# Asobu Photos 📸

A containerized web photo gallery with **upload**, **download**, and **share-link** features.
Browse **All Photos**, organize into **Albums** (with thumbnails), and curate **Favorites** —
all wrapped in a dark, cinematic, glassmorphism UI with rich animation.

## Stack

| Layer     | Tech                                   |
| --------- | -------------------------------------- |
| Frontend  | React + Vite, framer-motion, nginx     |
| Backend   | Node.js + Express                      |
| Blobs     | MinIO (S3-compatible object storage)   |
| Metadata  | PostgreSQL                             |
| Orchestration | Docker Compose                     |

Image bytes are streamed through the backend, so MinIO credentials never reach the browser.

## Quick start

```bash
cp .env.example .env      # optional — defaults work out of the box
docker compose up -d --build
```

Then open:

- **App:** http://localhost:8080
- **Backend health:** http://localhost:3000/api/health
- **MinIO console:** http://localhost:9001 (login with `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)

### Port already in use?

If `8080`, `3000`, `9000`, or `9001` are taken by another app, override them in `.env`
(and set `PUBLIC_BASE_URL` to match the frontend port so share links work):

```bash
FRONTEND_PORT=8090
BACKEND_PORT=3010
MINIO_API_PORT=9010
MINIO_CONSOLE_PORT=9011
PUBLIC_BASE_URL=http://localhost:8090
```

## Features

- **Upload** — drag & drop multiple images; thumbnails generated server-side.
- **Download** — original file streamed with a proper filename.
- **Share links** — generate an unguessable `/share/<token>` URL for a single photo,
  an album, or the whole gallery. Recipients get a read-only view and can download.
- **All Photos** — animated masonry grid.
- **Albums** — create albums, add photos, browse by album thumbnail.
- **Favorites** — heart any photo; view your curated set.

## Services

| Service        | Port  | Purpose                                  |
| -------------- | ----- | ---------------------------------------- |
| `frontend`     | 8080  | React SPA via nginx, proxies `/api`      |
| `backend`      | 3000  | Express REST API                         |
| `db`           | —     | PostgreSQL (metadata)                    |
| `minio`        | 9000/9001 | Object storage (API / console)       |
| `createbuckets`| —     | One-shot init: creates the bucket        |

## Development notes

- Schema is created idempotently on backend startup (`backend/src/db/schema.sql`).
- Configuration is via environment variables (see `.env.example`).
