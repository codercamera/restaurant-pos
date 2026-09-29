import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, makeT, type Lang } from "./index";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

/** For server components and actions: `const { t, lang } = await getT()`. */
export async function getT() {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
}
