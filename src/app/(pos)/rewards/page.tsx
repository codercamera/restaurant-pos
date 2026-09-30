import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { getLoyaltySettings } from "@/lib/loyalty";
import { getContext } from "@/lib/session";
import { RewardsAdmin, type CustomerRow } from "./RewardsAdmin";

export default async function RewardsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { staff, branch } = await getContext("rewards.manage");
  const { t } = await getT();
  const q = String((await searchParams).q ?? "").replace(/\D/g, "").slice(0, 10);
  const [settings, customers, totals] = await Promise.all([
    getLoyaltySettings(staff.company_id),
    db.q<CustomerRow>(
      `select id, phone, name, points, total_spent, visits, created_at from customers
        where company_id = ?1 ${q ? "and phone like ?2" : ""} order by points desc, created_at desc limit 100`,
      q ? [staff.company_id, `%${q}%`] : [staff.company_id]
    ),
    db.one<{ n: number; pts: number }>("select count(*) as n, coalesce(sum(points), 0) as pts from customers where company_id = ?1", [staff.company_id]),
  ]);
  return <RewardsAdmin settings={settings} customers={customers} q={q} currency={branch.currency} members={Number(totals?.n ?? 0)} outstanding={Number(totals?.pts ?? 0)} title={t("Rewards")} />;
}
