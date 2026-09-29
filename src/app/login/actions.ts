"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { db, newId, stmt } from "@/lib/db";
import { seedStatements } from "@/lib/seed";

export type AuthState = { error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const staff = await db.one<{ id: string; password_hash: string | null; is_active: boolean }>(
    "select id, password_hash, is_active from staff where lower(email) = ?1",
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

  const exists = await db.one("select 1 as x from staff where lower(email) = ?1", [email]);
  if (exists) return { error: "An account with this email already exists. Sign in instead." };

  const hash = await hashPassword(password);
  const companyId = newId();
  const branchId = newId();
  const staffId = newId();
  try {
    await db.batch([
      stmt("insert into companies (id, name) values (?1, ?2)", companyId, company),
      stmt("insert into branches (id, company_id, name) values (?1, ?2, ?3)", branchId, companyId, branch),
      stmt(
        "insert into staff (id, company_id, branch_id, full_name, email, password_hash, role) values (?1, ?2, ?3, ?4, ?5, ?6, 'owner')",
        staffId,
        companyId,
        branchId,
        fullName,
        email,
        hash
      ),
      ...(withSample ? seedStatements(companyId, branchId) : []),
    ]);
  } catch (e) {
    console.error(e);
    return { error: /UNIQUE/i.test(String(e)) ? "An account with this email already exists. Sign in instead." : "Could not create the restaurant. Please try again." };
  }

  await createSession(staffId);
  redirect("/tables");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
