import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "../db/pool.js";
import {
  putObject,
  putFile,
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

// Uploads are spooled to temp files on disk (not RAM) so large or parallel
// uploads cannot exhaust the backend's memory. The frontend sends batches of
// ≤10 files, so 50 per request leaves headroom for API clients.
const UPLOAD_MAX_FILES = 50;
const MAX_CONCURRENT_UPLOADS_PER_USER = 2;
const upload = multer({
  // No destination/filename → os.tmpdir() with random names (no user-controlled extension).
  storage: multer.diskStorage({}),
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1 GB per file (covers most videos)
    files: UPLOAD_MAX_FILES,
    fields: 20,
    parts: UPLOAD_MAX_FILES + 20,
  },
});

// Reject a user's upload while they already have MAX_CONCURRENT_UPLOADS_PER_USER in flight.
const activeUploads = new Map(); // userId -> count
function limitConcurrentUploads(req, res, next) {
  const id = req.user.id;
  const n = activeUploads.get(id) || 0;
  if (n >= MAX_CONCURRENT_UPLOADS_PER_USER) {
    return res.status(429).json({ error: "Too many uploads in progress. Please wait." });
  }
  activeUploads.set(id, n + 1);
  let released = false;
  res.on("close", () => {
    if (released) return;
    released = true;
    const left = (activeUploads.get(id) || 1) - 1;
    if (left > 0) activeUploads.set(id, left);
    else activeUploads.delete(id);
  });
  next();
}

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

// Same shape, but blob URLs are scoped to a share token so public recipients
// (who have no session) can load them via /api/share/:token/photos/:id/*.
function serializeShared(row, token) {
  const base = `/api/share/${encodeURIComponent(token)}/photos/${row.id}`;
  return {
    ...serialize(row),
    isFavorite: false,
    thumbUrl: `${base}/thumb`,
    fileUrl: `${base}/file`,
    downloadUrl: `${base}/download`,
  };
}

// Extract a single still frame from an uploaded video file using ffmpeg (returns
// a PNG buffer, or null if extraction fails). Seeks ~0.5s in, falling back to frame 0.
async function extractVideoFrame(filePath) {
  for (const ss of ["0.5", "0"]) {
    try {
      const { stdout } = await execFileP(
        "ffmpeg",
        ["-ss", ss, "-i", filePath, "-frames:v", "1", "-an", "-f", "image2pipe",
          "-vcodec", "png", "pipe:1"],
        { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }
      );
      if (stdout && stdout.length > 0) return stdout;
    } catch {
      /* try next seek position */
    }
  }
  return null;
}

// Upload type allowlist. The stored mime type is later sent back as the blob's
// Content-Type, so it must never be something a browser would execute (e.g.
// image/svg+xml or text/html). Images are identified from their actual bytes via
// sharp, never from the client-supplied multipart Content-Type.
const IMAGE_FORMAT_MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tiff: "image/tiff",
};
const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/ogg",
  "video/3gpp",
  "video/x-m4v",
]);

// Returns the safe mime type to store for this upload, or null to reject it.
async function detectMimeType(file) {
  const claimed = String(file.mimetype || "").toLowerCase();
  if (VIDEO_MIME_TYPES.has(claimed)) return claimed;
  if (!claimed.startsWith("image/")) return null;
  let meta;
  try {
    meta = await sharp(file.path).metadata();
  } catch {
    return null; // not a decodable image
  }
  if (meta.format === "heif") return meta.compression === "av1" ? "image/avif" : "image/heic";
  return IMAGE_FORMAT_MIME[meta.format] || null; // rejects svg, pdf, etc.
}

// Build a 640px webp thumbnail (poster for video) plus pixel dimensions.
async function buildThumbnail(file, mimeType) {
  const isVideo = mimeType.startsWith("video/");
  const source = isVideo ? await extractVideoFrame(file.path) : file.path;

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
// (or null if the file is not an allowlisted image/video type).
async function storePhotoFile(file, ownerId) {
  const mimeType = await detectMimeType(file);
  if (!mimeType) return null;

  const id = uuidv4();
  const objectKey = `originals/${id}`;
  const thumbKey = `thumbs/${id}.webp`;

  const { thumbBuffer, width, height } = await buildThumbnail(file, mimeType);

  await putFile(objectKey, file.path, mimeType);
  await putObject(thumbKey, thumbBuffer, "image/webp");

  const { rows } = await query(
    `INSERT INTO photos
       (id, original_name, mime_type, size_bytes, width, height, object_key, thumb_key, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      file.originalname,
      mimeType,
      file.size,
      width,
      height,
      objectKey,
      thumbKey,
      ownerId,
    ]
  );
  return rows[0];
}

// POST /api/photos — multipart upload of one or more images
router.post("/", limitConcurrentUploads, upload.array("photos", UPLOAD_MAX_FILES), async (req, res, next) => {
  const files = req.files || [];
  try {
    if (files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const created = [];
    for (const file of files) {
      const row = await storePhotoFile(file, req.user.id);
      if (row) created.push(serialize(row));
    }

    if (created.length === 0) {
      return res.status(400).json({ error: "No valid image or video files uploaded" });
    }
    res.status(201).json(created);
  } catch (err) {
    next(err);
  } finally {
    // Temp spool files are no longer needed once stored (or rejected).
    for (const f of files) fs.unlink(f.path).catch(() => {});
  }
});

// GET /api/photos — newest first. Supports optional ?limit & ?offset for
// paginated/infinite-scroll loading; with no limit it returns everything
// (used by the album photo-picker).
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 0, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    let sql = `SELECT * FROM photos WHERE owner_id = $1
      ORDER BY ${photoOrderClause(req.query.sort, req.query.order)}`;
    const params = [req.user.id];
    if (limit > 0) {
      sql += " LIMIT $2 OFFSET $3";
      params.push(limit, offset);
    }
    const { rows } = await query(sql, params);
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

// GET /api/favorites lives here for convenience (mounted separately too)
router.get("/favorites", async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT * FROM photos WHERE owner_id = $1 AND is_favorite ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

// GET /api/photos/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM photos WHERE id = $1 AND owner_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

async function streamBlob(req, res, next, opts) {
  try {
    const { rows } = await query(
      `SELECT object_key, thumb_key, mime_type, original_name, size_bytes
       FROM photos WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    await sendPhotoBlob(req, res, next, rows[0], opts);
  } catch (err) {
    next(err);
  }
}

// Stream a photo's thumbnail or original (with Range support) for an already
// authorized photo row. Shared by the owner routes and share-token routes.
export async function sendPhotoBlob(req, res, next, row, { key, disposition }) {
  try {
    const isThumb = key === "thumb";
    const objKey = isThumb ? row.thumb_key : row.object_key;
    const contentType = isThumb ? "image/webp" : row.mime_type;
    const total = isThumb ? null : Number(row.size_bytes);

    res.setHeader("Content-Type", contentType);
    // Blobs are user content served from the app's origin: never let the browser
    // sniff them into something else, and if one is opened directly (e.g. a legacy
    // SVG row), run it in a sandbox with no scripts and no same-origin access.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    // private: responses depend on the session/share token, so shared caches must not keep them.
    res.setHeader("Cache-Control", "private, max-age=86400");
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
      `UPDATE photos SET is_favorite = NOT is_favorite
       WHERE id = $1 AND owner_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
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
    const { rows } = await query("SELECT * FROM photos WHERE id = $1 AND owner_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    await query("DELETE FROM photos WHERE id = $1 AND owner_id = $2", [req.params.id, req.user.id]);
    await removeObject(rows[0].object_key);
    await removeObject(rows[0].thumb_key);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { router as photosRouter, serialize as serializePhoto, serializeShared as serializeSharedPhoto };
