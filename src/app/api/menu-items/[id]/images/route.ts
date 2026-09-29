import { getSessionStaff } from "@/lib/auth";
import { db, isUuid, newId } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { MAX_IMAGES_PER_DISH, MAX_IMAGE_BYTES } from "@/lib/menu-images";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Upload one photo (multipart field "file", already compressed to JPEG by the browser) for a dish. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  try {
    const staff = await getSessionStaff();
    if (!staff) return json({ error: t("Sign in again.") }, 401);
    if (!can(staff.role, "menu.manage")) return json({ error: t("You don't have access to this.") }, 403);

    const { id } = await params;
    if (!isUuid(id)) return json({ error: t("Dish not found") }, 404);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: t("Choose a photo.") }, 400);
    if (file.size > MAX_IMAGE_BYTES) return json({ error: t("That photo is too large. Try a smaller one.") }, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isJpeg) return json({ error: t("Use a JPEG photo.") }, 400);

    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

    // One statement: only inserts when the dish is this company's and has room; the first photo becomes the main one.
    const changes = await db.run(
      `insert into menu_item_images (id, menu_item_id, content_type, data_b64, size_bytes, sort_order, is_primary)
       select ?1, mi.id, 'image/jpeg', ?3, ?4,
              coalesce((select max(sort_order) from menu_item_images where menu_item_id = mi.id), 0) + 1,
              case when (select count(*) from menu_item_images where menu_item_id = mi.id) = 0 then 1 else 0 end
         from menu_items mi
        where mi.id = ?2 and mi.company_id = ?5
          and (select count(*) from menu_item_images where menu_item_id = mi.id) < ${MAX_IMAGES_PER_DISH}`,
      [newId(), id, btoa(bin), bytes.length, staff.company_id]
    );
    if (changes === 0) {
      const own = await db.one("select 1 as x from menu_items where id = ?1 and company_id = ?2", [id, staff.company_id]);
      return own ? json({ error: t("A dish can have at most {n} photos.", { n: MAX_IMAGES_PER_DISH }) }, 409) : json({ error: t("Dish not found") }, 404);
    }
    revalidatePath("/menu");
    revalidatePath("/order");
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: t("Something went wrong") }, 500);
  }
}
