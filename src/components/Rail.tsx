"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { LangToggle } from "./LangToggle";
import { useLang } from "@/lib/i18n/client";
import { signOut } from "@/app/login/actions";
import type { Permission } from "@/lib/permissions";

const LINKS: { href: string; label: string; icon: "orders" | "list" | "tables" | "kitchen" | "menu" | "user" | "dashboard" | "gift"; perm: Permission }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", perm: "dashboard.view" },
  { href: "/order", label: "New order", icon: "orders", perm: "order.use" },
  { href: "/orders", label: "Orders", icon: "list", perm: "orders.view" },
  { href: "/tables", label: "Tables", icon: "tables", perm: "tables.view" },
  { href: "/kitchen", label: "Kitchen", icon: "kitchen", perm: "kitchen.view" },
  { href: "/menu", label: "Menu", icon: "menu", perm: "menu.manage" },
  { href: "/rewards", label: "Rewards", icon: "gift", perm: "rewards.manage" },
  { href: "/users", label: "Users", icon: "user", perm: "users.manage" },
];

const PHONE_TABS = 4; // links beyond this go into the Settings sheet on phones

export function Rail({ initials, perms }: { initials: string; perms: Permission[] }) {
  const path = usePathname();
  const { t } = useLang();
  const [more, setMore] = useState(false);
  const links = LINKS.filter((l) => perms.includes(l.perm));
  const tabs = links.slice(0, PHONE_TABS);
  const overflow = links.slice(PHONE_TABS);
  const isActive = (href: string) => path === href || path.startsWith(href + "/") || (href === "/orders" && path.startsWith("/checkout"));

  // Close the "more" sheet when the route changes.
  useEffect(() => setMore(false), [path]);

  const iconBtn = "size-11 rounded-xl text-[#c9c3b6] hover:text-white flex items-center justify-center";

  return (
    <>
      {/* Tablet / desktop: left sidebar */}
      <nav aria-label={t("Main")} className="no-print hidden md:flex w-[88px] shrink-0 bg-rail flex-col items-center py-5 gap-2 h-screen sticky top-0">
        <div className="size-11 rounded-xl bg-accent text-white flex items-center justify-center font-display font-bold text-xl mb-5">F</div>
        {links.map((l) => {
          const active = isActive(l.href);
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
        <LangToggle className={iconBtn} />
        <ThemeToggle className={iconBtn} />
        <form action={signOut}>
          <button type="submit" aria-label={t("Sign out")} className={iconBtn}>
            <Icon name="logout" size={20} />
          </button>
        </form>
      </nav>

      {/* Phone: bottom tab bar */}
      <nav
        aria-label={t("Main")}
        className="no-print md:hidden fixed inset-x-0 bottom-0 z-50 bg-rail border-t border-white/10 flex items-stretch px-1 pb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map((l) => {
          const active = isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex-1 min-w-0 h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold leading-tight ${
                active ? "text-white" : "text-[#a9a396]"
              }`}
            >
              <span className={`h-7 w-12 rounded-full flex items-center justify-center ${active ? "bg-rail-2" : ""}`}>
                <Icon name={l.icon} size={21} stroke={1.8} />
              </span>
              <span className="max-w-full truncate px-0.5">{t(l.label)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          aria-label={t("Settings")}
          className={`flex-1 min-w-0 h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold leading-tight ${more || overflow.some((l) => isActive(l.href)) ? "text-white" : "text-[#a9a396]"}`}
        >
          <span className={`h-7 w-12 rounded-full flex items-center justify-center ${more ? "bg-rail-2" : ""}`}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </span>
          <span className="max-w-full truncate px-0.5">{t("Settings")}</span>
        </button>
      </nav>

      {more && (
        <div className="no-print md:hidden fixed inset-0 z-40" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-label={t("Settings")}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-2xl bg-rail border border-white/10 p-3 flex flex-col gap-2 shadow-2xl"
          >
            {overflow.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={`h-12 px-3 rounded-xl flex items-center gap-3 text-[15px] font-semibold ${isActive(l.href) ? "bg-rail-2 text-white" : "text-[#c9c3b6]"}`}
              >
                <Icon name={l.icon} size={20} stroke={1.8} />
                {t(l.label)}
              </Link>
            ))}
            <div className="flex items-center gap-2">
            <div className="size-10 rounded-full bg-rail-2 text-[#f4f1ea] flex items-center justify-center text-sm font-semibold" title={t("Signed in")}>
              {initials}
            </div>
            <div className="grow" />
            <LangToggle className={`${iconBtn} border border-white/10`} />
            <ThemeToggle className={`${iconBtn} border border-white/10`} />
            <form action={signOut}>
              <button type="submit" aria-label={t("Sign out")} className={`${iconBtn} border border-white/10`}>
                <Icon name="logout" size={20} />
              </button>
            </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
