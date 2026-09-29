import Link from "next/link";
import { notFound } from "next/navigation";
import { db, isUuid } from "@/lib/db";
import { getContext } from "@/lib/session";
import { formatMoney, ORDER_TYPE_LABEL } from "@/lib/money";
import { PrintButton } from "./PrintButton";

type Snapshot = {
  branch: { name: string; currency: string; tax_rate: number; service_charge_rate: number };
  order: {
    order_number: string;
    order_type: string;
    subtotal: number;
    discount_total: number;
    tax_total: number;
    service_charge_total: number;
    tip_total: number;
    grand_total: number;
    closed_at: string | null;
    created_at: string;
  };
  items: { name: string; quantity: number; unit_price: number; options: { name: string; price_delta: number }[]; total: number }[];
  payments: { method: string; amount: number; received_amount: number | null; change_amount: number | null }[];
  cashier: string;
};

const METHOD: Record<string, string> = { cash: "Cash", card: "Card", qr_promptpay: "PromptPay", other: "Other" };

export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const { branch } = await getContext();
  if (!isUuid(orderId)) notFound();
  const data = await db.one<{ receipt_number: string; snapshot: unknown; printed_at: string }>(
    `select r.receipt_number, r.snapshot, r.printed_at
       from receipts r join orders o on o.id = r.order_id
      where r.order_id = $1 and o.branch_id = $2
      order by r.printed_at desc limit 1`,
    [orderId, branch.id]
  );
  if (!data) notFound();

  const s = data.snapshot as Snapshot;
  const cur = s.branch?.currency ?? branch.currency;
  const m = (n: number) => formatMoney(Number(n), cur);
  const when = new Date(s.order.closed_at ?? data.printed_at).toLocaleString("en-GB", { timeZone: branch.timezone });

  return (
    <main className="min-h-screen flex flex-col items-center gap-4 py-8 px-4">
      <div className="no-print flex gap-2">
        <Link href="/orders" className="h-11 px-4 rounded-xl border border-line bg-white font-semibold flex items-center">Back to orders</Link>
        <PrintButton />
      </div>
      <article className="w-[320px] bg-white p-5 font-mono text-[13px] leading-snug text-black shadow-sm print:shadow-none">
        <div className="text-center">
          <div className="text-base font-bold">{s.branch?.name ?? branch.name}</div>
          <div>Receipt {data.receipt_number}</div>
          <div>{when}</div>
          <div>
            Order #{s.order.order_number} · {ORDER_TYPE_LABEL[s.order.order_type] ?? s.order.order_type}
          </div>
        </div>
        <hr className="my-3 border-dashed border-black" />
        {s.items.map((i, idx) => (
          <div key={idx} className="mb-1.5">
            <div className="flex justify-between gap-2">
              <span>
                {i.quantity} × {i.name}
              </span>
              <span>{m(i.total)}</span>
            </div>
            {i.options.length > 0 && <div className="pl-4 text-[12px]">{i.options.map((o) => o.name).join(", ")}</div>}
          </div>
        ))}
        <hr className="my-3 border-dashed border-black" />
        <Line label="Subtotal" value={m(s.order.subtotal)} />
        {Number(s.order.discount_total) > 0 && <Line label="Discount" value={`-${m(s.order.discount_total)}`} />}
        {Number(s.order.service_charge_total) > 0 && <Line label={`Service ${s.branch.service_charge_rate}%`} value={m(s.order.service_charge_total)} />}
        <Line label={`Tax ${s.branch?.tax_rate ?? ""}%`} value={m(s.order.tax_total)} />
        {Number(s.order.tip_total) > 0 && <Line label="Tip" value={m(s.order.tip_total)} />}
        <div className="flex justify-between font-bold text-[15px] mt-1">
          <span>TOTAL</span>
          <span>{m(s.order.grand_total)}</span>
        </div>
        <hr className="my-3 border-dashed border-black" />
        {s.payments.map((p, idx) => (
          <div key={idx}>
            <Line label={METHOD[p.method] ?? p.method} value={m(p.amount)} />
            {p.method === "cash" && p.received_amount != null && (
              <>
                <Line label="  Received" value={m(p.received_amount)} />
                <Line label="  Change" value={m(p.change_amount ?? 0)} />
              </>
            )}
          </div>
        ))}
        <div className="text-center mt-4">Served by {s.cashier}</div>
        <div className="text-center">Thank you!</div>
      </article>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between whitespace-pre">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
