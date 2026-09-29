"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { actionError, getContext } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

export async function setSelfOrder(tableId: string, on: boolean): Promise<ActionResult> {
  try {
    const { branch } = await getContext("tables.edit");
    const { t } = await getT();
    const n = await db.run("update dining_tables set self_order = ?3 where id = ?1 and branch_id = ?2", [tableId, branch.id, on ? 1 : 0]);
    if (!n) return { ok: false, error: t("That table no longer exists") };
    revalidatePath("/tables/qr");
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

/** New random link; the old QR code stops working immediately. */
export async function regenerateLink(tableId: string): Promise<ActionResult> {
  try {
    const { branch } = await getContext("tables.edit");
    const { t } = await getT();
    const n = await db.run("update dining_tables set qr_token = lower(hex(randomblob(16))) where id = ?1 and branch_id = ?2", [tableId, branch.id]);
    if (!n) return { ok: false, error: t("That table no longer exists") };
    revalidatePath("/tables/qr");
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}
