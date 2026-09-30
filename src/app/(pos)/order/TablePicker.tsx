"use client";

import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";
import type { DiningTable } from "@/lib/types";

type Tbl = Pick<DiningTable, "id" | "name" | "zone" | "seats" | "status">;

const STATUS_LABEL: Record<string, string> = { available: "Available", occupied: "Ordered", reserved: "Reserved", cleaning: "Needs cleaning" };
const STATUS_CLS: Record<string, string> = {
  available: "bg-good-soft text-good-dark",
  occupied: "bg-warn-soft text-warn",
  reserved: "bg-info-soft text-info",
  cleaning: "bg-ground-2 text-muted-2",
};

/** Table chooser: a list grouped by area, with seats and status. */
export function TablePicker({ tables, value, onPick, onClose }: { tables: Tbl[]; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zones = [...new Set(tables.map((x) => x.zone || "Main hall"))];
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("Choose table…")} className="w-full max-w-[480px] h-[75dvh] sm:h-auto sm:max-h-[85dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center p-4 border-b border-line">
          <h2 className="grow font-display text-xl font-bold">{t("Choose table…")}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose} className="size-11 grid place-items-center"><Icon name="close" /></button>
        </div>
        <div className="overflow-y-auto p-2">
          {tables.length === 0 && <p className="p-6 text-center text-muted">{t("No tables in this area yet.")}</p>}
          {zones.map((z) => (
            <div key={z} className="pb-2">
              <div className="px-3 pt-3 pb-1 text-[13px] font-bold uppercase tracking-[0.06em] text-muted">{t(z)}</div>
              <ul>
                {tables.filter((x) => (x.zone || "Main hall") === z).map((tb) => (
                  <li key={tb.id}>
                    <button
                      type="button"
                      onClick={() => onPick(tb.id)}
                      aria-current={tb.id === value}
                      className={`w-full min-h-14 px-3 py-2 rounded-xl flex items-center gap-3 text-left ${tb.id === value ? "bg-accent-soft" : "hover:bg-panel-2"}`}
                    >
                      <span className="grow min-w-0">
                        <span className="block font-semibold">{t("Table {n}", { n: tb.name })}</span>
                        <span className="block text-sm text-muted">{t("{n} seats", { n: tb.seats })}</span>
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_CLS[tb.status] ?? STATUS_CLS.available}`}>{t(STATUS_LABEL[tb.status] ?? tb.status)}</span>
                      {tb.id === value && <Icon name="check" size={18} />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
