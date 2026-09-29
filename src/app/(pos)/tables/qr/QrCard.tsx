"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";
import { regenerateLink, setSelfOrder } from "./actions";

/** Phones: a compact list row (small QR, tap to enlarge). sm and up, and print: a card. */
export function QrCard({ id, focus, name, zone, enabled, url, svg }: { id: string; focus?: boolean; name: string; zone: string | null; enabled: boolean; url: string; svg: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [big, setBig] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    if (focus) document.getElementById(`qr-${id}`)?.scrollIntoView({ block: "center" });
  }, [focus, id]);
  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBig(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? null);
      else {
        setErr(null);
        router.refresh();
      }
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  const btn = "h-12 px-3 rounded-xl border border-line text-sm font-semibold flex items-center justify-center gap-1.5";

  return (
    <div
      id={`qr-${id}`}
      className={`scroll-mt-4 rounded-2xl border bg-panel p-3 sm:p-4 flex flex-col break-inside-avoid print:border-line ${focus ? "border-accent ring-2 ring-accent" : "border-line"} ${enabled ? "" : "opacity-60"}`}
    >
      <div className="flex items-center gap-3 sm:flex-col sm:text-center">
        <button
          type="button"
          onClick={() => setBig(true)}
          aria-label={t("Table QR code")}
          className="shrink-0 size-20 sm:size-auto sm:w-full sm:max-w-64 print:size-auto print:w-full print:max-w-48 rounded-xl bg-white p-1.5 sm:p-2 [&>svg]:w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="grow min-w-0 sm:w-full">
          <div className="font-display text-xl font-bold leading-tight">{t("Table {n}", { n: name })}</div>
          {zone && <div className="text-xs text-muted">{t(zone)}</div>}
          {!enabled && <div className="text-xs font-bold text-muted-2 mt-0.5">{t("Turned off")}</div>}
          <p className="mt-1 text-sm font-semibold hidden print:block">{t("Scan to order")}</p>
          <div className="mt-1 truncate font-mono text-[11px] text-muted print:hidden sm:mt-2" title={url}>{url}</div>
        </div>
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label={t("More")} className="sm:hidden print:hidden size-12 shrink-0 grid place-items-center rounded-xl border border-line">
          <Icon name="list" size={18} />
        </button>
      </div>

      <div className={`${more ? "grid" : "hidden"} sm:grid mt-3 w-full grid-cols-2 gap-2 print:hidden`}>
        {canShare && (
          <button type="button" onClick={() => navigator.share({ title: t("Table {n}", { n: name }), url }).catch(() => {})} className="col-span-2 h-12 px-3 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-1.5">
            <Icon name="send" size={15} /> {t("Share")}
          </button>
        )}
        <button type="button" onClick={copy} className={btn}>
          <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? t("Copied") : t("Copy link")}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className={btn}>{t("Open")}</a>
        <button type="button" disabled={pending} onClick={() => run(() => setSelfOrder(id, !enabled))} className={btn}>
          {enabled ? t("Turn off") : t("Turn on")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("Make a new link? The printed QR code for this table will stop working."))) run(() => regenerateLink(id));
          }}
          className={btn}
        >
          {t("New link")}
        </button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-accent-text print:hidden">{err}</p>}

      {big && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-6 print:hidden" onClick={() => setBig(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-5 text-center text-[#1b1a17]" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-2xl font-bold">{t("Table {n}", { n: name })}</div>
            <div className="mt-3 [&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="mt-2 text-sm font-semibold">{t("Scan to order")}</p>
            <button type="button" onClick={() => setBig(false)} className="mt-4 h-12 w-full rounded-xl bg-[#1b1a17] text-white font-bold">{t("Close")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
