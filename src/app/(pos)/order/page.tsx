import { db, isUuid } from "@/lib/db";
import { getContext } from "@/lib/session";
import { loadSellableMenu } from "@/lib/menu";
import { ACTIVE_STATUSES, getOrder, getOrderItems } from "@/lib/orders";
import type { DiningTable, Order, OrderItem } from "@/lib/types";
import { OrderScreen } from "./OrderScreen";

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ order?: string; table?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const { branch, staff } = ctx;
  const tableParam = isUuid(sp.table) ? sp.table : null;

  const [{ categories, items }, tables] = await Promise.all([
    loadSellableMenu(ctx),
    db.q<Pick<DiningTable, "id" | "name" | "zone" | "seats">>(
      "select id, name, zone, seats from dining_tables where branch_id = $1 and is_active order by zone nulls first, name",
      [branch.id]
    ),
  ]);

  let orderId = isUuid(sp.order) ? sp.order : null;
  // Opening a table that already has an active order continues that order.
  if (!orderId && tableParam) {
    const row = await db.one<{ id: string }>(
      "select id from orders where table_id = $1 and branch_id = $2 and status = any($3) order by created_at desc limit 1",
      [tableParam, branch.id, ACTIVE_STATUSES]
    );
    orderId = row?.id ?? null;
  }

  let order: Order | null = null;
  let orderItems: OrderItem[] = [];
  if (orderId) {
    order = await getOrder(db, orderId, branch.id);
    if (order) orderItems = await getOrderItems(db, order.id);
  }

  return (
    <OrderScreen
      key={order?.id ?? `new-${tableParam ?? ""}`}
      categories={categories}
      items={items}
      tables={tables}
      order={order}
      orderItems={orderItems}
      presetTableId={order?.table_id ?? tableParam}
      branch={branch}
      staffName={staff.full_name}
    />
  );
}
