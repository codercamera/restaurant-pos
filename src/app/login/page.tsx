import { ThemeToggle } from "@/components/ThemeToggle";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ nobranch?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <ThemeToggle className="fixed top-4 right-4 size-11 rounded-xl border border-line bg-panel text-ink flex items-center justify-center" />
      <div className="w-full max-w-[460px] rounded-2xl border border-line bg-panel p-8 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-accent text-white flex items-center justify-center font-display text-xl font-bold">F</div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Restaurant POS</h1>
            <p className="text-sm text-muted">Sign in to start service</p>
          </div>
        </div>
        <LoginForm notice={sp.nobranch ? "Your account isn't linked to a branch yet. Ask the owner to assign you one." : undefined} />
      </div>
    </main>
  );
}
