"use server";

import { revalidatePath } from "next/cache";
import { db, isUuid, tx } from "@/lib/db";
import { actionError, canManage, getContext } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

async function managerCtx() {
  const ctx = await getContext();
  if (!canManage(ctx.staff.role)) throw new Error("Only managers can edit the menu");
  return ctx;
}

function done() {
  revalidatePath("/menu");
  revalidatePath("/order");
}

export async function saveCategory(input: { id?: string | null; name: string }): Promise<ActionResult> {
  try {
    const { staff } = await managerCtx();
    const name = String(input.name ?? "").trim().slice(0, 60);
    if (!name) return { ok: false, error: "Give the category a name" };
    if (input.id) {
      if (!isUuid(input.id)) return { ok: false, error: "Category not found" };
      await db.q("update categories set name = $3 where id = $1 and company_id = $2", [input.id, staff.company_id, name]);
    } else {
      await db.q(
        `insert into categories (company_id, name, sort_order)
         values ($1, $2, coalesce((select max(sort_order) from categories where company_id = $1), 0) + 1)`,
        [staff.company_id, name]
      );
    }
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const { staff } = await managerCtx();
    if (!isUuid(id)) return { ok: false, error: "Category not found" };
    await db.q("update categories set is_active = $3 where id = $1 and company_id = $2", [id, staff.company_id, !!active]);
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    const { staff } = await managerCtx();
    if (!isUuid(id)) return { ok: false, error: "Category not found" };
    const used = await db.one("select 1 from menu_items where category_id = $1 limit 1", [id]);
    if (used) return { ok: false, error: "Move or delete the dishes in this category first, or hide it instead." };
    await db.q("delete from categories where id = $1 and company_id = $2", [id, staff.company_id]);
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

export type ItemInput = { id?: string | null; category_id: string; name: string; description: string; base_price: number };

export async function saveItem(input: ItemInput): Promise<ActionResult> {
  try {
    const { staff } = await managerCtx();
    const name = String(input.name ?? "").trim().slice(0, 80);
    const description = String(input.description ?? "").trim().slice(0, 240) || null;
    const price = Math.round(Number(input.base_price) * 100) / 100;
    if (!name) return { ok: false, error: "Give the dish a name" };
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Enter a valid price" };
    if (!isUuid(input.category_id)) return { ok: false, error: "Choose a category" };
    const cat = await db.one("select 1 from categories where id = $1 and company_id = $2", [input.category_id, staff.company_id]);
    if (!cat) return { ok: false, error: "Choose a category" };

    if (input.id) {
      if (!isUuid(input.id)) return { ok: false, error: "Dish not found" };
      await db.q(
        "update menu_items set category_id = $3, name = $4, description = $5, base_price = $6 where id = $1 and company_id = $2",
        [input.id, staff.company_id, input.category_id, name, description, price]
      );
    } else {
      await db.q(
        `insert into menu_items (company_id, category_id, name, description, base_price, sort_order)
         values ($1, $2, $3, $4, $5, coalesce((select max(sort_order) from menu_items where category_id = $2), 0) + 1)`,
        [staff.company_id, input.category_id, name, description, price]
      );
    }
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

export async function setItemAvailable(id: string, available: boolean): Promise<ActionResult> {
  try {
    const { staff } = await managerCtx();
    if (!isUuid(id)) return { ok: false, error: "Dish not found" };
    await db.q("update menu_items set is_available = $3 where id = $1 and company_id = $2", [id, staff.company_id, !!available]);
    done();
    return { ok: true, data: undefined };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteItem(id: string): Promise<ActionResult<{ hidden: boolean }>> {
  try {
    const { staff } = await managerCtx();
    if (!isUuid(id)) return { ok: false, error: "Dish not found" };
    const own = await db.one("select 1 from menu_items where id = $1 and company_id = $2", [id, staff.company_id]);
    if (!own) return { ok: false, error: "Dish not found" };

    const sold = await db.one("select 1 from order_items where menu_item_id = $1 limit 1", [id]);
    if (sold) {
      await db.q("update menu_items set is_available = false where id = $1", [id]);
      done();
      return { ok: true, data: { hidden: true } };
    }
    await tx(async (t) => {
      await t.q("delete from option_choices where option_group_id in (select id from option_groups where menu_item_id = $1)", [id]);
      await t.q("delete from option_groups where menu_item_id = $1", [id]);
      await t.q("delete from menu_item_branch_overrides where menu_item_id = $1", [id]);
      await t.q("delete from menu_item_ingredients where menu_item_id = $1", [id]);
      await t.q("delete from menu_items where id = $1", [id]);
    });
    done();
    return { ok: true, data: { hidden: false } };
  } catch (e) {
    return actionError(e);
  }
}
