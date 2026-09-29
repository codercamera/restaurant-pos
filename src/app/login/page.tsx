import { ThemeToggle } from "@/components/ThemeToggle";
import { LangToggle } from "@/components/LangToggle";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ nobranch?: string }> }) {
  const sp = await searchParams;
  const { t } = await getT();
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <LangToggle className="fixed top-4 right-[68px] size-11 rounded-xl border border-line bg-panel text-ink flex items-center justify-center" />
      <ThemeToggle className="fixed top-4 right-4 size-11 rounded-xl border border-line bg-panel text-ink flex items-center justify-center" />
      <div className="w-full max-w-[460px] rounded-2xl border border-line bg-panel p-5 sm:p-8 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-accent text-white flex items-center justify-center font-display text-xl font-bold">F</div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t("Restaurant POS")}</h1>
            <p className="text-sm text-muted">{t("Sign in to start service")}</p>
          </div>
        </div>
        <LoginForm notice={sp.nobranch ? t("Your account isn't linked to a branch yet. Ask the owner to assign you one.") : undefined} />
      </div>
    </main>
  );
}
