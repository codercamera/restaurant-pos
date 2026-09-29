import "server-only";
import { db } from "@/lib/db";
import type { Ctx } from "@/lib/session";
import type { Category, OptionGroup, SellableItem } from "@/lib/types";

/** Active categories and the items sold at this branch (branch overrides applied), with option groups. */
export async function loadSellableMenu(ctx: Ctx) {
  const { staff, branch } = ctx;
  const [categories, rows, groups] = await Promise.all([
    db.q<Category>(
      "select id, name, sort_order, is_active from categories where company_id = $1 and is_active order by sort_order, name",
      [staff.company_id]
    ),
    db.q<Omit<SellableItem, "groups">>(
      `select mi.id, mi.category_id, mi.name, mi.description, mi.base_price, mi.image_url, mi.sort_order,
              coalesce(o.price, mi.base_price) as price,
              coalesce(o.is_available, mi.is_available) as is_available
         from menu_items mi
         join categories c on c.id = mi.category_id and c.is_active
         left join menu_item_branch_overrides o on o.menu_item_id = mi.id and o.branch_id = $2
        where mi.company_id = $1
        order by mi.sort_order, mi.name`,
      [staff.company_id, branch.id]
    ),
    loadOptionGroups(staff.company_id),
  ]);

  const byItem = new Map<string, OptionGroup[]>();
  for (const g of groups) byItem.set(g.menu_item_id, [...(byItem.get(g.menu_item_id) ?? []), g]);
  const items: SellableItem[] = rows.map((r) => ({ ...r, groups: byItem.get(r.id) ?? [] }));
  return { categories, items };
}

export function loadOptionGroups(companyId: string) {
  return db.q<OptionGroup>(
    `select g.id, g.menu_item_id, g.name, g.selection_type, g.is_required, g.min_select, g.max_select, g.sort_order,
            coalesce(
              json_agg(json_build_object(
                'id', ch.id, 'option_group_id', ch.option_group_id, 'name', ch.name,
                'price_delta', ch.price_delta, 'is_available', ch.is_available, 'sort_order', ch.sort_order
              ) order by ch.sort_order) filter (where ch.id is not null),
              '[]'
            ) as option_choices
       from option_groups g
       join menu_items mi on mi.id = g.menu_item_id
       left join option_choices ch on ch.option_group_id = g.id
      where mi.company_id = $1
      group by g.id
      order by g.sort_order, g.name`,
    [companyId]
  );
}
