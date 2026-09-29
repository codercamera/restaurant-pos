"use server";

import { revalidatePath } from "next/cache";
import { db, isUuid, newId, NOW, stmt } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { actionError, getContext } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

async function managerCtx() {
  return getContext("menu.manage");
}

function done() {
  revalidatePath("/menu");
  revalidatePath("/order");
}

export async function saveCategory(input: { id?: string | null; name: string; name_th?: string | null }): Promise<ActionResult> {
  const { t } = await getT();
  try {
    const { staff } = await managerCtx();
    const name = String(input.name ?? "").trim().slice(0, 60);
    const nameTh = String(input.name_th ?? "").trim().slice(0, 60) || null;
    if (!name) return { ok: false, error: t("Give the category a name") };
    if (input.id) {
      if (!isUuid(input.id)) return { ok: false, error: t("Category not found") };
      await db.run("update categories set name = ?3, name_th = ?4 where id = ?1 and company_id = ?2", [input.id, staff.company_id, name, nameTh]);
    } else {
      await db.run(
        `insert into categories (id, company_id, name, name_th, sort_order)
         values (?1, ?2, ?3, ?4, coalesce((select max(sort_order) from categories where company_id = ?2), 0) + 1)`,
        [newId(), staff.company_id, name, nameTh]
      );
    }
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e, t);
  }
}

export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  const { t } = await getT();
  try {
    const { staff } = await managerCtx();
    if (!isUuid(id)) return { ok: false, error: t("Category not found") };
    await db.run("update categories set is_active = ?3 where id = ?1 and company_id = ?2", [id, staff.company_id, active ? 1 : 0]);
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e, t);
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const { t } = await getT();
  try {
    const { staff } = await managerCtx();
    if (!isUuid(id)) return { ok: false, error: t("Category not found") };
    const used = await db.one("select 1 as x from menu_items where category_id = ?1 limit 1", [id]);
    if (used) return { ok: false, error: t("Move or delete the dishes in this category first, or hide it instead.") };
    await db.run("delete from categories where id = ?1 and company_id = ?2", [id, staff.company_id]);
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e, t);
  }
}

export type ItemInput = { id?: string | null; category_id: string; name: string; name_th?: string | null; description: string; description_th?: string | null; base_price: number };

export async function saveItem(input: ItemInput): Promise<ActionResult> {
  const { t } = await getT();
  try {
    const { staff } = await managerCtx();
    const name = String(input.name ?? "").trim().slice(0, 80);
    const description = String(input.description ?? "").trim().slice(0, 240) || null;
    const nameTh = String(input.name_th ?? "").trim().slice(0, 80) || null;
    const descriptionTh = String(input.description_th ?? "").trim().slice(0, 240) || null;
    const price = Math.round(Number(input.base_price) * 100) / 100;
    if (!name) return { ok: false, error: t("Give the dish a name") };
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: t("Enter a valid price") };
    if (!isUuid(input.category_id)) return { ok: false, error: t("Choose a category") };
    const cat = await db.one("select 1 as x from categories where id = ?1 and company_id = ?2", [input.category_id, staff.company_id]);
    if (!cat) return { ok: false, error: t("Choose a category") };

    if (input.id) {
      if (!isUuid(input.id)) return { ok: false, error: t("Dish not found") };
      await db.run(
        `update menu_items set category_id = ?3, name = ?4, description = ?5, base_price = ?6, name_th = ?7, description_th = ?8, updated_at = ${NOW}
          where id = ?1 and company_id = ?2`,
        [input.id, staff.company_id, input.category_id, name, description, price, nameTh, descriptionTh]
      );
    } else {
      await db.run(
        `insert into menu_items (id, company_id, category_id, name, description, base_price, name_th, description_th, sort_order)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, coalesce((select max(sort_order) from menu_items where category_id = ?3), 0) + 1)`,
        [newId(), staff.company_id, input.category_id, name, description, price, nameTh, descriptionTh]
      );
    }
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e, t);
  }
}

export async function setItemAvailable(id: string, available: boolean): Promise<ActionResult> {
  const { t } = await getT();
  try {
    const { staff } = await managerCtx();
    if (!isUuid(id)) return { ok: false, error: t("Dish not found") };
    await db.run(`update menu_items set is_available = ?3, updated_at = ${NOW} where id = ?1 and company_id = ?2`, [id, staff.company_id, available ? 1 : 0]);
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e, t);
  }
}

export async function deleteItem(id: string): Promise<ActionResult<{ hidden: boolean }>> {
  const { t } = await getT();
  try {
    const { staff } = await managerCtx();
    if (!isUuid(id)) return { ok: false, error: t("Dish not found") };
    const own = await db.one("select 1 as x from menu_items where id = ?1 and company_id = ?2", [id, staff.company_id]);
    if (!own) return { ok: false, error: t("Dish not found") };

    const sold = await db.one("select 1 as x from order_items where menu_item_id = ?1 limit 1", [id]);
    if (sold) {
      await db.run("update menu_items set is_available = 0 where id = ?1", [id]);
      done();
      return { ok: true, data: { hidden: true } };
    }
    await db.batch([
      stmt("delete from option_choices where option_group_id in (select id from option_groups where menu_item_id = ?1)", id),
      stmt("delete from option_groups where menu_item_id = ?1", id),
      stmt("delete from menu_item_images where menu_item_id = ?1", id),
      stmt("delete from menu_item_branch_overrides where menu_item_id = ?1", id),
      stmt("delete from menu_item_ingredients where menu_item_id = ?1", id),
      stmt("delete from menu_items where id = ?1", id),
    ]);
    done();
    return { ok: true, data: { hidden: false } };
  } catch (e) {
    return actionError(e, t);
  }
}

/** Make one of a dish's photos the main (sample) photo shown on the order screen. */
export async function setPrimaryImage(imageId: string): Promise<ActionResult> {
  const { t } = await getT();
  try {
    const { staff } = await managerCtx();
    if (!isUuid(imageId)) return { ok: false, error: t("Photo not found") };
    const img = await db.one<{ menu_item_id: string }>(
      `select i.menu_item_id from menu_item_images i join menu_items mi on mi.id = i.menu_item_id where i.id = ?1 and mi.company_id = ?2`,
      [imageId, staff.company_id]
    );
    if (!img) return { ok: false, error: t("Photo not found") };
    await db.batch([
      stmt("update menu_item_images set is_primary = 0 where menu_item_id = ?1", img.menu_item_id),
      stmt("update menu_item_images set is_primary = 1 where id = ?1", imageId),
    ]);
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e, t);
  }
}

/** Remove a photo; if it was the main one, the next photo takes over. */
export async function deleteImage(imageId: string): Promise<ActionResult> {
  const { t } = await getT();
  try {
    const { staff } = await managerCtx();
    if (!isUuid(imageId)) return { ok: false, error: t("Photo not found") };
    const img = await db.one<{ menu_item_id: string }>(
      `select i.menu_item_id from menu_item_images i join menu_items mi on mi.id = i.menu_item_id where i.id = ?1 and mi.company_id = ?2`,
      [imageId, staff.company_id]
    );
    if (!img) return { ok: false, error: t("Photo not found") };
    await db.batch([
      stmt("delete from menu_item_images where id = ?1", imageId),
      stmt(
        `update menu_item_images set is_primary = 1
          where id = (select id from menu_item_images where menu_item_id = ?1 order by sort_order, rowid limit 1)
            and not exists (select 1 from menu_item_images where menu_item_id = ?1 and is_primary = 1)`,
        img.menu_item_id
      ),
    ]);
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e, t);
  }
}
