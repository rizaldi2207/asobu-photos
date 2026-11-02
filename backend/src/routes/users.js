import { Router } from "express";
import { pool, query } from "../db/pool.js";
import { removeObject } from "../lib/storage.js";
import {
  hashPassword,
  publicUser,
  revokeOtherSessions,
  validatePassword,
  validateUsername,
} from "../lib/auth.js";

// Admin-only user management (mounted behind requireAdmin in index.js).
const router = Router();

async function withPhotoCount(user) {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM photos WHERE owner_id = $1", [
    user.id,
  ]);
  return { ...publicUser(user), photoCount: rows[0].n };
}

// GET /api/users
router.get("/", async (_req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM users ORDER BY created_at ASC");
    res.json(await Promise.all(rows.map(withPhotoCount)));
  } catch (err) {
    next(err);
  }
});

// POST /api/users — { username, password, role? }
router.post("/", async (req, res, next) => {
  try {
    const { username, password, role = "user" } = req.body || {};
    const err = validateUsername(username) || validatePassword(password);
    if (err) return res.status(400).json({ error: err });
    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({ error: "role must be admin or user" });
    }
    const { rows: dupe } = await query("SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)", [
      username,
    ]);
    if (dupe.length) return res.status(409).json({ error: "Username is already taken" });

    const { rows } = await query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING *",
      [username, await hashPassword(password), role]
    );
    res.status(201).json(await withPhotoCount(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id — { role?, password? } (admin reset)
router.patch("/:id", async (req, res, next) => {
  try {
    const { role, password } = req.body || {};
    const isSelf = req.params.id === req.user.id;

    if (role !== undefined) {
      if (!["admin", "user"].includes(role)) {
        return res.status(400).json({ error: "role must be admin or user" });
      }
      if (isSelf && role !== "admin") {
        return res.status(400).json({ error: "You cannot remove your own admin role" });
      }
    }
    if (password !== undefined) {
      const pErr = validatePassword(password);
      if (pErr) return res.status(400).json({ error: pErr });
    }

    const { rows } = await query(
      `UPDATE users SET
         role = COALESCE($2, role),
         password_hash = COALESCE($3, password_hash)
       WHERE id = $1 RETURNING *`,
      [req.params.id, role ?? null, password !== undefined ? await hashPassword(password) : null]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });

    // A password reset signs the user out everywhere (except the admin's own session).
    if (password !== undefined) await revokeOtherSessions(req.params.id, isSelf ? req : null);
    res.json(await withPhotoCount(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — deletes the user and everything they own (incl. blobs)
router.delete("/:id", async (req, res, next) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  const client = await pool.connect();
  let keys = [];
  try {
    await client.query("BEGIN");
    const { rows: photos } = await client.query(
      "SELECT object_key, thumb_key FROM photos WHERE owner_id = $1",
      [req.params.id]
    );
    keys = photos.flatMap((p) => [p.object_key, p.thumb_key]);
    // photos/albums/share_links/sessions cascade from users.
    const { rowCount } = await client.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return next(err);
  } finally {
    client.release();
  }

  // Best-effort blob cleanup after the DB commit.
  for (const key of keys) {
    await removeObject(key).catch((e) => console.warn(`[users] could not remove ${key}: ${e.message}`));
  }
  res.status(204).end();
});

export { router as usersRouter };
