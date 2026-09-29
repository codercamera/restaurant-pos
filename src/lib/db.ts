import "server-only";
import { Pool, types, type PoolClient } from "pg";

// Return numbers and ISO strings instead of strings/Dates.
types.setTypeParser(1700, (v: string) => parseFloat(v)); // numeric
types.setTypeParser(20, (v: string) => parseInt(v, 10)); // int8 / count(*)
types.setTypeParser(1184, (v: string) => new Date(v).toISOString()); // timestamptz

const g = globalThis as unknown as { __posPool?: Pool };

function pool(): Pool {
  if (!g.__posPool) {
    g.__posPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return g.__posPool;
}

type Exec = Pool | PoolClient;

export type Db = {
  q<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null>;
};

function runner(exec: () => Exec): Db {
  return {
    async q<T>(text: string, params?: unknown[]) {
      const r = await exec().query(text, params as unknown[] | undefined);
      return r.rows as T[];
    },
    async one<T>(text: string, params?: unknown[]) {
      const r = await exec().query(text, params as unknown[] | undefined);
      return (r.rows[0] as T | undefined) ?? null;
    },
  };
}

export const db: Db = runner(pool);

/** Run fn inside a transaction; rolls back on throw. */
export async function tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(runner(() => client));
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
