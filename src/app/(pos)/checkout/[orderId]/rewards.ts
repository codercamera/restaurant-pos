"use server";

import { revalidatePath } from "next/cache";
import { db, isUuid, newId, stmt } from "@/lib/db";
import { getLoyaltySettings } from "@/lib/loyalty";
import { getT } from "@/lib/i18n/server";
import { paidAmount, recalcOrder } from "@/lib/orders";
import { round2 } from "@/lib/money";
import { normalizeThaiPhone } from "@/lib/phone";
import { actionError, getContext } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

type Editable = { id: string; subtotal: number; customer_id: string | null };

/** The order must be open and unpaid: rewards change the bill, so they lock with the first payment. */
async function editableOrder(orderId: string, branchId: string, t: (k: string) => string): Promise<Editable | string> {
  if (!isUuid(orderId)) return t("Order not found");
  const o = await db.one<Editable & { status: string }>("select id, status, subtotal, customer_id from orders where id = ?1 and branch_id = ?2", [orderId, branchId]);
  if (!o) return t("Order not found");
  if (o.status === "completed" || o.status === "cancelled") return t("This order is already closed");
  if ((await paidAmount(orderId)) > 0) return t("Rewards can't be changed after the first payment");
  return o;
}

export async function attachCustomer(orderId: string, phoneInput: string, nameInput?: string | null): Promise<ActionResult> {
  try {
    const { staff, branch } = await getContext("checkout");
    const { t } = await getT();
    const settings = await getLoyaltySettings(staff.company_id);
    if (!settings.enabled) return { ok: false, error: t("Rewards are turned off") };
    const phone = normalizeThaiPhone(phoneInput);
    if (!phone) return { ok: false, error: t("Enter a Thai mobile number, e.g. 081-234-5678") };
    const o = await editableOrder(orderId, branch.id, t);
    if (typeof o === "string") return { ok: false, error: o };
    const name = nameInput?.trim().slice(0, 80) || null;

    await db.batch([
      stmt("insert into customers (id, company_id, phone, name) values (?1, ?2, ?3, ?4) on conflict (company_id, phone) do update set name = coalesce(customers.name, excluded.name)", newId(), staff.company_id, phone, name),
      // switching customer clears any points already applied to this bill
      stmt(
        `update orders set customer_id = (select id from customers where company_id = ?2 and phone = ?3),
                points_redeemed = case when customer_id is (select id from customers where company_id = ?2 and phone = ?3) then points_redeemed else 0 end,
                discount_total = case when customer_id is (select id from customers where company_id = ?2 and phone = ?3) then discount_total else 0 end
          where id = ?1`,
        orderId, staff.company_id, phone
      ),
    ]);
    await recalcOrder(orderId, branch);
    revalidatePath(`/checkout/${orderId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

export async function detachCustomer(orderId: string): Promise<ActionResult> {
  try {
    const { branch } = await getContext("checkout");
    const { t } = await getT();
    const o = await editableOrder(orderId, branch.id, t);
    if (typeof o === "string") return { ok: false, error: o };
    await db.run("update orders set customer_id = null, points_redeemed = 0, discount_total = 0 where id = ?1", [orderId]);
    await recalcOrder(orderId, branch);
    revalidatePath(`/checkout/${orderId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

/** Use `points` (0 clears) from the attached customer as a baht discount on this bill. */
export async function setRedeem(orderId: string, pointsInput: number): Promise<ActionResult> {
  try {
    const { staff, branch } = await getContext("checkout");
    const { t } = await getT();
    const settings = await getLoyaltySettings(staff.company_id);
    const o = await editableOrder(orderId, branch.id, t);
    if (typeof o === "string") return { ok: false, error: o };
    if (!o.customer_id) return { ok: false, error: t("Add the customer's phone number first") };
    const points = Math.floor(Number(pointsInput) || 0);
    if (points < 0) return { ok: false, error: t("Enter a number of points") };
    let discount = 0;
    if (points > 0) {
      if (!settings.enabled) return { ok: false, error: t("Rewards are turned off") };
      if (points < settings.min_redeem) return { ok: false, error: t("Minimum to redeem is {n} points", { n: settings.min_redeem }) };
      const c = await db.one<{ points: number }>("select points from customers where id = ?1 and company_id = ?2", [o.customer_id, staff.company_id]);
      if (!c || c.points < points) return { ok: false, error: t("Not enough points") };
      discount = round2(points * settings.point_value);
      if (discount > round2(o.subtotal)) return { ok: false, error: t("That is more than the bill. Use fewer points.") };
    }
    await db.run("update orders set points_redeemed = ?2, discount_total = ?3 where id = ?1", [orderId, points, discount]);
    await recalcOrder(orderId, branch);
    revalidatePath(`/checkout/${orderId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}
