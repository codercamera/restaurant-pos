// Applies db/schema.sql (idempotent). Runs before `next start`.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = await readFile(path.join(dir, "..", "db", "schema.sql"), "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

for (let attempt = 1; ; attempt++) {
  try {
    await client.connect();
    break;
  } catch (e) {
    if (attempt >= 10) throw e;
    console.log(`[migrate] database not ready (${e.message}), retrying…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

try {
  await client.query("select pg_advisory_lock(727001)");
  await client.query(sql);
  console.log("[migrate] schema up to date");
} finally {
  await client.query("select pg_advisory_unlock(727001)").catch(() => {});
  await client.end();
}
