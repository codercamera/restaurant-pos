export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const cache = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency = "THB"): string {
  let f = cache.get(currency);
  if (!f) {
    const locale = currency === "THB" ? "th-TH" : "en-US";
    try {
      f = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 });
    } catch {
      f = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    cache.set(currency, f);
  }
  return f.format(Number(amount) || 0);
}

export type Totals = { subtotal: number; tax: number; service: number; discount: number; tip: number; grand: number };

export function computeTotals(
  subtotal: number,
  opts: { taxRate: number; serviceRate: number; discount?: number; tip?: number }
): Totals {
  const discount = round2(opts.discount ?? 0);
  const base = Math.max(0, round2(subtotal) - discount);
  const service = round2((base * opts.serviceRate) / 100);
  const tax = round2(((base + service) * opts.taxRate) / 100);
  const tip = round2(opts.tip ?? 0);
  return { subtotal: round2(subtotal), discount, service, tax, tip, grand: round2(base + service + tax + tip) };
}

export const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};
