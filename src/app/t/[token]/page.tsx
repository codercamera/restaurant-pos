import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { loadSellableMenu } from "@/lib/menu";
import { tableByToken } from "@/lib/table-link";
import { SelfOrder } from "./SelfOrder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order at your table", robots: { index: false, follow: false } };

export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const table = await tableByToken(token);
  const { t, lang } = await getT();
  if (!table) {
    return (
      <main className="min-h-dvh grid place-items-center p-6 text-center bg-ground text-ink">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("This table link is not active. Please ask our staff.")}</h1>
        </div>
      </main>
    );
  }
  const { categories, items } = await loadSellableMenu({ companyId: table.company_id, branchId: table.branch_id }, lang);
  if (!items.length) notFound();
  return <SelfOrder token={token} tableName={table.name} branchName={table.branch_name} currency={table.currency} categories={categories} items={items} />;
}
