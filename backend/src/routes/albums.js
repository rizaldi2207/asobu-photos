import { Router } from "express";
import { query } from "../db/pool.js";
import { serializePhoto, photoOrderClause, SORT_KEYS } from "./photos.js";

const router = Router();

// Attach a thumbnail + photo count to an album row.
async function serializeAlbum(row) {
  // Prefer the explicit cover photo; otherwise fall back to the most recent member.
  const { rows: coverRows } = await query(
    `SELECT p.* FROM photos p
     WHERE p.id = COALESCE(
       $1,
       (SELECT photo_id FROM album_photos WHERE album_id = $2 ORDER BY added_at DESC LIMIT 1)
     )`,
    [row.cover_photo_id, row.id]
  );
  const { rows: countRows } = await query(
    "SELECT COUNT(*)::int AS count FROM album_photos WHERE album_id = $1",
    [row.id]
  );
  const cover = coverRows[0] ? serializePhoto(coverRows[0]) : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    photoCount: countRows[0].count,
    coverThumbUrl: cover ? cover.thumbUrl : null,
    coverPhotoId: cover ? cover.id : null,
  };
}

// GET /api/albums
router.get("/", async (_req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM albums ORDER BY created_at DESC");
    const albums = await Promise.all(rows.map(serializeAlbum));
    res.json(albums);
  } catch (err) {
    next(err);
  }
});

// POST /api/albums
router.post("/", async (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Album name is required" });
    }
    const { rows } = await query(
      "INSERT INTO albums (name, description) VALUES ($1, $2) RETURNING *",
      [name.trim(), description || null]
    );
    res.status(201).json(await serializeAlbum(rows[0]));
  } catch (err) {
    next(err);
  }
});

// GET /api/albums/:id — album metadata (photos are fetched via /:id/photos)
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM albums WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(await serializeAlbum(rows[0]));
  } catch (err) {
    next(err);
  }
});

// GET /api/albums/:id/photos — album photos, newest-added first. Supports
// optional ?limit & ?offset for infinite scroll; with no limit returns all.
router.get("/:id/photos", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 0, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // With an explicit sort use it; otherwise keep the album's "newest added" order.
    const orderBy = SORT_KEYS.includes(req.query.sort)
      ? photoOrderClause(req.query.sort, req.query.order, "p")
      : "ap.added_at DESC, p.id DESC";

    let sql = `SELECT p.* FROM photos p
       JOIN album_photos ap ON ap.photo_id = p.id
       WHERE ap.album_id = $1
       ORDER BY ${orderBy}`;
    const params = [req.params.id];
    if (limit > 0) {
      sql += " LIMIT $2 OFFSET $3";
      params.push(limit, offset);
    }
    const { rows } = await query(sql, params);
    res.json(rows.map(serializePhoto));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/albums/:id — rename / change cover
router.patch("/:id", async (req, res, next) => {
  try {
    const { name, description, coverPhotoId } = req.body || {};
    const { rows } = await query(
      `UPDATE albums SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         cover_photo_id = COALESCE($4, cover_photo_id)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name || null, description ?? null, coverPhotoId || null]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(await serializeAlbum(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/albums/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await query("DELETE FROM albums WHERE id = $1", [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/albums/:id/photos — add photos { photoIds: [...] }
router.post("/:id/photos", async (req, res, next) => {
  try {
    const { photoIds } = req.body || {};
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ error: "photoIds array is required" });
    }
    for (const photoId of photoIds) {
      await query(
        `INSERT INTO album_photos (album_id, photo_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, photoId]
      );
    }
    const { rows } = await query("SELECT * FROM albums WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(await serializeAlbum(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/albums/:id/photos/:photoId — remove a photo from an album
router.delete("/:id/photos/:photoId", async (req, res, next) => {
  try {
    await query("DELETE FROM album_photos WHERE album_id = $1 AND photo_id = $2", [
      req.params.id,
      req.params.photoId,
    ]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { router as albumsRouter, serializeAlbum };
