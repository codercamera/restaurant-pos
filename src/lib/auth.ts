import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Staff } from "@/lib/types";

export const SESSION_COOKIE = "pos_session";
const SESSION_DAYS = 30;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(staffId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.q("insert into sessions (id, staff_id, expires_at) values ($1, $2, $3)", [hashToken(token), staffId, expires.toISOString()]);
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
  if (token) await db.q("delete from sessions where id = $1", [hashToken(token)]);
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
      where x.id = $1 and x.expires_at > now() and s.is_active`,
    [hashToken(token)]
  );
}
