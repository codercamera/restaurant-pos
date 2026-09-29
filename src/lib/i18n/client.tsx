"use client";

import { createContext, useContext, useMemo } from "react";
import { localeOf, makeT, type Lang, type TFn } from "./index";

type Ctx = { lang: Lang; t: TFn; locale: string };
const LangContext = createContext<Ctx>({ lang: "en", t: makeT("en"), locale: localeOf("en") });

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(lang), locale: localeOf(lang) }), [lang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** Client components: `const { t, lang, locale } = useLang()`. */
export const useLang = () => useContext(LangContext);
