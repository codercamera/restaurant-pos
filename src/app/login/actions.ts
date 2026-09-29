"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { db, tx } from "@/lib/db";

export type AuthState = { error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const staff = await db.one<{ id: string; password_hash: string | null; is_active: boolean }>(
    "select id, password_hash, is_active from staff where lower(email) = $1",
    [email]
  );
  const ok = staff?.password_hash ? await verifyPassword(password, staff.password_hash) : false;
  if (!staff || !ok) return { error: "That email and password don't match." };
  if (!staff.is_active) return { error: "This account has been deactivated." };

  await createSession(staff.id);
  redirect("/order");
}

/** Creates a restaurant (company + first branch) with the signer-up as owner. */
export async function createRestaurant(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const company = String(formData.get("company") ?? "").trim().slice(0, 80);
  const branch = String(formData.get("branch") ?? "").trim().slice(0, 80) || "Main branch";
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const withSample = formData.get("sample") === "on";

  if (!company || !fullName) return { error: "Enter the restaurant name and your name." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const exists = await db.one("select 1 from staff where lower(email) = $1", [email]);
  if (exists) return { error: "An account with this email already exists. Sign in instead." };

  const hash = await hashPassword(password);
  const staffId = await tx(async (t) => {
    const c = await t.one<{ id: string }>("insert into companies (name) values ($1) returning id", [company]);
    const b = await t.one<{ id: string }>("insert into branches (company_id, name) values ($1, $2) returning id", [c!.id, branch]);
    const s = await t.one<{ id: string }>(
      "insert into staff (company_id, branch_id, full_name, email, password_hash, role) values ($1, $2, $3, $4, $5, 'owner') returning id",
      [c!.id, b!.id, fullName, email, hash]
    );
    if (withSample) await t.q("select seed_sample($1, $2)", [c!.id, b!.id]);
    return s!.id;
  });

  await createSession(staffId);
  redirect("/tables");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
