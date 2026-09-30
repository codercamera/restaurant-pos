-- Reward points keyed by Thai mobile number.
create table if not exists loyalty_settings (
  company_id text primary key references companies(id),
  enabled integer not null default 1 check (enabled in (0,1)),
  baht_per_point real not null default 10 check (baht_per_point > 0),   -- spend this much (before tax/service) to earn 1 point
  point_value real not null default 0.1 check (point_value > 0),        -- baht discount per point redeemed (0.1 = 100 points -> 10 baht)
  min_redeem integer not null default 50 check (min_redeem >= 0),       -- smallest redemption allowed
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create table if not exists customers (
  id text primary key default (lower(hex(randomblob(16)))),
  company_id text not null references companies(id),
  phone text not null check (phone glob '0[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  name text,
  points integer not null default 0 check (points >= 0),
  total_spent real not null default 0,
  visits integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (company_id, phone)
);
create table if not exists point_ledger (
  id text primary key default (lower(hex(randomblob(16)))),
  customer_id text not null references customers(id),
  order_id text references orders(id),
  kind text not null check (kind in ('earn','redeem','adjust')),
  points integer not null,
  note text,
  staff_id text references staff(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists point_ledger_customer_idx on point_ledger (customer_id, created_at);
alter table orders add column customer_id text references customers(id);
alter table orders add column points_redeemed integer not null default 0;
alter table orders add column points_earned integer not null default 0;
