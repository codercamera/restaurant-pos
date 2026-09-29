-- Roles become: admin, kitchen, cashier, customer.
-- SQLite cannot change a CHECK constraint in place, so the staff table is recreated inside one transaction
-- (defer_foreign_keys lets other tables keep pointing at staff(id) while it is rebuilt).
-- Existing roles map: owner, manager -> admin; waiter -> cashier. Open sessions are cleared (everyone signs in again once).
PRAGMA defer_foreign_keys=on;
create table staff_tmp as select id, company_id, branch_id, full_name, email, password_hash,
  case role when 'owner' then 'admin' when 'manager' then 'admin' when 'waiter' then 'cashier' else role end as role,
  pin_code_hash, is_active, created_at from staff;
drop table staff;
create table staff (
  id text primary key default (lower(hex(randomblob(16)))),
  company_id text not null references companies(id),
  branch_id text references branches(id),
  full_name text not null,
  email text,
  password_hash text,
  role text not null check (role in ('admin','kitchen','cashier','customer')),
  pin_code_hash text,
  is_active integer not null default 1 check (is_active in (0,1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
insert into staff (id, company_id, branch_id, full_name, email, password_hash, role, pin_code_hash, is_active, created_at)
  select id, company_id, branch_id, full_name, email, password_hash, role, pin_code_hash, is_active, created_at from staff_tmp;
drop table staff_tmp;
create unique index if not exists staff_email_idx on staff (lower(email));
create index if not exists staff_company_idx on staff (company_id);
