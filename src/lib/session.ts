import "server-only";
import { redirect } from "next/navigation";
import { getSessionStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { can, type Permission } from "@/lib/permissions";
import type { Branch } from "@/lib/types";

/** Signed-in staff member + their branch. Redirects to /login when missing. */
/** Signed-in staff member + branch. Pass a permission (or several, any-of) to also require it; otherwise redirects to /no-access. */
export async function getContext(perm?: Permission | Permission[]) {
  const staff = await getSessionStaff();
  if (!staff) redirect("/login");
  if (!staff.branch_id) redirect("/login?nobranch=1");

  const branch = await db.one<Branch>(
    "select id, name, currency, tax_rate, service_charge_rate, timezone from branches where id = ?1 and company_id = ?2",
    [staff.branch_id, staff.company_id]
  );
  if (!branch) redirect("/login?nobranch=1");

  if (perm && !can(staff.role, perm)) redirect("/no-access");

  return { staff: { ...staff, branch_id: staff.branch_id }, branch };
}

export type Ctx = Awaited<ReturnType<typeof getContext>>;

/** For server actions: let Next.js redirects/notFound propagate, turn other errors into messages. */
export async function actionError(e: unknown, t?: (key: string) => string): Promise<{ ok: false; error: string }> {
  if (e && typeof e === "object" && "digest" in e) throw e;
  const tr = t ?? (await getT()).t;
  console.error(e);
  const msg = e instanceof Error ? e.message : "Something went wrong";
  return { ok: false, error: tr(/UNIQUE constraint/i.test(msg) ? "That was just taken by someone else — please try again." : msg) };
}
