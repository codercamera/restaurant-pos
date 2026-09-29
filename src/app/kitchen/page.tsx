import { db } from "@/lib/db";
import { getContext } from "@/lib/session";
import { KitchenBoard, type Ticket } from "./KitchenBoard";

type Row = {
  id: string;
  order_id: string;
  item_name: string;
  quantity: number;
  status: "pending" | "preparing" | "ready";
  notes: string | null;
  created_at: string;
  options: string[];
  order_number: string;
  order_type: string;
  customer_name: string | null;
  order_notes: string | null;
  table_name: string | null;
};

export default async function KitchenPage() {
  const { branch } = await getContext();
  const rows = await db.q<Row>(
    `select oi.id, oi.order_id, oi.item_name, oi.quantity, oi.status, oi.notes, oi.created_at,
            coalesce((select json_group_array(x.choice_name) from (select choice_name from order_item_options where order_item_id = oi.id order by rowid) x), '[]') as options,
            o.order_number, o.order_type, o.customer_name, o.notes as order_notes, t.name as table_name
       from order_items oi
       join orders o on o.id = oi.order_id
       left join dining_tables t on t.id = o.table_id
      where o.branch_id = ?1 and oi.status in ('pending','preparing','ready')
      order by oi.created_at, oi.rowid`,
    [branch.id]
  );

  const byOrder = new Map<string, Ticket>();
  for (const r of rows) {
    let t = byOrder.get(r.order_id);
    if (!t) {
      t = {
        orderId: r.order_id,
        number: r.order_number,
        type: r.order_type,
        table: r.table_name,
        customer: r.customer_name,
        notes: r.order_notes,
        since: r.created_at,
        items: [],
      };
      byOrder.set(r.order_id, t);
    }
    if (r.created_at < t.since) t.since = r.created_at;
    t.items.push({ id: r.id, name: r.item_name, quantity: r.quantity, status: r.status, notes: r.notes, options: r.options });
  }

  return <KitchenBoard tickets={[...byOrder.values()]} branchName={branch.name} />;
}
