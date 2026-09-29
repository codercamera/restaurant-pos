"use server";

import { revalidatePath } from "next/cache";
import { ACTIVE_SQL, db, isUuid, newId, NOW, ph, stmt, type Stmt } from "@/lib/db";
import { actionError, getContext } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { freeTableStmt, recalcOrder } from "@/lib/orders";
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
    const { t } = await getT();

    if (!["dine_in", "takeaway", "delivery"].includes(input.orderType)) return { ok: false, error: t("Unknown order type") };
    const lines = (input.lines ?? []).filter((l) => l && isUuid(l.menuItemId));
    if (lines.length > 40) return { ok: false, error: t("Too many items in one go — send this batch first, then add more.") };
    for (const l of lines) {
      if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 99) return { ok: false, error: t("Quantity must be 1–99") };
      if ((l.choiceIds ?? []).some((c) => !isUuid(c))) return { ok: false, error: t("Invalid option") };
    }
    const tableId = input.orderType === "dine_in" && isUuid(input.tableId) ? input.tableId : null;
    if (input.orderId && !isUuid(input.orderId)) return { ok: false, error: t("Order not found") };
    const guests = input.guests && input.guests > 0 ? Math.min(99, Math.floor(input.guests)) : null;
    const customerName = input.customerName?.trim().slice(0, 80) || null;
    const notes = input.notes?.trim().slice(0, 280) || null;

    if (tableId) {
      const tbl = await db.one("select 1 as x from dining_tables where id = ?1 and branch_id = ?2 and is_active = 1", [tableId, branch.id]);
      if (!tbl) return { ok: false, error: t("That table no longer exists") };
    }

    // Resolve prices on the server (branch overrides applied)
    const itemIds = [...new Set(lines.map((l) => l.menuItemId))];
    const choiceIds = [...new Set(lines.flatMap((l) => l.choiceIds ?? []))];
    if (choiceIds.length > 90) return { ok: false, error: t("Too many options selected") };
    const items = itemIds.length
      ? await db.q<{ id: string; name: string; price: number; is_available: boolean }>(
          `select mi.id, mi.name, coalesce(o.price, mi.base_price) as price, coalesce(o.is_available, mi.is_available) as is_available
             from menu_items mi
             left join menu_item_branch_overrides o on o.menu_item_id = mi.id and o.branch_id = ?2
            where mi.company_id = ?1 and mi.id in (${ph(3, itemIds.length)})`,
          [staff.company_id, branch.id, ...itemIds]
        )
      : [];
    const choices = choiceIds.length
      ? await db.q<{ id: string; name: string; price_delta: number; is_available: boolean; menu_item_id: string }>(
          `select ch.id, ch.name, ch.price_delta, ch.is_available, g.menu_item_id
             from option_choices ch join option_groups g on g.id = ch.option_group_id
            where ch.id in (${ph(1, choiceIds.length)})`,
          choiceIds
        )
      : [];
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const choiceMap = new Map(choices.map((c) => [c.id, c]));
    for (const l of lines) {
      const it = itemMap.get(l.menuItemId);
      if (!it) return { ok: false, error: t("A dish on this order no longer exists") };
      if (!it.is_available) return { ok: false, error: t("{name} is not available right now", { name: it.name }) };
      for (const cid of l.choiceIds ?? []) {
        const ch = choiceMap.get(cid);
        if (!ch || ch.menu_item_id !== l.menuItemId) return { ok: false, error: t("An option for {name} is no longer valid", { name: it.name }) };
        if (!ch.is_available) return { ok: false, error: t("{name} is not available right now", { name: ch.name }) };
      }
    }

    // Create or update the order
    let orderId = input.orderId || null;
    if (!orderId && tableId) {
      const existing = await db.one<{ id: string }>(
        `select id from orders where table_id = ?1 and branch_id = ?2 and status in ${ACTIVE_SQL} order by created_at desc limit 1`,
        [tableId, branch.id]
      );
      orderId = existing?.id ?? null;
    }
    let isNew = false;
    if (!orderId) {
      if (!lines.length) return { ok: false, error: t("Add at least one dish") };
      orderId = newId();
      isNew = true;
    } else {
      const cur = await db.one<{ status: string }>("select status from orders where id = ?1 and branch_id = ?2", [orderId, branch.id]);
      if (!cur) return { ok: false, error: t("Order not found") };
      if (cur.status === "completed" || cur.status === "cancelled") return { ok: false, error: t("This order is already closed") };
    }

    const stmts: Stmt[] = [];
    if (isNew) {
      stmts.push(
        stmt(
          `insert into orders (id, branch_id, table_id, order_number, order_type, status, opened_by_staff_id, customer_count, customer_name, notes)
           values (?1, ?2, ?3,
                   (select printf('%04d', coalesce(max(cast(order_number as integer)), 0) + 1) from orders where branch_id = ?2),
                   ?4, 'open', ?5, ?6, ?7, ?8)`,
          orderId, branch.id, tableId, input.orderType, staff.id, guests, customerName, notes
        )
      );
    } else {
      stmts.push(
        stmt(
          `update orders set table_id = ?2, order_type = ?3, customer_count = ?4, customer_name = ?5, notes = ?6, updated_at = ${NOW}
            where id = ?1 and branch_id = ?7 and status not in ('completed','cancelled')`,
          orderId, tableId, input.orderType, guests, customerName, notes, branch.id
        )
      );
    }

    // New lines go straight to the kitchen
    for (const l of lines) {
      const it = itemMap.get(l.menuItemId)!;
      const lineId = newId();
      stmts.push(
        stmt(
          `insert into order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, status, notes)
           values (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7)`,
          lineId, orderId, l.menuItemId, it.name, it.price, l.quantity, l.notes?.trim().slice(0, 140) || null
        )
      );
      for (const cid of l.choiceIds ?? []) {
        const ch = choiceMap.get(cid)!;
        stmts.push(
          stmt(
            "insert into order_item_options (id, order_item_id, option_choice_id, choice_name, price_delta) values (?1, ?2, ?3, ?4, ?5)",
            newId(), lineId, cid, ch.name, ch.price_delta
          )
        );
      }
    }
    if (lines.length) {
      stmts.push(stmt("update orders set status = 'sent_to_kitchen' where id = ?1 and status in ('open','ready','served')", orderId));
    }
    if (tableId) stmts.push(stmt("update dining_tables set status = 'occupied' where id = ?1 and branch_id = ?2", tableId, branch.id));

    await db.batch(stmts); // atomic
    await recalcOrder(orderId, branch);

    refresh();
    return { ok: true, data: { orderId } };
  } catch (e) {
    return actionError(e);
  }
}

export async function voidItem(itemId: string): Promise<ActionResult> {
  try {
    const { branch } = await getContext();
    const { t } = await getT();
    if (!isUuid(itemId)) return { ok: false, error: t("Item not found") };
    const item = await db.one<{ order_id: string; status: string }>(
      "select oi.order_id, oi.status from order_items oi join orders o on o.id = oi.order_id where oi.id = ?1 and o.branch_id = ?2",
      [itemId, branch.id]
    );
    if (!item) return { ok: false, error: t("Item not found") };
    if (item.status === "served") return { ok: false, error: t("This item was already served") };
    await db.run("update order_items set status = 'cancelled' where id = ?1", [itemId]);
    await recalcOrder(item.order_id, branch);
    refresh();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  try {
    const { branch } = await getContext();
    const { t } = await getT();
    if (!isUuid(orderId)) return { ok: false, error: t("Order not found") };
    const o = await db.one<{ table_id: string | null }>("select table_id from orders where id = ?1 and branch_id = ?2", [orderId, branch.id]);
    if (!o) return { ok: false, error: t("Order not found") };
    const paid = await db.one("select 1 as x from payments where order_id = ?1 limit 1", [orderId]);
    if (paid) return { ok: false, error: t("This order already has payments") };
    await db.batch([
      stmt("update order_items set status = 'cancelled' where order_id = ?1 and status <> 'served'", orderId),
      stmt(`update orders set status = 'cancelled', closed_at = ${NOW} where id = ?1 and branch_id = ?2`, orderId, branch.id),
      ...(o.table_id ? [freeTableStmt(o.table_id)] : []),
    ]);
    refresh();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}
