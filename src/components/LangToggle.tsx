"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLang } from "@/lib/i18n/actions";
import { useLang } from "@/lib/i18n/client";

/** EN / ไทย switch. Stores the choice in a cookie so server-rendered pages follow it. */
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = lang === "en" ? "th" : "en";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setLang(next);
          router.refresh();
        })
      }
      aria-label={lang === "en" ? "เปลี่ยนเป็นภาษาไทย" : "Switch to English"}
      title={lang === "en" ? "ภาษาไทย" : "English"}
      className={`${className} font-bold text-[13px] leading-none`}
    >
      {lang === "en" ? "ไทย" : "EN"}
    </button>
  );
}
