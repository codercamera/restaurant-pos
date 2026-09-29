-- Restaurant POS schema (plain PostgreSQL). Idempotent: safe to run on every start.

create extension if not exists pgcrypto;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  address text,
  phone text,
  timezone text not null default 'Asia/Bangkok',
  currency text not null default 'THB',
  tax_rate numeric not null default 7 check (tax_rate >= 0),
  service_charge_rate numeric not null default 0 check (service_charge_rate >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  branch_id uuid references branches(id),
  full_name text not null,
  email text unique,
  password_hash text,
  role text not null check (role in ('owner','admin','manager','cashier','kitchen','waiter')),
  pin_code_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  staff_id uuid not null references staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_staff_idx on sessions (staff_id);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  category_id uuid not null references categories(id),
  name text not null,
  description text,
  base_price numeric not null check (base_price >= 0),
  image_url text,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_item_branch_overrides (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id),
  branch_id uuid not null references branches(id),
  price numeric check (price >= 0),
  is_available boolean
);

create table if not exists option_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id),
  name text not null,
  selection_type text not null check (selection_type in ('single','multiple')),
  is_required boolean not null default false,
  min_select integer not null default 0,
  max_select integer,
  sort_order integer not null default 0
);

create table if not exists option_choices (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references option_groups(id),
  name text not null,
  price_delta numeric not null default 0,
  is_available boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists dining_tables (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  zone text,
  seats integer not null default 4,
  status text not null default 'available' check (status in ('available','occupied','reserved','cleaning')),
  pos_x numeric,
  pos_y numeric,
  width numeric not null default 120,
  height numeric not null default 96,
  shape text not null default 'rect' check (shape in ('round','rect')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists order_number_seq;
create sequence if not exists receipt_number_seq;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  table_id uuid references dining_tables(id),
  order_number text not null default lpad(nextval('order_number_seq')::text, 4, '0'),
  order_type text not null check (order_type in ('dine_in','takeaway','delivery')),
  status text not null default 'open' check (status in ('open','sent_to_kitchen','ready','served','completed','cancelled')),
  opened_by_staff_id uuid references staff(id),
  customer_name text,
  customer_count integer,
  subtotal numeric not null default 0,
  discount_total numeric not null default 0,
  tax_total numeric not null default 0,
  service_charge_total numeric not null default 0,
  tip_total numeric not null default 0,
  grand_total numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  menu_item_id uuid not null references menu_items(id),
  item_name text not null,
  unit_price numeric not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'pending' check (status in ('pending','preparing','ready','served','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id),
  option_choice_id uuid references option_choices(id),
  choice_name text not null,
  price_delta numeric not null default 0
);

create table if not exists discounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  type text not null check (type in ('percentage','fixed')),
  value numeric not null check (value >= 0),
  is_active boolean not null default true
);

create table if not exists order_discounts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  discount_id uuid references discounts(id),
  label text not null,
  amount numeric not null check (amount >= 0),
  applied_by_staff_id uuid references staff(id),
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  method text not null check (method in ('cash','card','qr_promptpay','other')),
  amount numeric not null check (amount >= 0),
  received_amount numeric,
  change_amount numeric,
  status text not null default 'completed' check (status in ('pending','completed','refunded')),
  staff_id uuid references staff(id),
  paid_at timestamptz not null default now()
);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  receipt_number text not null unique default ('R' || lpad(nextval('receipt_number_seq')::text, 6, '0')),
  snapshot jsonb not null,
  printed_at timestamptz not null default now(),
  reprint_count integer not null default 0
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  unit text not null,
  quantity_on_hand numeric not null default 0,
  reorder_threshold numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id),
  inventory_item_id uuid not null references inventory_items(id),
  quantity_used numeric not null check (quantity_used > 0)
);

create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id),
  order_item_id uuid references order_items(id),
  change_qty numeric not null,
  reason text not null check (reason in ('sale','restock','adjustment','waste')),
  staff_id uuid references staff(id),
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid references staff(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- updated_at triggers
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at before update on orders for each row execute function set_updated_at();
drop trigger if exists menu_items_set_updated_at on menu_items;
create trigger menu_items_set_updated_at before update on menu_items for each row execute function set_updated_at();

-- Indexes
create index if not exists branches_company_idx on branches (company_id);
create index if not exists staff_company_idx on staff (company_id);
create index if not exists categories_company_idx on categories (company_id);
create index if not exists menu_items_company_idx on menu_items (company_id, category_id);
create index if not exists overrides_item_branch_idx on menu_item_branch_overrides (menu_item_id, branch_id);
create index if not exists option_groups_item_idx on option_groups (menu_item_id);
create index if not exists option_choices_group_idx on option_choices (option_group_id);
create index if not exists dining_tables_branch_idx on dining_tables (branch_id);
create index if not exists orders_branch_status_idx on orders (branch_id, status);
create index if not exists orders_table_idx on orders (table_id);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_status_idx on order_items (status);
create index if not exists order_item_options_item_idx on order_item_options (order_item_id);
create index if not exists payments_order_idx on payments (order_id);
create index if not exists receipts_order_idx on receipts (order_id);

-- Sample menu + floor plan for a new restaurant
create or replace function seed_sample(p_company uuid, p_branch uuid) returns void
language plpgsql as $$
declare
  v_item uuid;
  v_group uuid;
begin
  with cats as (
    insert into categories (company_id, name, sort_order)
    select p_company, n, o from (values ('Burgers',1),('Pizza',2),('Bowls',3),('Sides',4),('Drinks',5),('Desserts',6)) v(n,o)
    returning id, name
  )
  insert into menu_items (company_id, category_id, name, description, base_price, sort_order)
  select p_company, cats.id, i.name, i.descr, i.price, i.o
  from cats join (values
    ('Burgers','Smash Burger','Double patty, cheddar, pickles, house sauce',259,1),
    ('Burgers','Crispy Chicken','Buttermilk thigh, slaw, hot honey',239,2),
    ('Burgers','Mushroom Melt','Portobello, gruyère, onion jam',229,3),
    ('Pizza','Margherita','Tomato, fior di latte, basil',289,1),
    ('Pizza','Pepperoni','Cup pepperoni, oregano, chili oil',329,2),
    ('Pizza','Four Cheese','Mozzarella, gorgonzola, fontina, parmesan',349,3),
    ('Bowls','Teriyaki Salmon','Rice, edamame, pickled ginger',319,1),
    ('Bowls','Falafel Bowl','Hummus, tabbouleh, tahini',249,2),
    ('Sides','Fries','Sea salt, aioli',89,1),
    ('Sides','Onion Rings','Beer batter, chipotle mayo',109,2),
    ('Sides','Caesar Salad','Romaine, croutons, parmesan',149,3),
    ('Drinks','Lemonade','Fresh-squeezed, mint',75,1),
    ('Drinks','Thai Iced Tea','Black tea, condensed milk',65,2),
    ('Drinks','Cola','330 ml can',45,3),
    ('Desserts','Chocolate Brownie','Warm, vanilla ice cream',129,1),
    ('Desserts','Sundae','Soft-serve, caramel, peanuts',99,2)
  ) i(cat, name, descr, price, o) on i.cat = cats.name;

  for v_item in select id from menu_items where company_id = p_company and name = 'Smash Burger' loop
    insert into option_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
      values (v_item, 'Add-ons', 'multiple', false, 0, 3, 1) returning id into v_group;
    insert into option_choices (option_group_id, name, price_delta, sort_order) values
      (v_group, 'Extra cheese', 30, 1), (v_group, 'Bacon', 45, 2), (v_group, 'Fried egg', 25, 3);
    insert into option_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
      values (v_item, 'Doneness', 'single', true, 1, 1, 2) returning id into v_group;
    insert into option_choices (option_group_id, name, price_delta, sort_order) values
      (v_group, 'Medium', 0, 1), (v_group, 'Medium well', 0, 2), (v_group, 'Well done', 0, 3);
  end loop;
  for v_item in select mi.id from menu_items mi join categories c on c.id = mi.category_id
                where mi.company_id = p_company and c.name = 'Pizza' loop
    insert into option_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
      values (v_item, 'Size', 'single', true, 1, 1, 1) returning id into v_group;
    insert into option_choices (option_group_id, name, price_delta, sort_order) values
      (v_group, 'Regular 10"', 0, 1), (v_group, 'Large 14"', 120, 2);
  end loop;
  for v_item in select id from menu_items where company_id = p_company and name = 'Thai Iced Tea' loop
    insert into option_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
      values (v_item, 'Sweetness', 'single', true, 1, 1, 1) returning id into v_group;
    insert into option_choices (option_group_id, name, price_delta, sort_order) values
      (v_group, '100%', 0, 1), (v_group, '50%', 0, 2), (v_group, '25%', 0, 3), (v_group, 'No sugar', 0, 4);
  end loop;

  insert into dining_tables (branch_id, name, zone, seats, shape, pos_x, pos_y, width, height) values
    (p_branch,'1','Main hall',2,'round',40,40,104,104),
    (p_branch,'2','Main hall',2,'round',176,40,104,104),
    (p_branch,'3','Main hall',4,'rect',320,40,176,104),
    (p_branch,'4','Main hall',4,'rect',536,40,176,104),
    (p_branch,'5','Main hall',6,'rect',40,200,224,112),
    (p_branch,'6','Main hall',3,'round',312,200,112,112),
    (p_branch,'7','Main hall',6,'rect',464,200,248,112),
    (p_branch,'8','Main hall',2,'round',40,376,104,104),
    (p_branch,'9','Main hall',2,'round',176,376,104,104),
    (p_branch,'10','Main hall',4,'rect',320,376,176,104),
    (p_branch,'11','Main hall',4,'rect',536,376,176,104),
    (p_branch,'12','Main hall',8,'rect',40,544,384,104),
    (p_branch,'P1','Patio',4,'round',40,40,120,120),
    (p_branch,'P2','Patio',4,'round',200,40,120,120);
end $$;
