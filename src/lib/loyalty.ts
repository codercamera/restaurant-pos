import "server-only";
import { db } from "@/lib/db";

export type LoyaltySettings = { enabled: boolean; baht_per_point: number; point_value: number; min_redeem: number };
export const DEFAULT_LOYALTY: LoyaltySettings = { enabled: true, baht_per_point: 10, point_value: 0.1, min_redeem: 50 };

export async function getLoyaltySettings(companyId: string): Promise<LoyaltySettings> {
  const r = await db.one<LoyaltySettings>(
    "select enabled, baht_per_point, point_value, min_redeem from loyalty_settings where company_id = ?1",
    [companyId]
  );
  return r ? { ...r, baht_per_point: Number(r.baht_per_point), point_value: Number(r.point_value), min_redeem: Number(r.min_redeem) } : DEFAULT_LOYALTY;
}

/** Points earned for a bill: net subtotal (after discount, before tax/service/tip) divided by the earn rate, rounded down. */
export const pointsFor = (netSubtotal: number, s: LoyaltySettings) => (s.enabled ? Math.max(0, Math.floor((netSubtotal + 1e-6) / s.baht_per_point)) : 0);
