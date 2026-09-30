"use server";

import { revalidatePath } from "next/cache";
import { db, newId, stmt } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { actionError, getContext } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

export type SettingsInput = { enabled: boolean; baht_per_point: number; point_value: number; min_redeem: number };

export async function saveSettings(input: SettingsInput): Promise<ActionResult> {
  try {
    const { staff } = await getContext("rewards.manage");
    const { t } = await getT();
    const per = Number(input.baht_per_point);
    const val = Number(input.point_value);
    const min = Math.floor(Number(input.min_redeem));
    if (!(per > 0) || per > 100000) return { ok: false, error: t("Baht per point must be more than 0") };
    if (!(val > 0) || val > 1000) return { ok: false, error: t("Point value must be more than 0") };
    if (!(min >= 0) || min > 1000000) return { ok: false, error: t("Enter a valid minimum") };
    await db.run(
      `insert into loyalty_settings (company_id, enabled, baht_per_point, point_value, min_redeem) values (?1, ?2, ?3, ?4, ?5)
       on conflict (company_id) do update set enabled = ?2, baht_per_point = ?3, point_value = ?4, min_redeem = ?5, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      [staff.company_id, input.enabled ? 1 : 0, per, val, min]
    );
    revalidatePath("/rewards");
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

/** Add or remove points by hand (positive or negative), with a note. */
export async function adjustPoints(customerId: string, delta: number, note: string): Promise<ActionResult> {
  try {
    const { staff } = await getContext("rewards.manage");
    const { t } = await getT();
    const d = Math.trunc(Number(delta) || 0);
    if (!d) return { ok: false, error: t("Enter a number of points") };
    if (Math.abs(d) > 1000000) return { ok: false, error: t("Enter a number of points") };
    const c = await db.one<{ points: number }>("select points from customers where id = ?1 and company_id = ?2", [customerId, staff.company_id]);
    if (!c) return { ok: false, error: t("Customer not found") };
    if (c.points + d < 0) return { ok: false, error: t("Not enough points") };
    await db.batch([
      stmt("update customers set points = points + ?2 where id = ?1 and company_id = ?3", customerId, d, staff.company_id),
      stmt("insert into point_ledger (id, customer_id, kind, points, note, staff_id) values (?1, ?2, 'adjust', ?3, ?4, ?5)", newId(), customerId, d, note.trim().slice(0, 140) || null, staff.id),
    ]);
    revalidatePath("/rewards");
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}
