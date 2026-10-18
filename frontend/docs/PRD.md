# Moka Cafe POS — Product Requirements

Version 1.0 · frontend complete · backend not started

## 1. Problem

Moka Cafe runs a counter and needs to take orders, take payment, and know what it
sold. Without a system, the café tracks revenue in a notebook, runs out of milk
without noticing, and cannot tell which drinks actually make money.

The cafe sells two structurally different things, and the difference drives most
of the design:

- **Made-to-order drinks** — a latte is not in stock, it is *made*, and it
  consumes milk, beans, ice, and syrup. Availability is derived from ingredients.
- **Packaged and retail goods** — a 250 g bag of beans or a ceramic mug *is* the
  stock. It is counted.

A system that models only one of those produces wrong stock numbers. Both are
modelled, and which one applies is a per-product choice.

## 2. Users and permissions

| Role | Who | Reaches |
|---|---|---|
| **Cashier** (`kasir`) | Counter staff taking orders | Point of Sale only |
| **Admin** | Owner or manager | Everything: Overview, POS, Products, Stock, Reports, Users |

A cashier is refused admin routes twice over — the sidebar never renders the
links, and the dashboard layout blocks rendering and redirects. Today both are
client-side; the server must re-check every route once it exists.

## 3. Scope

Seven screens. Each acceptance criterion below is enforced by an automated check
in `npm run smoke`.

### 3.1 Login

Users sign in with username, password, and a role. Role is a claim about the
account, not a choice: signing in as Cashier with admin credentials is refused.

- Refuses an unknown username or wrong password with "Incorrect username or password."
- Refuses a deactivated account with a specific message, not a generic one.
- Refuses a role mismatch with "This account is not registered for the selected role."
- Admin lands on `/dashboard`; Cashier lands on `/dashboard/pos`.
- Signing out returns to `/login`.
- A reload does not sign the user out.
- A signed-in user never sees the login screen flash on the way in.

*Verified by `smoke:screens` (login) and `smoke:users` (deactivation, sign-in).*

### 3.2 Dashboard (Overview)

Today's trading at a glance, for the owner opening up in the morning.

- Revenue today, average order value, items sold, and low-stock count.
- A 7-day revenue trend.
- Payment mix: count and share of the day by method.
- Recent transactions across all cashiers.
- Low stock across both stock modes, spanning ingredients and counted products.

### 3.3 Transaksi Penjualan (Point of Sale)

The screen used most. Everything on it is a tap target sized for a finger.

- Menu grid, filtered by category, with per-category counts.
- Search by product name.
- Tiles show price, cart quantity, and an out-of-stock banner when genuinely
  unavailable.
- Cart with quantity steppers, line totals, subtotal, PPN, and total.
- Payment by **cash, QRIS, debit, or credit**.
- Cash: quick-tender buttons, and change calculated live.
- Underpayment is refused.
- Completing a sale issues an itemised 80 mm receipt.
- The receipt prints on its own — the POS grid, sidebar, and dialog chrome are
  excluded.

### 3.4 Manajemen Product

The catalogue.

- List of products with image, category, price, stock, recipe cost and margin,
  and listing status.
- Create and edit, including a **recipe editor** for made-to-order items, with a
  live cost / margin / gross-per-cup roll-up.
- Products are either made to order or counted directly; switching shows the
  right fields.
- A duplicate ingredient inside one recipe is rejected.
- Illustration picker with a live preview.
- Category management: add, rename, reorder, delete. Reorder is what the POS
  grid renders, so it is managed explicitly rather than as an editable number.
- Products can be deleted. Order lines denormalise name and price as sold, so
  receipts and historical totals survive; a category split on a deleted product
  falls back to **Uncategorised** rather than dropping its revenue.
- Hiding a product from the POS is separate from deleting it and is reversible.
- Filters: category chip, stock mode, listing status. All reflected in the URL.

### 3.5 Management Stock

Why the numbers are what they are.

- Ingredient levels with reorder points and cost cover.
- Counted packaged stock with its own levels.
- **Movement ledger** — every change ever made, with type, signed quantity, who,
  and when. This is what answers "why is this number wrong".
- Adjust stock by purchase, waste, or correction. Sign follows the reason;
  a correction keeps whichever direction is typed. The resulting level is shown
  before saving, with a warning when it lands under the reorder point.
- Withdrawing more than is on hand is refused.
- Tabs and filters live in the URL.

### 3.6 Laporan

Sales analysis for a chosen period.

- Date range with today / 7 day / 30 day / 12 month presets, or a range picked by
  hand. An inverted hand-typed range is swapped, not reported as empty.
- The trend chart covers **every period in the range**, including those with no
  sales. A chart that skipped them would show a fortnight of trading for a
  30-day report and read as though the rest of the month never happened.
- Granularity follows the range: one bar per day up to 31 days, one bar per month
  beyond it. The month is the unit the cafe actually reviews in, which is what
  makes the monthly report a monthly report rather than 365 daily ones.
- Every headline figure carries a percentage against the equivalent period
  immediately before it. A total on its own cannot be read.
- Revenue per day or per month, payment mix, revenue by category, top products,
  and takings per cashier.
- CSV export, quoted and BOM-prefixed so spreadsheets read it correctly.
- An empty period reports zero and says so, rather than rendering broken UI.

### 3.7 Manajemen Pengguna

- List accounts with name, username, role, and activation status.
- Create and edit. Password required on create, optional on edit.
- Activate and deactivate. **Never delete** — sales reference the cashier.
- The last active admin cannot be deactivated, or nobody could reach user
  management again.
- A deactivated account is refused at the login screen while its past orders
  still resolve their name.
- Usernames are unique case-insensitively.

## 4. Business rules

These are the rules a backend must honour. They are not implementation detail.

| Rule | Detail |
|---|---|
| **Tax** | PPN 10% of subtotal, rounded to whole rupiah. Cash has no sub-unit. |
| **Stock modes** | `recipe` consumes ingredients; `direct` consumes the item. Never both. |
| **`minStock`** | A reorder *alert*, **not a sales block**. Items stay sellable to zero. |
| **`costPerUnit`** | Rupiah for one unit (one gram, one millilitre). Recipes multiply by quantity. |
| **Sale atomicity** | Recording the sale, decrementing stock, and writing the ledger is one operation. A shortfall must leave no receipt. |
| **Users are never deleted** | Sales reference the cashier, so an account is deactivated instead. |
| **Denormalised lines** | An order line stores name, price, and stock mode as sold. A two-year-old receipt shows what was charged. |
| **Receipt numbers** | Sequential and human-readable, e.g. `MOKA-1042`. |
| **Ingredient is deleted by renaming** | No ingredient is ever deleted; a rename keeps recipe rows valid. |

## 5. Out of scope for v1

Named so nobody discovers them as a surprise in testing.

- Shift open/close **gating** the POS. `Shift` records exist and `ShiftRepository`
  is implemented, but nothing requires an open shift to sell.
- Cash reconciliation — closing a shift stores a counted float; nothing compares
  it against the cash sales inside the shift.
- Discounts, promotions, and vouchers.
- Split bills, tabs, and table service.
- Product photo upload (products pick from the 20 bundled illustrations).
- Kitchen display or order queue.
- Real authentication, multi-device sync, and any server of any kind.

## 6. Success criteria

The frontend is done when:

- Every screen in §3 is working, not compiling — a placeholder that renders is
  not a screen.
- A cashier cannot see an admin screen, and an admin can see all of them.
- A completed sale moves stock and is visible in the ledger, the dashboard, and
  the reports.
- `typecheck`, `lint`, and `build` are clean.
- The browser suites pass with no console errors.

All six hold today. `npm run smoke` — 154 checks across 7 suites.

## 7. Decisions needed before the backend

1. **Session strategy** — httpOnly cookie (survives XSS, recommended) versus a
   token held in memory (needs an interceptor on every request).
2. **Does shift gating ship in v1?** It changes the POS's opening behaviour, so
   retrofitting touches a screen that is already busy.
3. **Do roles stay fixed at two?** The code assumes `admin | kasir` throughout.
   A third role means widening `Role` and re-checking `lib/nav.ts`.
4. **Where do product images live?** Decides whether Express serves files or
   presigned URLs do.

See [`API-CONTRACT.md`](./API-CONTRACT.md) for the interface the backend
implements.