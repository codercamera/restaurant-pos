"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";
import { regenerateLink, setSelfOrder } from "./actions";

export function QrCard({ id, name, zone, enabled, url, svg }: { id: string; name: string; zone: string | null; enabled: boolean; url: string; svg: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    <div className={`rounded-2xl border border-line bg-panel p-4 flex flex-col items-center text-center break-inside-avoid ${enabled ? "" : "opacity-60"}`}>
      <div className="font-display text-xl font-bold">{t("Table {n}", { n: name })}</div>
      {zone && <div className="text-xs text-muted">{t(zone)}</div>}
      <div className="mt-3 w-44 rounded-xl bg-white p-2 [&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-2 text-sm font-semibold hidden print:block">{t("Scan to order")}</p>
      <div className="mt-2 w-full truncate font-mono text-[11px] text-muted print:hidden" title={url}>{url}</div>
      <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
          className="h-10 px-3 rounded-lg border border-line text-sm font-semibold flex items-center gap-1.5"
        >
          <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? t("Copied") : t("Copy link")}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="h-10 px-3 rounded-lg border border-line text-sm font-semibold flex items-center">{t("Open")}</a>
        <button type="button" disabled={pending} onClick={() => run(() => setSelfOrder(id, !enabled))} className="h-10 px-3 rounded-lg border border-line text-sm font-semibold">
          {enabled ? t("Turn off") : t("Turn on")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("Make a new link? The printed QR code for this table will stop working."))) run(() => regenerateLink(id));
          }}
          className="h-10 px-3 rounded-lg border border-line text-sm font-semibold"
        >
          {t("New link")}
        </button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-accent-text">{err}</p>}
    </div>
  );
}
