# Backend docs

Documentation for the Moka-POS API. This folder is the **only** place backend
documentation lives.

## Canonical sources

The API specification is not written here. It lives with the frontend, because
the frontend is what codes against it:

| Document | Location | What it is |
|---|---|---|
| **API contract** | [`../../frontend/docs/API-CONTRACT.md`](../../frontend/docs/API-CONTRACT.md) | Every endpoint, DTO, error code and business rule. **This is the spec.** Read it before writing any route. |
| Product requirements | [`../../frontend/docs/PRD.md`](../../frontend/docs/PRD.md) | Roles, screens, and the business-rules table. |
| Test plan | [`../../frontend/docs/TESTING.md`](../../frontend/docs/TESTING.md) | The 154-check suite the swap is validated against. |
| Design tokens | [`../../frontend/docs/DESIGN.md`](../../frontend/docs/DESIGN.md) | Currency, locale, PPN rate. |

Keep one copy. Do not fork the contract into this folder — a second copy will
drift and then both will be wrong.

## What this folder will hold

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Folder layout, module conventions, error envelope, transaction rules. |

## Ground rules for anything written here

1. **A route that is not in the API contract does not get built.** If an endpoint
   seems necessary, the contract is amended first.
2. **The contract wins over convenience.** If following it is hard, that is the
   signal the design is wrong, not that the contract is wrong.
3. **Money is integer rupiah.** No floats, anywhere, ever.
4. **Totals are computed server-side.** A total arriving in a request body is
   ignored.
5. **`actor` and `cashier` come from the session.** Any value in a body is
   ignored.

## Historical note

This folder previously held `moka_pos_product_requirements_prd.md` and
`moka_pos_technical_requirements_trd.md`. Both described an earlier Express
design with `users` keyed on email, a `transactions` collection and a
`stock_history` collection. None of that shipped, and none of it matches what the
frontend calls. They were removed in the commit that established this index; the
replacement documents are listed above.