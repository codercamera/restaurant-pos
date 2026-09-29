"use server";

import { revalidatePath } from "next/cache";
import { db, isUuid, tx } from "@/lib/db";
import { actionError, getContext } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

/** Move a ticket to its next stage: new → cooking → ready → served. */
export async function advanceTicket(orderId: string, stage: "new" | "cooking" | "ready"): Promise<ActionResult> {
  try {
    const { branch } = await getContext();
    if (!isUuid(orderId)) return { ok: false, error: "Order not found" };
    const order = await db.one<{ status: string }>("select status from orders where id = $1 and branch_id = $2", [orderId, branch.id]);
    if (!order) return { ok: false, error: "Order not found" };
    const closed = order.status === "completed" || order.status === "cancelled";

    await tx(async (t) => {
      if (stage === "new") {
        await t.q("update order_items set status = 'preparing' where order_id = $1 and status = 'pending'", [orderId]);
      } else if (stage === "cooking") {
        await t.q("update order_items set status = 'ready' where order_id = $1 and status in ('pending','preparing')", [orderId]);
        if (!closed) await t.q("update orders set status = 'ready' where id = $1", [orderId]);
      } else {
        await t.q("update order_items set status = 'served' where order_id = $1 and status = 'ready'", [orderId]);
        if (!closed) {
          await t.q(
            `update orders set status = 'served' where id = $1
               and not exists (select 1 from order_items where order_id = $1 and status in ('pending','preparing','ready'))`,
            [orderId]
          );
        }
      }
    });
    revalidatePath("/kitchen");
    revalidatePath("/tables");
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}
