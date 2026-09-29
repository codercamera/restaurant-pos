import Link from "next/link";
import { db } from "@/lib/db";
import { getContext } from "@/lib/session";
import { formatMoney, ORDER_TYPE_LABEL } from "@/lib/money";
import { getT } from "@/lib/i18n/server";
import { localeOf } from "@/lib/i18n";

type Row = {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  customer_name: string | null;
  grand_total: number;
  created_at: string;
  closed_at: string | null;
  table_name: string | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-info-soft text-info" },
  sent_to_kitchen: { label: "In kitchen", cls: "bg-warn-soft text-warn" },
  ready: { label: "Food ready", cls: "bg-good-soft text-good-dark" },
  served: { label: "Served", cls: "bg-accent-soft text-accent-text" },
  completed: { label: "Paid", cls: "bg-ground-2 text-muted-2" },
  cancelled: { label: "Cancelled", cls: "bg-ground-2 text-muted-2" },
};

export default async function OrdersPage() {
  const { branch } = await getContext("orders.view");
  const { t, lang } = await getT();
  const cols = `o.id, o.order_number, o.order_type, o.status, o.customer_name, o.grand_total, o.created_at, o.closed_at, t.name as table_name`;
  const [active, done] = await Promise.all([
    db.q<Row>(
      `select ${cols} from orders o left join dining_tables t on t.id = o.table_id
        where o.branch_id = ?1 and o.status in ('open','sent_to_kitchen','ready','served') order by o.created_at`,
      [branch.id]
    ),
    db.q<Row>(
      `select ${cols} from orders o left join dining_tables t on t.id = o.table_id
        where o.branch_id = ?1 and o.status in ('completed','cancelled') and o.created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-24 hours')
        order by o.closed_at desc limit 50`,
      [branch.id]
    ),
  ]);
  const takings = done.filter((o) => o.status === "completed").reduce((s, o) => s + Number(o.grand_total), 0);
  const money = (n: number) => formatMoney(n, branch.currency);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(localeOf(lang), { hour: "2-digit", minute: "2-digit", timeZone: branch.timezone });

  const List = ({ rows, closed }: { rows: Row[]; closed?: boolean }) => (
    <div className="rounded-2xl border border-line bg-panel overflow-hidden">
      {rows.length === 0 && <div className="p-8 text-center text-muted">{closed ? t("No closed orders in the last 24 hours.") : t("No open orders. Start one from New order or Tables.")}</div>}
      {rows.map((o) => {
        const st = STATUS[o.status] ?? STATUS.open;
        return (
          <Link
            key={o.id}
            href={closed ? (o.status === "completed" ? `/receipt/${o.id}` : `/order?order=${o.id}`) : `/order?order=${o.id}`}
            className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-2.5 min-h-16 border-b border-hair last:border-b-0 hover:bg-panel-2"
          >
            <span className="font-mono text-base sm:text-lg font-semibold w-14 sm:w-16 shrink-0">#{o.order_number}</span>
            <span className="grow min-w-0 font-semibold">
              <span className="block truncate">
                {t(ORDER_TYPE_LABEL[o.order_type])}
                {o.table_name ? ` · ${t("Table {n}", { n: o.table_name })}` : ""}
                {o.customer_name ? ` · ${o.customer_name}` : ""}
              </span>
              <span className="sm:hidden block text-xs font-normal text-muted">{time(closed && o.closed_at ? o.closed_at : o.created_at)}</span>
            </span>
            <span className="hidden sm:block text-sm text-muted w-24">{time(closed && o.closed_at ? o.closed_at : o.created_at)}</span>
            <span className={`hidden sm:block text-xs font-bold px-2.5 py-1 rounded-full w-24 text-center ${st.cls}`}>{t(st.label)}</span>
            <span className="flex flex-col items-end gap-1 sm:block sm:w-28 text-right shrink-0">
              <span className="font-mono font-semibold">{money(Number(o.grand_total))}</span>
              <span className={`sm:hidden text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{t(st.label)}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <main className="px-4 py-4 sm:px-6 sm:py-5 flex flex-col gap-5 sm:gap-6 max-w-[1100px]">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight">{t("Orders")}</h1>
          <div className="text-sm text-muted">{branch.name}</div>
        </div>
        <div className="grow" />
        <div className="rounded-xl bg-panel border border-line px-4 py-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">{t("Paid · last 24h")}</div>
          <div className="font-mono text-xl font-semibold">{money(takings)}</div>
        </div>
        <Link href="/order" className="h-12 px-5 rounded-xl bg-accent text-white font-bold flex items-center hover:bg-accent-dark">{t("New order")}</Link>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-muted">{t("Open")} · {active.length}</h2>
        <List rows={active} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-muted">{t("Closed · last 24 hours")}</h2>
        <List rows={done} closed />
      </section>
    </main>
  );
}
