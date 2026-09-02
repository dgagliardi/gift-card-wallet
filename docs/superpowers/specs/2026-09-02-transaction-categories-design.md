# Transaction Categories, Expenses View, and Top Navigation

**Date:** 2026-09-02
**Branch:** `claude/charge-categories-expenses-8270ab`
**Status:** Approved design, pending implementation plan

## Problem

The wallet records what was spent and when, but not *what it was spent on*. Every
Costco charge is either fuel or merchandise, and today those are indistinguishable
in the data and in the stats. There is also no way to look at spending across
years, and no persistent navigation — the only route back to the home page is the
header title, which does not read as a link.

## Goals

1. Every transaction carries one of two categories: **Gas** or **Merchandise**.
2. The transaction entry form makes picking a category a single tap, pre-selected
   from the card type.
3. Existing transactions are classified retroactively without manual data entry.
4. Home-page stats report year-to-date spend split by category.
5. A dedicated Expenses view reports spending by year and by month.
6. Persistent top navigation across the app.

## Non-goals

- **Google Sheets parity.** `apps/sheets/Code.gs` and `Index.html` will not be
  updated. The Sheets deployment keeps its current uncategorized behavior. The
  README's dual-deployment checklist is amended so it stops asserting parity that
  no longer holds.
- **Per-card default category.** Category lives on the transaction only. A card's
  `type` supplies the *default* at entry time; it is not stored as card state.
- **Categories beyond two.** No user-defined categories, no subcategories.
- **Removing `components/wallet-home.tsx`.** It is 1,168 lines of dead code
  (imported by nothing) but is unrelated to this work and stays out of scope.

## Design

### 1. Data model

One new column on `gift_card_transaction`:

```ts
category: text("category").notNull().default("")
```

Domain values are the string literals `"gas"` and `"merchandise"`. The empty
string means *not yet classified* and is the signal the backfill keys on. After
the backfill completes, no row should hold `""`; the column stays `DEFAULT ''`
rather than `DEFAULT 'gas'` so that any future row inserted outside the
application is visibly unclassified rather than silently wrong.

A `transactionCategorySchema` (`z.enum(["gas", "merchandise"])`) is added to
`packages/domain/src/schemas.ts`, and `transactionRowSchema` gains a `category`
field so the domain functions can rely on it.

### 2. Migration and backfill

`apps/web/lib/db.ts` already constructs the `better-sqlite3` handle at module
load and is imported by every server action. An idempotent `ensureWalletSchema()`
runs there, immediately after the handle is opened and before `drizzle()` wraps
it:

1. `PRAGMA table_info(gift_card_transaction)` — add the column via
   `ALTER TABLE ... ADD COLUMN category TEXT NOT NULL DEFAULT ''` only if absent.
2. Backfill by card type:

```sql
UPDATE gift_card_transaction
SET category = (
  SELECT CASE WHEN gc.type = 'Digital' THEN 'merchandise' ELSE 'gas' END
  FROM gift_card gc WHERE gc.id = gift_card_transaction."cardId"
)
WHERE category = ''
  AND EXISTS (SELECT 1 FROM gift_card gc WHERE gc.id = gift_card_transaction."cardId");
```

Both steps are no-ops on every subsequent boot. The `WHERE category = ''` guard
means a manual re-classification is never reverted by a later restart.

**Why boot-time rather than a deploy step:** `.github/workflows/deploy.yml` pulls,
installs, builds, and restarts under pm2 — it never runs `pnpm db:push`. A column
added only to the Drizzle schema would therefore not exist in the live SQLite file
and every transaction query would throw. Running the DDL at boot makes the deploy
self-healing and keeps the ordering guarantee (schema before first query) that a
separate SSH step cannot provide.

The Drizzle schema remains the source of truth for `pnpm db:push` in local
development; `ensureWalletSchema()` is a convergence step, not a replacement.

### 3. Transaction entry

In `apps/web/components/card-detail-page.tsx`, the add-transaction form gains a
two-button segmented control (Gas | Merchandise) beside the date/amount/note
inputs. It is initialised from the card type — `Digital → merchandise`,
`Physical → gas` — and resets to that default after each submit, so the common
case is zero taps and the exception is one.

Receipt-scan prefill (`autoCreateTransactionFromReceipt`) sets the same default.
Receipt text is **not** inspected for fuel keywords; per the agreed backfill rule,
classification is card-type-driven and corrected by hand.

`addTransaction(cardId, amount, note, txDateInput, category)` gains the category
parameter.

### 4. Re-classifying an existing transaction

The History list on the card detail page renders each transaction's category as a
tappable chip. Tapping it flips Gas ↔ Merchandise through a new
`updateTransactionCategory(txId, cardId, category)` server action.

This is how the ~1% of transactions the card-type rule gets wrong are corrected.
It also gives the orphaned `editTransaction` action a sibling that is actually
reachable; `editTransaction` itself remains unused and unchanged (out of scope).

### 5. Stats

`computeWalletStats` gains two fields:

- `spentYearGas`
- `spentYearMerchandise`

**Sign convention (explicit decision, changed from the reviewed design):** the
existing implementation skips any transaction with `amount <= 0`, so refunds and
card credits do not reduce year-to-date spend. This behavior is **preserved**,
and no existing number on the home page changes as a result of this work.

The design presented in chat said a gas refund would net out of the Gas total.
That would have been a behavior change to `spentYear`, restating figures already
shown, and it is not carried into this spec. See *Open question* below.

Each category total is rounded to cents independently, and `spentYear` is rounded
from its own unrounded sum. Because every amount stored by the app is already
cent-precision, `spentYearGas + spentYearMerchandise === spentYear` in practice;
the test suite asserts this identity on cent-valued fixtures rather than claiming
it for arbitrary floats.

This is a deliberate choice rather than an oversight. A negative amount in this
app means "value added back to the card," which covers both a refund (genuinely
negative spending) and a promotional top-up (not spending at all). Netting them
against spend would be right for the first and wrong for the second, and would
silently restate figures already shown. The Expenses view uses the same
positive-only convention so the two surfaces agree.

*Known pre-existing inconsistency, not addressed here:* `/transactions` reports
"Net spend" as a plain sum including negatives, which is a different number from
the home page's year-to-date. This design does not change that line.

**Open question for review:** if you would rather refunds reduce year-to-date
spend, that is a one-line change in `computeWalletStats` plus updated fixtures,
but it will lower the year-to-date figure currently displayed by the sum of all
credits entered to date. Flag it during spec review and it goes into this
implementation; otherwise gross (positive-only) ships as specified.

A new pure function is added to `packages/domain/src/stats.ts`:

```ts
computeExpenseSummary(
  transactions: TransactionRow[],
  now?: Date,
): ExpenseSummary
```

returning

```ts
type CategoryTotals = { gas: number; merchandise: number; total: number };
type ExpenseSummary = {
  years: { year: number; totals: CategoryTotals }[];   // descending
  months: { year: number; month: number; totals: CategoryTotals }[];
};
```

`months` covers all twelve months of every year present, including zero months,
so the page can render a complete calendar without gap-filling in the view layer.
All money values are rounded to cents with the existing
`Math.round(x * 100) / 100` convention.

### 6. Expenses page

New route `apps/web/app/(main)/expenses/page.tsx` (server component) backed by a
new `getExpenseSummary()` server action in `app/actions/wallet.ts`, which reuses
the session guard and per-user scoping of the existing actions.

Two sections:

1. **Year over year** — rows per year, columns Gas / Merchandise / Total,
   newest first. With one year of data this renders a single row, which is the
   expected state for 2026.
2. **Monthly detail** — for a selected year (defaulting to the current year), the
   twelve months with Gas / Merchandise / Total. Year selection is a plain set of
   buttons over the years present in the data; with one year it renders as a
   single inert-looking control, which is acceptable.

Empty state: when there are no transactions, the page shows a single message
rather than an empty table.

### 7. Navigation

`apps/web/app/(main)/layout.tsx` gains a second sticky row beneath the existing
header, in a new `components/MainNav.tsx` client component (it needs
`usePathname()` for the active state):

- **Cards** → `/`
- **Expenses** → `/expenses`
- **History** → `/transactions`

The active route is highlighted in teal, consistent with the existing accent.
Links respect `NEXT_PUBLIC_BASE_PATH` the same way the header title already does.
The ad-hoc "Home" link on `/transactions` is removed, since the nav now covers it.

`/transactions` additionally displays each transaction's category in its metadata
line alongside date and card type, which requires `getAllTransactions()` to
select the new column.

## Testing

**Domain (`packages/domain`, Vitest):**

- `computeWalletStats` splits year-to-date by category; `gas + merchandise === total`.
- Category totals ignore non-positive amounts, matching `spentYear`.
- Transactions from prior years are excluded from year-to-date but present in
  `computeExpenseSummary`.
- `computeExpenseSummary` groups by year descending and emits all twelve months
  per year including zeroes.
- Rounding: repeated cent-level amounts do not accumulate float drift.

**Web app:**

- Backfill idempotency verified against a seeded SQLite file: run
  `ensureWalletSchema()` twice, assert the column exists once, all rows are
  classified, counts match the card-type rule, and a manually flipped row is not
  reverted by a second run.
- `pnpm lint` and `pnpm build` pass.

**Regression guarantee:** the stats tests assert that `spentYear`, `spentLast30`,
and `avgPurchaseLast30` are unchanged for the existing fixtures, so the category
work cannot quietly restate historical figures.

## Rollout

- Version bump `apps/web/package.json` to `0.3.0` (surfaced on the login footer
  via `next.config.ts`).
- Deploy through the existing `[deploy]` commit marker. No SSH step and no manual
  `pnpm db:push` are required; the first boot after deploy performs the column
  addition and the backfill.
- Rollback: reverting the deploy leaves the `category` column in place and unread
  by the previous build, which is harmless.

## Files touched

| File | Change |
|---|---|
| `packages/domain/src/schemas.ts` | Category enum, `TransactionRow.category`, stats + expense summary schemas |
| `packages/domain/src/stats.ts` | Category totals in `computeWalletStats`; new `computeExpenseSummary` |
| `packages/domain/src/stats.test.ts` | New and regression tests |
| `apps/web/db/schema.ts` | `category` column |
| `apps/web/lib/db.ts` | `ensureWalletSchema()` |
| `apps/web/app/actions/wallet.ts` | Category on read/write paths; `getExpenseSummary`, `updateTransactionCategory` |
| `apps/web/components/card-detail-page.tsx` | Category picker; category chip in History |
| `apps/web/components/wallet-home-page.tsx` | Gas / Merch / Total year-to-date tiles |
| `apps/web/components/MainNav.tsx` | New |
| `apps/web/app/(main)/layout.tsx` | Mount nav |
| `apps/web/app/(main)/expenses/page.tsx` | New |
| `apps/web/components/expenses-page.tsx` | New |
| `apps/web/app/(main)/transactions/page.tsx` | Show category; drop ad-hoc Home link |
| `apps/web/package.json` | Version 0.3.0 |
| `README.md` | Feature note; amend dual-deployment checklist |
