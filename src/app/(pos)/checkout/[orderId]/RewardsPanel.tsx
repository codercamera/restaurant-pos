"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n/client";
import { formatMoney, round2 } from "@/lib/money";
import { formatPhone, normalizeThaiPhone } from "@/lib/phone";
import type { LoyaltySettings } from "@/lib/loyalty";
import { attachCustomer, detachCustomer, setRedeem } from "./rewards";

export type RewardsData = {
  settings: Omit<LoyaltySettings, never>;
  customer: { id: string; phone: string; name: string | null; points: number } | null;
  redeemed: number;
  earned: number;
};

export function RewardsPanel({ orderId, locked, data, subtotal, currency }: { orderId: string; locked: boolean; data: RewardsData; subtotal: number; currency: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pts, setPts] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { settings, customer, redeemed } = data;
  const money = (n: number) => formatMoney(n, currency);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? null);
      setErr(null);
      after?.();
      router.refresh();
    });

  const maxPts = customer ? Math.max(0, Math.min(customer.points, Math.floor((round2(subtotal) + 1e-6) / settings.point_value))) : 0;
  const canRedeem = customer && maxPts >= settings.min_redeem && settings.min_redeem >= 0;
  const willEarn = Math.max(0, Math.floor((round2(subtotal) - round2(redeemed * settings.point_value) + 1e-6) / settings.baht_per_point));

  return (
    <section aria-label={t("Rewards")} className="rounded-2xl border border-line bg-panel p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="grow text-sm font-bold uppercase tracking-[0.06em] text-muted">{t("Rewards")}</h3>
        {customer && !locked && (
          <button type="button" disabled={pending} onClick={() => run(() => detachCustomer(orderId))} className="h-9 px-3 rounded-lg border border-line text-sm font-semibold">
            {t("Remove")}
          </button>
        )}
      </div>

      {!customer ? (
        locked ? (
          <p className="text-sm text-muted">{t("No customer on this bill")}</p>
        ) : (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => attachCustomer(orderId, phone, name), () => { setPhone(""); setName(""); });
            }}
          >
            <input
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+\-\s]/g, "").slice(0, 16))}
              placeholder={t("Phone 08x-xxx-xxxx")}
              aria-label={t("Customer phone number")}
              className="h-12 grow min-w-[150px] rounded-xl border border-line bg-ground px-3 font-mono"
            />
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("Name (optional)")} className="h-12 grow min-w-[120px] rounded-xl border border-line bg-ground px-3" />
            <button type="submit" disabled={pending || !normalizeThaiPhone(phone)} className="h-12 px-5 rounded-xl bg-strong text-on-strong font-bold disabled:opacity-40">
              {t("Add")}
            </button>
          </form>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono font-semibold">{formatPhone(customer.phone)}</span>
            {customer.name && <span className="text-muted">{customer.name}</span>}
            <span className="grow" />
            <span className="font-semibold">{t("{n} points", { n: customer.points.toLocaleString() })}</span>
          </div>
          {redeemed > 0 && <p className="text-sm font-semibold text-good-dark">{t("Using {n} points = −{amount}", { n: redeemed.toLocaleString(), amount: money(round2(redeemed * settings.point_value)) })}</p>}
          {!locked && (
            <div className="flex flex-wrap items-center gap-2">
              {canRedeem ? (
                <>
                  <input
                    inputMode="numeric"
                    value={pts}
                    onChange={(e) => setPts(e.target.value.replace(/\D/g, "").slice(0, 7))}
                    placeholder={t("Points to use (max {n})", { n: maxPts.toLocaleString() })}
                    aria-label={t("Points to use")}
                    className="h-12 grow min-w-[150px] rounded-xl border border-line bg-ground px-3 font-mono"
                  />
                  <button type="button" disabled={pending} onClick={() => setPts(String(maxPts))} className="h-12 px-3 rounded-xl border border-line text-sm font-semibold">{t("Max")}</button>
                  <button type="button" disabled={pending || !pts} onClick={() => run(() => setRedeem(orderId, Number(pts)), () => setPts(""))} className="h-12 px-4 rounded-xl bg-accent text-white font-bold disabled:opacity-40">{t("Use points")}</button>
                  {redeemed > 0 && <button type="button" disabled={pending} onClick={() => run(() => setRedeem(orderId, 0))} className="h-12 px-3 rounded-xl border border-line text-sm font-semibold">{t("Clear")}</button>}
                </>
              ) : (
                redeemed === 0 && <p className="text-sm text-muted">{t("Minimum to redeem is {n} points", { n: settings.min_redeem })}</p>
              )}
            </div>
          )}
          <p className="text-sm text-muted">{t("Will earn {n} points when paid", { n: willEarn.toLocaleString() })}</p>
        </>
      )}
      {err && <p role="alert" className="text-sm font-semibold text-accent-text">{err}</p>}
    </section>
  );
}
