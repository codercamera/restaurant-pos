"use server";

import { revalidatePath } from "next/cache";
import { db, isUuid, tx } from "@/lib/db";
import { actionError, getContext } from "@/lib/session";
import { ACTIVE_STATUSES, freeTableIfIdle, recalcOrder } from "@/lib/orders";
import type { ActionResult, OrderType } from "@/lib/types";

export type DraftLineInput = {
  menuItemId: string;
  quantity: number;
  choiceIds: string[];
  notes?: string | null;
};

export type SaveOrderInput = {
  orderId?: string | null;
  tableId?: string | null;
  orderType: OrderType;
  guests?: number | null;
  customerName?: string | null;
  notes?: string | null;
  lines: DraftLineInput[];
};

function refresh() {
  revalidatePath("/order");
  revalidatePath("/orders");
  revalidatePath("/tables");
  revalidatePath("/kitchen");
}

export async function saveOrder(input: SaveOrderInput): Promise<ActionResult<{ orderId: string }>> {
  try {
    const { staff, branch } = await getContext();

    if (!["dine_in", "takeaway", "delivery"].includes(input.orderType)) return { ok: false, error: "Unknown order type" };
    const lines = (input.lines ?? []).filter((l) => l && isUuid(l.menuItemId));
    for (const l of lines) {
      if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 99) return { ok: false, error: "Quantity must be 1–99" };
      if ((l.choiceIds ?? []).some((c) => !isUuid(c))) return { ok: false, error: "Invalid option" };
    }
    const tableId = input.orderType === "dine_in" && isUuid(input.tableId) ? input.tableId : null;
    if (input.orderId && !isUuid(input.orderId)) return { ok: false, error: "Order not found" };
    const guests = input.guests && input.guests > 0 ? Math.min(99, Math.floor(input.guests)) : null;
    const customerName = input.customerName?.trim().slice(0, 80) || null;
    const notes = input.notes?.trim().slice(0, 280) || null;

    if (tableId) {
      const t = await db.one("select 1 from dining_tables where id = $1 and branch_id = $2 and is_active", [tableId, branch.id]);
      if (!t) return { ok: false, error: "That table no longer exists" };
    }

    // Resolve prices on the server (branch overrides applied)
    const itemIds = [...new Set(lines.map((l) => l.menuItemId))];
    const choiceIds = [...new Set(lines.flatMap((l) => l.choiceIds ?? []))];
    const items = itemIds.length
      ? await db.q<{ id: string; name: string; price: number; available: boolean }>(
          `select mi.id, mi.name, coalesce(o.price, mi.base_price) as price, coalesce(o.is_available, mi.is_available) as available
             from menu_items mi
             left join menu_item_branch_overrides o on o.menu_item_id = mi.id and o.branch_id = $2
            where mi.company_id = $1 and mi.id = any($3::uuid[])`,
          [staff.company_id, branch.id, itemIds]
        )
      : [];
    const choices = choiceIds.length
      ? await db.q<{ id: string; name: string; price_delta: number; is_available: boolean; menu_item_id: string }>(
          `select ch.id, ch.name, ch.price_delta, ch.is_available, g.menu_item_id
             from option_choices ch join option_groups g on g.id = ch.option_group_id
            where ch.id = any($1::uuid[])`,
          [choiceIds]
        )
      : [];
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const choiceMap = new Map(choices.map((c) => [c.id, c]));
    for (const l of lines) {
      const it = itemMap.get(l.menuItemId);
      if (!it) return { ok: false, error: "A dish on this order no longer exists" };
      if (!it.available) return { ok: false, error: `${it.name} is not available right now` };
      for (const cid of l.choiceIds ?? []) {
        const ch = choiceMap.get(cid);
        if (!ch || ch.menu_item_id !== l.menuItemId) return { ok: false, error: `An option for ${it.name} is no longer valid` };
        if (!ch.is_available) return { ok: false, error: `${ch.name} is not available right now` };
      }
    }

    const result = await tx(async (t): Promise<ActionResult<{ orderId: string }>> => {
      let orderId = input.orderId || null;
      if (!orderId && tableId) {
        const existing = await t.one<{ id: string }>(
          "select id from orders where table_id = $1 and branch_id = $2 and status = any($3) order by created_at desc limit 1 for update",
          [tableId, branch.id, ACTIVE_STATUSES]
        );
        orderId = existing?.id ?? null;
      }

      if (!orderId) {
        if (!lines.length) return { ok: false, error: "Add at least one dish" };
        const created = await t.one<{ id: string }>(
          `insert into orders (branch_id, table_id, order_type, status, opened_by_staff_id, customer_count, customer_name, notes)
           values ($1, $2, $3, 'open', $4, $5, $6, $7) returning id`,
          [branch.id, tableId, input.orderType, staff.id, guests, customerName, notes]
        );
        orderId = created!.id;
      } else {
        const cur = await t.one<{ status: string }>("select status from orders where id = $1 and branch_id = $2 for update", [orderId, branch.id]);
        if (!cur) return { ok: false, error: "Order not found" };
        if (cur.status === "completed" || cur.status === "cancelled") return { ok: false, error: "This order is already closed" };
        await t.q(
          "update orders set table_id = $2, order_type = $3, customer_count = $4, customer_name = $5, notes = $6 where id = $1",
          [orderId, tableId, input.orderType, guests, customerName, notes]
        );
      }

      // New lines go straight to the kitchen
      for (const l of lines) {
        const it = itemMap.get(l.menuItemId)!;
        const row = await t.one<{ id: string }>(
          `insert into order_items (order_id, menu_item_id, item_name, unit_price, quantity, status, notes)
           values ($1, $2, $3, $4, $5, 'pending', $6) returning id`,
          [orderId, l.menuItemId, it.name, it.price, l.quantity, l.notes?.trim().slice(0, 140) || null]
        );
        for (const cid of l.choiceIds ?? []) {
          const ch = choiceMap.get(cid)!;
          await t.q(
            "insert into order_item_options (order_item_id, option_choice_id, choice_name, price_delta) values ($1, $2, $3, $4)",
            [row!.id, cid, ch.name, ch.price_delta]
          );
        }
      }
      if (lines.length) {
        await t.q("update orders set status = 'sent_to_kitchen' where id = $1 and status in ('open','ready','served')", [orderId]);
      }
      await recalcOrder(t, orderId, branch);
      if (tableId) await t.q("update dining_tables set status = 'occupied' where id = $1", [tableId]);
      return { ok: true, data: { orderId } };
    });

    if (result.ok) refresh();
    return result;
  } catch (e) {
    return actionError(e);
  }
}

export async function voidItem(itemId: string): Promise<ActionResult> {
  try {
    const { branch } = await getContext();
    if (!isUuid(itemId)) return { ok: false, error: "Item not found" };
    const item = await db.one<{ order_id: string; status: string }>(
      "select oi.order_id, oi.status from order_items oi join orders o on o.id = oi.order_id where oi.id = $1 and o.branch_id = $2",
      [itemId, branch.id]
    );
    if (!item) return { ok: false, error: "Item not found" };
    if (item.status === "served") return { ok: false, error: "This item was already served" };
    await tx(async (t) => {
      await t.q("update order_items set status = 'cancelled' where id = $1", [itemId]);
      await recalcOrder(t, item.order_id, branch);
    });
    refresh();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  try {
    const { branch } = await getContext();
    if (!isUuid(orderId)) return { ok: false, error: "Order not found" };
    const o = await db.one<{ table_id: string | null }>("select table_id from orders where id = $1 and branch_id = $2", [orderId, branch.id]);
    if (!o) return { ok: false, error: "Order not found" };
    const paid = await db.one("select 1 from payments where order_id = $1 limit 1", [orderId]);
    if (paid) return { ok: false, error: "This order already has payments" };
    await tx(async (t) => {
      await t.q("update order_items set status = 'cancelled' where order_id = $1 and status <> 'served'", [orderId]);
      await t.q("update orders set status = 'cancelled', closed_at = now() where id = $1", [orderId]);
      if (o.table_id) await freeTableIfIdle(t, o.table_id);
    });
    refresh();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}
