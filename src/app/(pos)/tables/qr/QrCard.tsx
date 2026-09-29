"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";
import { regenerateLink, setSelfOrder } from "./actions";

export function QrCard({ id, focus, name, zone, enabled, url, svg }: { id: string; focus?: boolean; name: string; zone: string | null; enabled: boolean; url: string; svg: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    if (focus) document.getElementById(`qr-${id}`)?.scrollIntoView({ block: "center" });
  }, [focus, id]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? null);
      else {
        setErr(null);
        router.refresh();
      }
    });

  return (
    <div id={`qr-${id}`} className={`scroll-mt-4 rounded-2xl border bg-panel p-4 flex flex-col items-center text-center break-inside-avoid print:border-line ${focus ? "border-accent ring-2 ring-accent" : "border-line"} ${enabled ? "" : "opacity-60"}`}>
      <div className="font-display text-xl font-bold">{t("Table {n}", { n: name })}</div>
      {zone && <div className="text-xs text-muted">{t(zone)}</div>}
      <div className="mt-3 w-full max-w-64 print:max-w-48 rounded-xl bg-white p-2 [&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-2 text-sm font-semibold hidden print:block">{t("Scan to order")}</p>
      <div className="mt-2 w-full truncate font-mono text-xs text-muted print:hidden" title={url}>{url}</div>
      <div className="mt-3 w-full grid grid-cols-2 gap-2 print:hidden">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
          className="h-12 px-3 rounded-xl border border-line text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? t("Copied") : t("Copy link")}
        </button>
        {canShare && (
          <button type="button" onClick={() => navigator.share({ title: t("Table {n}", { n: name }), url }).catch(() => {})} className="col-span-2 h-12 px-3 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-1.5">
            <Icon name="send" size={15} /> {t("Share")}
          </button>
        )}
        <a href={url} target="_blank" rel="noreferrer" className="h-12 px-3 rounded-xl border border-line text-sm font-semibold flex items-center justify-center">{t("Open")}</a>
        <button type="button" disabled={pending} onClick={() => run(() => setSelfOrder(id, !enabled))} className="h-12 px-3 rounded-xl border border-line text-sm font-semibold">
          {enabled ? t("Turn off") : t("Turn on")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("Make a new link? The printed QR code for this table will stop working."))) run(() => regenerateLink(id));
          }}
          className="h-12 px-3 rounded-xl border border-line text-sm font-semibold"
        >
          {t("New link")}
        </button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-accent-text">{err}</p>}
    </div>
  );
}
