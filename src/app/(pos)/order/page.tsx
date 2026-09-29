import { ACTIVE_SQL, db, isUuid } from "@/lib/db";
import { getContext } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { loadSellableMenu } from "@/lib/menu";
import { getOrder, getOrderItems } from "@/lib/orders";
import type { DiningTable, Order, OrderItem } from "@/lib/types";
import { OrderScreen } from "./OrderScreen";

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ order?: string; table?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext("order.use");
  const { lang } = await getT();
  const { branch, staff } = ctx;
  const tableParam = isUuid(sp.table) ? sp.table : null;

  const [{ categories, items }, tables] = await Promise.all([
    loadSellableMenu({ companyId: ctx.staff.company_id, branchId: ctx.branch.id }, lang),
    db.q<Pick<DiningTable, "id" | "name" | "zone" | "seats">>(
      "select id, name, zone, seats from dining_tables where branch_id = ?1 and is_active = 1 order by zone, name",
      [branch.id]
    ),
  ]);

  let orderId = isUuid(sp.order) ? sp.order : null;
  // Opening a table that already has an active order continues that order.
  if (!orderId && tableParam) {
    const row = await db.one<{ id: string }>(
      `select id from orders where table_id = ?1 and branch_id = ?2 and status in ${ACTIVE_SQL} order by created_at desc limit 1`,
      [tableParam, branch.id]
    );
    orderId = row?.id ?? null;
  }

  let order: Order | null = null;
  let orderItems: OrderItem[] = [];
  if (orderId) {
    order = await getOrder(orderId, branch.id);
    if (order) orderItems = await getOrderItems(order.id, { lang });
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
