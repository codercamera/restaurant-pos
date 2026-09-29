"use client";

import { Icon } from "@/components/Icon";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="h-11 px-4 rounded-xl bg-accent text-white font-bold flex items-center gap-2 hover:bg-accent-dark">
      <Icon name="print" size={18} /> Print
    </button>
  );
}
