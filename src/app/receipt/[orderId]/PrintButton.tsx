"use client";

import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";

export function PrintButton() {
  const { t } = useLang();
  return (
    <button type="button" onClick={() => window.print()} className="h-11 px-4 rounded-xl bg-accent text-white font-bold flex items-center gap-2 hover:bg-accent-dark">
      <Icon name="print" size={18} /> {t("Print")}
    </button>
  );
}
