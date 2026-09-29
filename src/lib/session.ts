import "server-only";
import { redirect } from "next/navigation";
import { getSessionStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Branch } from "@/lib/types";

/** Signed-in staff member + their branch. Redirects to /login when missing. */
export async function getContext() {
  const staff = await getSessionStaff();
  if (!staff) redirect("/login");
  if (!staff.branch_id) redirect("/login?nobranch=1");

  const branch = await db.one<Branch>(
    "select id, name, currency, tax_rate, service_charge_rate, timezone from branches where id = $1 and company_id = $2",
    [staff.branch_id, staff.company_id]
  );
  if (!branch) redirect("/login?nobranch=1");

  return { staff: { ...staff, branch_id: staff.branch_id }, branch };
}

export type Ctx = Awaited<ReturnType<typeof getContext>>;

export function canManage(role: string) {
  return role === "owner" || role === "admin" || role === "manager";
}

/** For server actions: let Next.js redirects/notFound propagate, turn other errors into messages. */
export function actionError(e: unknown): { ok: false; error: string } {
  if (e && typeof e === "object" && "digest" in e) throw e;
  console.error(e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
