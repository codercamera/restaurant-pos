"use server";

import { revalidatePath } from "next/cache";
import { hashPassword } from "@/lib/auth";
import { db, isUuid, newId } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { isRole } from "@/lib/permissions";
import { actionError, getContext } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UserInput = {
  id?: string | null;
  full_name: string;
  email: string;
  role: string;
  branch_id: string;
  password?: string;
  is_active?: boolean;
};

/** Create (no id) or update (id) a user of the admin's own company. */
export async function saveUser(input: UserInput): Promise<ActionResult> {
  const { t } = await getT();
  try {
    const { staff } = await getContext("users.manage");
    const fullName = String(input.full_name ?? "").trim().slice(0, 80);
    const email = String(input.email ?? "").trim().toLowerCase();
    const password = String(input.password ?? "");
    const role = input.role;

    if (!fullName) return { ok: false, error: t("Enter the person's name.") };
    if (!EMAIL.test(email)) return { ok: false, error: t("Enter a valid email address.") };
    if (!isRole(role)) return { ok: false, error: t("Choose a role.") };
    if (!isUuid(input.branch_id)) return { ok: false, error: t("Choose a branch.") };
    const branch = await db.one("select 1 as x from branches where id = ?1 and company_id = ?2", [input.branch_id, staff.company_id]);
    if (!branch) return { ok: false, error: t("Choose a branch.") };

    const clash = await db.one<{ id: string }>("select id from staff where lower(email) = ?1", [email]);

    if (!input.id) {
      if (password.length < 8) return { ok: false, error: t("Use a password of at least 8 characters.") };
      if (clash) return { ok: false, error: t("Another account already uses this email.") };
      await db.run(
        "insert into staff (id, company_id, branch_id, full_name, email, password_hash, role) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        [newId(), staff.company_id, input.branch_id, fullName, email, await hashPassword(password), role]
      );
    } else {
      if (!isUuid(input.id)) return { ok: false, error: t("User not found") };
      const target = await db.one<{ id: string; role: string; is_active: boolean }>(
        "select id, role, is_active from staff where id = ?1 and company_id = ?2",
        [input.id, staff.company_id]
      );
      if (!target) return { ok: false, error: t("User not found") };
      if (clash && clash.id !== target.id) return { ok: false, error: t("Another account already uses this email.") };
      if (password && password.length < 8) return { ok: false, error: t("Use a password of at least 8 characters.") };

      const active = input.is_active !== false;
      const isSelf = target.id === staff.id;
      if (isSelf && (role !== target.role || !active)) return { ok: false, error: t("You can't change your own role or deactivate yourself.") };
      if (target.role === "admin" && target.is_active && (role !== "admin" || !active)) {
        const others = await db.one<{ n: number }>(
          "select count(*) as n from staff where company_id = ?1 and role = 'admin' and is_active = 1 and id <> ?2",
          [staff.company_id, target.id]
        );
        if (!others || Number(others.n) < 1) return { ok: false, error: t("Keep at least one active admin.") };
      }

      await db.run(
        `update staff set full_name = ?3, email = ?4, role = ?5, branch_id = ?6, is_active = ?7${password ? ", password_hash = ?8" : ""}
          where id = ?1 and company_id = ?2`,
        password
          ? [target.id, staff.company_id, fullName, email, role, input.branch_id, active ? 1 : 0, await hashPassword(password)]
          : [target.id, staff.company_id, fullName, email, role, input.branch_id, active ? 1 : 0]
      );
      // Deactivating or resetting a password signs that person out everywhere.
      if (!active || password) await db.run("delete from sessions where staff_id = ?1", [target.id]);
    }
    revalidatePath("/users");
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e, t);
  }
}
