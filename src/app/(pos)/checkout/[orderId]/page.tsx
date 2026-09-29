import { notFound } from "next/navigation";
import { db, isUuid } from "@/lib/db";
import { getContext } from "@/lib/session";
import { ORDER_COLS, getOrderItems, recalcOrder } from "@/lib/orders";
import { round2 } from "@/lib/money";
import type { Order } from "@/lib/types";
import { CheckoutScreen } from "./CheckoutScreen";

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const { branch, staff } = await getContext();
  if (!isUuid(orderId)) notFound();

  const status = await db.one<{ status: string }>("select status from orders where id = ?1 and branch_id = ?2", [orderId, branch.id]);
  if (!status) notFound();
  if (status.status !== "completed" && status.status !== "cancelled") await recalcOrder(orderId, branch);

  const [raw, items, payments] = await Promise.all([
    db.one<Order & { table_name: string | null; server_name: string | null }>(
      `select ${ORDER_COLS}, t.name as table_name, s.full_name as server_name
         from orders o
         left join dining_tables t on t.id = o.table_id
         left join staff s on s.id = o.opened_by_staff_id
        where o.id = ?1 and o.branch_id = ?2`,
      [orderId, branch.id]
    ),
    getOrderItems(orderId, { excludeCancelled: true }),
    db.q<{ id: string; method: string; amount: number; status: string; paid_at: string }>(
      "select id, method, amount, status, paid_at from payments where order_id = ?1 order by paid_at",
      [orderId]
    ),
  ]);
  if (!raw) notFound();
  const paid = round2(payments.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0));

  return (
    <CheckoutScreen
      order={raw}
      items={items}
      payments={payments}
      paid={paid}
      tableName={raw.table_name}
      serverName={raw.server_name ?? staff.full_name}
      branch={branch}
    />
  );
}
