import Link from "next/link";
import { headers } from "next/headers";
import { renderSVG } from "uqr";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { getContext } from "@/lib/session";
import { PrintClient } from "./PrintClient";
import { QrCard } from "./QrCard";

export default async function TableQrPage() {
  const { branch } = await getContext("tables.edit");
  const { t } = await getT();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const rows = await db.q<{ id: string; name: string; zone: string | null; qr_token: string; self_order: boolean }>(
    `select id, name, zone, qr_token, self_order from dining_tables where branch_id = ?1 and is_active = 1 and qr_token is not null order by zone, name`,
    [branch.id]
  );
  const cards = rows.map((r) => {
    const url = `${proto}://${host}/t/${r.qr_token}`;
    return { id: r.id, name: r.name, zone: r.zone, enabled: r.self_order, url, svg: renderSVG(url, { border: 1, ecc: "M" }) };
  });

  return (
    <div className="p-4 sm:p-6 max-w-[1100px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/tables" className="size-11 grid place-items-center rounded-xl border border-line bg-panel" aria-label={t("Back")}>
          <Icon name="back" />
        </Link>
        <div className="grow">
          <h1 className="font-display text-2xl font-bold">{t("Table QR codes")}</h1>
          <p className="text-sm text-muted">{t("Each table has a permanent link. Guests scan it and order without signing in. Turn a table off or make a new link any time.")}</p>
        </div>
        <PrintClient label={t("Print")} />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
        {cards.map((c) => (
          <QrCard key={c.id} {...c} />
        ))}
      </div>
    </div>
  );
}
