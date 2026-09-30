"use server";

import { revalidatePath } from "next/cache";
import { db, isUuid, newId, NOW, stmt, type Stmt } from "@/lib/db";
import { actionError, getContext } from "@/lib/session";
import { freeTableStmt, getOrder, getOrderItems, lineTotal, paidAmount, recalcOrder } from "@/lib/orders";
import { round2 } from "@/lib/money";
import { getT } from "@/lib/i18n/server";
import { getLoyaltySettings, pointsFor } from "@/lib/loyalty";
import { maskPhone } from "@/lib/phone";
import type { ActionResult, PaymentMethod } from "@/lib/types";

export type PaymentInput = {
  orderId: string;
  method: PaymentMethod;
  amount: number;
  received?: number | null;
  tip?: number | null;
};

export type PaymentResult = { completed: boolean; remaining: number; change: number; receiptNumber: string | null };

export async function takePayment(input: PaymentInput): Promise<ActionResult<PaymentResult>> {
  try {
    const { staff, branch } = await getContext("checkout");
    const { t } = await getT();
    if (!isUuid(input.orderId)) return { ok: false, error: t("Order not found") };
    if (!["cash", "card", "qr_promptpay", "other"].includes(input.method)) return { ok: false, error: t("Unknown payment method") };

    const o = await db.one<{ status: string; table_id: string | null; order_type: string }>(
      "select status, table_id, order_type from orders where id = ?1 and branch_id = ?2",
      [input.orderId, branch.id]
    );
    if (!o) return { ok: false, error: t("Order not found") };
    if (o.status === "completed" || o.status === "cancelled") return { ok: false, error: t("This order is already closed") };
    if (o.order_type === "dine_in" && o.status !== "served") return { ok: false, error: t("Dine-in orders must be served before payment") };

    let paid = await paidAmount(input.orderId);
    // Tip can only change before the first payment.
    if (paid === 0 && input.tip != null) {
      await db.run("update orders set tip_total = ?2 where id = ?1", [input.orderId, Math.max(0, round2(Number(input.tip) || 0))]);
    }
    const totals = await recalcOrder(input.orderId, branch);
    const remainingBefore = round2(totals.grand - paid);
    if (remainingBefore <= 0) return { ok: false, error: t("Nothing left to pay") };

    const amount = round2(Math.min(Number(input.amount) || 0, remainingBefore));
    if (amount <= 0) return { ok: false, error: t("Enter an amount to charge") };

    let received: number | null = null;
    let change = 0;
    if (input.method === "cash") {
      received = round2(Number(input.received ?? amount));
      if (received < amount) return { ok: false, error: t("Cash received is less than the amount due") };
      change = round2(received - amount);
    }

    const paidAt = new Date().toISOString();
    paid = round2(paid + amount);
    const remaining = round2(totals.grand - paid);
    const completed = remaining <= 0.004;

    const stmts: Stmt[] = [
      // Only inserts while the order is still open (guards against a double-submit after it was closed)
      stmt(
        `insert into payments (id, order_id, method, amount, received_amount, change_amount, status, staff_id, paid_at)
         select ?1, ?2, ?3, ?4, ?5, ?6, 'completed', ?7, ?8
          where exists (select 1 from orders where id = ?2 and status not in ('completed','cancelled'))`,
        newId(), input.orderId, input.method, amount, received, input.method === "cash" ? change : null, staff.id, paidAt
      ),
    ];

    if (completed) {
      const order = await getOrder(input.orderId, branch.id);
      const items = await getOrderItems(input.orderId, { excludeCancelled: true });
      const itemsTh = await getOrderItems(input.orderId, { lang: "th", excludeCancelled: true });
      const thById = new Map(itemsTh.map((x) => [x.id, x]));
      const previous = await db.q<{ method: string; amount: number; received_amount: number | null; change_amount: number | null; paid_at: string }>(
        "select method, amount, received_amount, change_amount, paid_at from payments where order_id = ?1 order by paid_at",
        [input.orderId]
      );
      // Reward points: redeem what was applied, earn on the net bill, both only when the bill is fully paid.
      const rw = await db.one<{ customer_id: string | null; points_redeemed: number }>("select customer_id, points_redeemed from orders where id = ?1", [input.orderId]);
      let loyalty: { phone: string; name: string | null; earned: number; redeemed: number; balance: number } | null = null;
      if (rw?.customer_id) {
        const settings = await getLoyaltySettings(staff.company_id);
        const cust = await db.one<{ phone: string; name: string | null; points: number }>("select phone, name, points from customers where id = ?1 and company_id = ?2", [rw.customer_id, staff.company_id]);
        if (cust) {
          const redeemed = Number(rw.points_redeemed) || 0;
          if (redeemed > cust.points) return { ok: false, error: t("Not enough points") };
          const net = Math.max(0, round2(Number(order?.subtotal ?? 0) - Number(order?.discount_total ?? 0)));
          const earned = pointsFor(net, settings);
          loyalty = { phone: cust.phone, name: cust.name, earned, redeemed, balance: cust.points - redeemed + earned };
          if (redeemed > 0) stmts.push(stmt("insert into point_ledger (id, customer_id, order_id, kind, points, note, staff_id) values (?1, ?2, ?3, 'redeem', ?4, null, ?5)", newId(), rw.customer_id, input.orderId, -redeemed, staff.id));
          if (earned > 0) stmts.push(stmt("insert into point_ledger (id, customer_id, order_id, kind, points, note, staff_id) values (?1, ?2, ?3, 'earn', ?4, null, ?5)", newId(), rw.customer_id, input.orderId, earned, staff.id));
          stmts.push(
            stmt("update customers set points = points - ?2 + ?3, total_spent = total_spent + ?4, visits = visits + 1 where id = ?1", rw.customer_id, redeemed, earned, net),
            stmt("update orders set points_earned = ?2 where id = ?1", input.orderId, earned)
          );
        }
      }
      const snapshot = {
        loyalty: loyalty ? { phone: maskPhone(loyalty.phone), name: loyalty.name, earned: loyalty.earned, redeemed: loyalty.redeemed, balance: loyalty.balance } : null,
        branch: { name: branch.name, currency: branch.currency, tax_rate: branch.tax_rate, service_charge_rate: branch.service_charge_rate },
        order: { ...order, status: "completed", closed_at: paidAt },
        items: items.map((i) => {
          const th = thById.get(i.id);
          const thOpts = new Map((th?.order_item_options ?? []).map((x) => [x.id, x.choice_name]));
          return {
            name: i.item_name,
            name_th: th?.item_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            options: i.order_item_options.map((x) => ({ name: x.choice_name, name_th: thOpts.get(x.id), price_delta: x.price_delta })),
            total: lineTotal(i),
          };
        }),
        payments: [
          ...previous,
          { method: input.method, amount, received_amount: received, change_amount: input.method === "cash" ? change : null, paid_at: paidAt },
        ],
        cashier: staff.full_name,
      };
      stmts.push(
        stmt("update orders set status = 'completed', closed_at = ?2, updated_at = " + NOW + " where id = ?1 and status not in ('completed','cancelled')", input.orderId, paidAt),
        stmt(
          `insert into receipts (id, order_id, receipt_number, snapshot)
           values (?1, ?2, (select 'R' || printf('%06d', coalesce(max(cast(substr(receipt_number, 2) as integer)), 0) + 1) from receipts), ?3)`,
          newId(), input.orderId, JSON.stringify(snapshot)
        )
      );
      if (o.table_id) stmts.push(freeTableStmt(o.table_id));
    }

    await db.batch(stmts); // atomic

    let receiptNumber: string | null = null;
    if (completed) {
      const rec = await db.one<{ receipt_number: string }>(
        "select receipt_number from receipts where order_id = ?1 order by printed_at desc limit 1",
        [input.orderId]
      );
      receiptNumber = rec?.receipt_number ?? null;
    }

    revalidatePath("/orders");
    revalidatePath("/tables");
    revalidatePath(`/checkout/${input.orderId}`);
    return { ok: true, data: { completed, remaining: Math.max(0, remaining), change, receiptNumber } };
  } catch (e) {
    return actionError(e);
  }
}
