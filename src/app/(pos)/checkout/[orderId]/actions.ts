"use server";

import { revalidatePath } from "next/cache";
import { isUuid, tx } from "@/lib/db";
import { actionError, getContext } from "@/lib/session";
import { freeTableIfIdle, getOrder, getOrderItems, lineTotal, paidAmount, recalcOrder } from "@/lib/orders";
import { round2 } from "@/lib/money";
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
    const { staff, branch } = await getContext();
    if (!isUuid(input.orderId)) return { ok: false, error: "Order not found" };
    if (!["cash", "card", "qr_promptpay", "other"].includes(input.method)) return { ok: false, error: "Unknown payment method" };

    const result = await tx(async (t): Promise<ActionResult<PaymentResult>> => {
      const o = await t.one<{ status: string; table_id: string | null }>(
        "select status, table_id from orders where id = $1 and branch_id = $2 for update",
        [input.orderId, branch.id]
      );
      if (!o) return { ok: false, error: "Order not found" };
      if (o.status === "completed" || o.status === "cancelled") return { ok: false, error: "This order is already closed" };

      let paid = await paidAmount(t, input.orderId);
      // Tip can only change before the first payment.
      if (paid === 0 && input.tip != null) {
        await t.q("update orders set tip_total = $2 where id = $1", [input.orderId, Math.max(0, round2(Number(input.tip) || 0))]);
      }
      const totals = await recalcOrder(t, input.orderId, branch);
      const remainingBefore = round2(totals.grand - paid);
      if (remainingBefore <= 0) return { ok: false, error: "Nothing left to pay" };

      const amount = round2(Math.min(Number(input.amount) || 0, remainingBefore));
      if (amount <= 0) return { ok: false, error: "Enter an amount to charge" };

      let received: number | null = null;
      let change = 0;
      if (input.method === "cash") {
        received = round2(Number(input.received ?? amount));
        if (received < amount) return { ok: false, error: "Cash received is less than the amount due" };
        change = round2(received - amount);
      }

      await t.q(
        `insert into payments (order_id, method, amount, received_amount, change_amount, status, staff_id)
         values ($1, $2, $3, $4, $5, 'completed', $6)`,
        [input.orderId, input.method, amount, received, input.method === "cash" ? change : null, staff.id]
      );
      paid = round2(paid + amount);
      const remaining = round2(totals.grand - paid);
      const completed = remaining <= 0.004;
      let receiptNumber: string | null = null;

      if (completed) {
        await t.q("update orders set status = 'completed', closed_at = now() where id = $1", [input.orderId]);
        const order = await getOrder(t, input.orderId, branch.id);
        const items = await getOrderItems(t, input.orderId, { excludeCancelled: true });
        const payments = await t.q(
          "select method, amount, received_amount, change_amount, paid_at from payments where order_id = $1 order by paid_at",
          [input.orderId]
        );
        const snapshot = {
          branch: { name: branch.name, currency: branch.currency, tax_rate: branch.tax_rate, service_charge_rate: branch.service_charge_rate },
          order,
          items: items.map((i) => ({
            name: i.item_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            options: i.order_item_options.map((x) => ({ name: x.choice_name, price_delta: x.price_delta })),
            total: lineTotal(i),
          })),
          payments,
          cashier: staff.full_name,
        };
        const rec = await t.one<{ receipt_number: string }>(
          "insert into receipts (order_id, snapshot) values ($1, $2) returning receipt_number",
          [input.orderId, JSON.stringify(snapshot)]
        );
        receiptNumber = rec?.receipt_number ?? null;
        if (o.table_id) await freeTableIfIdle(t, o.table_id);
      }
      return { ok: true, data: { completed, remaining: Math.max(0, remaining), change, receiptNumber } };
    });

    if (result.ok) {
      revalidatePath("/orders");
      revalidatePath("/tables");
      revalidatePath(`/checkout/${input.orderId}`);
    }
    return result;
  } catch (e) {
    return actionError(e);
  }
}

