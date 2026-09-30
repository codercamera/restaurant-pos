import { notFound } from "next/navigation";
import { db, isUuid } from "@/lib/db";
import { getContext } from "@/lib/session";
import { ORDER_COLS, getOrderItems, recalcOrder } from "@/lib/orders";
import { round2 } from "@/lib/money";
import type { Order } from "@/lib/types";
import { getT } from "@/lib/i18n/server";
import { getLoyaltySettings } from "@/lib/loyalty";
import { CheckoutScreen } from "./CheckoutScreen";

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const { branch, staff } = await getContext("checkout");
  const { lang } = await getT();
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
    getOrderItems(orderId, { lang, excludeCancelled: true }),
    db.q<{ id: string; method: string; amount: number; status: string; paid_at: string }>(
      "select id, method, amount, status, paid_at from payments where order_id = ?1 order by paid_at",
      [orderId]
    ),
  ]);
  if (!raw) notFound();
  const settings = await getLoyaltySettings(staff.company_id);
  const link = await db.one<{ customer_id: string | null; points_redeemed: number; points_earned: number }>("select customer_id, points_redeemed, points_earned from orders where id = ?1", [orderId]);
  const customer = link?.customer_id
    ? await db.one<{ id: string; phone: string; name: string | null; points: number }>("select id, phone, name, points from customers where id = ?1 and company_id = ?2", [link.customer_id, staff.company_id])
    : null;
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
      rewards={{ settings, customer, redeemed: Number(link?.points_redeemed ?? 0), earned: Number(link?.points_earned ?? 0) }}
    />
  );
}
