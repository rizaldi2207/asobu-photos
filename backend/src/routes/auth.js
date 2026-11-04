import { Router } from "express";
import { query } from "../db/pool.js";
import {
  burnPasswordCheck,
  clearFailures,
  createSession,
  destroySession,
  hashPassword,
  isThrottled,
  loginDelayMs,
  publicUser,
  recordFailure,
  requireAuth,
  revokeOtherSessions,
  validatePassword,
  verifyPassword,
} from "../lib/auth.js";

const router = Router();

// POST /api/auth/login — { username, password }
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    if (isThrottled(req, username)) {
      return res.status(429).json({ error: "Too many failed attempts. Try again later." });
    }
    const delay = loginDelayMs(req, username);
    if (delay) await new Promise((r) => setTimeout(r, delay));

    const { rows } = await query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [
      username.trim(),
    ]);
    const user = rows[0];
    const ok = user ? await verifyPassword(password, user.password_hash) : (await burnPasswordCheck(password), false);
    if (!ok) {
      recordFailure(req, username);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    clearFailures(req, username);
    await createSession(res, user.id);
    res.json(publicUser(user));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res, next) => {
  try {
    await destroySession(req, res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — current user, or 401
router.get("/me", requireAuth, (req, res) => res.json(req.user));

// POST /api/auth/password — { currentPassword, newPassword }
router.post("/password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const pErr = validatePassword(newPassword);
    if (pErr) return res.status(400).json({ error: pErr });

    const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    if (!rows[0] || !(await verifyPassword(String(currentPassword || ""), rows[0].password_hash))) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    await query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      req.user.id,
      await hashPassword(newPassword),
    ]);
    // Sign out every other device that was using the old password.
    await revokeOtherSessions(req.user.id, req);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
