import "server-only";
import { newId, stmt, type Stmt } from "@/lib/db";

// Sample menu + floor plan for a new restaurant. All values are constants defined here,
// so they are safe to inline as SQL literals (D1 allows only 100 bound parameters per query).
const lit = (s: string | number | null) => (s === null ? "null" : typeof s === "number" ? String(s) : `'${s.replace(/'/g, "''")}'`);

const CATEGORIES = ["Burgers", "Pizza", "Bowls", "Sides", "Drinks", "Desserts"];

const ITEMS: [cat: string, name: string, description: string, price: number][] = [
  ["Burgers", "Smash Burger", "Double patty, cheddar, pickles, house sauce", 259],
  ["Burgers", "Crispy Chicken", "Buttermilk thigh, slaw, hot honey", 239],
  ["Burgers", "Mushroom Melt", "Portobello, gruyère, onion jam", 229],
  ["Pizza", "Margherita", "Tomato, fior di latte, basil", 289],
  ["Pizza", "Pepperoni", "Cup pepperoni, oregano, chili oil", 329],
  ["Pizza", "Four Cheese", "Mozzarella, gorgonzola, fontina, parmesan", 349],
  ["Bowls", "Teriyaki Salmon", "Rice, edamame, pickled ginger", 319],
  ["Bowls", "Falafel Bowl", "Hummus, tabbouleh, tahini", 249],
  ["Sides", "Fries", "Sea salt, aioli", 89],
  ["Sides", "Onion Rings", "Beer batter, chipotle mayo", 109],
  ["Sides", "Caesar Salad", "Romaine, croutons, parmesan", 149],
  ["Drinks", "Lemonade", "Fresh-squeezed, mint", 75],
  ["Drinks", "Thai Iced Tea", "Black tea, condensed milk", 65],
  ["Drinks", "Cola", "330 ml can", 45],
  ["Desserts", "Chocolate Brownie", "Warm, vanilla ice cream", 129],
  ["Desserts", "Sundae", "Soft-serve, caramel, peanuts", 99],
];

type Group = { name: string; type: "single" | "multiple"; required: boolean; min: number; max: number | null; choices: [string, number][] };
const GROUPS: { match: (item: (typeof ITEMS)[number]) => boolean; groups: Group[] }[] = [
  {
    match: (i) => i[1] === "Smash Burger",
    groups: [
      { name: "Add-ons", type: "multiple", required: false, min: 0, max: 3, choices: [["Extra cheese", 30], ["Bacon", 45], ["Fried egg", 25]] },
      { name: "Doneness", type: "single", required: true, min: 1, max: 1, choices: [["Medium", 0], ["Medium well", 0], ["Well done", 0]] },
    ],
  },
  {
    match: (i) => i[0] === "Pizza",
    groups: [{ name: "Size", type: "single", required: true, min: 1, max: 1, choices: [['Regular 10"', 0], ['Large 14"', 120]] }],
  },
  {
    match: (i) => i[1] === "Thai Iced Tea",
    groups: [{ name: "Sweetness", type: "single", required: true, min: 1, max: 1, choices: [["100%", 0], ["50%", 0], ["25%", 0], ["No sugar", 0]] }],
  },
];

const TABLES: [name: string, zone: string, seats: number, shape: "round" | "rect", x: number, y: number, w: number, h: number][] = [
  ["1", "Main hall", 2, "round", 40, 40, 104, 104],
  ["2", "Main hall", 2, "round", 176, 40, 104, 104],
  ["3", "Main hall", 4, "rect", 320, 40, 176, 104],
  ["4", "Main hall", 4, "rect", 536, 40, 176, 104],
  ["5", "Main hall", 6, "rect", 40, 200, 224, 112],
  ["6", "Main hall", 3, "round", 312, 200, 112, 112],
  ["7", "Main hall", 6, "rect", 464, 200, 248, 112],
  ["8", "Main hall", 2, "round", 40, 376, 104, 104],
  ["9", "Main hall", 2, "round", 176, 376, 104, 104],
  ["10", "Main hall", 4, "rect", 320, 376, 176, 104],
  ["11", "Main hall", 4, "rect", 536, 376, 176, 104],
  ["12", "Main hall", 8, "rect", 40, 544, 384, 104],
  ["P1", "Patio", 4, "round", 40, 40, 120, 120],
  ["P2", "Patio", 4, "round", 200, 40, 120, 120],
];

/** Statements that create the sample menu, options and tables. Run them in the same batch as the company/branch. */
export function seedStatements(companyId: string, branchId: string): Stmt[] {
  const catId = new Map(CATEGORIES.map((c) => [c, newId()]));
  const catRows = CATEGORIES.map((c, i) => `(${lit(catId.get(c)!)}, ${lit(companyId)}, ${lit(c)}, ${i + 1})`);

  const itemRows: string[] = [];
  const groupRows: string[] = [];
  const choiceRows: string[] = [];
  const perCat = new Map<string, number>();
  for (const item of ITEMS) {
    const [cat, name, description, price] = item;
    const order = (perCat.get(cat) ?? 0) + 1;
    perCat.set(cat, order);
    const itemId = newId();
    itemRows.push(`(${lit(itemId)}, ${lit(companyId)}, ${lit(catId.get(cat)!)}, ${lit(name)}, ${lit(description)}, ${price}, ${order})`);
    for (const spec of GROUPS.filter((g) => g.match(item))) {
      spec.groups.forEach((g, gi) => {
        const groupId = newId();
        groupRows.push(`(${lit(groupId)}, ${lit(itemId)}, ${lit(g.name)}, ${lit(g.type)}, ${g.required ? 1 : 0}, ${g.min}, ${g.max === null ? "null" : g.max}, ${gi + 1})`);
        g.choices.forEach(([cname, delta], ci) => {
          choiceRows.push(`(${lit(newId())}, ${lit(groupId)}, ${lit(cname)}, ${delta}, ${ci + 1})`);
        });
      });
    }
  }

  const tableRows = TABLES.map(
    ([name, zone, seats, shape, x, y, w, h]) =>
      `(${lit(newId())}, ${lit(branchId)}, ${lit(name)}, ${lit(zone)}, ${seats}, ${lit(shape)}, ${x}, ${y}, ${w}, ${h})`
  );

  return [
    stmt(`insert into categories (id, company_id, name, sort_order) values ${catRows.join(", ")}`),
    stmt(`insert into menu_items (id, company_id, category_id, name, description, base_price, sort_order) values ${itemRows.join(", ")}`),
    stmt(`insert into option_groups (id, menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order) values ${groupRows.join(", ")}`),
    stmt(`insert into option_choices (id, option_group_id, name, price_delta, sort_order) values ${choiceRows.join(", ")}`),
    stmt(`insert into dining_tables (id, branch_id, name, zone, seats, shape, pos_x, pos_y, width, height) values ${tableRows.join(", ")}`),
  ];
}
