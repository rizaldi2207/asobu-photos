import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text, params) {
  return pool.query(text, params);
}

// Idempotently apply the schema on startup, retrying until Postgres is reachable.
export async function initSchema({ retries = 10, delayMs = 2000 } = {}) {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(schema);
      console.log("[db] schema ready");
      return;
    } catch (err) {
      console.warn(`[db] schema init attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
