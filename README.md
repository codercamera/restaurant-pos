# Restaurant POS — v1

Next.js 16 (App Router) on Cloudflare Workers (OpenNext adapter) with a Cloudflare D1 (SQLite) database.

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

- **Database**: D1 through the `DB` binding (`src/lib/db.ts`). `db/schema.sql` is idempotent. Writes that must succeed together use `db.batch()` — a D1 batch is one transaction.
- **Auth**: email + password (PBKDF2 via Web Crypto), sessions in the `sessions` table (SHA-256 of a random token), httpOnly cookie `pos_session`, 30 days. There is no middleware; every server page/action calls `getContext()`, which redirects to `/login`.
- **Access control**: every query is scoped to the signed-in staff member's `company_id` / `branch_id`. Menu and floor-plan edits need owner/admin/manager.
- **Prices** are resolved on the server (branch overrides applied); the client never sets prices.
- **Totals**: subtotal − discount → + service charge (branch %) → + tax (branch %) → + tip.
- **Branch settings** on `branches`: `currency` (THB), `tax_rate` (7), `service_charge_rate` (0), `timezone` (Asia/Bangkok).
- Tables and dishes with order history are hidden rather than deleted.
- `updated_at` columns are set by the app (D1's REST endpoint can't apply triggers).

## Deploy (Cloudflare Workers Builds)

1. Workers & Pages → Create → Import a repository → pick this repo. The Worker name must be `restaurant-pos` (matches `wrangler.jsonc`).
2. Build command: `npm run build` (runs `opennextjs-cloudflare build`) · Deploy command: `npx wrangler deploy` (Cloudflare's defaults work).
3. The D1 database (`restaurant-pos`) is already bound in `wrangler.jsonc`. To (re)create the tables: `npm run db:apply`.

Or from your machine: `npm install && npm run deploy`.

## Local development

```sh
npm install
npm run db:apply:local
npm run dev
```

## Not in v1 yet

Staff invites / PIN login, option-group editor on the Menu page, discounts UI, reports, inventory deduction, multi-branch switching.
