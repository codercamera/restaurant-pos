"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { LangToggle } from "@/components/LangToggle";
import { useLang } from "@/lib/i18n/client";
import { formatMoney, round2 } from "@/lib/money";
import type { Category, SellableItem } from "@/lib/types";
import { OptionsDialog, type PickedOptions } from "@/app/(pos)/order/OptionsDialog";
import { placeTableOrder } from "./actions";

type Line = { key: string; item: SellableItem; picked: PickedOptions };

export function SelfOrder({
  token,
  tableName,
  branchName,
  currency,
  categories,
  items,
}: {
  token: string;
  tableName: string;
  branchName: string;
  currency: string;
  categories: Category[];
  items: SellableItem[];
}) {
  const { t } = useLang();
  const money = (n: number) => formatMoney(n, currency);
  const [cat, setCat] = useState("all");
  const [dlg, setDlg] = useState<SellableItem | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(() => items.filter((i) => cat === "all" || i.category_id === cat), [items, cat]);
  const lineTotal = (l: Line) => round2((l.item.price + l.picked.extra) * l.picked.quantity);
  const total = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const count = lines.reduce((s, l) => s + l.picked.quantity, 0);

  const add = (item: SellableItem, picked: PickedOptions) => {
    setLines((p) => [...p, { key: crypto.randomUUID(), item, picked }]);
    setDlg(null);
  };
  const setQty = (key: string, d: number) =>
    setLines((p) => p.flatMap((l) => (l.key !== key ? [l] : l.picked.quantity + d < 1 ? [] : [{ ...l, picked: { ...l.picked, quantity: Math.min(20, l.picked.quantity + d) } }])));

  const send = () => {
    setErr(null);
    start(async () => {
      const r = await placeTableOrder(token, {
        name,
        notes,
        lines: lines.map((l) => ({ menuItemId: l.item.id, quantity: l.picked.quantity, choiceIds: l.picked.choiceIds, notes: l.picked.notes })),
      });
      if (!r.ok) return setErr(r.error);
      setDone(r.data.orderNumber);
      setLines([]);
      setCartOpen(false);
      setNotes("");
    });
  };

  if (done) {
    return (
      <main className="min-h-dvh grid place-items-center p-6 text-center bg-ground text-ink">
        <div className="max-w-sm">
          <div className="mx-auto size-16 rounded-full bg-good-soft text-good-dark grid place-items-center"><Icon name="check" size={32} /></div>
          <h1 className="mt-4 font-display text-2xl font-bold">{t("Order sent to the kitchen")}</h1>
          <p className="mt-2 text-muted">{t("Order #{n} · Table {table}", { n: done, table: tableName })}</p>
          <p className="mt-1 text-muted">{t("Our staff will bring your food. Payment is at the counter or with your waiter.")}</p>
          <button type="button" onClick={() => setDone(null)} className="mt-6 h-12 px-6 rounded-xl bg-accent text-white font-bold">{t("Order more")}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-ground text-ink pb-28">
      <header className="sticky top-0 z-20 bg-panel border-b border-line px-4 py-3 flex items-center gap-3">
        <div className="grow min-w-0">
          <div className="font-display text-xl font-bold truncate">{t("Table {n}", { n: tableName })}</div>
          <div className="text-xs text-muted truncate">{branchName}</div>
        </div>
        <LangToggle className="h-10 px-3 rounded-lg border border-line" />
      </header>

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {[{ id: "all", name: t("All") }, ...categories].map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`h-10 shrink-0 px-4 rounded-full text-sm font-semibold border ${cat === c.id ? "bg-ink text-white border-ink" : "bg-panel border-line"}`}>
            {c.name}
          </button>
        ))}
      </div>

      <ul className="px-4 grid gap-3 sm:grid-cols-2">
        {shown.map((it) => (
          <li key={it.id}>
            <button type="button" disabled={!it.is_available} onClick={() => setDlg(it)} className="w-full flex gap-3 text-left rounded-2xl border border-line bg-panel p-3 disabled:opacity-50">
              {it.image_id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/menu-images/${it.image_id}`} alt="" loading="lazy" className="size-20 rounded-xl object-cover bg-ground-2 shrink-0" />
              ) : (
                <div className="size-20 rounded-xl bg-ground-2 shrink-0" />
              )}
              <span className="grow min-w-0">
                <span className="block font-semibold">{it.name}</span>
                {it.description && <span className="block text-sm text-muted line-clamp-2">{it.description}</span>}
                <span className="block mt-1 font-mono font-semibold">{it.is_available ? money(it.price) : t("Sold out")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-ground via-ground to-transparent">
          <button type="button" onClick={() => setCartOpen(true)} className="w-full h-14 rounded-2xl bg-accent text-white font-bold flex items-center justify-between px-5 shadow-lg">
            <span>{t("View order")} · {count}</span>
            <span className="font-mono">{money(total)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={() => setCartOpen(false)}>
          <div className="w-full max-w-[560px] max-h-[90dvh] flex flex-col rounded-t-2xl bg-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center p-4 border-b border-line">
              <h2 className="grow font-display text-xl font-bold">{t("Your order")}</h2>
              <button type="button" aria-label={t("Close")} onClick={() => setCartOpen(false)} className="size-10 grid place-items-center"><Icon name="close" /></button>
            </div>
            <ul className="overflow-y-auto p-4 grid gap-3">
              {lines.map((l) => (
                <li key={l.key} className="flex items-start gap-3">
                  <div className="grow min-w-0">
                    <div className="font-semibold">{l.item.name}</div>
                    {l.picked.choiceNames.length > 0 && <div className="text-sm text-muted">{l.picked.choiceNames.join(", ")}</div>}
                    {l.picked.notes && <div className="text-sm text-muted italic">{l.picked.notes}</div>}
                    <div className="font-mono text-sm">{money(lineTotal(l))}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="-" onClick={() => setQty(l.key, -1)} className="size-10 rounded-lg border border-line grid place-items-center"><Icon name={l.picked.quantity === 1 ? "trash" : "minus"} size={16} /></button>
                    <span className="w-6 text-center font-mono font-semibold">{l.picked.quantity}</span>
                    <button type="button" aria-label="+" onClick={() => setQty(l.key, 1)} className="size-10 rounded-lg border border-line grid place-items-center"><Icon name="plus" size={16} /></button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="p-4 border-t border-line grid gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("Your name (optional)")} className="h-12 rounded-xl border border-line bg-ground px-3" />
              <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={280} placeholder={t("Note for the kitchen (optional)")} className="h-12 rounded-xl border border-line bg-ground px-3" />
              <p className="text-xs text-muted">{t("Prices before tax and service charge. Payment is at the counter or with your waiter.")}</p>
              {err && <p role="alert" className="text-sm font-semibold text-accent-text">{err}</p>}
              <button type="button" disabled={pending || !lines.length} onClick={send} className="h-14 rounded-2xl bg-accent text-white font-bold disabled:opacity-60">
                {pending ? t("Sending…") : `${t("Send order")} · ${money(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {dlg && <OptionsDialog item={dlg} currency={currency} onClose={() => setDlg(null)} onAdd={(p) => add(dlg, p)} />}
    </main>
  );
}
