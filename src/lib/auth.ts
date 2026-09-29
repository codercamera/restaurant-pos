import "server-only";
import { cookies } from "next/headers";
import { db, NOW } from "@/lib/db";
import type { Staff } from "@/lib/types";

export const SESSION_COOKIE = "pos_session";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000; // Workers caps PBKDF2 at 100k iterations

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const got = await pbkdf2(password, fromB64(salt), parseInt(iter, 10));
  const want = fromB64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

export async function createSession(staffId: string) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = toB64(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.run("insert into sessions (id, staff_id, expires_at) values (?1, ?2, ?3)", [await sha256Hex(token), staffId, expires.toISOString()]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.run("delete from sessions where id = ?1", [await sha256Hex(token)]);
  jar.delete(SESSION_COOKIE);
}

/** Staff member for the current session cookie, or null. */
export async function getSessionStaff(): Promise<Staff | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return db.one<Staff>(
    `select s.id, s.full_name, s.role, s.company_id, s.branch_id, s.email
       from sessions x
       join staff s on s.id = x.staff_id
      where x.id = ?1 and x.expires_at > ${NOW} and s.is_active = 1`,
    [await sha256Hex(token)]
  );
}
