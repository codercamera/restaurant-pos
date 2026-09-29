"use server";

import { cookies } from "next/headers";
import { LANG_COOKIE, isLang } from "./index";

export async function setLang(lang: string) {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
