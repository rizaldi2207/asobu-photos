import { Router } from "express";
import crypto from "node:crypto";
import { query } from "../db/pool.js";
import { requireAuth } from "../lib/auth.js";
import { serializeSharedPhoto, sendPhotoBlob } from "./photos.js";
import { serializeAlbum } from "./albums.js";

const router = Router();

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "http://localhost:8080";

function newToken() {
  return crypto.randomBytes(24).toString("base64url");
}

// Resolve a token to a live (unexpired) link row. Sends the error response and
// returns null when the link is missing or expired.
async function findActiveLink(token, res) {
  const { rows } = await query("SELECT * FROM share_links WHERE token = $1", [token]);
  if (rows.length === 0) {
    res.status(404).json({ error: "Link not found" });
    return null;
  }
  const link = rows[0];
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    res.status(410).json({ error: "This link has expired" });
    return null;
  }
  return link;
}

// POST /api/share — { kind: 'photo'|'album'|'all', targetId?, expiresInDays? }
// Only the owner of the target can create a link to it.
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { kind, targetId, expiresInDays } = req.body || {};
    if (!["photo", "album", "all"].includes(kind)) {
      return res.status(400).json({ error: "kind must be photo, album, or all" });
    }
    if ((kind === "photo" || kind === "album") && !targetId) {
      return res.status(400).json({ error: "targetId is required for this kind" });
    }
    if (kind !== "all") {
      const table = kind === "photo" ? "photos" : "albums";
      const { rows } = await query(`SELECT 1 FROM ${table} WHERE id = $1 AND owner_id = $2`, [
        targetId,
        req.user.id,
      ]);
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    }

    const token = newToken();
    const expiresAt =
      expiresInDays && Number(expiresInDays) > 0
        ? new Date(Date.now() + Number(expiresInDays) * 86400000)
        : null;

    await query(
      `INSERT INTO share_links (token, kind, target_id, expires_at, owner_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, kind, kind === "all" ? null : targetId, expiresAt, req.user.id]
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

// GET /api/share/:token — public: resolve a share link to its payload
router.get("/:token", async (req, res, next) => {
  try {
    const link = await findActiveLink(req.params.token, res);
    if (!link) return;
    const token = link.token;

    if (link.kind === "all") {
      const { rows: photos } = await query(
        "SELECT * FROM photos WHERE owner_id = $1 ORDER BY created_at DESC",
        [link.owner_id]
      );
      return res.json({
        kind: "all",
        title: "Shared Gallery",
        photos: photos.map((p) => serializeSharedPhoto(p, token)),
      });
    }

    if (link.kind === "photo") {
      const { rows: photos } = await query(
        "SELECT * FROM photos WHERE id = $1 AND owner_id = $2",
        [link.target_id, link.owner_id]
      );
      if (photos.length === 0)
        return res.status(404).json({ error: "Shared photo no longer exists" });
      return res.json({
        kind: "photo",
        title: photos[0].original_name,
        photos: [serializeSharedPhoto(photos[0], token)],
      });
    }

    // kind === 'album'
    const { rows: albumRows } = await query(
      "SELECT * FROM albums WHERE id = $1 AND owner_id = $2",
      [link.target_id, link.owner_id]
    );
    if (albumRows.length === 0)
      return res.status(404).json({ error: "Shared album no longer exists" });
    const { rows: photoRows } = await query(
      `SELECT p.* FROM photos p
       JOIN album_photos ap ON ap.photo_id = p.id
       WHERE ap.album_id = $1
       ORDER BY ap.added_at DESC`,
      [link.target_id]
    );
    const album = await serializeAlbum(albumRows[0], token);
    return res.json({
      kind: "album",
      title: album.name,
      album,
      photos: photoRows.map((p) => serializeSharedPhoto(p, token)),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/share/:token/photos/:id/(thumb|file|download) — public blob access,
// limited to photos that are actually covered by the share link.
async function sharedBlob(req, res, next, opts) {
  try {
    const link = await findActiveLink(req.params.token, res);
    if (!link) return;

    let scopeSql;
    let params;
    if (link.kind === "photo") {
      scopeSql = "p.id = $1 AND p.id = $2 AND p.owner_id = $3";
      params = [req.params.id, link.target_id, link.owner_id];
    } else if (link.kind === "album") {
      scopeSql = `p.id = $1 AND p.owner_id = $3 AND EXISTS (
        SELECT 1 FROM album_photos ap WHERE ap.photo_id = p.id AND ap.album_id = $2)`;
      params = [req.params.id, link.target_id, link.owner_id];
    } else {
      scopeSql = "p.id = $1 AND p.owner_id = $2";
      params = [req.params.id, link.owner_id];
    }

    const { rows } = await query(
      `SELECT p.object_key, p.thumb_key, p.mime_type, p.original_name, p.size_bytes
       FROM photos p WHERE ${scopeSql}`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    await sendPhotoBlob(req, res, next, rows[0], opts);
  } catch (err) {
    next(err);
  }
}

router.get("/:token/photos/:id/thumb", (req, res, next) =>
  sharedBlob(req, res, next, { key: "thumb" })
);
router.get("/:token/photos/:id/file", (req, res, next) =>
  sharedBlob(req, res, next, { key: "original" })
);
router.get("/:token/photos/:id/download", (req, res, next) =>
  sharedBlob(req, res, next, { key: "original", disposition: "attachment" })
);

export { router as shareRouter };
