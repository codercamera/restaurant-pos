"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";
import { computeTotals, formatMoney, round2 } from "@/lib/money";
import type { Branch, Category, DiningTable, Order, OrderItem, OrderType, SellableItem } from "@/lib/types";
import { OptionsDialog, type PickedOptions } from "./OptionsDialog";
import { TablePicker } from "./TablePicker";
import { cancelOrder, saveOrder, voidItem } from "./actions";

type DraftLine = {
  key: string;
  menuItemId: string;
  name: string;
  unit: number; // base + option deltas
  quantity: number;
  choiceIds: string[];
  choiceNames: string[];
  notes: string;
};

const TYPES: { id: OrderType; label: string }[] = [
  { id: "dine_in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway" },
  { id: "delivery", label: "Delivery" },
];

const CAT_TONES = ["#c97b3a", "#b83a20", "#2f6b4f", "#9a7b1c", "#1e4f8a", "#7a3e6b", "#4f5d2f", "#8a4b2f"];

const ITEM_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Sent", cls: "bg-info-soft text-info" },
  preparing: { label: "Cooking", cls: "bg-warn-soft text-warn" },
  ready: { label: "Ready", cls: "bg-good-soft text-good-dark" },
  served: { label: "Served", cls: "bg-ground-2 text-muted-2" },
  cancelled: { label: "Void", cls: "bg-ground-2 text-muted-2 line-through" },
};

export function OrderScreen({
  categories,
  items,
  tables,
  order,
  orderItems,
  presetTableId,
  branch,
  staffName,
}: {
  categories: Category[];
  items: SellableItem[];
  tables: Pick<DiningTable, "id" | "name" | "zone" | "seats" | "status">[];
  order: Order | null;
  orderItems: OrderItem[];
  presetTableId: string | null;
  branch: Branch;
  staffName: string;
}) {
  const router = useRouter();
  const { t, locale } = useLang();
  const [pending, startTransition] = useTransition();
  const [cat, setCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState<OrderType>(order?.order_type ?? (presetTableId ? "dine_in" : "dine_in"));
  const [tableId, setTableId] = useState<string>(presetTableId ?? "");
  const [pickTable, setPickTable] = useState(false);
  const selectedTable = tables.find((tb) => tb.id === tableId) ?? null;
  const [guests, setGuests] = useState<number>(order?.customer_count ?? (presetTableId ? 2 : 0));
  const [customerName, setCustomerName] = useState(order?.customer_name ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [dialogItem, setDialogItem] = useState<SellableItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false); // order panel as a full-screen sheet below lg

  const currency = branch.currency;
  const money = (n: number) => formatMoney(n, currency);
  const closed = order?.status === "completed" || order?.status === "cancelled";

  const toneByCat = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c, i) => m.set(c.id, CAT_TONES[i % CAT_TONES.length]));
    return m;
  }, [categories]);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const q = search.trim().toLowerCase();
  const visible = items.filter(
    (i) => (cat === "all" || i.category_id === cat) && (!q || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q))
  );

  const qtyInDraft = (menuItemId: string) => draft.filter((d) => d.menuItemId === menuItemId).reduce((s, d) => s + d.quantity, 0);

  const addLine = (item: SellableItem, picked?: PickedOptions) => {
    const choiceIds = picked?.choiceIds ?? [];
    const notesText = picked?.notes ?? "";
    const key = `${item.id}|${[...choiceIds].sort().join(",")}|${notesText}`;
    const add = picked?.quantity ?? 1;
    setDraft((prev) => {
      const found = prev.find((d) => d.key === key);
      if (found) return prev.map((d) => (d.key === key ? { ...d, quantity: Math.min(99, d.quantity + add) } : d));
      return [
        ...prev,
        {
          key,
          menuItemId: item.id,
          name: item.name,
          unit: round2(item.price + (picked?.extra ?? 0)),
          quantity: add,
          choiceIds,
          choiceNames: picked?.choiceNames ?? [],
          notes: notesText,
        },
      ];
    });
  };

  const onPick = (item: SellableItem) => {
    if (!item.is_available || closed) return;
    if (item.groups.length) setDialogItem(item);
    else addLine(item);
  };

  const setQty = (key: string, qty: number) =>
    setDraft((prev) => (qty <= 0 ? prev.filter((d) => d.key !== key) : prev.map((d) => (d.key === key ? { ...d, quantity: Math.min(99, qty) } : d))));

  // Totals preview (the server recalculates on save)
  const savedSubtotal = orderItems
    .filter((i) => i.status !== "cancelled")
    .reduce((s, i) => s + (i.unit_price + i.order_item_options.reduce((a, o) => a + o.price_delta, 0)) * i.quantity, 0);
  const draftSubtotal = draft.reduce((s, d) => s + d.unit * d.quantity, 0);
  const totals = computeTotals(savedSubtotal + draftSubtotal, {
    taxRate: branch.tax_rate,
    serviceRate: branch.service_charge_rate,
    discount: order?.discount_total ?? 0,
  });

  const needsTable = orderType === "dine_in" && !tableId;
  const hasAnything = draft.length > 0 || orderItems.some((i) => i.status !== "cancelled");

  const submit = (goToCheckout: boolean) => {
    setError(null);
    if (needsTable && draft.length) {
      setError(t("Choose a table for this dine-in order, or switch to Takeaway."));
      return;
    }
    startTransition(async () => {
      let id = order?.id ?? null;
      const detailsChanged =
        !!order &&
        (order.order_type !== orderType ||
          (order.table_id ?? "") !== (orderType === "dine_in" ? tableId : "") ||
          (order.customer_count ?? 0) !== guests ||
          (order.customer_name ?? "") !== customerName ||
          (order.notes ?? "") !== notes);
      if (draft.length || !order || detailsChanged) {
        const res = await saveOrder({
          orderId: order?.id ?? null,
          tableId: orderType === "dine_in" ? tableId || null : null,
          orderType,
          guests,
          customerName,
          notes,
          lines: draft.map((d) => ({ menuItemId: d.menuItemId, quantity: d.quantity, choiceIds: d.choiceIds, notes: d.notes || null })),
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        id = res.data.orderId;
        setDraft([]);
      }
      if (!id) return;
      if (goToCheckout) router.push(`/checkout/${id}`);
      else if (!order) router.replace(`/order?order=${id}`);
      else router.refresh();
    });
  };

  const onVoid = (itemId: string) => {
    if (!confirm(t("Void this item? The kitchen will see it removed."))) return;
    startTransition(async () => {
      const res = await voidItem(itemId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const onCancelOrder = () => {
    if (!order || !confirm(t("Cancel order #{n}? This can't be undone.", { n: order.order_number }))) return;
    startTransition(async () => {
      const res = await cancelOrder(order.id);
      if (!res.ok) setError(res.error);
      else router.push("/orders");
    });
  };

  const chip = (active: boolean) =>
    `inline-flex shrink-0 whitespace-nowrap items-center gap-2 h-11 px-[18px] rounded-full text-[15px] font-semibold border ${
      active ? "bg-strong text-on-strong border-strong" : "bg-panel text-ink border-line hover:border-line-2"
    }`;

  const now = new Date();
  const timeLabel = now.toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: branch.timezone });

  return (
    <div className="flex flex-col lg:flex-row lg:h-screen">
      <main className="grow min-w-0 flex flex-col px-4 sm:px-6 pt-4 sm:pt-5 pb-5 sm:pb-6 max-lg:pb-24 gap-3.5 sm:gap-[18px] lg:overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight">
              {order ? (
                <>
                  {t("Order")} <span className="font-mono text-2xl">#{order.order_number}</span>
                </>
              ) : (
                t("New order")
              )}
            </h1>
            <div className="text-sm text-muted">
              {branch.name} · {timeLabel} · {staffName}
            </div>
          </div>
          <div className="grow" />
          <label htmlFor="menu-search" className="sr-only">{t("Search menu")}</label>
          <div className="flex items-center gap-2 h-12 w-full sm:w-[300px] max-w-full px-3.5 bg-panel border border-line rounded-xl text-muted">
            <Icon name="search" size={18} stroke={2} />
            <input
              id="menu-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search dishes")}
              className="grow min-w-0 bg-transparent outline-none text-[15px] font-medium text-ink"
            />
          </div>
          <div role="group" aria-label={t("Order type")} className="flex w-full sm:w-auto p-1 bg-ground-2 rounded-xl gap-1">
            {TYPES.map((ty) => (
              <button
                key={ty.id}
                type="button"
                aria-pressed={orderType === ty.id}
                disabled={closed}
                onClick={() => setOrderType(ty.id)}
                className={`h-10 flex-1 sm:flex-none px-4 rounded-[9px] text-sm font-semibold ${orderType === ty.id ? "bg-panel text-ink shadow-sm" : "text-muted-2"}`}
              >
                {t(ty.label)}
              </button>
            ))}
          </div>
        </header>

        <div role="tablist" aria-label={t("Categories")} className="flex gap-2 overflow-x-auto md:flex-wrap md:overflow-visible -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 pb-1 md:pb-0 [scrollbar-width:none]">
          <button type="button" role="tab" aria-selected={cat === "all"} onClick={() => setCat("all")} className={chip(cat === "all")}>
            {t("All")} <span className="font-mono text-xs opacity-70">{items.length}</span>
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)} className={chip(cat === c.id)}>
              {c.name} <span className="font-mono text-xs opacity-70">{items.filter((i) => i.category_id === c.id).length}</span>
            </button>
          ))}
        </div>

        <div className="grow min-h-0 overflow-auto">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-2 p-10 text-center text-muted">
              {t("Your menu is empty.")} <Link href="/menu" className="font-semibold text-accent underline">{t("Add dishes")}</Link> {t("to start taking orders.")}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-muted">{t("No dishes match “{search}”.", { search })}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 sm:gap-3 content-start">
              {visible.map((item) => {
                const n = qtyInDraft(item.id);
                const off = !item.is_available;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPick(item)}
                    disabled={off || closed}
                    className={`text-left flex flex-col gap-2 p-3 sm:p-4 min-h-[140px] sm:min-h-[176px] rounded-[14px] bg-panel border-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      n > 0 ? "border-accent" : "border-panel shadow-[inset_0_0_0_1px_var(--color-line)]"
                    }`}
                  >
                    {item.image_id && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/menu-images/${item.image_id}`} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-[10px] bg-ground-2" />
                    )}
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-[0.06em]">
                        <span className="size-2 rounded-full" style={{ background: toneByCat.get(item.category_id) }} />
                        {catName.get(item.category_id)}
                      </span>
                      {n > 0 && (
                        <span className="min-w-[26px] h-[26px] px-1.5 rounded-full bg-accent text-white font-mono text-[13px] font-semibold inline-flex items-center justify-center">{n}</span>
                      )}
                      {off && <span className="text-xs font-bold text-accent-text">{t("Sold out")}</span>}
                    </div>
                    <div className="text-[17px] font-bold leading-tight">{item.name}</div>
                    <div className="grow text-[13px] text-muted leading-snug line-clamp-2">{item.description}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-semibold">{money(item.price)}</span>
                      <span className="size-8 rounded-[10px] bg-ground flex items-center justify-center">
                        <Icon name={item.groups.length ? "edit" : "plus"} size={16} stroke={2.2} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <aside
        aria-label={t("Current order")}
        className={`w-full lg:w-[400px] shrink-0 bg-panel border-l border-line flex flex-col lg:h-screen max-lg:fixed max-lg:inset-0 max-lg:z-[60] max-lg:h-dvh ${sheetOpen ? "" : "max-lg:hidden"}`}
      >
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-4 border-b border-line flex flex-col gap-3">
          <div className="flex items-center lg:items-baseline justify-between gap-2">
            <button type="button" onClick={() => setSheetOpen(false)} aria-label={t("Back to menu")} className="lg:hidden -ml-1 size-11 shrink-0 rounded-xl border border-line flex items-center justify-center">
              <Icon name="back" size={20} stroke={2} />
            </button>
            <h2 className="grow lg:grow-0 font-display text-[22px] font-bold">
              {order ? (
                <>
                  {t("Order")} <span className="font-mono text-lg">#{order.order_number}</span>
                </>
              ) : (
                t("Current order")
              )}
            </h2>
            <span className="text-[13px] font-semibold px-2.5 py-1 rounded-full bg-warn-soft text-warn">
              {order ? t(order.status.replaceAll("_", " ")) : t("Draft")}
            </span>
          </div>
          {orderType === "dine_in" ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={closed}
                onClick={() => setPickTable(true)}
                aria-haspopup="dialog"
                className={`grow min-w-0 h-11 rounded-[10px] border bg-panel px-3 text-sm font-semibold flex items-center gap-2 text-left disabled:opacity-60 ${needsTable && draft.length ? "border-accent" : "border-line"}`}
              >
                <Icon name="tables" size={16} />
                <span className="grow truncate">
                  {selectedTable ? `${t("Table {n}", { n: selectedTable.name })}${selectedTable.zone ? ` · ${t(selectedTable.zone)}` : ""}` : t("Choose table…")}
                </span>
              </button>
              <div className="flex items-center gap-0.5 rounded-[10px] border border-line px-0.5" role="group" aria-label={t("Guests")}>
                <button type="button" aria-label={t("Fewer guests")} onClick={() => setGuests((g) => Math.max(0, g - 1))} className="size-10 flex items-center justify-center">
                  <Icon name="minus" size={14} stroke={2.2} />
                </button>
                <span className="flex items-center gap-1 text-sm font-semibold min-w-[44px] justify-center">
                  <Icon name="guests" size={15} />
                  {guests}
                </span>
                <button type="button" aria-label={t("More guests")} onClick={() => setGuests((g) => Math.min(99, g + 1))} className="size-10 flex items-center justify-center">
                  <Icon name="plus" size={14} stroke={2.2} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor="cust" className="sr-only">{t("Customer name")}</label>
              <input
                id="cust"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={orderType === "delivery" ? t("Customer / delivery ref") : t("Customer name")}
                className="h-11 rounded-[10px] border border-line bg-panel px-3 text-sm font-semibold outline-none focus:border-ink"
              />
            </div>
          )}
        </div>

        <div className="grow min-h-0 overflow-auto px-4 sm:px-6 py-2 flex flex-col">
          {!hasAnything && <div className="m-auto text-center text-muted text-[15px] leading-relaxed py-10">{t("No items yet.")}<br />{t("Tap a dish to add it.")}</div>}

          {orderItems.length > 0 && (
            <div className="pt-2">
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted pb-1">{t("Sent to kitchen")}</div>
              {orderItems.map((i) => {
                const st = ITEM_STATUS[i.status] ?? ITEM_STATUS.pending;
                const lt = (i.unit_price + i.order_item_options.reduce((a, o) => a + o.price_delta, 0)) * i.quantity;
                return (
                  <div key={i.id} className={`flex items-start gap-3 py-3 border-b border-hair ${i.status === "cancelled" ? "opacity-60" : ""}`}>
                    <span className="font-mono text-sm text-muted w-7 pt-0.5">{i.quantity}×</span>
                    <div className="grow min-w-0">
                      <div className={`text-[15px] font-semibold ${i.status === "cancelled" ? "line-through" : ""}`}>{i.item_name}</div>
                      {i.order_item_options.length > 0 && <div className="text-[13px] text-muted">{i.order_item_options.map((o) => o.choice_name).join(", ")}</div>}
                      {i.notes && <div className="text-[13px] text-accent-text">“{i.notes}”</div>}
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{t(st.label)}</span>
                    <span className="font-mono text-sm font-semibold w-[76px] text-right">{i.status === "cancelled" ? "—" : money(lt)}</span>
                    {(i.status === "pending" || i.status === "preparing") && !closed && (
                      <button type="button" onClick={() => onVoid(i.id)} aria-label={t("Void {name}", { name: i.item_name })} className="size-8 -my-1 rounded-lg text-muted hover:bg-accent-soft hover:text-accent-text flex items-center justify-center">
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {draft.length > 0 && (
            <div className="pt-3">
              {orderItems.length > 0 && <div className="text-xs font-bold uppercase tracking-[0.06em] text-accent-text pb-1">{t("New — not sent yet")}</div>}
              {draft.map((d) => (
                <div key={d.key} className="flex items-center gap-3 py-3 border-b border-hair">
                  <div className="grow min-w-0 flex flex-col gap-0.5">
                    <div className="text-[15px] font-semibold">{d.name}</div>
                    {d.choiceNames.length > 0 && <div className="text-[13px] text-muted">{d.choiceNames.join(", ")}</div>}
                    {d.notes && <div className="text-[13px] text-accent-text">“{d.notes}”</div>}
                    <div className="font-mono text-[13px] text-muted">{t("{price} each", { price: money(d.unit) })}</div>
                  </div>
                  <div className="flex items-center gap-1 bg-ground rounded-[10px] p-0.5">
                    <button type="button" aria-label={t("Remove one {name}", { name: d.name })} onClick={() => setQty(d.key, d.quantity - 1)} className="size-11 rounded-lg flex items-center justify-center">
                      <Icon name="minus" size={16} stroke={2.2} />
                    </button>
                    <span className="w-[22px] text-center font-mono text-[15px] font-semibold">{d.quantity}</span>
                    <button type="button" aria-label={t("Add one {name}", { name: d.name })} onClick={() => setQty(d.key, d.quantity + 1)} className="size-11 rounded-lg flex items-center justify-center">
                      <Icon name="plus" size={16} stroke={2.2} />
                    </button>
                  </div>
                  <div className="w-[76px] text-right font-mono text-[15px] font-semibold">{money(d.unit * d.quantity)}</div>
                </div>
              ))}
            </div>
          )}

          {!closed && (
            <div className="pt-3.5 flex flex-col gap-1.5">
              <label htmlFor="order-note" className="text-[13px] font-bold text-muted-2">{t("Note for kitchen")}</label>
              <textarea
                id="order-note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={280}
                placeholder={t("Allergies, timing, anything the kitchen should know")}
                className="rounded-[10px] border border-dashed border-line-2 bg-transparent px-3 py-2 text-sm outline-none focus:border-ink focus:border-solid"
              />
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-line flex flex-col gap-2.5 bg-panel-2">
          <div className="flex justify-between text-[15px] text-muted"><span>{t("Subtotal")}</span><span className="font-mono text-ink">{money(totals.subtotal)}</span></div>
          {totals.service > 0 && (
            <div className="flex justify-between text-[15px] text-muted"><span>{t("Service ({rate}%)", { rate: branch.service_charge_rate })}</span><span className="font-mono text-ink">{money(totals.service)}</span></div>
          )}
          <div className="flex justify-between text-[15px] text-muted"><span>{t("Tax ({rate}%)", { rate: branch.tax_rate })}</span><span className="font-mono text-ink">{money(totals.tax)}</span></div>
          <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-line-2">
            <span className="text-[17px] font-bold">{t("Total")}</span>
            <span className="font-mono text-[26px] font-semibold">{money(totals.grand)}</span>
          </div>
          {error && <p role="alert" className="rounded-[10px] bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-text">{error}</p>}
          {closed ? (
            <div className="flex gap-2.5 mt-1.5">
              <Link href={`/receipt/${order!.id}`} className="grow h-14 rounded-xl border border-ink bg-panel flex items-center justify-center gap-2 font-bold">
                <Icon name="print" size={18} /> {t("Receipt")}
              </Link>
              <Link href="/order" className="grow h-14 rounded-xl bg-accent text-white flex items-center justify-center font-bold hover:bg-accent-dark">{t("New order")}</Link>
            </div>
          ) : (
            <div className="flex gap-2.5 mt-1.5">
              <button
                type="button"
                disabled={pending || (!draft.length && !!order)}
                onClick={() => submit(false)}
                className="grow h-14 rounded-xl border border-ink bg-panel text-base font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Icon name="send" size={18} /> {pending ? t("Saving…") : t("Make order")}
              </button>
              <button
                type="button"
                disabled={pending || !hasAnything}
                onClick={() => submit(true)}
                className="grow-[1.4] h-14 rounded-xl bg-accent text-white text-base font-bold disabled:opacity-40 hover:bg-accent-dark"
              >
                {t("Charge {amount}", { amount: money(totals.grand) })}
              </button>
            </div>
          )}
          {order && !closed && (
            <button type="button" onClick={onCancelOrder} disabled={pending} className="h-10 text-sm font-semibold text-muted-2 underline underline-offset-4">
              {t("Cancel order")}
            </button>
          )}
        </div>
      </aside>

      {!closed && hasAnything && !sheetOpen && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="no-print lg:hidden fixed inset-x-3 z-40 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 h-14 px-4 rounded-2xl bg-accent text-white shadow-lg flex items-center gap-3 font-bold"
        >
          <span className="min-w-7 h-7 px-2 rounded-full bg-white/20 font-mono text-sm inline-flex items-center justify-center">
            {orderItems.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.quantity, 0) + draft.reduce((s, d) => s + d.quantity, 0)}
          </span>
          <span className="grow text-left">{t("View order")}</span>
          <span className="font-mono">{money(totals.grand)}</span>
        </button>
      )}

      {dialogItem && (
        <OptionsDialog
          item={dialogItem}
          currency={currency}
          onClose={() => setDialogItem(null)}
          onAdd={(picked) => {
            addLine(dialogItem, picked);
            setDialogItem(null);
          }}
        />
      )}
      {pickTable && (
        <TablePicker
          tables={tables}
          value={tableId}
          onPick={(id) => {
            setTableId(id);
            setPickTable(false);
          }}
          onClose={() => setPickTable(false)}
        />
      )}
    </div>
  );
}
