import { db, isUuid } from "@/lib/db";

/** Serves a dish photo. Ids are random UUIDs and never change, so this is public (guest table pages need it) and cacheable for a year. */
export async function GET(_req: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  if (!isUuid(imageId)) return new Response("Not found", { status: 404 });

  const row = await db.one<{ data_b64: string; content_type: string }>(
    "select data_b64, content_type from menu_item_images where id = ?1",
    [imageId]
  );
  if (!row) return new Response("Not found", { status: 404 });

  const bin = atob(row.data_b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: { "Content-Type": row.content_type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
