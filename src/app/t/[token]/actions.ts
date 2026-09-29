"use server";

import { revalidatePath } from "next/cache";
import { db, isUuid, newId, ph, stmt, type Stmt, ACTIVE_SQL } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { recalcOrder } from "@/lib/orders";
import { tableByToken } from "@/lib/table-link";
import type { ActionResult, Branch } from "@/lib/types";

export type TableOrderLine = { menuItemId: string; quantity: number; choiceIds: string[]; notes?: string | null };

const MAX_LINES = 20;
const MAX_QTY = 20;
const MAX_WAITING_LINES = 40; // lines the kitchen has not started yet, per table

/** Public (no login): guests place an order for the table behind a permanent QR link. */
export async function placeTableOrder(token: string, input: { lines: TableOrderLine[]; name?: string | null; notes?: string | null }): Promise<ActionResult<{ orderNumber: string }>> {
  const { t } = await getT();
  try {
    const table = await tableByToken(token);
    if (!table) return { ok: false, error: t("This table link is not active. Please ask our staff.") };

    const lines = (input.lines ?? []).filter((l) => l && isUuid(l.menuItemId));
    if (!lines.length) return { ok: false, error: t("Add at least one dish") };
    if (lines.length > MAX_LINES) return { ok: false, error: t("Too many items in one go — send this batch first, then add more.") };
    for (const l of lines) {
      if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY) return { ok: false, error: t("Quantity must be 1–99") };
      if (!Array.isArray(l.choiceIds) || l.choiceIds.length > 20 || l.choiceIds.some((c) => !isUuid(c))) return { ok: false, error: t("Invalid option") };
    }
    const name = input.name?.trim().slice(0, 80) || null;
    const notes = input.notes?.trim().slice(0, 280) || null;

    const itemIds = [...new Set(lines.map((l) => l.menuItemId))];
    const choiceIds = [...new Set(lines.flatMap((l) => l.choiceIds))];
    const items = await db.q<{ id: string; name: string; price: number; is_available: boolean }>(
      `select mi.id, mi.name, coalesce(o.price, mi.base_price) as price, coalesce(o.is_available, mi.is_available) as is_available
         from menu_items mi
         join categories c on c.id = mi.category_id and c.is_active = 1
         left join menu_item_branch_overrides o on o.menu_item_id = mi.id and o.branch_id = ?2
        where mi.company_id = ?1 and mi.id in (${ph(3, itemIds.length)})`,
      [table.company_id, table.branch_id, ...itemIds]
    );
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
      for (const cid of l.choiceIds) {
        const ch = choiceMap.get(cid);
        if (!ch || ch.menu_item_id !== l.menuItemId) return { ok: false, error: t("An option for {name} is no longer valid", { name: it.name }) };
        if (!ch.is_available) return { ok: false, error: t("{name} is not available right now", { name: ch.name }) };
      }
    }

    // Join the table's running bill, or open a new one
    const existing = await db.one<{ id: string; order_number: string }>(
      `select id, order_number from orders where table_id = ?1 and branch_id = ?2 and status in ${ACTIVE_SQL} order by created_at desc limit 1`,
      [table.id, table.branch_id]
    );
    if (existing) {
      const w = await db.one<{ n: number }>(
        "select count(*) as n from order_items where order_id = ?1 and status = 'pending'",
        [existing.id]
      );
      if (Number(w?.n ?? 0) + lines.length > MAX_WAITING_LINES) return { ok: false, error: t("The kitchen already has a lot waiting for this table. Please ask our staff.") };
    }
    const orderId = existing?.id ?? newId();
    const stmts: Stmt[] = [];
    if (!existing) {
      stmts.push(
        stmt(
          `insert into orders (id, branch_id, table_id, order_number, order_type, source, status, customer_name, notes)
           values (?1, ?2, ?3,
                   (select printf('%04d', coalesce(max(cast(order_number as integer)), 0) + 1) from orders where branch_id = ?2),
                   'dine_in', 'table_qr', 'open', ?4, ?5)`,
          orderId, table.branch_id, table.id, name, notes
        )
      );
    } else if (notes) {
      stmts.push(stmt("update orders set notes = case when notes is null or notes = '' then ?2 else substr(notes || char(10) || ?2, 1, 500) end where id = ?1", orderId, notes));
    }
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
      for (const cid of l.choiceIds) {
        const ch = choiceMap.get(cid)!;
        stmts.push(
          stmt("insert into order_item_options (id, order_item_id, option_choice_id, choice_name, price_delta) values (?1, ?2, ?3, ?4, ?5)", newId(), lineId, cid, ch.name, ch.price_delta)
        );
      }
    }
    stmts.push(stmt("update orders set status = 'sent_to_kitchen' where id = ?1 and status in ('open','ready','served')", orderId));
    stmts.push(stmt("update dining_tables set status = 'occupied' where id = ?1", table.id));
    await db.batch(stmts);

    const branch = await db.one<Branch>("select id, name, currency, tax_rate, service_charge_rate, timezone from branches where id = ?1", [table.branch_id]);
    if (branch) await recalcOrder(orderId, branch);
    const num = existing?.order_number ?? (await db.one<{ order_number: string }>("select order_number from orders where id = ?1", [orderId]))?.order_number ?? "";

    revalidatePath("/orders");
    revalidatePath("/tables");
    revalidatePath("/kitchen");
    return { ok: true, data: { orderNumber: num } };
  } catch (e) {
    console.error(e);
    return { ok: false, error: t("Something went wrong") };
  }
}
