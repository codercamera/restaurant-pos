import Link from "next/link";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { getContext } from "@/lib/session";

const RANGES = ["today", "7d", "30d", "all"] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Record<Range, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" };

/** UTC ISO instant of local midnight (`daysBack` days ago) in the branch's time zone. */
function startOfDay(tz: string, daysBack: number): string {
  const now = new Date();
  let local: Date;
  try {
    local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  } catch {
    local = now;
  }
  const offsetMs = local.getTime() - now.getTime(); // local wall clock minus UTC
  local.setHours(0, 0, 0, 0);
  local.setDate(local.getDate() - daysBack);
  return new Date(local.getTime() - offsetMs).toISOString();
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { branch } = await getContext("dashboard.view");
  const { t } = await getT();
  const sp = await searchParams;
  const range: Range = (RANGES as readonly string[]).includes(sp.range ?? "") ? (sp.range as Range) : "today";
  const since = range === "all" ? "0000" : startOfDay(branch.timezone, range === "today" ? 0 : range === "7d" ? 6 : 29);

  const [orders, paid] = await Promise.all([
    db.one<{ total: number; paid: number; open: number; cancelled: number }>(
      `select count(*) filter (where status <> 'cancelled') as total,
              count(*) filter (where status = 'completed') as paid,
              count(*) filter (where status in ('open','sent_to_kitchen','ready','served')) as open,
              count(*) filter (where status = 'cancelled') as cancelled
         from orders where branch_id = ?1 and created_at >= ?2`,
      [branch.id, since]
    ),
    db.one<{ amount: number; orders: number; guests: number }>(
      `select coalesce(sum(p.amount), 0) as amount,
              count(distinct p.order_id) as orders,
              coalesce((select sum(coalesce(o2.customer_count, 0)) from orders o2
                         where o2.branch_id = ?1 and o2.id in (select order_id from payments where status = 'completed' and paid_at >= ?2)), 0) as guests
         from payments p join orders o on o.id = p.order_id
        where o.branch_id = ?1 and p.status = 'completed' and p.paid_at >= ?2`,
      [branch.id, since]
    ),
  ]);

  const n = (v: number | undefined) => Number(v ?? 0).toLocaleString();
  const cards = [
    {
      label: t("Total orders"),
      value: n(orders?.total),
      sub: t("{paid} paid · {open} in progress", { paid: n(orders?.paid), open: n(orders?.open) }) + (Number(orders?.cancelled) ? ` · ${t("{n} cancelled", { n: n(orders?.cancelled) })}` : ""),
    },
    {
      label: t("Total paid by customers"),
      value: formatMoney(Number(paid?.amount ?? 0), branch.currency),
      sub: t("{orders} paid orders · {guests} guests", { orders: n(paid?.orders), guests: n(paid?.guests) }),
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-[1000px] mx-auto">
      <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight">{t("Dashboard")}</h1>
      <div role="tablist" aria-label={t("Period")} className="mt-4 flex max-w-full overflow-x-auto p-1 bg-ground-2 rounded-xl gap-1 w-fit">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/dashboard?range=${r}`}
            role="tab"
            aria-selected={r === range}
            className={`h-10 shrink-0 whitespace-nowrap px-4 rounded-[9px] text-sm font-semibold flex items-center ${r === range ? "bg-panel text-ink shadow-sm" : "text-muted-2"}`}
          >
            {t(RANGE_LABEL[r])}
          </Link>
        ))}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-line bg-panel p-5 min-w-0">
            <div className="text-sm font-bold uppercase tracking-[0.06em] text-muted">{c.label}</div>
            <div className="mt-2 font-display text-4xl sm:text-5xl font-bold tracking-tight truncate">{c.value}</div>
            <div className="mt-2 text-sm text-muted">{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
