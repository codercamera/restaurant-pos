export type OrderType = "dine_in" | "takeaway" | "delivery";
export type OrderStatus = "open" | "sent_to_kitchen" | "ready" | "served" | "completed" | "cancelled";
export type ItemStatus = "pending" | "preparing" | "ready" | "served" | "cancelled";
export type PaymentMethod = "cash" | "card" | "qr_promptpay" | "other";
export type TableShape = "round" | "rect";
export type TableStatus = "available" | "occupied" | "reserved" | "cleaning";

export type Branch = {
  id: string;
  name: string;
  currency: string;
  tax_rate: number;
  service_charge_rate: number;
  timezone: string;
};

export type Staff = {
  id: string;
  full_name: string;
  role: string;
  company_id: string;
  branch_id: string | null;
  email?: string | null;
};

export type Category = { id: string; name: string; sort_order: number; is_active: boolean };

export type OptionChoice = {
  id: string;
  option_group_id: string;
  name: string;
  price_delta: number;
  is_available: boolean;
  sort_order: number;
};

export type OptionGroup = {
  id: string;
  menu_item_id: string;
  name: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_select: number;
  max_select: number | null;
  sort_order: number;
  option_choices: OptionChoice[];
};

export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
};

/** Menu item as sold at this branch (override price/availability applied) */
export type SellableItem = MenuItem & { price: number; groups: OptionGroup[]; image_id: string | null; images: string[] };

export type DiningTable = {
  id: string;
  name: string;
  zone: string | null;
  seats: number;
  status: TableStatus;
  pos_x: number | null;
  pos_y: number | null;
  width: number;
  height: number;
  shape: TableShape;
};

export type OrderItemOption = { id: string; choice_name: string; price_delta: number; option_choice_id: string | null };

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  status: ItemStatus;
  notes: string | null;
  created_at: string;
  order_item_options: OrderItemOption[];
};

export type Order = {
  id: string;
  branch_id: string;
  table_id: string | null;
  order_number: string;
  order_type: OrderType;
  status: OrderStatus;
  customer_name: string | null;
  customer_count: number | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  service_charge_total: number;
  tip_total: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
};

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
