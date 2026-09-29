"use server";

import { revalidatePath } from "next/cache";
import { getT } from "@/lib/i18n/server";
import { ACTIVE_SQL, db, isUuid, newId, stmt, type Stmt } from "@/lib/db";
import { actionError, getContext } from "@/lib/session";
import type { ActionResult, TableStatus } from "@/lib/types";

export type LayoutTable = {
  id: string | null;
  name: string;
  zone: string;
  seats: number;
  shape: "round" | "rect";
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));

export async function saveLayout(input: { tables: LayoutTable[]; deletedIds: string[] }): Promise<ActionResult<{ hidden: number }>> {
  try {
    const { t } = await getT();
    const { branch } = await getContext("tables.edit");

    const rows = (input.tables ?? []).map((t) => ({
      id: isUuid(t.id) ? t.id : null,
      name: String(t.name ?? "").trim().slice(0, 12) || "?",
      zone: String(t.zone ?? "").trim().slice(0, 40) || "Main hall",
      seats: clamp(t.seats, 1, 40),
      shape: t.shape === "round" ? "round" : "rect",
      pos_x: clamp(t.pos_x, 0, 4000),
      pos_y: clamp(t.pos_y, 0, 4000),
      width: clamp(t.width, 48, 1200),
      height: clamp(t.height, 48, 1200),
    }));
    const deleted = (input.deletedIds ?? []).filter(isUuid);

    const stmts: Stmt[] = [];
    for (const r of rows) {
      if (r.id) {
        stmts.push(
          stmt(
            `update dining_tables set name = ?3, zone = ?4, seats = ?5, shape = ?6, pos_x = ?7, pos_y = ?8, width = ?9, height = ?10
              where id = ?1 and branch_id = ?2`,
            r.id, branch.id, r.name, r.zone, r.seats, r.shape, r.pos_x, r.pos_y, r.width, r.height
          )
        );
      } else {
        stmts.push(
          stmt(
            `insert into dining_tables (id, branch_id, name, zone, seats, shape, pos_x, pos_y, width, height)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
            newId(), branch.id, r.name, r.zone, r.seats, r.shape, r.pos_x, r.pos_y, r.width, r.height
          )
        );
      }
    }
    let hidden = 0;
    for (const id of deleted) {
      const active = await db.one(`select 1 as x from orders where table_id = ?1 and status in ${ACTIVE_SQL} limit 1`, [id]);
      if (active) return { ok: false, error: t("A table you removed still has an open order. Close it first.") };
      const history = await db.one("select 1 as x from orders where table_id = ?1 limit 1", [id]);
      if (history) {
        // Keep order history intact: hide instead of deleting.
        stmts.push(stmt("update dining_tables set is_active = 0 where id = ?1 and branch_id = ?2", id, branch.id));
        hidden++;
      } else {
        stmts.push(stmt("delete from dining_tables where id = ?1 and branch_id = ?2", id, branch.id));
      }
    }
    await db.batch(stmts); // atomic

    revalidatePath("/tables");
    revalidatePath("/order");
    return { ok: true, data: { hidden } };
  } catch (e) {
    return actionError(e);
  }
}

export async function setTableStatus(tableId: string, status: TableStatus): Promise<ActionResult> {
  try {
    const { t } = await getT();
    const { branch } = await getContext("tables.view");
    if (!isUuid(tableId)) return { ok: false, error: t("Table not found") };
    if (!["available", "occupied", "reserved", "cleaning"].includes(status)) return { ok: false, error: t("Unknown status") };
    await db.run("update dining_tables set status = ?3 where id = ?1 and branch_id = ?2", [tableId, branch.id, status]);
    revalidatePath("/tables");
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}
