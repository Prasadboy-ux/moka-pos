# Design system

Tokens, components, and the interaction rules the app holds itself to. Most of
the rules here exist because the POS runs on a tablet, touched by hand, all day.

## 1. Brand

Lifted from `asset/logo/moka-logo.svg`.

| Token | Value | Use |
|---|---|---|
| `--brand-cyan` | `#00c4df` | Logo accent, gradient start |
| `--brand-teal` | `#009bb0` | Cyan gradient end |
| `--brand-blue` | `#1b75bc` | Accent |
| `--brand-navy` | `#0f4c81` | Gradient end |
| `--brand-ink` | `#0f2027` | Foreground text |
| `--primary` | `#007a87` | Buttons, active states, tile prices |

`--primary` is the logo cyan darkened far enough to clear WCAG AA (≈5:1 with
white text). The raw `#00c4df` fails badly (≈2.1:1), and the first replacement
`#00a5bd` still failed at ≈3:1 — which is why the value is this deep now. The
bright cyan stays available as `--brand-cyan` for gradients and non-text
accents; anything carrying text uses `--primary`.

`--ring` shares the `--primary` value and is applied at full opacity. A bright
cyan ring at 50% opacity against white is invisible, which is not a focus
indicator.

Semantic tokens (`--background`, `--foreground`, `--card`, `--muted`,
`--success`, `--warning`, `--destructive`, `--border`, `--chart-*`,
`--sidebar-*`) are mapped through `@theme inline` so Tailwind generates
utilities from them. **Change the token, never the utility class.** Raw palette
values (`bg-emerald-500`, `from-[#00c4df]`) do not belong in a component: the
brand gradients use `from-brand-cyan to-brand-navy`, and success/warning states
use `text-success` / `text-warning`.

A full `.dark` palette exists and is token-complete but has no toggle.

## 2. Locale

Copy and dates are English; money stays Indonesian. That split is deliberate,
not an oversight — rupiah is the real currency and the local grouping is the one
staff and customers read without translating, while every label on screen is
English and an English UI printing "18 Okt 2026" mixes two languages on the same
line.

| | |
|---|---|
| UI copy | English |
| Currency | `Intl.NumberFormat("id-ID")` — `Rp 28.000` |
| Plain numbers | `Intl.NumberFormat("id-ID")` — `28.000` |
| Dates | `Intl.DateTimeFormat("en-GB")` — `28 Oct 2026`, `Oct 2026` |
| Tax | PPN 10% (the local acronym, kept on purpose) |
| Units | `gram`, `ml`, `pcs` |
| `<html lang>` | `en` |

`lang` follows the **words**, not the money. It is what a screen reader uses to
pick a voice and a pronunciation dictionary, and every string it would read is
English. `<html lang="id">` would read English copy with Indonesian phonetics.

`en-GB` rather than `en-US` for dates because day-first ordering keeps the shape
staff already know.

**Never hardcode a date or number format.** A bare `yyyy-mm-dd` parses as UTC
midnight and renders as the previous day west of Greenwich — `formatDate` pins
those strings to local time first.

Numbers in columns get `tabular-nums` so digits line up.

## 3. Touch and pointer

The app is used on a tablet. These are not optional polish.

| Rule | Value |
|---|---|
| Double-tap delay | `touch-action: manipulation` on `<body>` |
| Tap flash | `-webkit-tap-highlight-color: transparent` on `<body>` |
| Cart steppers | 40 px |
| Quick tender | 44 px |
| Charge button | 48 px |
| Category chips (POS and admin) | 40 px minimum height |
| Cart "Clear", dialog close | 40 px minimum hit area |
| Sidebar links, buttons | 40 px minimum height |
| Menu tile | whole tile is the target |
| Mobile tab bar | icons + short label, never text alone |

Pinch-zoom still works — `manipulation` removes only the double-tap gesture.

The default `Button` sizes are one step taller than stock shadcn for the same
reason (`default` 40 px, `sm` 36 px).

## 4. Motion

Everything collapses under `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Duration rather than `animation: none`, so the **end state is still reached** —
an interrupted fade-in would leave a dialog half transparent.

Two animations are cancelled outright rather than sped up, because snapping is
worse than not moving:

| Case | Treatment |
|---|---|
| Skeleton pulse (infinite) | `motion-reduce:animate-none` |
| Tile hover zoom | `motion-reduce:group-hover:scale-100` |
| Tile press-down | `motion-safe:active:scale-[0.98]` only |

## 5. Transitions

Name the properties. `transition-all` also animates whatever a variant happens
to change later, which is how a hover ends up costing a reflow.

```css
/* good */  transition-[color,background-color,border-color,box-shadow]
/* also */  transition-colors   transition-transform   transition-opacity
```

## 6. Focus and semantics

- Interactive elements carry `:focus-visible` rings. There is no `outline-none`
  without a replacement.
- Icon-only buttons have `aria-label`; decorative icons are `aria-hidden`.
- Async feedback uses `role="alert"` (errors) or a `polite` live region
  (confirmations).
- A skip link to `#main` sits first in the DOM and is the first tab stop.
- Clickable **rows** are avoided — a row is not reachable by keyboard. The
  product and account names are real buttons instead. This also fixed a real bug:
  a row-level click handler fired when the actions menu inside the row was used,
  opening the edit dialog on top of the confirmation and swallowing its click.
- Destructive actions confirm. Clearing an order shows the item count and value.

## 7. Components

22 shadcn primitives in `src/components/ui`, hand-authored against `radix-ui`
rather than fetched by the CLI — the package already ships `select`, `switch`,
`alert-dialog`, `dropdown-menu`, and `popover`, so there was no reason to add a
dependency or a lockfile change.

| Primitive | Notes |
|---|---|
| `alert`, `badge`, `button`, `card`, `dialog`, `input`, `label`, `progress`, `separator`, `scroll-area`, `tabs`, `toggle`, `toggle-group` | stock shadcn |
| `table` | Plain markup — Radix has no table primitive |
| `select`, `switch`, `dropdown-menu`, `alert-dialog` | Hand-authored on `radix-ui` |
| `avatar` | Users screen |
| `skeleton` | `motion-reduce:animate-none` |
| `textarea` | Notes fields |
| `toast` | Single polite live region, no queueing |

Shared app components:

| Component | Purpose |
|---|---|
| `DataTable` | Sortable columns, client pagination, skeleton and empty states |
| `FilterBar` | Search plus counted category chips |
| `ConfirmDialog` | Awaits the action, toasts failures, stays open on failure |
| `PageHeader` | Title, description, one primary action |

## 8. Print

A receipt prints alone. The POS grid, sidebar, and dialog chrome are all excluded.

```css
@media print {
  body * { visibility: hidden; }
  [data-receipt], [data-receipt] * { visibility: visible; }
  [data-slot="dialog-content"] { position: absolute; top: 0; left: 0;
    --tw-translate-x: 0px; --tw-translate-y: 0px; max-height: none; overflow: visible; }
  [data-receipt] { width: 80mm; margin: 0 auto; }
}
```

Two traps, both cost real time:

> **Tailwind v4 emits `translate-x-[-50%]` as the CSS `translate` property**, not
> `transform`. Setting `transform: none` does not cancel it, and the build strips
> a literal `translate: none` from the rule. Zero `--tw-translate-x` /
> `--tw-translate-y` instead — that survives minification.

**Keep the dialog positioned.** `position: static` makes it flow to the end of
the document and print off the bottom of the page.

Print layout is asserted on measured geometry in `smoke:a11y`, not on the
stylesheet source, because the stylesheet can look right and print nothing.

## 9. Empty and error states

Every list has one. Both screens the cashier uses most — the menu grid and the
cart — say what to do next, not just that nothing is there:

> **Order is empty** — Tap a menu item to start the order.

Loading is a skeleton that matches the layout it replaces so nothing jumps —
the POS grid, the dashboard, and the auth gate all draw their own shell rather
than a spinner. Errors use the `Alert` pattern with a way out: name what
failed, then a **Try again** action. Placeholders inside inputs end in `…` and
show an example ("Search products…"), while the field's accessible label stays
clean ("Search products").

## 10. Headings

Each screen has exactly one `<h1>` — `PageHeader` owns it on admin screens; the
till and the overview carry their own. The app header renders the route name as
muted chrome, not a heading, so it cannot stack a duplicate title above the
page's real one.

## 10. Copy

- Active voice: "Tap a menu item to start the order", not "A menu item should be tapped".
- Specific labels: "Clear order", "Record movement", "Export CSV" — never "Continue".
- Numerals for counts: "8 deployments", not "eight".
- Errors name the fix: "Cannot remove 99999999 ml; only 6200 on hand."
- Title Case for headings and buttons.
- Placeholders end in `…` and show an example: "e.g. 50000…", "Search menu…".
- Brand names carry `translate="no"` so a page translator cannot mangle them.

Copy is English throughout, and dates render in English. Currency, number
grouping, and the `PPN` tax acronym stay Indonesian. If the copy is translated,
this is a copy pass, not a refactor — but `lang` on `<html>` has to change with
it, and `smoke:a11y` asserts the value.

## 11. Adding a screen

1. Add the route under `src/app/dashboard/`.
2. Add a `NAV_ITEM` to `src/lib/nav.ts` with its allowed `roles`. This is the
   only source of truth — the sidebar, header, and guard all read it.
3. Build the screen as a `"use client"` component under `src/components/<area>/`.
4. Read data through `getRepositories()`, never `localStorage` directly.
5. Load with `useAsync`. Keep filter state in the URL with `useQueryState`.
6. Use `DataTable` for lists, `ConfirmDialog` for destructive actions,
   `PageHeader` at the top.
7. Wrap the page in `<Suspense>` if it reads search parameters.
8. Add a smoke suite. A screen with no check is a screen nobody has verified.
9. Run `typecheck`, `lint`, `build`, `smoke`.