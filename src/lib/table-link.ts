import "server-only";
import { db } from "@/lib/db";

export type LinkedTable = {
  id: string;
  name: string;
  zone: string | null;
  branch_id: string;
  branch_name: string;
  company_id: string;
  currency: string;
};

/** Table behind a permanent QR token, only when active and self-ordering is switched on. */
export async function tableByToken(token: string): Promise<LinkedTable | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return db.one<LinkedTable>(
    `select t.id, t.name, t.zone, t.branch_id, b.name as branch_name, b.company_id, b.currency
       from dining_tables t join branches b on b.id = t.branch_id
      where t.qr_token = ?1 and t.is_active = 1 and t.self_order = 1`,
    [token]
  );
}
