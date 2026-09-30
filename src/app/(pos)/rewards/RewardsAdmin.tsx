"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import type { LoyaltySettings } from "@/lib/loyalty";
import { adjustPoints, saveSettings } from "./actions";

export type CustomerRow = { id: string; phone: string; name: string | null; points: number; total_spent: number; visits: number; created_at: string };

export function RewardsAdmin({ settings, customers, q, currency, members, outstanding, title }: { settings: LoyaltySettings; customers: CustomerRow[]; q: string; currency: string; members: number; outstanding: number; title: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [per, setPer] = useState(String(settings.baht_per_point));
  const [val, setVal] = useState(String(settings.point_value));
  const [min, setMin] = useState(String(settings.min_redeem));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adj, setAdj] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState(q);
  const money = (n: number) => formatMoney(n, currency);

  const save = () =>
    start(async () => {
      const r = await saveSettings({ enabled, baht_per_point: Number(per), point_value: Number(val), min_redeem: Number(min) });
      setMsg(r.ok ? { ok: true, text: t("Saved") } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  const doAdjust = (id: string) =>
    start(async () => {
      const r = await adjustPoints(id, Number(delta), note);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg(null);
      setAdj(null);
      setDelta("");
      setNote("");
      router.refresh();
    });

  const input = "h-12 rounded-xl border border-line bg-ground px-3 font-mono w-full";
  const per1 = Number(per) > 0 ? t("Earn 1 point per {amount}", { amount: money(Number(per)) }) : "";
  const example = Number(val) > 0 ? t("100 points = {amount} off", { amount: money(100 * Number(val)) }) : "";

  return (
    <div className="p-4 sm:p-6 max-w-[1000px] mx-auto flex flex-col gap-5">
      <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight">{title}</h1>

      <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="grow text-sm font-bold uppercase tracking-[0.06em] text-muted">{t("Point rules")}</h2>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-5" /> {t("Rewards on")}
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {t("Baht spent per 1 point")}
            <input inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {t("Baht discount per point used")}
            <input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {t("Minimum points to use")}
            <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className={input} />
          </label>
        </div>
        <p className="text-sm text-muted">{[per1, example, t("Points are earned on the bill before tax, service and tip, once it is fully paid.")].filter(Boolean).join(" · ")}</p>
        <div className="flex items-center gap-3">
          <button type="button" disabled={pending} onClick={save} className="h-12 px-6 rounded-xl bg-accent text-white font-bold disabled:opacity-50">{t("Save")}</button>
          {msg && <span role="status" className={`text-sm font-semibold ${msg.ok ? "text-good-dark" : "text-accent-text"}`}>{msg.text}</span>}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="grow text-sm font-bold uppercase tracking-[0.06em] text-muted">
            {t("Members")} · {members.toLocaleString()} · {t("{n} points outstanding", { n: outstanding.toLocaleString() })}
          </h2>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); router.push(search ? `/rewards?q=${encodeURIComponent(search)}` : "/rewards"); }}>
            <input inputMode="tel" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search phone")} aria-label={t("Search phone")} className="h-11 w-40 rounded-xl border border-line bg-panel px-3 font-mono" />
            <button type="submit" className="h-11 px-4 rounded-xl border border-line bg-panel font-semibold">{t("Search")}</button>
          </form>
        </div>
        {customers.length === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-6 text-center text-muted">{t("No members yet. Add a customer's phone number at checkout.")}</p>
        ) : (
          <ul className="rounded-2xl border border-line bg-panel overflow-hidden">
            {customers.map((c) => (
              <li key={c.id} className="border-b border-hair last:border-b-0 px-4 py-3 min-w-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="grow min-w-0">
                    <div className="font-mono font-semibold">{formatPhone(c.phone)}</div>
                    <div className="text-sm text-muted truncate">{c.name || "—"} · {t("{n} visits", { n: c.visits })} · {money(Number(c.total_spent))}</div>
                  </div>
                  <div className="font-display text-xl font-bold">{c.points.toLocaleString()}</div>
                  <button type="button" onClick={() => { setAdj(adj === c.id ? null : c.id); setDelta(""); setNote(""); setMsg(null); }} className="h-10 px-3 rounded-lg border border-line text-sm font-semibold">{t("Adjust")}</button>
                </div>
                {adj === c.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, "").slice(0, 8))} placeholder={t("+100 or -50")} aria-label={t("Points change")} className="h-11 w-32 rounded-xl border border-line bg-ground px-3 font-mono" />
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder={t("Reason (optional)")} className="h-11 grow min-w-[140px] rounded-xl border border-line bg-ground px-3" />
                    <button type="button" disabled={pending || !delta} onClick={() => doAdjust(c.id)} className="h-11 px-4 rounded-xl bg-strong text-on-strong font-bold disabled:opacity-40">{t("Apply")}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {msg && !msg.ok && adj && <p role="alert" className="text-sm font-semibold text-accent-text">{msg.text}</p>}
      </section>
    </div>
  );
}
