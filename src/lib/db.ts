import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Minimal shape of the D1 binding we use (avoids depending on generated types).
interface D1Result<T> {
  results: T[];
  success: boolean;
  meta?: { changes?: number };
}
interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}
interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(statements: D1Stmt[]): Promise<D1Result<unknown>[]>;
}

function d1(): D1Like {
  return (getCloudflareContext().env as unknown as { DB: D1Like }).DB;
}

/** SQL expression for "now" as ISO-8601 UTC text (the format stored in every timestamp column). */
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export const ACTIVE_SQL = "('open','sent_to_kitchen','ready','served')";

export const newId = () => crypto.randomUUID();

const UUID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** "?4,?5,?6" — numbered placeholders for an IN (...) list starting at index `start`. */
export function ph(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => `?${start + i}`).join(",");
}

const JSON_KEYS = new Set(["images", "options", "order_item_options", "option_choices", "items", "snapshot"]);

function fix<T>(row: Record<string, unknown>): T {
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (k.startsWith("is_") && (v === 0 || v === 1)) row[k] = v === 1;
    else if (JSON_KEYS.has(k) && typeof v === "string") {
      try {
        row[k] = JSON.parse(v);
      } catch {
        /* leave as text */
      }
    }
  }
  return row as T;
}

const bindable = (v: unknown) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

export type Stmt = { sql: string; params: unknown[] };
/** Describe a statement for db.batch(). Placeholders are numbered: ?1, ?2, … */
export const stmt = (sql: string, ...params: unknown[]): Stmt => ({ sql, params });

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await d1()
    .prepare(sql)
    .bind(...params.map(bindable))
    .all<Record<string, unknown>>();
  return (r.results ?? []).map((row) => fix<T>(row));
}

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

/** Runs one statement; resolves to the number of rows it changed. */
async function run(sql: string, params: unknown[] = []): Promise<number> {
  const r = await d1()
    .prepare(sql)
    .bind(...params.map(bindable))
    .run();
  return r.meta?.changes ?? 0;
}

/** Run statements atomically: D1 batches are a single transaction (all commit or none). */
async function batch(statements: Stmt[]): Promise<void> {
  if (!statements.length) return;
  const d = d1();
  await d.batch(statements.map((s) => d.prepare(s.sql).bind(...s.params.map(bindable))));
}

export const db = { q, one, run, batch };
