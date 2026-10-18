# API Contract — what the frontend expects

The frontend codes against seven repository interfaces in
`src/lib/repositories/types.ts`. This document is those interfaces expressed as
HTTP, plus the rules the server must enforce so behaviour does not change when
the swap happens.

**Nothing here is implemented yet.** The app runs entirely against a mock. When
the API lands, the change is confined to `src/lib/repositories/index.ts`.

## 1. Conventions

- Base path `/api`. JSON in, JSON out. `snake_case` is avoided — the TypeScript
  shapes are `camelCase` and should be transmitted unchanged.
- All money is an integer number of rupiah. No floats, ever. `12000`, not
  `12_000.00`.
- All timestamps are ISO 8601 UTC strings (`2026-10-17T23:00:00.000Z`).
- All IDs are opaque strings. The mock uses prefixes (`u-1`, `p-iced-latte`,
  `mv-42`) for legibility while debugging; treat them as opaque.
- All list endpoints return arrays, newest-first where a natural order exists.

### Error envelope

Every non-2xx response:

```json
{ "error": "machine-readable-code", "message": "Human sentence for the UI" }
```

`error` is stable and switchable. `message` is shown to the user, so it must read
as a sentence with a next step where one exists — not "Invalid input".

| `error` | Status | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No or expired session |
| `forbidden` | 403 | Authenticated but wrong role, or wrong resource owner |
| `not-found` | 404 | Unknown id |
| `validation` | 422 | Body failed a rule. Include `fields` for per-field errors. |
| `conflict` | 409 | Business rule refused it (see below) |
| `insufficient-stock` | 409 | The sale cannot be covered by current stock |

`409` carries a `reason` so the client can say something specific:

```json
{ "error": "conflict", "reason": "last-active-admin", "message": "This is the last active admin. Promote another account first." }
```

Reasons in use: `last-active-admin` · `category-in-use` · `already-open-shift` ·
`already-closed-shift` · `username-taken`.

### Security rules the server owns

These are the ones a client must never be trusted on:

1. **`actor` and `cashier` come from the session, not the body.** The frontend
   types carry `actor: { id, name }` and `cashier: { id, name }` so the mock needs
   no session. The API must ignore them and read the session user.
2. **Totals are computed server-side.** `subtotal`, `taxAmount`, `total`, and
   `changeAmount` are never accepted from the client.
3. **Role is re-checked on every route.** Hiding a nav link is not authorisation.
4. **Passwords are hashed** (bcrypt or argon2) and never returned. The response
   shape is `User`, which has no password field.
5. **Price on an order line is historical.** Store what was charged; a later
   price change must not rewrite old receipts.

## 2. Authentication

Recommended: **httpOnly cookie session**. It survives XSS better than a token in
`localStorage`, and requires no interceptor on every request. If a bearer token
is chosen instead, every screen that calls a repository needs the header attached —
the seam does not provide that for free.

### `POST /api/auth/login`

```jsonc
// request
{ "username": "admin", "password": "admin123", "role": "admin" }  // role optional
```

```jsonc
// 200 — sets the session cookie
{ "user": { "id": "u-1", "name": "Budi Santoso", "username": "admin", "role": "admin", "isActive": true } }
```

| Failure | Status | `reason` |
|---|---|---|
| Unknown username or wrong password | 401 | `invalid` |
| Account deactivated | 401 | `inactive` |
| `role` supplied and it contradicts the account | 403 | `role-mismatch` |

These three map exactly onto `LoginFailureReason` in `src/types/auth.ts`, and the
login screen already shows a distinct message for each. Keep them distinct.

Use the same message and status for `invalid` regardless of which half was
wrong, so usernames cannot be enumerated.

### `POST /api/auth/logout` → `204`, clears the cookie.

### `GET /api/auth/me` → `200 { user }` or `401`.

Replaces reading the persisted session from `localStorage`. Called once on app
load; every guard waits on it — the same reason the mock has a `hydrated` flag.

## 3. Categories

`CategoryRepository`

| Method | Endpoint |
|---|---|
| `list()` | `GET /api/categories` |
| `create(input)` | `POST /api/categories` → `201` |
| `update(id, input)` | `PUT /api/categories/:id` |
| `remove(id)` | `DELETE /api/categories/:id` → `204` |
| `reorder(orderedIds)` | `PUT /api/categories/order` |

```jsonc
CategoryInput  { name: string, sortOrder?: number }
Category       { id, name, sortOrder }
```

`reorder` body: `{ "ids": ["c-coffee", "c-snack", ...] }` — order is the display
order the POS grid and every filter use.

`remove` must refuse with `409 category-in-use` while any product still
references the category. The UI disables the button, but the server enforces it.

## 4. Ingredients

`IngredientRepository`

| Method | Endpoint |
|---|---|
| `list()` | `GET /api/ingredients` |
| `getById(id)` | `GET /api/ingredients/:id` |
| `create(input)` | `POST /api/ingredients` → `201` |
| `update(id, input)` | `POST /api/ingredients/:id` → `PUT` |

```jsonc
IngredientInput { name, unit: "gram" | "ml" | "pcs", minStock: number, costPerUnit: number }
Ingredient      { id, name, unit, stock, minStock, costPerUnit }
```

**There is no delete.** An ingredient is removed from the menu by renaming it or
dropping it from recipes. Deleting one would orphan recipe rows. A new ingredient
starts at `stock: 0`; the first stock arrives as a `purchase` movement, so every
unit has a ledger entry.

`costPerUnit` is rupiah for **one** unit. This is the single easiest field to get
wrong: a 250 g bag at Rp 95,000 is `380` per gram, not `0.095`. The previous
mock had this wrong and every margin read as 100%.

## 5. Products

`ProductRepository`

| Method | Endpoint |
|---|---|
| `list(query)` | `GET /api/products?includeInactive&categoryId&search` |
| `getById(id)` | `GET /api/products/:id` |
| `create(input)` | `POST /api/products` → `201` |
| `update(id, input)` | `PUT /api/products/:id` |
| `setActive(id, isActive)` | `PATCH /api/products/:id/active` |
| `remove(id)` | `DELETE /api/products/:id` — `204` |

```jsonc
ProductInput {
  name: string
  categoryId: string
  price: number            // rupiah
  image: string            // public path, e.g. "/menu/coffee/iced_americano.svg"
  stockMode: "recipe" | "direct"
  stock?: number           // required when direct
  minStock?: number        // required when direct
  recipe: RecipeItem[]     // required and non-empty when recipe
  isActive: boolean
}
```

Query defaults: `includeInactive` false — only active products unless asked.

Server-side validation the client also enforces, so both fail the same way:

- `recipe` mode: at least one ingredient, and no duplicate `ingredientId`.
- `direct` mode: `stock` and `minStock` present.
- `recipe` is ignored (stored empty) in `direct` mode.

`remove` is separate from `setActive` on purpose: `setActive` is the reversible
"not selling this today" state, and `remove` is the terminal one. They are not the
same action and the UI offers them as two items.

**Deleting a product does not rewrite history.** Order lines denormalise `name`,
`price`, and `stockMode` as sold, so a receipt for a deleted product still prints
what was actually charged and a reprint years later still matches. The server
must not rewrite order lines on delete.

The one caller that resolves products live is the **category split in reports**.
A deleted product must be attributed to an `Uncategorised` bucket there rather
than skipped, so the category table keeps agreeing with the revenue total above
it.

## 6. Stock

`StockRepository`

| Method | Endpoint |
|---|---|
| `movements(filter)` | `GET /api/stock/movements?type&ingredientId&productId` |
| `adjust(input)` | `POST /api/stock/adjust` → `201` |
| `levelOf(target, id)` | `GET /api/stock/level?target=ingredient&targetId=i-milk` |
| `value()` | `GET /api/stock/value` |

```jsonc
// POST /api/stock/adjust
{
  "target": "ingredient" | "product",
  "targetId": "i-milk-fresh",
  "type": "purchase" | "waste" | "adjustment",   // never "sale"
  "qty": 1000,                                     // signed
  "note": "Delivery from supplier, invoice 2041"
}
// actor is taken from the session and ignored in the body
```

```jsonc
// 201
StockMovement {
  id, type, ingredientId | null, productId | null, label,
  qty,                            // signed: negative consumes
  unit | null, note, createdAt, byUserId, byUserName
}
```

Server rules:

- `type: "sale"` is **not accepted** here. Sales write their movements as part of
  `POST /api/orders`.
- A movement that would drive stock below zero → `422 validation`, with the
  amount on hand in `message`. The stock screen relies on this message.
- `target: "product"` requires `stockMode: "direct"`. A recipe product has no
  stock of its own to adjust.
- `label` should be denormalised onto the movement (the ingredient or product
  name at that moment) so the ledger reads correctly after a rename.

```jsonc
// GET /api/stock/value
{ "ingredientsValue": 1741160, "retailValue": 3811000, "total": 5552160 }
```

`ingredientsValue` is at unit cost; `retailValue` is packaged stock at **selling**
price. They are reported separately and only summed for a rough figure — the UI
labels the combined number "treat as an order of magnitude", and that labelling
should survive into the API consumer.

## 7. Users

`UserRepository`

| Method | Endpoint |
|---|---|
| `list()` | `GET /api/users` |
| `create(input)` | `POST /api/users` → `201` |
| `update(id, input)` | `PUT /api/users/:id` |
| `setActive(id, isActive)` | `PATCH /api/users/:id/active` |
| `authenticate(u, p)` | `POST /api/auth/login` |

```jsonc
UserInput { name, username, role, isActive, password? }
// password required on create; on update, absent or empty means unchanged
User      { id, name, username, role, isActive }   // never a password field
```

Server rules:

- **Usernames unique case-insensitively.** `409 username-taken`.
- **`409 last-active-admin`** when deactivating the last active admin. Without
  this the app can be left with no account that can reach user management.
- **No delete endpoint.** Orders reference the cashier by id; deactivation is how
  someone leaves.

## 8. Orders

`OrderRepository`

| Method | Endpoint |
|---|---|
| `list(query)` | `GET /api/orders?cashierId&from&to` |
| `getById(id)` | `GET /api/orders/:id` |
| `recent(limit)` | `GET /api/orders/recent?limit=8` |
| `create(input)` | `POST /api/orders` → `201` |

```jsonc
// POST /api/orders
{
  "lines": [{ "productId": "p-iced-americano", "qty": 2 }],
  "paymentMethod": "cash" | "qris" | "debit" | "credit",
  "paidAmount": 70400
  // cashier is taken from the session and ignored in the body
}
```

```jsonc
// 201
{
  "order": Order,
  "movements": [StockMovement, ...]   // the stock this sale consumed
}
```

### The one endpoint that must be a real transaction

Inside a single MongoDB transaction:

1. Re-read every line's product. Reject unknown ids.
2. Recompute `subtotal`, `taxAmount` (PPN 10%, rounded to whole rupiah), and
   `total` from stored prices. **Never trust a total from the client.**
3. Validate coverage. A `direct` product needs `stock >= qty`; a `recipe` product
   needs every ingredient to cover `recipe.qty × qty`. Otherwise →
   `409 insufficient-stock`, naming the short ingredient.
4. Assign the next `receiptNo` (`MOKA-####`).
5. Write the order with denormalised lines.
6. Decrement stock and append the movements.

If any step fails, **nothing is written.** This mirrors what the mock does with
its snapshot-and-restore `mutate`, and the reason the until's stock numbers can
be trusted. A partial write here means a receipt exists for stock that was never
sold, or stock was consumed by an order that does not exist.

### `from` / `to` are inclusive, `yyyy-mm-dd`

`to` must cover the whole day. The mock had to special-case this: parsed as a bare
date a `to` lands at midnight, so a range ending today silently drops that day's
sales. Apply `<= to 23:59:59.999` or translate to `< to+1day`.

### Idempotency

Accept an `Idempotency-Key` header on `POST /api/orders`. A mobile till on flaky
wifi will retry, and a retry that creates a second receipt is a real-world
duplicate charge. Keyed on the header, returning the original order.

## 9. Shifts

`ShiftRepository` — records only; nothing gates on them yet.

| Method | Endpoint |
|---|---|
| `current(userId)` | `GET /api/shifts/current` |
| `list(query)` | `GET /api/shifts?cashierId` |
| `open(input)` | `POST /api/shifts` → `201` |
| `close(id, counted)` | `POST /api/shifts/:id/close` |

```jsonc
Shift { id, userId, userName, openedAt, openingFloat, closedAt | null,
        closingCounted | null, status: "open" | "closed" }
```

- `409 already-open-shift` when the user has one open.
- `409 already-closed-shift` on double close.
- `userId` / `cashier.id` come from the session.

Cash reconciliation is **not** in scope: closing stores a counted float, and
nothing compares it against cash sales inside the shift.

## 10. Suggested MongoDB shape

```
users            { _id, name, username, passwordHash, role, isActive, createdAt }
                 unique index on username (case-insensitive)

categories       { _id, name, sortOrder }

ingredients      { _id, name, unit, stock, minStock, costPerUnit }

products         { _id, name, categoryId, price, image, stockMode,
                   stock?, minStock?, recipe: [{ ingredientId, qty }], isActive }
                 index on categoryId, on isActive

orders           { _id, receiptNo, lines: [{ productId, name, price, qty, stockMode }],
                   subtotal, taxRate, taxAmount, total, paymentMethod,
                   paidAmount, changeAmount, cashierId, cashierName, createdAt }
                 unique index on receiptNo
                 index on createdAt (the reports range-scan it)
                 index on cashierId
                 NO index on lines.productId — lines are embedded and never joined

stock_movements  { _id, type, ingredientId?, productId?, label, qty, unit,
                   note, createdAt, byUserId, byUserName }
                 index on createdAt desc, on ingredientId, on productId

shifts           { _id, userId, userName, openedAt, openingFloat,
                   closedAt?, closingCounted?, status }
                 index on { userId, status }
```

Order lines are embedded on purpose. A receipt must be printable without a join,
and the historical price requirement means the line is a snapshot, not a
reference.

Note there is **no inventory collection**. `Ingredient.stock` and direct-product
`Product.stock` are current levels on their own documents; `stock_movements` is the
history. The ledger is the audit trail, not the source of truth.

## 11. What the frontend does not need from the server

Stated explicitly so nobody builds it:

- **Totals, taxes, margins, servings** — computed in
  `lib/repositories/read-models.ts` and `types/pos.ts` from returned data. Only
  `StockRepository.value()` is a server call, because it multiplies levels by
  costs.
- **Sorting, pagination, filtering UI** — currently client-side. When they move
  server-side, that logic goes in the repository, not in the screens.
- **The dashboard and report aggregations** — the frontend already sums, trends,
  and splits. Moving them server-side is a performance option, not a requirement.
- **Route-level guards** — the client keeps its own; the server just has to
  agree.

## 12. Acceptance for the swap

The API is done when:

1. A new implementation of the seven interfaces returns real data.
2. `getRepositories()` points at it. **That is the only file changed.**
3. `npm run smoke` passes **154/154 unchanged**.

Point 3 is the real test. It covers catalogue CRUD, stock adjustments and their
refusals, the ledger, a full sale through to the receipt, report ranges and CSV,
account creation and deactivation, the role gate, and the print layout — against
whatever the API does. If a screen had to be edited, the abstraction leaked, and
that is worth knowing before it spreads.