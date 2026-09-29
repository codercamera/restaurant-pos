// Tiny i18n: English source strings are the keys; Thai lives in src/lib/i18n/th/*.ts.
// A string with no Thai entry falls back to English, so nothing ever renders blank.
import common from "./th/common";
import order from "./th/order";
import checkout from "./th/checkout";
import tables from "./th/tables";
import kitchen from "./th/kitchen";
import menu from "./th/menu";
import misc from "./th/misc";

export type Lang = "en" | "th";
export const LANGS: Lang[] = ["en", "th"];
export const LANG_COOKIE = "pos_lang";
export const DEFAULT_LANG: Lang = "en";

export const isLang = (v: unknown): v is Lang => v === "en" || v === "th";

const TH: Record<string, string> = { ...common, ...order, ...checkout, ...tables, ...kitchen, ...menu, ...misc };

export type Params = Record<string, string | number>;
export type TFn = (key: string, params?: Params) => string;

export function makeT(lang: Lang): TFn {
  return (key, params) => {
    let s = (lang === "th" && TH[key]) || key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** BCP-47 locale for Intl / toLocale*String. Thai uses the Buddhist-era calendar, as Thai receipts do. */
export const localeOf = (lang: Lang) => (lang === "th" ? "th-TH" : "en-GB");

/** Localised name from a row that has both `x` and `x_th` (Thai falls back to English when empty). */
export const pick = (lang: Lang, en: string, th?: string | null) => (lang === "th" && th && th.trim() ? th : en);

/** SQL for a localised column: loc("mi.name", "th") -> coalesce(nullif(mi.name_th,''), mi.name). Column is a trusted literal. */
export const loc = (col: string, lang: Lang) => (lang === "th" ? `coalesce(nullif(${col}_th, ''), ${col})` : col);
