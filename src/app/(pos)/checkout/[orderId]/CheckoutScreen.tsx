"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";
import { computeTotals, formatMoney, ORDER_TYPE_LABEL, round2 } from "@/lib/money";
import type { Branch, Order, OrderItem, PaymentMethod } from "@/lib/types";
import { takePayment } from "./actions";
import { RewardsPanel, type RewardsData } from "./RewardsPanel";

const METHODS: { id: PaymentMethod; label: string; icon: "card" | "cash" | "qr" }[] = [
  { id: "cash", label: "Cash", icon: "cash" },
  { id: "card", label: "Card", icon: "card" },
  { id: "qr_promptpay", label: "PromptPay QR", icon: "qr" },
];
const TIPS = [0, 5, 10, 15];
const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", qr_promptpay: "PromptPay", other: "Other" };

const ceil2 = (n: number) => Math.ceil(round2(n) * 100 - 1e-6) / 100;

export function CheckoutScreen({
  order,
  items,
  payments,
  paid,
  tableName,
  serverName,
  branch,
  rewards,
}: {
  order: Order;
  items: OrderItem[];
  payments: { id: string; method: string; amount: number; status: string; paid_at: string }[];
  paid: number;
  tableName: string | null;
  serverName: string;
  branch: Branch;
  rewards: RewardsData;
}) {
  const router = useRouter();
  const { t } = useLang();
  const [pending, startTransition] = useTransition();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tipPct, setTipPct] = useState(0);
  const [ways, setWays] = useState(1);
  const [cents, setCents] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<number | null>(null);

  const cur = branch.currency;
  const money = (n: number) => formatMoney(n, cur);
  const closed = order.status === "completed" || order.status === "cancelled";
  const tipLocked = paid > 0 || closed;

  const tip = tipLocked ? order.tip_total : round2((order.subtotal * tipPct) / 100);
  const totals = computeTotals(order.subtotal, {
    taxRate: branch.tax_rate,
    serviceRate: branch.service_charge_rate,
    discount: order.discount_total,
    tip,
  });
  const grand = tipLocked ? order.grand_total : totals.grand;
  const remaining = Math.max(0, round2(grand - paid));
  const amount = ways > 1 ? Math.min(remaining, ceil2(grand / ways)) : remaining;

  const received = cents ? Number(cents) / 100 : 0;
  const changeDue = round2(received - amount);
  const canCharge = !closed && amount > 0 && (method !== "cash" || received >= amount);

  const press = (k: string) =>
    setCents((c) => {
      if (k === "del") return c.slice(0, -1);
      if (c.length >= 8) return c;
      return (c === "0" ? "" : c) + k;
    });
  const up = (step: number) => Math.ceil((amount + 0.0001) / step) * step;
  const quick = [amount, up(20), up(100), up(500), up(1000)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);

  const charge = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await takePayment({
        orderId: order.id,
        method,
        amount,
        received: method === "cash" ? received : null,
        tip: tipLocked ? null : tip,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCents("");
      if (res.data.completed) setLastChange(res.data.change);
      else setNotice(`${t("Payment recorded")}${res.data.change ? ` · ${t("change {amount}", { amount: money(res.data.change) })}` : ""}. ${t("{amount} left to pay", { amount: money(res.data.remaining) })}.`);
      router.refresh();
    });
  };

  const tile = (on: boolean) =>
    `rounded-2xl flex items-center justify-center gap-3 font-bold border-2 ${on ? "bg-strong text-on-strong border-strong" : "bg-panel text-ink border-line"}`;

  return (
    <div className="flex flex-col lg:flex-row lg:h-screen">
      <section aria-label={t("Order summary")} className="w-full lg:w-[460px] shrink-0 bg-panel border-r border-line flex flex-col px-4 py-4 sm:px-8 sm:py-7 gap-4 sm:gap-5">
        <Link href={`/order?order=${order.id}`} className="self-start inline-flex items-center gap-2 h-11 pl-2.5 pr-3.5 rounded-[10px] border border-line text-sm font-semibold">
          <Icon name="back" size={18} /> {t("Back to order")}
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl sm:text-[30px] font-bold tracking-tight">
            {t("Order")} <span className="font-mono text-[26px]">#{order.order_number}</span>
          </h1>
          <div className="text-[15px] text-muted">
            {t(ORDER_TYPE_LABEL[order.order_type])}
            {tableName ? ` · ${t("Table {n}", { n: tableName })}` : ""}
            {order.customer_count ? ` · ${t("{n} guests", { n: order.customer_count })}` : ""}
            {order.customer_name ? ` · ${order.customer_name}` : ""} · {serverName}
          </div>
        </div>

        <div className="grow min-h-0 overflow-auto flex flex-col max-h-44 sm:max-h-64 lg:max-h-none">
          {items.map((i) => (
            <div key={i.id} className="flex items-baseline gap-3.5 py-3 border-b border-hair">
              <span className="font-mono text-[15px] font-semibold text-muted w-7">{i.quantity}×</span>
              <div className="grow min-w-0">
                <div className="text-base font-semibold">{i.item_name}</div>
                {i.order_item_options.length > 0 && <div className="text-[13px] text-muted">{i.order_item_options.map((o) => o.choice_name).join(", ")}</div>}
              </div>
              <span className="font-mono text-[15px] font-semibold">
                {money((i.unit_price + i.order_item_options.reduce((a, o) => a + o.price_delta, 0)) * i.quantity)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 pt-4 border-t border-line">
          <Row label={t("Subtotal")} value={money(order.subtotal)} />
          {order.discount_total > 0 && <Row label={t("Discount")} value={`−${money(order.discount_total)}`} />}
          {totals.service > 0 && <Row label={t("Service ({rate}%)", { rate: branch.service_charge_rate })} value={money(totals.service)} />}
          <Row label={t("Tax ({rate}%)", { rate: branch.tax_rate })} value={money(tipLocked ? order.tax_total : totals.tax)} />
          <Row label={t("Tip")} value={money(tip)} />
          {paid > 0 && <Row label={t("Paid so far")} value={`−${money(paid)}`} />}
          <div className="flex justify-between items-baseline pt-2.5 border-t border-dashed border-line-2">
            <span className="text-lg font-bold">{closed ? t("Total paid") : t("Amount due")}</span>
            <span className="font-mono text-[28px] sm:text-[32px] font-semibold">{money(closed ? grand : remaining)}</span>
          </div>
        </div>
      </section>

      <main className="grow min-w-0 px-4 py-5 sm:px-10 sm:py-7 flex flex-col gap-4 sm:gap-5">
        {closed ? (
          <div className="grow flex flex-col items-center justify-center gap-5 text-center">
            <div className="size-24 rounded-[28px] bg-good-soft text-good-dark flex items-center justify-center">
              <Icon name="check" size={48} stroke={2.2} />
            </div>
            <h2 className="font-display text-[34px] font-bold">{order.status === "cancelled" ? t("Order cancelled") : t("Payment complete")}</h2>
            {lastChange != null && lastChange > 0 && (
              <div className="rounded-2xl bg-good-soft px-8 py-4 text-good-dark">
                <div className="text-sm font-bold uppercase tracking-wider">{t("Change due")}</div>
                <div className="font-mono text-5xl font-semibold">{money(lastChange)}</div>
              </div>
            )}
            {rewards.customer && (rewards.earned > 0 || rewards.redeemed > 0) && (
              <div className="rounded-2xl bg-accent-soft px-6 py-3 text-accent-text font-semibold">
                {rewards.earned > 0 && <div>{t("+{n} points earned", { n: rewards.earned })}</div>}
                {rewards.redeemed > 0 && <div>{t("{n} points used", { n: rewards.redeemed })}</div>}
                <div className="text-sm font-normal">{t("Balance {n} points", { n: rewards.customer.points })}</div>
              </div>
            )}
            <div className="text-muted">
              {payments.map((p) => `${t(METHOD_LABEL[p.method] ?? p.method)} ${money(p.amount)}`).join(" · ")}
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              <Link href={`/receipt/${order.id}`} target="_blank" className="h-14 px-6 rounded-xl border border-ink bg-panel flex items-center gap-2 font-bold">
                <Icon name="print" size={18} /> {t("Print receipt")}
              </Link>
              <Link href="/tables" className="h-14 px-6 rounded-xl border border-line bg-panel flex items-center font-semibold">{t("Floor plan")}</Link>
              <Link href="/order" className="h-14 px-8 rounded-xl bg-accent text-white flex items-center font-bold hover:bg-accent-dark">{t("New order")}</Link>
            </div>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl sm:text-[30px] font-bold tracking-tight">{t("Take payment")}</h2>

            <div role="group" aria-label={t("Payment method")} className="grid grid-cols-3 gap-3">
              {METHODS.map((m) => (
                <button key={m.id} type="button" aria-pressed={method === m.id} onClick={() => setMethod(m.id)} className={`h-[72px] sm:h-[76px] flex-col sm:flex-row gap-1 sm:gap-3 text-sm sm:text-lg ${tile(method === m.id)}`}>
                  <Icon name={m.icon} size={26} stroke={1.8} /> {t(m.label)}
                </button>
              ))}
            </div>

            {rewards.settings.enabled && (
              <RewardsPanel orderId={order.id} locked={tipLocked} data={rewards} subtotal={order.subtotal} currency={cur} />
            )}

            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col gap-2 grow">
                <div className="text-sm font-bold uppercase tracking-[0.06em] text-muted">{t("Tip")} {tipLocked && `· ${t("locked after first payment")}`}</div>
                <div role="group" aria-label={t("Tip")} className="flex gap-2">
                  {TIPS.map((p) => {
                    const on = tipLocked ? false : p === tipPct;
                    return (
                      <button
                        key={p}
                        type="button"
                        disabled={tipLocked}
                        aria-pressed={on}
                        onClick={() => setTipPct(p)}
                        className={`flex-1 h-[60px] rounded-xl flex flex-col items-center justify-center gap-0.5 border-2 disabled:opacity-40 ${
                          on ? "bg-accent text-white border-accent" : "bg-panel text-ink border-line"
                        }`}
                      >
                        <span className="text-base font-bold">{p === 0 ? t("No tip") : `${p}%`}</span>
                        <span className="font-mono text-xs opacity-80">{money(round2((order.subtotal * p) / 100))}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-sm font-bold uppercase tracking-[0.06em] text-muted">{t("Split bill")}</div>
                <div className="flex items-center gap-1 bg-panel border border-line rounded-xl p-1 h-[60px]">
                  <button type="button" aria-label={t("Fewer ways")} onClick={() => setWays((w) => Math.max(1, w - 1))} className="size-12 rounded-lg flex items-center justify-center">
                    <Icon name="minus" size={18} stroke={2.2} />
                  </button>
                  <span className="w-28 text-center text-[15px] font-bold">{ways === 1 ? t("Pay in full") : t("{n} ways", { n: ways })}</span>
                  <button type="button" aria-label={t("More ways")} onClick={() => setWays((w) => Math.min(20, w + 1))} className="size-12 rounded-lg flex items-center justify-center">
                    <Icon name="plus" size={18} stroke={2.2} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grow min-h-0 bg-panel border border-line rounded-[18px] p-4 sm:p-7 flex flex-col">
              <div className="flex items-baseline justify-between pb-4 mb-4 border-b border-line">
                <span className="text-base font-bold text-muted-2">{ways > 1 ? t("This share (1 of {n})", { n: ways }) : t("Charging now")}</span>
                <span className="font-mono text-[28px] sm:text-[34px] font-semibold">{money(amount)}</span>
              </div>

              {method === "cash" ? (
                <div className="grow flex flex-wrap gap-5 sm:gap-7 min-h-0">
                  <div className="grow flex flex-col gap-3.5 sm:min-w-[260px]">
                    <div>
                      <div className="text-sm font-semibold text-muted">{t("Cash received")}</div>
                      <div className="font-mono text-4xl sm:text-5xl font-semibold">{money(received)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {quick.map((v, i) => (
                        <button key={v} type="button" onClick={() => setCents(String(Math.round(v * 100)))} className="h-14 rounded-xl border border-line bg-ground font-mono text-[17px] font-semibold">
                          {i === 0 ? t("Exact") : money(v)}
                        </button>
                      ))}
                    </div>
                    <div className="grow" />
                    <div className={`flex items-center justify-between px-5 py-4 rounded-2xl ${changeDue >= 0 && received > 0 ? "bg-good-soft text-good-dark" : "bg-accent-soft text-accent-text"}`}>
                      <span className="text-base font-bold">{changeDue >= 0 && received > 0 ? t("Change due") : t("Still owed")}</span>
                      <span className="font-mono text-3xl font-semibold">{money(received > 0 ? Math.abs(changeDue) : amount)}</span>
                    </div>
                  </div>
                  <div className="w-full sm:w-[300px] grid grid-cols-3 gap-2.5 content-start">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"].map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => press(k)}
                        aria-label={k === "del" ? t("Delete digit") : k}
                        className="h-14 sm:h-[68px] rounded-[14px] border border-line bg-panel font-mono text-2xl font-semibold active:bg-ground"
                      >
                        {k === "del" ? "⌫" : k}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grow flex flex-col items-center justify-center gap-4 text-center">
                  <div className="size-24 rounded-[28px] bg-good-soft text-good-dark flex items-center justify-center">
                    <Icon name={method === "card" ? "card" : "qr"} size={44} stroke={1.6} />
                  </div>
                  <p className="text-[17px] text-muted max-w-[440px] leading-relaxed">
                    {method === "card"
                      ? t("Charge this amount on the card terminal, then confirm here once it's approved.")
                      : t("Show the PromptPay QR for this amount, then confirm here once the transfer arrives.")}
                  </p>
                </div>
              )}
            </div>

            {notice && <p role="status" className="rounded-xl bg-good-soft px-4 py-3 font-semibold text-good-dark">{notice}</p>}
            {error && <p role="alert" className="rounded-xl bg-accent-soft px-4 py-3 font-semibold text-accent-text">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              {payments.length > 0 && (
                <div className="text-sm text-muted">
                  {t("Paid")}: {payments.map((p) => `${t(METHOD_LABEL[p.method] ?? p.method)} ${money(p.amount)}`).join(" · ")}
                </div>
              )}
              <div className="grow" />
              <button
                type="button"
                disabled={!canCharge || pending}
                onClick={charge}
                className="h-[60px] w-full sm:w-auto sm:min-w-[320px] px-5 sm:px-7 rounded-[14px] bg-accent text-white text-lg font-bold flex items-center justify-center gap-2.5 disabled:opacity-40 hover:bg-accent-dark"
              >
                <Icon name="check" size={20} stroke={2.4} />
                {pending ? t("Recording…") : method === "cash" ? t("Take cash {amount}", { amount: money(amount) }) : t("Confirm {amount} paid", { amount: money(amount) })}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[15px] text-muted">
      <span>{label}</span>
      <span className="font-mono text-ink">{value}</span>
    </div>
  );
}
