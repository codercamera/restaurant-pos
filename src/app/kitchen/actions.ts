"use server";

import { revalidatePath } from "next/cache";
import { db, isUuid, stmt, type Stmt } from "@/lib/db";
import { actionError, getContext } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

/** Move a ticket to its next stage: new → cooking → ready → served. */
export async function advanceTicket(orderId: string, stage: "new" | "cooking" | "ready"): Promise<ActionResult> {
  try {
    const { branch } = await getContext();
    if (!isUuid(orderId)) return { ok: false, error: "Order not found" };
    const order = await db.one<{ status: string }>("select status from orders where id = ?1 and branch_id = ?2", [orderId, branch.id]);
    if (!order) return { ok: false, error: "Order not found" };
    const closed = order.status === "completed" || order.status === "cancelled";

    const stmts: Stmt[] = [];
    if (stage === "new") {
      stmts.push(stmt("update order_items set status = 'preparing' where order_id = ?1 and status = 'pending'", orderId));
    } else if (stage === "cooking") {
      stmts.push(stmt("update order_items set status = 'ready' where order_id = ?1 and status in ('pending','preparing')", orderId));
      if (!closed) stmts.push(stmt("update orders set status = 'ready' where id = ?1", orderId));
    } else {
      stmts.push(stmt("update order_items set status = 'served' where order_id = ?1 and status = 'ready'", orderId));
      if (!closed) {
        stmts.push(
          stmt(
            `update orders set status = 'served' where id = ?1
               and not exists (select 1 from order_items where order_id = ?1 and status in ('pending','preparing','ready'))`,
            orderId
          )
        );
      }
    }
    await db.batch(stmts);
    revalidatePath("/kitchen");
    revalidatePath("/tables");
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}
