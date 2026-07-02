import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "../db/pool.js";
import {
  putObject,
  getObjectStream,
  getPartialObjectStream,
  removeObject,
} from "../lib/storage.js";

const execFileP = promisify(execFile);
const router = Router();

// Whitelisted sort keys → SQL expressions, so query params can never inject.
// `alias` is the photos-table alias used in joined queries (e.g. "p").
const SORT_KEYS = ["date", "name", "size", "type"];
export function photoOrderClause(sort, order, alias = "") {
  const a = alias ? `${alias}.` : "";
  const dir = order === "asc" ? "ASC" : "DESC";
  const map = {
    date: `${a}created_at`,
    name: `LOWER(${a}original_name)`,
    size: `${a}size_bytes`,
    type: `${a}mime_type`,
  };
  const expr = map[sort] || `${a}created_at`;
  return `${expr} ${dir}, ${a}id DESC`; // id tiebreak keeps pagination stable
}
export { SORT_KEYS };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB per file (covers most videos)
});

// Shape a DB row into the API representation the frontend expects.
function serialize(row) {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    kind: row.mime_type?.startsWith("video/") ? "video" : "image",
    sizeBytes: Number(row.size_bytes),
    width: row.width,
    height: row.height,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    thumbUrl: `/api/photos/${row.id}/thumb`,
    fileUrl: `/api/photos/${row.id}/file`,
    downloadUrl: `/api/photos/${row.id}/download`,
  };
}

// Extract a single still frame from a video buffer using ffmpeg (returns a PNG
// buffer, or null if extraction fails). Seeks ~0.5s in, falling back to frame 0.
async function extractVideoFrame(buffer, name) {
  const ext = (path.extname(name) || ".mp4").toLowerCase();
  const tmp = path.join(os.tmpdir(), `asobu-${uuidv4()}${ext}`);
  await fs.writeFile(tmp, buffer);
  try {
    for (const ss of ["0.5", "0"]) {
      try {
        const { stdout } = await execFileP(
          "ffmpeg",
          ["-ss", ss, "-i", tmp, "-frames:v", "1", "-an", "-f", "image2pipe",
            "-vcodec", "png", "pipe:1"],
          { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }
        );
        if (stdout && stdout.length > 0) return stdout;
      } catch {
        /* try next seek position */
      }
    }
    return null;
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
}

// Build a 640px webp thumbnail (poster for video) plus pixel dimensions.
async function buildThumbnail(file) {
  const isVideo = file.mimetype.startsWith("video/");
  const source = isVideo ? await extractVideoFrame(file.buffer, file.originalname) : file.buffer;

  if (!source) {
    // Video frame extraction failed — use a neutral placeholder poster.
    const placeholder = await sharp({
      create: { width: 640, height: 360, channels: 3, background: { r: 18, g: 18, b: 27 } },
    })
      .webp()
      .toBuffer();
    return { thumbBuffer: placeholder, width: null, height: null };
  }

  const meta = await sharp(source).metadata();
  const thumbBuffer = await sharp(source)
    .rotate()
    .resize(640, 640, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return { thumbBuffer, width: meta.width || null, height: meta.height || null };
}

// Process a single uploaded image or video: generate a thumbnail/poster, push
// both blobs to storage, and insert the metadata row. Returns the raw DB row
// (or null if the file is neither an image nor a video).
async function storePhotoFile(file) {
  const isImage = file.mimetype.startsWith("image/");
  const isVideo = file.mimetype.startsWith("video/");
  if (!isImage && !isVideo) return null;

  const id = uuidv4();
  const objectKey = `originals/${id}`;
  const thumbKey = `thumbs/${id}.webp`;

  const { thumbBuffer, width, height } = await buildThumbnail(file);

  await putObject(objectKey, file.buffer, file.mimetype);
  await putObject(thumbKey, thumbBuffer, "image/webp");

  const { rows } = await query(
    `INSERT INTO photos
       (id, original_name, mime_type, size_bytes, width, height, object_key, thumb_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      file.originalname,
      file.mimetype,
      file.size,
      width,
      height,
      objectKey,
      thumbKey,
    ]
  );
  return rows[0];
}

// POST /api/photos — multipart upload of one or more images
router.post("/", upload.array("photos", 500), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const created = [];
    for (const file of files) {
      const row = await storePhotoFile(file);
      if (row) created.push(serialize(row));
    }

    if (created.length === 0) {
      return res.status(400).json({ error: "No valid image or video files uploaded" });
    }
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// GET /api/photos — newest first. Supports optional ?limit & ?offset for
// paginated/infinite-scroll loading; with no limit it returns everything
// (used by the album photo-picker).
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 0, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    let sql = `SELECT * FROM photos ORDER BY ${photoOrderClause(req.query.sort, req.query.order)}`;
    const params = [];
    if (limit > 0) {
      sql += " LIMIT $1 OFFSET $2";
      params.push(limit, offset);
    }
    const { rows } = await query(sql, params);
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

// GET /api/favorites lives here for convenience (mounted separately too)
router.get("/favorites", async (_req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT * FROM photos WHERE is_favorite ORDER BY created_at DESC"
    );
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

// GET /api/photos/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM photos WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

async function streamBlob(req, res, next, { key, disposition }) {
  try {
    const { rows } = await query(
      `SELECT object_key, thumb_key, mime_type, original_name, size_bytes
       FROM photos WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    const row = rows[0];

    const isThumb = key === "thumb";
    const objKey = isThumb ? row.thumb_key : row.object_key;
    const contentType = isThumb ? "image/webp" : row.mime_type;
    const total = isThumb ? null : Number(row.size_bytes);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (disposition === "attachment") {
      const safe = encodeURIComponent(row.original_name);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safe}`);
    }
    if (!isThumb) res.setHeader("Accept-Ranges", "bytes");

    // Honour HTTP Range requests on originals (enables video seeking / fast start).
    const range = req.headers.range;
    if (!isThumb && range && total) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      let start = match && match[1] ? parseInt(match[1], 10) : 0;
      let end = match && match[2] ? parseInt(match[2], 10) : total - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        res.setHeader("Content-Range", `bytes */${total}`);
        return res.status(416).end();
      }
      end = Math.min(end, total - 1);
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", chunkSize);
      const stream = await getPartialObjectStream(objKey, start, chunkSize);
      stream.on("error", next);
      return stream.pipe(res);
    }

    if (total != null) res.setHeader("Content-Length", total);
    const stream = await getObjectStream(objKey);
    stream.on("error", next);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

// GET /api/photos/:id/thumb — inline thumbnail
router.get("/:id/thumb", (req, res, next) =>
  streamBlob(req, res, next, { key: "thumb" })
);

// GET /api/photos/:id/file — inline original
router.get("/:id/file", (req, res, next) =>
  streamBlob(req, res, next, { key: "original" })
);

// GET /api/photos/:id/download — original as attachment
router.get("/:id/download", (req, res, next) =>
  streamBlob(req, res, next, { key: "original", disposition: "attachment" })
);

// PATCH /api/photos/:id/favorite — toggle favorite
router.patch("/:id/favorite", async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE photos SET is_favorite = NOT is_favorite WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/photos/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM photos WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    await query("DELETE FROM photos WHERE id = $1", [req.params.id]);
    await removeObject(rows[0].object_key);
    await removeObject(rows[0].thumb_key);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { router as photosRouter, serialize as serializePhoto };
