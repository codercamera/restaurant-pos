"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";
import { formatMoney, round2 } from "@/lib/money";
import type { SellableItem } from "@/lib/types";

export type PickedOptions = { choiceIds: string[]; choiceNames: string[]; extra: number; quantity: number; notes: string };

export function OptionsDialog({
  item,
  currency,
  onClose,
  onAdd,
}: {
  item: SellableItem;
  currency: string;
  onClose: () => void;
  onAdd: (picked: PickedOptions) => void;
}) {
  const { t } = useLang();
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of item.groups) {
      const avail = g.option_choices.filter((c) => c.is_available);
      init[g.id] = g.selection_type === "single" && g.is_required && avail[0] ? [avail[0].id] : [];
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (groupId: string, choiceId: string) => {
    const g = item.groups.find((x) => x.id === groupId)!;
    setSelected((prev) => {
      const cur = prev[groupId] ?? [];
      if (g.selection_type === "single") return { ...prev, [groupId]: cur[0] === choiceId && !g.is_required ? [] : [choiceId] };
      if (cur.includes(choiceId)) return { ...prev, [groupId]: cur.filter((c) => c !== choiceId) };
      if (g.max_select && cur.length >= g.max_select) return prev;
      return { ...prev, [groupId]: [...cur, choiceId] };
    });
  };

  const problems = useMemo(
    () =>
      item.groups
        .filter((g) => {
          const n = (selected[g.id] ?? []).length;
          const min = g.is_required ? Math.max(1, g.min_select) : g.min_select;
          return n < min;
        })
        .map((g) => g.name),
    [item.groups, selected]
  );

  const chosen = item.groups.flatMap((g) => g.option_choices.filter((c) => (selected[g.id] ?? []).includes(c.id)));
  const extra = round2(chosen.reduce((s, c) => s + c.price_delta, 0));
  const unit = round2(item.price + extra);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="opt-title"
        className="w-full max-w-[560px] max-h-[92dvh] sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-line p-4 sm:p-6">
          <div className="grow">
            <h2 id="opt-title" className="font-display text-2xl font-bold">{item.name}</h2>
            {item.description && <p className="mt-1 text-muted">{item.description}</p>}
          </div>
          <button ref={firstRef} type="button" onClick={onClose} aria-label={t("Close")} className="size-11 shrink-0 rounded-xl bg-ground flex items-center justify-center">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="grow overflow-auto p-4 sm:p-6 flex flex-col gap-6">
          {item.groups.map((g) => {
            const req = g.is_required || g.min_select > 0;
            const hint =
              g.selection_type === "single"
                ? req ? t("Choose 1") : t("Optional · choose 1")
                : `${req ? t("Choose at least {n}", { n: Math.max(1, g.min_select) }) : t("Optional")}${g.max_select ? ` · ${t("up to {n}", { n: g.max_select })}` : ""}`;
            return (
              <fieldset key={g.id} className="flex flex-col gap-2.5">
                <legend className="mb-2.5 flex w-full items-baseline justify-between">
                  <span className="text-[17px] font-bold">{g.name}</span>
                  <span className={`text-[13px] font-semibold ${req ? "text-accent-text" : "text-muted"}`}>{hint}</span>
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {g.option_choices.map((c) => {
                    const on = (selected[g.id] ?? []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={!c.is_available}
                        aria-pressed={on}
                        onClick={() => toggle(g.id, c.id)}
                        className={`min-h-[52px] rounded-xl border-2 px-3.5 py-2 text-left flex items-center justify-between gap-2 disabled:opacity-40 ${
                          on ? "border-strong bg-strong text-on-strong" : "border-line bg-panel text-ink"
                        }`}
                      >
                        <span className="text-[15px] font-semibold">{c.name}</span>
                        {c.price_delta !== 0 && (
                          <span className="font-mono text-[13px] opacity-80">
                            {c.price_delta > 0 ? "+" : ""}
                            {formatMoney(c.price_delta, currency)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="line-note" className="text-[15px] font-bold">{t("Note for the kitchen")}</label>
            <input
              id="line-note"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={140}
              placeholder={t("e.g. no onions, sauce on the side")}
              className="h-12 rounded-[10px] border border-line-2 px-3.5 text-[15px] outline-none focus:border-ink"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-line p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-1 rounded-[10px] bg-ground p-0.5">
            <button type="button" aria-label={t("Fewer")} onClick={() => setQty((q) => Math.max(1, q - 1))} className="size-11 rounded-lg flex items-center justify-center">
              <Icon name="minus" size={16} stroke={2.2} />
            </button>
            <span className="w-8 text-center font-mono text-base font-semibold">{qty}</span>
            <button type="button" aria-label={t("More")} onClick={() => setQty((q) => Math.min(99, q + 1))} className="size-11 rounded-lg flex items-center justify-center">
              <Icon name="plus" size={16} stroke={2.2} />
            </button>
          </div>
          <button
            type="button"
            disabled={problems.length > 0}
            onClick={() => onAdd({ choiceIds: chosen.map((c) => c.id), choiceNames: chosen.map((c) => c.name), extra, quantity: qty, notes: notes.trim() })}
            className="grow h-14 rounded-xl bg-accent text-white text-base font-bold disabled:bg-line-2 disabled:text-muted-2 hover:bg-accent-dark"
          >
            {problems.length ? t("Choose {names}", { names: problems.join(", ") }) : t("Add {qty} · {price}", { qty, price: formatMoney(unit * qty, currency) })}
          </button>
        </div>
      </div>
    </div>
  );
}
