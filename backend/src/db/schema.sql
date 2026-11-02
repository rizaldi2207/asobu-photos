CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  width         INTEGER,
  height        INTEGER,
  object_key    TEXT NOT NULL,
  thumb_key     TEXT NOT NULL,
  is_favorite   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS albums (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT,
  cover_photo_id UUID REFERENCES photos(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS album_photos (
  album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, photo_id)
);

CREATE TABLE IF NOT EXISTS share_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('photo', 'album', 'all')),
  target_id  UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_favorite ON photos (is_favorite) WHERE is_favorite;
CREATE INDEX IF NOT EXISTS idx_album_photos_album ON album_photos (album_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links (token);

-- ---------------------------------------------------------------------------
-- Authentication & authorization
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username));

-- Opaque session tokens; only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Ownership. Added nullable so pre-auth rows survive; the backend backfills them
-- to the initial admin on boot (see lib/auth.js → seedInitialAdmin) and then
-- enforces NOT NULL.
ALTER TABLE photos      ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE albums      ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_photos_owner_created ON photos (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_albums_owner ON albums (owner_id);
