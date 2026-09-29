"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/client";
import { ROLES, ROLE_LABEL, ROLE_PERMISSIONS, isRole, type Role } from "@/lib/permissions";
import { saveUser } from "./actions";

export type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  branch_id: string | null;
  is_active: boolean;
  branch_name: string | null;
  created_at: string;
};
export type BranchRow = { id: string; name: string };
type Form = { id: string | null; full_name: string; email: string; role: Role; branch_id: string; password: string; is_active: boolean };

const field = "h-12 w-full rounded-[10px] border border-line-2 bg-panel px-3.5 text-[15px] font-medium outline-none focus:border-ink";
const ROLE_TONE: Record<Role, string> = {
  admin: "bg-accent-soft text-accent-text",
  kitchen: "bg-warn-soft text-warn",
  cashier: "bg-info-soft text-info",
  waiter: "bg-good-soft text-good-dark",
};

export function UsersAdmin({ users, branches, currentId, defaultBranchId }: { users: UserRow[]; branches: BranchRow[]; currentId: string; defaultBranchId: string }) {
  const router = useRouter();
  const { t } = useLang();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Form | null>(null);
  const [filter, setFilter] = useState<"all" | Role>("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = (r: Role) => users.filter((u) => u.role === r && u.is_active).length;
  const shown = users.filter((u) => filter === "all" || u.role === filter);

  const openNew = () => {
    setError(null);
    setForm({ id: null, full_name: "", email: "", role: "cashier", branch_id: defaultBranchId, password: "", is_active: true });
  };
  const openEdit = (u: UserRow) => {
    setError(null);
    setForm({
      id: u.id,
      full_name: u.full_name,
      email: u.email ?? "",
      role: isRole(u.role) ? u.role : "cashier",
      branch_id: u.branch_id ?? defaultBranchId,
      password: "",
      is_active: u.is_active,
    });
  };

  const submit = () => {
    if (!form) return;
    setError(null);
    start(async () => {
      const res = await saveUser({ ...form });
      if (!res.ok) setError(res.error);
      else {
        setNotice(form.id ? t("User updated") : t("User added"));
        setForm(null);
        router.refresh();
      }
    });
  };

  const isSelf = form?.id === currentId;
  const roleNote = (r: Role) => (ROLE_PERMISSIONS[r].length === 0 ? t("No screens enabled yet") : r === "admin" ? t("Can use every function") : t("Custom access"));

  return (
    <main className="px-4 py-4 sm:px-6 sm:py-5 flex flex-col gap-4 sm:gap-5 max-w-[1100px]">
      <header className="flex flex-wrap items-end gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight">{t("Users")}</h1>
          <div className="text-sm text-muted">{t("{n} users · {a} admins", { n: users.length, a: counts("admin") })}</div>
        </div>
        <div className="grow" />
        <button type="button" onClick={openNew} className="h-12 px-5 rounded-xl bg-accent text-white font-bold flex items-center gap-2 hover:bg-accent-dark">
          <Icon name="plus" size={18} stroke={2.2} /> {t("Add user")}
        </button>
      </header>

      {notice && <p role="status" className="rounded-xl bg-good-soft px-4 py-2.5 text-sm font-semibold text-good-dark">{notice}</p>}

      <div role="tablist" aria-label={t("Role")} className="flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0">
        {(["all", ...ROLES] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={filter === r}
            onClick={() => setFilter(r)}
            className={`inline-flex shrink-0 items-center gap-2 h-11 px-[18px] rounded-full text-[15px] font-semibold border ${
              filter === r ? "bg-strong text-on-strong border-strong" : "bg-panel text-ink border-line"
            }`}
          >
            {r === "all" ? t("All") : t(ROLE_LABEL[r])}
            <span className="font-mono text-xs opacity-70">{r === "all" ? users.length : users.filter((u) => u.role === r).length}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-panel overflow-hidden">
        {shown.length === 0 && <div className="p-8 text-center text-muted">{t("No users in this role yet.")}</div>}
        {shown.map((u) => {
          const role = isRole(u.role) ? u.role : null;
          return (
            <div key={u.id} className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 min-h-[68px] border-b border-hair last:border-b-0 ${u.is_active ? "" : "opacity-60"}`}>
              <div className="size-10 shrink-0 rounded-full bg-ground-2 flex items-center justify-center font-semibold text-sm">
                {u.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"}
              </div>
              <div className="grow min-w-0">
                <div className="font-semibold truncate">
                  {u.full_name}
                  {u.id === currentId && <span className="ml-2 text-xs font-bold text-muted">{t("You")}</span>}
                </div>
                <div className="text-[13px] text-muted truncate">
                  {u.email}
                  {u.branch_name ? ` · ${u.branch_name}` : ""}
                </div>
              </div>
              {!u.is_active && <span className="hidden sm:inline text-xs font-bold text-muted">{t("Inactive")}</span>}
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${role ? ROLE_TONE[role] : "bg-hair text-muted"}`}>{role ? t(ROLE_LABEL[role]) : u.role}</span>
              <button type="button" onClick={() => openEdit(u)} aria-label={t("Edit {name}", { name: u.full_name })} className="size-10 shrink-0 rounded-lg border border-line flex items-center justify-center">
                <Icon name="edit" size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {form && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setForm(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="w-full max-w-[480px] max-h-[92dvh] overflow-auto rounded-t-2xl sm:rounded-2xl bg-panel p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-4"
          >
            <h2 id="user-title" className="font-display text-2xl font-bold">{form.id ? t("Edit user") : t("New user")}</h2>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="u-name" className="text-sm font-bold text-muted-2">{t("Full name")}</label>
              <input id="u-name" autoFocus required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={field} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="u-email" className="text-sm font-bold text-muted-2">{t("Email (used to sign in)")}</label>
              <input id="u-email" type="email" required autoCapitalize="none" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-bold text-muted-2">{t("Role")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={isSelf}
                    aria-pressed={form.role === r}
                    onClick={() => setForm({ ...form, role: r })}
                    className={`min-h-12 px-3 py-2 rounded-[10px] border text-left disabled:opacity-50 ${form.role === r ? "border-strong bg-strong text-on-strong" : "border-line bg-panel"}`}
                  >
                    <div className="text-[15px] font-bold">{t(ROLE_LABEL[r])}</div>
                    <div className={`text-xs ${form.role === r ? "opacity-80" : "text-muted"}`}>{roleNote(r)}</div>
                  </button>
                ))}
              </div>
              {isSelf && <p className="text-xs text-muted">{t("You can't change your own role or deactivate yourself.")}</p>}
            </fieldset>

            {branches.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="u-branch" className="text-sm font-bold text-muted-2">{t("Branch")}</label>
                <select id="u-branch" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className={field}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="u-pass" className="text-sm font-bold text-muted-2">{form.id ? t("New password (leave blank to keep)") : t("Password")}</label>
              <input
                id="u-pass"
                type="password"
                autoComplete="new-password"
                required={!form.id}
                minLength={form.id && !form.password ? undefined : 8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={field}
              />
              <p className="text-xs text-muted">{t("At least 8 characters.")}</p>
            </div>

            {form.id && (
              <label className={`flex items-center gap-3 text-[15px] font-semibold ${isSelf ? "opacity-50" : "cursor-pointer"}`}>
                <input type="checkbox" disabled={isSelf} checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="size-5 accent-[#2f6b4f]" />
                {t("Active (can sign in)")}
              </label>
            )}

            {error && <p role="alert" className="rounded-[10px] bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-text">{error}</p>}

            <div className="flex gap-2.5 mt-1">
              <button type="button" onClick={() => setForm(null)} className="h-12 px-5 rounded-xl border border-line font-semibold">{t("Cancel")}</button>
              <button type="submit" disabled={pending} className="grow h-12 rounded-xl bg-accent text-white font-bold disabled:opacity-50 hover:bg-accent-dark">
                {pending ? t("Saving…") : form.id ? t("Save changes") : t("Add user")}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
