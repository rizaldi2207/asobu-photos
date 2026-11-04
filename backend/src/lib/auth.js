import crypto from "node:crypto";
import { promisify } from "node:util";
import { pool, query } from "../db/pool.js";

const scrypt = promisify(crypto.scrypt);

export const SESSION_COOKIE = "asobu_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
// Set COOKIE_SECURE=true when the app is served over HTTPS only.
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || "false") === "true";

export const MIN_PASSWORD_LENGTH = 8;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

// ---------------------------------------------------------------------------
// Passwords (scrypt, built into Node — no native deps)
// Stored format: scrypt$N$r$p$<salt b64>$<hash b64>
// ---------------------------------------------------------------------------
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(expected, actual);
}

// Run a dummy hash so "unknown user" and "wrong password" take similar time.
const DUMMY_HASH_PROMISE = hashPassword(crypto.randomBytes(16).toString("hex"));
export async function burnPasswordCheck(password) {
  await verifyPassword(password, await DUMMY_HASH_PROMISE).catch(() => false);
}

export function validateUsername(username) {
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return "Username must be 3–32 characters: letters, digits, dot, dash or underscore";
  }
  return null;
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > 256) return "Password is too long";
  return null;
}

// ---------------------------------------------------------------------------
// Sessions (opaque random token in an HttpOnly cookie; SHA-256 stored in DB).
// Cookies — not Authorization headers — because <img>/<video> tags must be able
// to load /api/photos/:id/thumb|file directly.
// ---------------------------------------------------------------------------
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000);
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    sha256(token),
    userId,
    expiresAt,
  ]);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(req, res) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  res.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: COOKIE_SECURE });
}

// Revoke every session of a user except (optionally) the caller's current one.
export async function revokeOtherSessions(userId, req) {
  const token = req && readCookie(req, SESSION_COOKIE);
  await query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [
    userId,
    token ? sha256(token) : "",
  ]);
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function publicUser(row) {
  return { id: row.id, username: row.username, role: row.role, createdAt: row.created_at };
}

// Populates req.user when a valid session cookie is present. Never rejects.
export async function loadSession(req, _res, next) {
  try {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return next();
    const { rows } = await query(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)]
    );
    if (rows[0]) req.user = publicUser(rows[0]);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

// ---------------------------------------------------------------------------
// Login throttling — in-memory, fixed 15-minute windows.
//  • one client guessing one account   (username+IP) → hard block
//  • one client spraying many accounts (IP)          → hard block
//  • one account attacked from many IPs (username)   → slow down, never block,
//    so a stranger cannot lock the real owner out of their account.
// ---------------------------------------------------------------------------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PAIR_FAILURES = 10;
const MAX_IP_FAILURES = 30;
const SLOW_USER_FAILURES = 10;
const SLOW_DELAY_MS = 2000;
const failures = new Map(); // key -> { count, first }

function failureKeys(req, username) {
  const u = String(username || "").trim().toLowerCase();
  return { user: `u:${u}`, ip: `ip:${req.ip}`, pair: `p:${u}|${req.ip}` };
}

function failureCount(key, now) {
  const f = failures.get(key);
  if (!f) return 0;
  if (now - f.first > WINDOW_MS) {
    failures.delete(key);
    return 0;
  }
  return f.count;
}

export function isThrottled(req, username) {
  const now = Date.now();
  const k = failureKeys(req, username);
  return failureCount(k.pair, now) >= MAX_PAIR_FAILURES || failureCount(k.ip, now) >= MAX_IP_FAILURES;
}

// Delay to apply before checking the password (applied to every attempt, so a
// client cannot learn the result early by aborting slow responses).
export function loginDelayMs(req, username) {
  return failureCount(failureKeys(req, username).user, Date.now()) >= SLOW_USER_FAILURES
    ? SLOW_DELAY_MS
    : 0;
}

export function recordFailure(req, username) {
  const now = Date.now();
  for (const k of Object.values(failureKeys(req, username))) {
    const f = failures.get(k);
    if (!f || now - f.first > WINDOW_MS) failures.set(k, { count: 1, first: now });
    else f.count++;
  }
}

export function clearFailures(req, username) {
  failures.delete(failureKeys(req, username).pair);
}

// Drop expired entries so spraying random usernames cannot grow the map forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, f] of failures) if (now - f.first > WINDOW_MS) failures.delete(k);
}, 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Bootstrap: create the initial admin if no users exist, then hand every
// pre-auth (owner-less) photo, album and share link to the first admin.
// ---------------------------------------------------------------------------
export async function seedInitialAdmin() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize concurrent boots.
    await client.query("LOCK TABLE users IN EXCLUSIVE MODE");

    const { rows: existing } = await client.query("SELECT COUNT(*)::int AS n FROM users");
    if (existing[0].n === 0) {
      const username = process.env.ADMIN_USERNAME || "admin";
      let password = process.env.ADMIN_PASSWORD;
      let generated = false;
      if (!password) {
        password = crypto.randomBytes(12).toString("base64url");
        generated = true;
      }
      const uErr = validateUsername(username);
      const pErr = validatePassword(password);
      if (uErr || pErr) throw new Error(`Invalid initial admin credentials: ${uErr || pErr}`);

      await client.query(
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
        [username, await hashPassword(password)]
      );
      console.log(`[auth] created initial admin user "${username}"`);
      if (generated) {
        console.log(`[auth] generated password for "${username}": ${password}`);
        console.log("[auth] log in and change it, or set ADMIN_PASSWORD before first boot.");
      }
    }

    const { rows: admins } = await client.query(
      "SELECT id, username FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1"
    );
    const owner = admins[0];
    if (owner) {
      for (const table of ["photos", "albums", "share_links"]) {
        const { rowCount } = await client.query(
          `UPDATE ${table} SET owner_id = $1 WHERE owner_id IS NULL`,
          [owner.id]
        );
        if (rowCount > 0) {
          console.log(`[auth] assigned ${rowCount} existing ${table} row(s) to "${owner.username}"`);
        }
        await client.query(`ALTER TABLE ${table} ALTER COLUMN owner_id SET NOT NULL`);
      }
    }

    await client.query("DELETE FROM sessions WHERE expires_at < now()");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
