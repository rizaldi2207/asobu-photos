import { Router } from "express";
import { query } from "../db/pool.js";
import { serializePhoto, serializeSharedPhoto, photoOrderClause, SORT_KEYS } from "./photos.js";

const router = Router();

// Load an album only if it belongs to the current user (null otherwise).
async function findOwnedAlbum(id, userId) {
  const { rows } = await query("SELECT * FROM albums WHERE id = $1 AND owner_id = $2", [id, userId]);
  return rows[0] || null;
}

// Attach a thumbnail + photo count to an album row. `token` (optional) scopes
// the cover URL to a share link for public recipients.
async function serializeAlbum(row, token) {
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
  const cover = coverRows[0]
    ? typeof token === "string"
      ? serializeSharedPhoto(coverRows[0], token)
      : serializePhoto(coverRows[0])
    : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    photoCount: countRows[0].count,
    coverThumbUrl: cover ? cover.thumbUrl : null,
    coverPhotoId: cover ? cover.id : null,
    // true when the user picked the cover; false when it falls back to the newest photo.
    customCover: !!row.cover_photo_id,
  };
}

// GET /api/albums
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT * FROM albums WHERE owner_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    const albums = await Promise.all(rows.map((r) => serializeAlbum(r)));
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
      "INSERT INTO albums (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *",
      [name.trim(), description || null, req.user.id]
    );
    res.status(201).json(await serializeAlbum(rows[0]));
  } catch (err) {
    next(err);
  }
});

// GET /api/albums/:id — album metadata (photos are fetched via /:id/photos)
router.get("/:id", async (req, res, next) => {
  try {
    const album = await findOwnedAlbum(req.params.id, req.user.id);
    if (!album) return res.status(404).json({ error: "Not found" });
    res.json(await serializeAlbum(album));
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

    if (!(await findOwnedAlbum(req.params.id, req.user.id))) {
      return res.status(404).json({ error: "Not found" });
    }

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

// PATCH /api/albums/:id — rename / change cover.
// coverPhotoId: omitted = unchanged, null = automatic (newest photo), uuid = that photo,
// which must be a member of this album.
router.patch("/:id", async (req, res, next) => {
  try {
    const { name, description, coverPhotoId } = req.body || {};
    const album = await findOwnedAlbum(req.params.id, req.user.id);
    if (!album) return res.status(404).json({ error: "Not found" });

    const setCover = coverPhotoId !== undefined;
    if (coverPhotoId) {
      const { rows: member } = await query(
        `SELECT 1 FROM album_photos ap JOIN photos p ON p.id = ap.photo_id
         WHERE ap.album_id = $1 AND ap.photo_id = $2 AND p.owner_id = $3`,
        [album.id, coverPhotoId, req.user.id]
      );
      if (member.length === 0) {
        return res.status(400).json({ error: "Cover photo must be in this album" });
      }
    }
    const { rows } = await query(
      `UPDATE albums SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         cover_photo_id = CASE WHEN $4 THEN $5::uuid ELSE cover_photo_id END
       WHERE id = $1 AND owner_id = $6 RETURNING *`,
      [album.id, name || null, description ?? null, setCover, coverPhotoId || null, req.user.id]
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
    const { rowCount } = await query("DELETE FROM albums WHERE id = $1 AND owner_id = $2", [
      req.params.id,
      req.user.id,
    ]);
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
    const album = await findOwnedAlbum(req.params.id, req.user.id);
    if (!album) return res.status(404).json({ error: "Not found" });
    // Only photos owned by the same user can be added; others are silently skipped.
    await query(
      `INSERT INTO album_photos (album_id, photo_id)
       SELECT $1, p.id FROM photos p
       WHERE p.id = ANY($2::uuid[]) AND p.owner_id = $3
       ON CONFLICT DO NOTHING`,
      [album.id, photoIds, req.user.id]
    );
    res.json(await serializeAlbum(album));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/albums/:id/photos/:photoId — remove a photo from an album
router.delete("/:id/photos/:photoId", async (req, res, next) => {
  try {
    if (!(await findOwnedAlbum(req.params.id, req.user.id))) {
      return res.status(404).json({ error: "Not found" });
    }
    await query("DELETE FROM album_photos WHERE album_id = $1 AND photo_id = $2", [
      req.params.id,
      req.params.photoId,
    ]);
    // A photo removed from the album can no longer be its cover → back to automatic.
    await query("UPDATE albums SET cover_photo_id = NULL WHERE id = $1 AND cover_photo_id = $2", [
      req.params.id,
      req.params.photoId,
    ]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { router as albumsRouter, serializeAlbum };
