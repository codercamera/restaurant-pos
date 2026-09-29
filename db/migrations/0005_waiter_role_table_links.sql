-- 1) Role "customer" becomes "waiter" (staff table rebuilt in one transaction, as in 0003).
PRAGMA defer_foreign_keys=on;
create table staff_tmp as select id, company_id, branch_id, full_name, email, password_hash,
  case role when 'customer' then 'waiter' else role end as role,
  pin_code_hash, is_active, created_at from staff;
drop table staff;
create table staff (
  id text primary key default (lower(hex(randomblob(16)))),
  company_id text not null references companies(id),
  branch_id text references branches(id),
  full_name text not null,
  email text,
  password_hash text,
  role text not null check (role in ('admin','kitchen','cashier','waiter')),
  pin_code_hash text,
  is_active integer not null default 1 check (is_active in (0,1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
insert into staff (id, company_id, branch_id, full_name, email, password_hash, role, pin_code_hash, is_active, created_at)
  select id, company_id, branch_id, full_name, email, password_hash, role, pin_code_hash, is_active, created_at from staff_tmp;
drop table staff_tmp;
create unique index if not exists staff_email_idx on staff (lower(email));
create index if not exists staff_company_idx on staff (company_id);

-- 2) Permanent, unguessable ordering link per table (/t/<qr_token>), switchable and re-issuable by an admin.
alter table dining_tables add column qr_token text;
alter table dining_tables add column self_order integer not null default 1 check (self_order in (0,1));
update dining_tables set qr_token = lower(hex(randomblob(16))) where qr_token is null;
create unique index if not exists dining_tables_qr_token_idx on dining_tables (qr_token) where qr_token is not null;

-- 3) Where an order came from.
alter table orders add column source text not null default 'staff' check (source in ('staff','table_qr'));
