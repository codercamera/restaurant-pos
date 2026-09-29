import { getSessionStaff } from "@/lib/auth";
import { db, isUuid } from "@/lib/db";

/** Serves a dish photo to signed-in staff of the same company. Ids never change, so browsers may cache for a year. */
export async function GET(_req: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const staff = await getSessionStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });
  const { imageId } = await params;
  if (!isUuid(imageId)) return new Response("Not found", { status: 404 });

  const row = await db.one<{ data_b64: string; content_type: string }>(
    `select i.data_b64, i.content_type from menu_item_images i
       join menu_items mi on mi.id = i.menu_item_id
      where i.id = ?1 and mi.company_id = ?2`,
    [imageId, staff.company_id]
  );
  if (!row) return new Response("Not found", { status: 404 });

  const bin = atob(row.data_b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: { "Content-Type": row.content_type, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
