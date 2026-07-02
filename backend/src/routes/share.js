import { Router } from "express";
import crypto from "node:crypto";
import { query } from "../db/pool.js";
import { serializePhoto } from "./photos.js";
import { serializeAlbum } from "./albums.js";

const router = Router();

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "http://localhost:8080";

function newToken() {
  return crypto.randomBytes(24).toString("base64url");
}

// POST /api/share — { kind: 'photo'|'album'|'all', targetId?, expiresInDays? }
router.post("/", async (req, res, next) => {
  try {
    const { kind, targetId, expiresInDays } = req.body || {};
    if (!["photo", "album", "all"].includes(kind)) {
      return res.status(400).json({ error: "kind must be photo, album, or all" });
    }
    if ((kind === "photo" || kind === "album") && !targetId) {
      return res.status(400).json({ error: "targetId is required for this kind" });
    }

    const token = newToken();
    const expiresAt =
      expiresInDays && Number(expiresInDays) > 0
        ? new Date(Date.now() + Number(expiresInDays) * 86400000)
        : null;

    await query(
      `INSERT INTO share_links (token, kind, target_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [token, kind, targetId || null, expiresAt]
    );

    res.status(201).json({
      token,
      kind,
      url: `${PUBLIC_BASE_URL}/share/${token}`,
      expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/share/:token — resolve a share link to its payload
router.get("/:token", async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM share_links WHERE token = $1", [
      req.params.token,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: "Link not found" });

    const link = rows[0];
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: "This link has expired" });
    }

    if (link.kind === "all") {
      const { rows: photos } = await query(
        "SELECT * FROM photos ORDER BY created_at DESC"
      );
      return res.json({
        kind: "all",
        title: "Shared Gallery",
        photos: photos.map(serializePhoto),
      });
    }

    if (link.kind === "photo") {
      const { rows: photos } = await query("SELECT * FROM photos WHERE id = $1", [
        link.target_id,
      ]);
      if (photos.length === 0)
        return res.status(404).json({ error: "Shared photo no longer exists" });
      return res.json({
        kind: "photo",
        title: photos[0].original_name,
        photos: [serializePhoto(photos[0])],
      });
    }

    // kind === 'album'
    const { rows: albumRows } = await query("SELECT * FROM albums WHERE id = $1", [
      link.target_id,
    ]);
    if (albumRows.length === 0)
      return res.status(404).json({ error: "Shared album no longer exists" });
    const { rows: photoRows } = await query(
      `SELECT p.* FROM photos p
       JOIN album_photos ap ON ap.photo_id = p.id
       WHERE ap.album_id = $1
       ORDER BY ap.added_at DESC`,
      [link.target_id]
    );
    const album = await serializeAlbum(albumRows[0]);
    return res.json({
      kind: "album",
      title: album.name,
      album,
      photos: photoRows.map(serializePhoto),
    });
  } catch (err) {
    next(err);
  }
});

export { router as shareRouter };
