"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { LangToggle } from "./LangToggle";
import { useLang } from "@/lib/i18n/client";
import { signOut } from "@/app/login/actions";

const LINKS = [
  { href: "/order", label: "New order", icon: "orders" as const },
  { href: "/orders", label: "Orders", icon: "list" as const },
  { href: "/tables", label: "Tables", icon: "tables" as const },
  { href: "/kitchen", label: "Kitchen", icon: "kitchen" as const },
  { href: "/menu", label: "Menu", icon: "menu" as const, manage: true },
];

export function Rail({ initials, canManage }: { initials: string; canManage: boolean }) {
  const path = usePathname();
  const { t } = useLang();
  return (
    <nav aria-label={t("Main")} className="no-print w-[88px] shrink-0 bg-rail flex flex-col items-center py-5 gap-2 h-screen sticky top-0">
      <div className="size-11 rounded-xl bg-accent text-white flex items-center justify-center font-display font-bold text-xl mb-5">F</div>
      {LINKS.filter((l) => !l.manage || canManage).map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/") || (l.href === "/orders" && path.startsWith("/checkout"));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`w-[72px] py-2.5 rounded-xl flex flex-col items-center gap-1 text-[12px] font-semibold text-center leading-tight ${
              active ? "bg-rail-2 text-white" : "text-[#c9c3b6] hover:text-white"
            }`}
          >
            <Icon name={l.icon} size={22} stroke={1.8} />
            {t(l.label)}
          </Link>
        );
      })}
      <div className="grow" />
      <div className="size-10 rounded-full bg-rail-2 text-[#f4f1ea] flex items-center justify-center text-sm font-semibold" title={t("Signed in")}>
        {initials}
      </div>
      <LangToggle className="size-11 rounded-xl text-[#c9c3b6] hover:text-white flex items-center justify-center" />
      <ThemeToggle className="size-11 rounded-xl text-[#c9c3b6] hover:text-white flex items-center justify-center" />
      <form action={signOut}>
        <button type="submit" aria-label={t("Sign out")} className="size-11 rounded-xl text-[#c9c3b6] hover:text-white flex items-center justify-center">
          <Icon name="logout" size={20} />
        </button>
      </form>
    </nav>
  );
}
