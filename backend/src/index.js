import "dotenv/config";
import express from "express";
import cors from "cors";
import { initSchema } from "./db/pool.js";
import { ensureBucket } from "./lib/storage.js";
import { photosRouter } from "./routes/photos.js";
import { albumsRouter } from "./routes/albums.js";
import { shareRouter } from "./routes/share.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/photos", photosRouter);
app.use("/api/albums", albumsRouter);
app.use("/api/share", shareRouter);

// /api/favorites convenience endpoint
app.get("/api/favorites", async (req, res, next) => {
  const { query } = await import("./db/pool.js");
  try {
    const { rows } = await query(
      "SELECT * FROM photos WHERE is_favorite ORDER BY created_at DESC"
    );
    const { serializePhoto } = await import("./routes/photos.js");
    res.json(rows.map(serializePhoto));
  } catch (err) {
    next(err);
  }
});

// Central error handler
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

async function start() {
  await initSchema();
  await ensureBucket();
  app.listen(PORT, () => console.log(`[asobu] backend listening on :${PORT}`));
}

start().catch((err) => {
  console.error("[asobu] failed to start:", err);
  process.exit(1);
});
