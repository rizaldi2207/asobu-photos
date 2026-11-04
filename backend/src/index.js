import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { initSchema, query } from "./db/pool.js";
import { ensureBucket } from "./lib/storage.js";
import { loadSession, requireAuth, requireAdmin, seedInitialAdmin } from "./lib/auth.js";
import { photosRouter, serializePhoto } from "./routes/photos.js";
import { albumsRouter } from "./routes/albums.js";
import { shareRouter } from "./routes/share.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Behind nginx (and optionally ngrok) on the private Docker network: trust only
// private-range hops so req.ip resolves to the real client for login throttling.
app.set("trust proxy", "loopback, linklocal, uniquelocal");

// The SPA is served same-origin via nginx/Vite proxy, so cross-origin access is
// not needed. Only enable CORS for explicitly configured origins.
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(","), credentials: true }));
}
app.use(express.json());
app.use(loadSession);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Public: login/logout/me, and share-link recipients.
app.use("/api/auth", authRouter);
app.use("/api/share", shareRouter);

// Everything below requires a signed-in user; data is scoped to that user.
app.use("/api/photos", requireAuth, photosRouter);
app.use("/api/albums", requireAuth, albumsRouter);
app.use("/api/users", requireAdmin, usersRouter);

// /api/favorites convenience endpoint
app.get("/api/favorites", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT * FROM photos WHERE owner_id = $1 AND is_favorite ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(rows.map((r) => serializePhoto(r)));
  } catch (err) {
    next(err);
  }
});

// Central error handler
app.use((err, _req, res, _next) => {
  // Malformed UUIDs in path params etc. → treat as "not found" instead of 500.
  if (err && err.code === "22P02") return res.status(404).json({ error: "Not found" });
  if (res.headersSent) {
    console.error("[error]", err);
    return res.end();
  }
  // Upload limit violations (file too large, too many files, …): safe, generic messages.
  if (err instanceof multer.MulterError) {
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.message });
  }
  // Client errors flagged as exposable (e.g. malformed JSON from express.json).
  if (err && err.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  // Anything else is internal: log details server-side, never send them to the client.
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  await initSchema();
  await seedInitialAdmin();
  await ensureBucket();
  app.listen(PORT, () => console.log(`[asobu] backend listening on :${PORT}`));
}

start().catch((err) => {
  console.error("[asobu] failed to start:", err);
  process.exit(1);
});
