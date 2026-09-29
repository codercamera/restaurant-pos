import { redirect } from "next/navigation";
import { LangToggle } from "@/components/LangToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSessionStaff } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { getT } from "@/lib/i18n/server";
import { ROLE_LABEL, homeFor, isRole } from "@/lib/permissions";

// Signed in, but the account's role has no screens enabled (yet).
export default async function NoAccessPage() {
  const staff = await getSessionStaff();
  if (!staff) redirect("/login");
  const home = homeFor(staff.role);
  if (home !== "/no-access") redirect(home);
  const { t } = await getT();
  const role = isRole(staff.role) ? t(ROLE_LABEL[staff.role]) : staff.role;

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="fixed top-4 right-4 flex gap-2">
        <LangToggle className="size-11 rounded-xl border border-line bg-panel text-ink flex items-center justify-center" />
        <ThemeToggle className="size-11 rounded-xl border border-line bg-panel text-ink flex items-center justify-center" />
      </div>
      <div className="w-full max-w-[460px] rounded-2xl border border-line bg-panel p-5 sm:p-8 flex flex-col gap-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("No access yet")}</h1>
          <p className="mt-2 text-muted leading-relaxed">
            {t("{name}, your account has the role {role}, which doesn't have any screens enabled yet. Ask an admin to set up access.", { name: staff.full_name, role })}
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="h-12 w-full rounded-xl border border-line font-semibold">
            {t("Sign out")}
          </button>
        </form>
      </div>
    </main>
  );
}
