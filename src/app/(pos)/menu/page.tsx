import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canManage, getContext } from "@/lib/session";
import { MenuAdmin, type CategoryRaw, type ItemRaw } from "./MenuAdmin";

export default async function MenuPage() {
  const { staff, branch } = await getContext();
  if (!canManage(staff.role)) redirect("/order");

  const [categories, items] = await Promise.all([
    db.q<CategoryRaw>("select id, name, name_th, sort_order, is_active from categories where company_id = ?1 order by sort_order, name", [staff.company_id]),
    db.q<ItemRaw>(
      `select mi.id, mi.category_id, mi.name, mi.name_th, mi.description, mi.description_th, mi.base_price, mi.image_url, mi.is_available, mi.sort_order,
              coalesce((select json_group_array(g.name) from (select name from option_groups where menu_item_id = mi.id order by sort_order) g), '[]') as options
         from menu_items mi where mi.company_id = ?1 order by mi.sort_order, mi.name`,
      [staff.company_id]
    ),
  ]);

  return <MenuAdmin categories={categories} items={items} currency={branch.currency} />;
}
