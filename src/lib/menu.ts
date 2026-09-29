import "server-only";
import { db } from "@/lib/db";
import type { Ctx } from "@/lib/session";
import { loc, type Lang } from "@/lib/i18n";
import type { Category, OptionGroup, SellableItem } from "@/lib/types";

/** Active categories and the items sold at this branch (branch overrides applied), with option groups. */
export async function loadSellableMenu(ctx: Ctx, lang: Lang = "en") {
  const { staff, branch } = ctx;
  const [categories, rows, groups] = await Promise.all([
    db.q<Category>(
      `select id, ${loc("name", lang)} as name, sort_order, is_active from categories where company_id = ?1 and is_active = 1 order by sort_order, name`,
      [staff.company_id]
    ),
    db.q<Omit<SellableItem, "groups">>(
      `select mi.id, mi.category_id, ${loc("mi.name", lang)} as name, ${loc("mi.description", lang)} as description, mi.base_price, mi.image_url, mi.sort_order,
              coalesce(o.price, mi.base_price) as price,
              coalesce(o.is_available, mi.is_available) as is_available
         from menu_items mi
         join categories c on c.id = mi.category_id and c.is_active = 1
         left join menu_item_branch_overrides o on o.menu_item_id = mi.id and o.branch_id = ?2
        where mi.company_id = ?1
        order by mi.sort_order, mi.name`,
      [staff.company_id, branch.id]
    ),
    loadOptionGroups(staff.company_id, lang),
  ]);

  const byItem = new Map<string, OptionGroup[]>();
  for (const g of groups) byItem.set(g.menu_item_id, [...(byItem.get(g.menu_item_id) ?? []), g]);
  const items: SellableItem[] = rows.map((r) => ({ ...r, groups: byItem.get(r.id) ?? [] }));
  return { categories, items };
}

export function loadOptionGroups(companyId: string, lang: Lang = "en") {
  return db.q<OptionGroup>(
    `select g.id, g.menu_item_id, ${loc("g.name", lang)} as name, g.selection_type, g.is_required, g.min_select, g.max_select, g.sort_order,
            coalesce((
              select json_group_array(json_object(
                       'id', ch.id, 'option_group_id', ch.option_group_id, 'name', ${loc("ch.name", lang)},
                       'price_delta', ch.price_delta, 'is_available', json(iif(ch.is_available = 1, 'true', 'false')),
                       'sort_order', ch.sort_order))
                from (select * from option_choices where option_group_id = g.id order by sort_order) ch
            ), '[]') as option_choices
       from option_groups g
       join menu_items mi on mi.id = g.menu_item_id
      where mi.company_id = ?1
      order by g.sort_order, g.name`,
    [companyId]
  );
}
