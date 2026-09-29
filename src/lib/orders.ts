import "server-only";
import type { Db } from "@/lib/db";
import { computeTotals, round2 } from "@/lib/money";
import type { Branch, Order, OrderItem } from "@/lib/types";

export const ACTIVE_STATUSES = ["open", "sent_to_kitchen", "ready", "served"];

export const ORDER_COLS =
  "o.id, o.branch_id, o.table_id, o.order_number, o.order_type, o.status, o.customer_name, o.customer_count, o.subtotal, o.discount_total, o.tax_total, o.service_charge_total, o.tip_total, o.grand_total, o.notes, o.created_at, o.closed_at";

const OPTIONS_JSON = `coalesce((
  select json_agg(json_build_object('id', x.id, 'choice_name', x.choice_name, 'price_delta', x.price_delta, 'option_choice_id', x.option_choice_id))
    from order_item_options x where x.order_item_id = oi.id
), '[]') as order_item_options`;

export function getOrder(db: Db, orderId: string, branchId: string) {
  return db.one<Order>(`select ${ORDER_COLS} from orders o where o.id = $1 and o.branch_id = $2`, [orderId, branchId]);
}

export function getOrderItems(db: Db, orderId: string, opts: { excludeCancelled?: boolean } = {}) {
  return db.q<OrderItem>(
    `select oi.id, oi.order_id, oi.menu_item_id, oi.item_name, oi.unit_price, oi.quantity, oi.status, oi.notes, oi.created_at, ${OPTIONS_JSON}
       from order_items oi
      where oi.order_id = $1 ${opts.excludeCancelled ? "and oi.status <> 'cancelled'" : ""}
      order by oi.created_at`,
    [orderId]
  );
}

export function lineTotal(item: Pick<OrderItem, "unit_price" | "quantity" | "order_item_options">) {
  const extras = (item.order_item_options ?? []).reduce((s, o) => s + Number(o.price_delta), 0);
  return round2((Number(item.unit_price) + extras) * item.quantity);
}

/** Recalculate and store order totals from its non-cancelled items. */
export async function recalcOrder(db: Db, orderId: string, branch: Branch) {
  const order = await db.one<{ discount_total: number; tip_total: number }>(
    "select discount_total, tip_total from orders where id = $1",
    [orderId]
  );
  if (!order) throw new Error("Order not found");
  const row = await db.one<{ subtotal: number }>(
    `select coalesce(sum((oi.unit_price + coalesce((select sum(x.price_delta) from order_item_options x where x.order_item_id = oi.id), 0)) * oi.quantity), 0) as subtotal
       from order_items oi where oi.order_id = $1 and oi.status <> 'cancelled'`,
    [orderId]
  );
  const t = computeTotals(Number(row?.subtotal ?? 0), {
    taxRate: Number(branch.tax_rate),
    serviceRate: Number(branch.service_charge_rate),
    discount: Number(order.discount_total),
    tip: Number(order.tip_total),
  });
  await db.q("update orders set subtotal = $2, tax_total = $3, service_charge_total = $4, grand_total = $5 where id = $1", [
    orderId,
    t.subtotal,
    t.tax,
    t.service,
    t.grand,
  ]);
  return t;
}

export async function paidAmount(db: Db, orderId: string) {
  const row = await db.one<{ paid: number }>(
    "select coalesce(sum(amount), 0) as paid from payments where order_id = $1 and status = 'completed'",
    [orderId]
  );
  return round2(Number(row?.paid ?? 0));
}

/** Mark a table free when it has no active orders left. */
export async function freeTableIfIdle(db: Db, tableId: string) {
  await db.q(
    `update dining_tables set status = 'available'
      where id = $1 and not exists (select 1 from orders where table_id = $1 and status = any($2))`,
    [tableId, ACTIVE_STATUSES]
  );
}
