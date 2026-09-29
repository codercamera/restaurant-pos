"use client";

import { Icon } from "@/components/Icon";

export function PrintClient({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="h-12 px-4 rounded-xl border border-line bg-panel font-semibold flex items-center gap-2">
      <Icon name="print" size={18} /> {label}
    </button>
  );
}
