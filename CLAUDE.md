# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Asobu Photos is a containerized web photo/video gallery: upload, download, share-link,
albums, and favorites. It runs as four Docker Compose services — a React SPA (nginx),
an Express REST API, PostgreSQL (metadata), and MinIO (S3-compatible blob storage).

## Commands

Everything runs through Docker Compose; there is no top-level package.json.

```bash
docker compose up -d --build     # build & start the full stack
docker compose logs -f backend   # tail backend logs
docker compose down              # stop (add -v to wipe pgdata/miniodata volumes)
```

- App: http://localhost:8080 · Backend health: http://localhost:3000/api/health · MinIO console: http://localhost:9001
- Copy `.env.example` to `.env` to override ports/credentials (defaults work out of the box). If you change `FRONTEND_PORT`, also set `PUBLIC_BASE_URL` to match or share links break.

Running a service outside its container (npm scripts exist only per-service):

```bash
cd backend  && npm install && npm run dev   # node --watch src/index.js
cd frontend && npm install && npm run dev   # vite dev server on :5173, proxies /api → localhost:3000
```

There is no test suite, linter, or formatter configured in this repo.

## Tooling

Use the **typescript-lsp** plugin's LSP tools when navigating or editing the JavaScript/JSX
sources (`backend/src`, `frontend/src`). Prefer them over plain text search for code intelligence:
go-to-definition, find-references, hover/type info, and diagnostics. Check LSP diagnostics on any
`.js`/`.jsx` file you edit before considering the change complete.

## Architecture

**Blobs never touch the browser directly.** The frontend only ever calls `/api/*`.
Original files and thumbnails live in MinIO under keys `originals/<uuid>` and
`thumbs/<uuid>.webp`; PostgreSQL stores only metadata (the `object_key` / `thumb_key`
pointers). Every image/video byte is streamed *through* the backend, so MinIO
credentials stay server-side. In production nginx proxies `/api/` to `backend:3000`;
in Vite dev the same proxy is configured in `vite.config.js`.

**Backend** (`backend/src`, ESM, Node 20):
- `index.js` — Express app, mounts routers, central error handler. On startup calls `initSchema()` then `ensureBucket()`, both of which retry until Postgres/MinIO are reachable.
- `db/pool.js` — pg Pool + `query()` helper. `initSchema()` applies `db/schema.sql` idempotently (`CREATE TABLE IF NOT EXISTS …`) on every boot — this is the migration mechanism; edit `schema.sql` to change the schema.
- `lib/storage.js` — MinIO client wrapper (`putObject`, `getObjectStream`, `getPartialObjectStream`, `removeObject`).
- `routes/photos.js` — upload, list, favorites, and blob streaming. Uploads use multer in-memory storage (1 GB/file limit). `sharp` builds a 640px webp thumbnail; for videos, `extractVideoFrame()` shells out to **ffmpeg** to grab a poster frame (falling back to a neutral placeholder). `streamBlob()` honors HTTP `Range` requests on originals so videos can seek.
- `routes/albums.js` / `routes/share.js` — albums (many-to-many via `album_photos`) and share links (opaque `crypto.randomBytes` base64url tokens, kind = `photo`|`album`|`all`, optional expiry).

**Data model** (`db/schema.sql`): `photos`, `albums`, `album_photos` (join), `share_links`. Deleting a photo cascades to `album_photos`; album cover FK is `ON DELETE SET NULL`.

**Frontend** (`frontend/src`, React 18 + Vite):
- `api/client.js` — the single axios layer (`Photos`, `Albums`, `Share`); all components go through it, never raw fetch.
- Routing in `App.jsx`: `/share/:token` renders bare (no sidebar/layout) for public recipients; all other routes render inside `Layout`. Page transitions use framer-motion `AnimatePresence`.
- Pages under `pages/`, shared UI under `components/`, each with a co-located `*.css` file.

## Conventions

- **API serialization**: DB rows are never returned raw. `serializePhoto` (photos.js) and `serializeAlbum` (albums.js) convert snake_case columns to the camelCase shape the frontend expects and synthesize URL fields (`thumbUrl`, `fileUrl`, `downloadUrl`). These serializers are imported across route files — reuse them rather than hand-shaping rows.
- **Sorting is injection-safe by whitelist**: user `?sort`/`?order` params never reach SQL directly. `photoOrderClause()` maps them through `SORT_KEYS` to fixed column expressions. Add new sortable columns there, not via string interpolation.
- All SQL uses parameterized `$1` placeholders via the `query()` helper.
- Config is entirely env-var driven (see `.env.example` / `docker-compose.yml`); no config files. Backend env vars are injected by compose, not read from `.env` at the repo root.
