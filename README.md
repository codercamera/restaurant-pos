# Restaurant POS — v1

Next.js 16 (App Router) + PostgreSQL. Runs anywhere that has Node 22+ and a Postgres database.

## Screens

| Route | What it does |
| --- | --- |
| `/login` | Sign in, or **Create restaurant** (company, first branch, owner account, optional sample menu + floor plan) |
| `/order` | Order taking — categories, search, option picker, table/guests, send to kitchen, charge |
| `/orders` | Open orders and the last 24 h of closed orders with takings |
| `/checkout/[orderId]` | Cash (keypad, change), card, PromptPay; tips; split into N shares; receipt on completion |
| `/tables` | Floor plan by area; **Edit layout** to add/delete/move/resize tables, set seats, shape and area |
| `/kitchen` | Kitchen display — New → Cooking → Ready → Served; refreshes every 4 s; late tickets turn red |
| `/menu` | Categories and dishes: add, edit, price, sold-out toggle, hide/delete |
| `/receipt/[orderId]` | Printable 80 mm receipt from the stored snapshot |

## How it works

- **Database**: plain Postgres via `pg`. `db/schema.sql` is idempotent and is applied by `scripts/migrate.mjs` on every start (guarded by an advisory lock).
- **Auth**: email + password (bcrypt), sessions in the `sessions` table (SHA-256 of a random token), httpOnly cookie `pos_session`, 30 days.
- **Access control**: every query is scoped to the signed-in staff member's `company_id` / `branch_id`. Menu and floor-plan edits need owner/admin/manager.
- **Prices** are resolved on the server (branch overrides applied); the client never sets prices.
- **Totals**: subtotal − discount → + service charge (branch %) → + tax (branch %) → + tip.
- **Branch settings** on `branches`: `currency` (THB), `tax_rate` (7), `service_charge_rate` (0), `timezone` (Asia/Bangkok).
- Tables and dishes with order history are hidden rather than deleted.

## Environment

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string, e.g. `postgres://user:pass@host:5432/pos` |
| `DATABASE_SSL` | Set to `true` for databases that require TLS |

## Deploying

```sh
npm ci && npm run build
DATABASE_URL=... npm start   # applies db/schema.sql, then starts Next.js on $PORT
```

The start script runs the migration first, so a fresh database sets itself up on first boot.

## Local development

```sh
npm install
DATABASE_URL=postgres://localhost/pos npm run migrate
DATABASE_URL=postgres://localhost/pos npm run dev
```

## Not in v1 yet

Staff invites / PIN login, option-group editor on the Menu page, discounts UI, reports, inventory deduction, multi-branch switching.
