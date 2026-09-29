import { ACTIVE_SQL, db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { canManage, getContext } from "@/lib/session";
import type { DiningTable } from "@/lib/types";
import { FloorPlan, type TableOrder } from "./FloorPlan";

export default async function TablesPage() {
  const { branch, staff } = await getContext();
  const { lang } = await getT();
  const th = lang === "th";

  const [tables, orders] = await Promise.all([
    db.q<DiningTable>(
      `select id, name, coalesce(nullif(zone, ''), 'Main hall') as zone, seats, status,
              coalesce(pos_x, 0) as pos_x, coalesce(pos_y, 0) as pos_y, width, height, shape
         from dining_tables where branch_id = ?1 and is_active = 1 order by name`,
      [branch.id]
    ),
    db.q<TableOrder>(
      `select o.id, o.table_id as tableId, o.order_number as number, o.status, o.customer_count as guests,
              o.grand_total as total, o.created_at as createdAt,
              coalesce((
                select json_group_array(json_object('item_name', x.item_name, 'quantity', x.quantity, 'status', x.status))
                  from (${
                    th
                      ? `select coalesce(nullif(mi.name_th, ''), oi.item_name) as item_name, oi.quantity, oi.status from order_items oi
                         left join menu_items mi on mi.id = oi.menu_item_id
                         where oi.order_id = o.id and oi.status <> 'cancelled' order by oi.created_at, oi.rowid`
                      : `select item_name, quantity, status from order_items
                         where order_id = o.id and status <> 'cancelled' order by created_at, rowid`
                  }) x
              ), '[]') as items
         from orders o
        where o.branch_id = ?1 and o.table_id is not null and o.status in ${ACTIVE_SQL}
        order by o.created_at`,
      [branch.id]
    ),
  ]);

  return <FloorPlan tables={tables} orders={orders} currency={branch.currency} canEdit={canManage(staff.role)} />;
}
