import { db } from "@/lib/db";
import { ACTIVE_STATUSES } from "@/lib/orders";
import { canManage, getContext } from "@/lib/session";
import type { DiningTable } from "@/lib/types";
import { FloorPlan, type TableOrder } from "./FloorPlan";

export default async function TablesPage() {
  const { branch, staff } = await getContext();

  const [tables, orders] = await Promise.all([
    db.q<DiningTable>(
      `select id, name, coalesce(nullif(zone, ''), 'Main hall') as zone, seats, status,
              coalesce(pos_x, 0) as pos_x, coalesce(pos_y, 0) as pos_y, width, height, shape
         from dining_tables where branch_id = $1 and is_active order by name`,
      [branch.id]
    ),
    db.q<TableOrder>(
      `select o.id, o.table_id as "tableId", o.order_number as number, o.status, o.customer_count as guests,
              o.grand_total as total, o.created_at as "createdAt",
              coalesce((select json_agg(json_build_object('item_name', oi.item_name, 'quantity', oi.quantity, 'status', oi.status) order by oi.created_at)
                          from order_items oi where oi.order_id = o.id and oi.status <> 'cancelled'), '[]') as items
         from orders o
        where o.branch_id = $1 and o.table_id is not null and o.status = any($2)
        order by o.created_at`,
      [branch.id, ACTIVE_STATUSES]
    ),
  ]);

  return <FloorPlan tables={tables} orders={orders} currency={branch.currency} canEdit={canManage(staff.role)} />;
}
