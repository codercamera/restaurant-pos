// Roles and what each may do. Shared by server (enforcement) and client (menus).
// To change what a role can do, edit ROLE_PERMISSIONS below — nothing else needs to change.

export const ROLES = ["admin", "kitchen", "cashier", "waiter"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "order.use", // New order screen: take and edit orders, send to kitchen
  "orders.view", // Orders list, receipts
  "checkout", // Take payments
  "tables.view", // Floor plan: see tables, seat guests, change table status
  "tables.edit", // Floor plan: edit layout (add / move / resize / delete tables)
  "kitchen.view", // Kitchen display: see tickets and move them along
  "menu.manage", // Menu page: dishes, categories, prices, Thai names
  "users.manage", // Users page: create users, change roles, deactivate
  "dashboard.view", // Dashboard: sales summary numbers
  "rewards.manage", // Rewards page: point rules, customers, manual point adjustments
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS, // every function
  kitchen: [], // to be defined
  cashier: [], // to be defined
  waiter: [], // to be defined
};

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** Never granted to anyone but admin, even if listed in ROLE_PERMISSIONS above. */
const ADMIN_ONLY: readonly Permission[] = ["dashboard.view"];

export const permsOf = (role: string): readonly Permission[] => {
  if (!isRole(role)) return [];
  return role === "admin" ? ROLE_PERMISSIONS.admin : ROLE_PERMISSIONS[role].filter((p) => !ADMIN_ONLY.includes(p));
};

export const can = (role: string, perm: Permission | Permission[]): boolean => {
  const have = permsOf(role);
  return (Array.isArray(perm) ? perm : [perm]).some((p) => have.includes(p));
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  kitchen: "Kitchen",
  cashier: "Cashier",
  waiter: "Waiter",
};

/** Screens in the order we look for a landing page after sign-in. */
export const NAV: { href: string; perm: Permission }[] = [
  { href: "/dashboard", perm: "dashboard.view" }, // admin lands here
  { href: "/order", perm: "order.use" },
  { href: "/orders", perm: "orders.view" },
  { href: "/tables", perm: "tables.view" },
  { href: "/kitchen", perm: "kitchen.view" },
  { href: "/menu", perm: "menu.manage" },
  { href: "/rewards", perm: "rewards.manage" },
  { href: "/users", perm: "users.manage" },
];

/** Where a role lands after signing in: its first permitted screen, else the "no access yet" page. */
export const homeFor = (role: string): string => NAV.find((n) => can(role, n.perm))?.href ?? "/no-access";
