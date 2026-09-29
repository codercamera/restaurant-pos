"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LangToggle } from "@/components/LangToggle";
import { useLang } from "@/lib/i18n/client";
import { advanceTicket } from "./actions";

export type Ticket = {
  orderId: string;
  number: string;
  type: string;
  table: string | null;
  customer: string | null;
  notes: string | null;
  since: string;
  items: { id: string; name: string; quantity: number; status: "pending" | "preparing" | "ready"; notes: string | null; options: string[] }[];
};

type Stage = "new" | "cooking" | "ready";
const COLS: { id: Stage; label: string; dot: string; action: string; btn: string }[] = [
  { id: "new", label: "New", dot: "#8fb0d8", action: "Start cooking", btn: "bg-[#f4f1ea] text-[#1b1a17] border-[#f4f1ea]" },
  { id: "cooking", label: "Cooking", dot: "#e3b34c", action: "Mark ready", btn: "bg-good text-white border-good" },
  { id: "ready", label: "Ready for pickup", dot: "#6fbf95", action: "Served — clear", btn: "bg-[#f4f1ea] text-[#1b1a17] border-[#f4f1ea]" },
];
const FILTERS = [
  { id: "all", label: "All orders" },
  { id: "dine_in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway" },
  { id: "delivery", label: "Delivery" },
];
const TYPE_LABEL: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery" };
const LATE_AFTER_MIN = 12;

function stageOf(t: Ticket): Stage {
  if (t.items.some((i) => i.status === "pending")) return "new";
  if (t.items.some((i) => i.status === "preparing")) return "cooking";
  return "ready";
}

export function KitchenBoard({ tickets, branchName }: { tickets: Ticket[]; branchName: string }) {
  const { t: tr, locale } = useLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("all");
  const [mobileCol, setMobileCol] = useState<Stage>("new"); // phones show one stage at a time
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // New tickets arrive by polling; a few seconds is plenty for a kitchen screen.
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [router]);

  const visible = tickets.filter((t) => filter === "all" || t.type === filter);
  const elapsed = (iso: string) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const lateCount = visible.filter((t) => stageOf(t) !== "ready" && elapsed(t.since) >= LATE_AFTER_MIN * 60).length;

  const advance = (t: Ticket) => {
    setError(null);
    setBusy(t.orderId);
    startTransition(async () => {
      const res = await advanceTicket(t.orderId, stageOf(t));
      setBusy(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const clock = new Date(now).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen lg:h-screen bg-[#151412] text-[#f4f1ea] flex flex-col px-4 sm:px-6 pt-4 sm:pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6 gap-3.5 sm:gap-[18px]">
      <header className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Link href="/order" aria-label={tr("Back to POS")} className="size-12 rounded-xl bg-[#2a2824] flex items-center justify-center">
          <Icon name="back" size={20} stroke={2} />
        </Link>
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight">{tr("Kitchen")}</h1>
          <div className="text-sm text-[#b5afa3]">
            {branchName} · {tr("{n} open tickets", { n: visible.length })} · {tr("{n} running late (over {m} min)", { n: lateCount, m: LATE_AFTER_MIN })}
          </div>
        </div>
        <div className="grow" />
        <div role="group" aria-label={tr("Order type")} className="order-last sm:order-none w-full sm:w-auto flex gap-2 overflow-x-auto sm:flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-11 shrink-0 px-4 rounded-[10px] text-[15px] font-semibold border ${filter === f.id ? "bg-[#f4f1ea] text-[#1b1a17] border-[#f4f1ea]" : "bg-[#2a2824] text-[#e4ded2] border-[#3a3732]"}`}
            >
              {tr(f.label)}
            </button>
          ))}
        </div>
        <div className="font-mono text-xl sm:text-[26px] font-semibold sm:pl-4" suppressHydrationWarning>{clock}</div>
        <LangToggle className="size-12 rounded-xl bg-[#2a2824] text-[#f4f1ea] flex items-center justify-center" />
      </header>

      {error && <p role="alert" className="rounded-xl bg-accent-soft px-4 py-2.5 font-semibold text-accent-text">{error}</p>}

      <div role="tablist" aria-label={tr("Stage")} className="md:hidden grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#1e1c19]">
        {COLS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={mobileCol === c.id}
            onClick={() => setMobileCol(c.id)}
            className={`h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${mobileCol === c.id ? "bg-[#f4f1ea] text-[#1b1a17]" : "text-[#e4ded2]"}`}
          >
            <span className="size-2 rounded-full shrink-0" style={{ background: c.dot }} />
            <span className="truncate">{tr(c.label === "Ready for pickup" ? "Ready" : c.label)}</span>
            <span className="font-mono text-xs opacity-70">{visible.filter((t) => stageOf(t) === c.id).length}</span>
          </button>
        ))}
      </div>

      <div className="grow min-h-0 grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLS.map((col) => {
          const list = visible.filter((t) => stageOf(t) === col.id).sort((a, b) => a.since.localeCompare(b.since));
          return (
            <section key={col.id} className={`min-h-0 flex-col gap-3 bg-[#1e1c19] rounded-[18px] p-3.5 ${mobileCol === col.id ? "flex" : "max-md:hidden md:flex"}`}>
              <div className="flex items-center gap-2.5 px-1 pt-0.5">
                <span className="size-2.5 rounded-full" style={{ background: col.dot }} />
                <h2 className="grow text-[17px] font-bold">{tr(col.label)}</h2>
                <span className="min-w-[30px] h-[30px] px-2 rounded-full bg-[#2e2b27] font-mono text-[15px] font-semibold inline-flex items-center justify-center">{list.length}</span>
              </div>
              <div className="grow min-h-0 overflow-auto flex flex-col gap-3">
                {list.length === 0 && <div className="py-10 text-center text-[#8e887c] text-[15px]">{tr("Nothing here")}</div>}
                {list.map((t) => {
                  const secs = elapsed(t.since);
                  const late = col.id !== "ready" && secs >= LATE_AFTER_MIN * 60;
                  const where = t.table ? `${tr(TYPE_LABEL[t.type] ?? t.type)} · T${t.table}` : `${TYPE_LABEL[t.type] ? tr(TYPE_LABEL[t.type]) : t.type}${t.customer ? ` · ${t.customer}` : ""}`;
                  const shown = t.items.filter((i) => (col.id === "ready" ? i.status === "ready" : col.id === "cooking" ? i.status !== "ready" : true));
                  return (
                    <article key={t.orderId} className="shrink-0 bg-ground text-ink rounded-[14px] overflow-hidden flex flex-col">
                      <div className={`flex items-center gap-3 px-4 py-3 ${late ? "bg-accent text-white" : "bg-[#2a2824] text-[#f4f1ea]"}`}>
                        <span className="font-mono text-xl font-bold">#{t.number}</span>
                        <span className="grow text-sm font-semibold">{where}</span>
                        <span className="font-mono text-lg font-bold" suppressHydrationWarning>{fmt(secs)}</span>
                      </div>
                      <ul className="px-4 py-3 flex flex-col gap-2.5">
                        {shown.map((i) => (
                          <li key={i.id} className="flex gap-3">
                            <span className="font-mono text-lg font-bold w-7">{i.quantity}</span>
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-lg font-bold ${col.id === "new" && i.status !== "pending" ? "opacity-50" : ""}`}>{i.name}</span>
                              {i.options.length > 0 && <span className="text-sm font-medium text-muted-2">{i.options.join(" · ")}</span>}
                              {i.notes && <span className="text-sm font-semibold text-accent-text">“{i.notes}”</span>}
                            </div>
                          </li>
                        ))}
                      </ul>
                      {t.notes && (
                        <div className="mx-4 mb-3 px-3 py-2.5 rounded-[10px] bg-accent-soft text-accent-text text-sm font-bold flex gap-2 items-start">
                          <Icon name="alert" size={16} stroke={2} className="mt-0.5 shrink-0" />
                          {t.notes}
                        </div>
                      )}
                      <div className="px-4 pb-4">
                        <button
                          type="button"
                          disabled={pending && busy === t.orderId}
                          onClick={() => advance(t)}
                          className={`w-full h-[52px] rounded-xl text-base font-bold border-2 disabled:opacity-50 ${col.btn}`}
                        >
                          {pending && busy === t.orderId ? "…" : tr(col.action)}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
