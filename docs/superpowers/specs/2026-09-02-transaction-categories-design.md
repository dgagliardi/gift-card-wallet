# Transaction Categories, Expenses View, and Top Navigation

**Date:** 2026-09-02
**Branch:** `claude/charge-categories-expenses-8270ab`
**Status:** Approved design, pending implementation plan
**Revision:** 2 — no unclassified state; adjustments net against totals

## Problem

The wallet records what was spent and when, but not *what it was spent on*. Every
Costco charge is either fuel or merchandise, and today those are indistinguishable
in the data and in the stats. There is also no way to look at spending across
years, and no persistent navigation — the only route back to the home page is the
header title, which does not read as a link.

## Goals

1. Every transaction carries one of exactly two categories: **Gas** or
   **Merchandise**. There is no third state and no unclassified state.
2. The transaction entry form makes picking a category a single tap, pre-selected
   from the card type.
3. Existing transactions are classified retroactively without manual data entry.
4. Home-page stats report year-to-date spend split by category, net of
   adjustments.
5. A dedicated Expenses view reports spending by year and by month.
6. Persistent top navigation across the app.

## Non-goals

- **A separate "adjustment" category.** A negative amount is a correction to an
  overstated transaction. It belongs to the same bucket as the charge it
  corrects, so a `-$10` on a physical card is gas, not a third thing. The word
  "Adjustment" appears in the UI as a *label derived from the sign*, never as
  stored state. This means it can never disagree with the amount, and editing an
  amount from `-10` to `10` reclassifies it with no extra bookkeeping.
- **Google Sheets parity.** `apps/sheets/Code.gs` and `Index.html` are not
  updated. The Sheets deployment keeps its current uncategorized, gross-of-
  adjustments behavior. The README's dual-deployment checklist is amended so it
  stops asserting parity that no longer holds, and the numeric divergence is
  called out explicitly.
- **Per-card default category.** Category lives on the transaction only. A card's
  `type` supplies the *default* at entry time; it is not stored as card state.
- **Removing `components/wallet-home.tsx`.** It is 1,168 lines of dead code
  (imported by nothing) but is unrelated to this work and stays out of scope.

## Design

### 1. Data model

One new column on `gift_card_transaction`:

```ts
category: text("category").notNull()
```

Domain values are exactly `"gas"` and `"merchandise"` — a
`transactionCategorySchema` (`z.enum(["gas", "merchandise"])`) in
`packages/domain/src/schemas.ts`. `transactionRowSchema` gains a `category` field
so the domain functions can rely on it being present.

There is no empty-string sentinel and no unclassified state. Every row holds one
of the two values from the moment the column exists.

### 2. Migration and backfill

`apps/web/lib/db.ts` already constructs the `better-sqlite3` handle at module
load and is imported by every server action. An idempotent `ensureWalletSchema()`
runs there, immediately after the handle is opened and before `drizzle()` wraps
it.

**Adding the column (once):** SQLite requires a non-null default when adding a
`NOT NULL` column to a table with existing rows, so the DDL and the correcting
`UPDATE` run inside a single `sqlite.transaction()`:

```sql
ALTER TABLE gift_card_transaction
  ADD COLUMN category TEXT NOT NULL DEFAULT 'merchandise';

UPDATE gift_card_transaction
SET category = (
  SELECT CASE WHEN gc.type = 'Digital' THEN 'merchandise' ELSE 'gas' END
  FROM gift_card gc WHERE gc.id = gift_card_transaction."cardId"
);
```

The `'merchandise'` default is a transient placeholder demanded by SQLite's
`NOT NULL`, overwritten before the transaction commits. No reader ever observes
it, because the whole thing is atomic and runs before the first query. Sign is
irrelevant here: a negative amount on a physical card is gas, same as a positive
one.

**Every boot:** a guard normalizes any row whose category is not one of the two
legal values back to the card-type rule. On a personal wallet this is a
sub-millisecond no-op, and it makes "no unclassified state" an invariant the
system enforces rather than one it merely assumes. It does not touch rows holding
a legal value, so a manual re-classification is never reverted.

**Why boot-time rather than a deploy step:** `.github/workflows/deploy.yml` pulls,
installs, builds, and restarts under pm2 — it never runs `pnpm db:push`. A column
added only to the Drizzle schema would therefore not exist in the live SQLite file
and every transaction query would throw. Running the DDL at boot makes the deploy
self-healing and provides the ordering guarantee — schema before first query —
that a separate SSH step cannot.

The Drizzle schema remains the source of truth for `pnpm db:push` in local
development; `ensureWalletSchema()` is a convergence step, not a replacement.

### 3. Transaction entry

In `apps/web/components/card-detail-page.tsx`, the add-transaction form gains a
two-button segmented control (Gas | Merchandise) beside the date/amount/note
inputs. It is initialised from the card type — `Digital → merchandise`,
`Physical → gas` — and resets to that default after each submit, so the common
case is zero taps and the exception is one. The control behaves identically for
negative amounts.

Receipt-scan prefill (`autoCreateTransactionFromReceipt`) sets the same default.
Receipt text is **not** inspected for fuel keywords; classification is
card-type-driven and corrected by hand.

`addTransaction(cardId, amount, note, txDateInput, category)` gains the category
parameter and always writes an explicit value.

### 4. Re-classifying an existing transaction

The History list on the card detail page renders each transaction's category as a
tappable chip. Tapping it flips Gas ↔ Merchandise through a new
`updateTransactionCategory(txId, cardId, category)` server action.

This is how the small number of transactions the card-type rule gets wrong are
corrected. It also gives the orphaned `editTransaction` action a sibling that is
actually reachable; `editTransaction` itself remains unused and unchanged.

### 5. Adjustments (derived, not stored)

A transaction with a negative amount is an adjustment: a correction to a
previously overstated charge. Nothing about this is persisted. Three consequences:

- **Labelling.** The History list and `/transactions` currently print "Credit"
  for negative amounts. They print **"Adjustment"** instead, keeping the existing
  green `+$` treatment.
- **Totals.** Adjustments reduce the bucket they belong to (see §6).
- **Visibility.** The Expenses view reports an *Adjustments* figure per row,
  computed as the sum of negative amounts in that period. No home-page tile —
  a fourth figure there would be noise for something that should be rare.

### 6. Stats

`computeWalletStats` gains two fields, `spentYearGas` and `spentYearMerchandise`.

**Sign convention — changed behavior.** The current implementation skips any
transaction with `amount <= 0`, so adjustments do not reduce reported spend. That
skip is **removed**: `spentLast30`, `spentYear`, and both category totals are now
*net* of adjustments.

This restates figures already displayed. Year-to-date and last-30-day spend will
drop by the sum of every negative amount entered to date. That is the intended
outcome — an adjustment exists precisely because the original charge was
overstated, so the pre-change figure was wrong.

`avgPurchaseLast30` keeps its current definition: the mean of *positive* amounts
in the last 30 days, over the count of positive amounts. It answers "how big is a
typical purchase," which adjustments would distort in both numerator and
denominator. Its numerator therefore deliberately differs from `spentLast30`.
This field is no longer rendered on the home page but remains in the schema and
in the Sheets implementation.

Each category total is rounded to cents, and `spentYear` is then derived from
those **rounded** figures rather than from its own unrounded sum. Rounding the
three independently does not reconcile: `112.4 + 164.55` evaluates to
`276.95000000000005` in IEEE 754, so the parts would not add up to the whole.
Deriving the total guarantees `round2(spentYearGas + spentYearMerchandise) ===
spentYear` for any input. `computeExpenseSummary` already composes its totals
this way, so both surfaces agree.

Note that the raw expression `spentYearGas + spentYearMerchandise === spentYear`
is still false for such values — that is a property of binary floating point, not
of the data. Displayed to cents, the figures always reconcile.

*Known divergence created here:* `apps/sheets/Code.gs` continues to report gross
figures. The two deployments will disagree for any wallet containing adjustments.
Documented in the README rather than fixed.

*Pre-existing inconsistency now resolved as a side effect:* `/transactions`
reported "Net spend" as a plain sum including negatives, a different number from
the home page's gross year-to-date. With the home page netting too, the two agree.

A new pure function is added to `packages/domain/src/stats.ts`:

```ts
computeExpenseSummary(
  transactions: TransactionRow[],
  now?: Date,
): ExpenseSummary
```

returning

```ts
type CategoryTotals = {
  gas: number;          // net of adjustments
  merchandise: number;  // net of adjustments
  adjustments: number;  // sum of negative amounts, reported as a positive figure
  total: number;        // gas + merchandise
};
type ExpenseSummary = {
  years: { year: number; totals: CategoryTotals }[];   // descending
  months: { year: number; month: number; totals: CategoryTotals }[];
};
```

`adjustments` is a memo figure — it is already reflected inside `gas` and
`merchandise` and must not be subtracted again. `months` covers all twelve months
of every year present, including zero months, so the page renders a complete
calendar without gap-filling in the view layer. All money values use the existing
`Math.round(x * 100) / 100` convention.

### 7. Expenses page

New route `apps/web/app/(main)/expenses/page.tsx` (server component) backed by a
new `getExpenseSummary()` server action in `app/actions/wallet.ts`, reusing the
session guard and per-user scoping of the existing actions.

Two sections:

1. **Year over year** — rows per year, columns Gas / Merchandise / Adjustments /
   Total, newest first. With one year of data this renders a single row, which is
   the expected state for 2026.
2. **Monthly detail** — for a selected year (defaulting to the current year), the
   twelve months with the same columns. Year selection is a plain set of buttons
   over the years present in the data.

The Adjustments column is visually de-emphasised (muted, parenthesised) to signal
that it is a memo already included in the other figures, not an addend.

Empty state: when there are no transactions, a single message rather than an
empty table.

### 8. Navigation

`apps/web/app/(main)/layout.tsx` gains a second sticky row beneath the existing
header, in a new `components/MainNav.tsx` client component (it needs
`usePathname()` for the active state):

- **Cards** → `/`
- **Expenses** → `/expenses`
- **History** → `/transactions`

The active route is highlighted in teal, consistent with the existing accent.
Links respect `NEXT_PUBLIC_BASE_PATH` the same way the header title already does.
The ad-hoc "Home" link on `/transactions` is removed, since the nav covers it.

`/transactions` additionally displays each transaction's category in its metadata
line alongside date and card type, which requires `getAllTransactions()` to select
the new column.

## Testing

**Domain (`packages/domain`, Vitest):**

- `computeWalletStats` splits year-to-date by category; `gas + merchandise === total`.
- **Netting:** a negative amount reduces `spentYear`, `spentLast30`, and its own
  category total. A gas card charged `$50` then adjusted `-$10` yields
  `spentYearGas === 40`.
- `avgPurchaseLast30` ignores negative amounts in both numerator and denominator,
  and is unchanged by adding an adjustment.
- Transactions from prior years are excluded from year-to-date but present in
  `computeExpenseSummary`.
- `computeExpenseSummary` groups by year descending, emits all twelve months per
  year including zeroes, and reports `adjustments` as a positive memo figure that
  is already netted into `gas`/`merchandise`.
- Rounding: repeated cent-level amounts do not accumulate float drift.

**Web app:**

- Backfill correctness and idempotency against a seeded SQLite file: run
  `ensureWalletSchema()` twice; assert the column exists once, **no row holds a
  value outside `{gas, merchandise}`**, negative-amount rows are classified by
  card type like any other, counts match the card-type rule, and a manually
  flipped row is not reverted by a second run.
- `pnpm lint` and `pnpm build` pass.

**Deliberately not asserted:** that `spentYear` is unchanged for existing
fixtures. Revision 1 promised that; revision 2 changes it on purpose, and the
netting tests above are the replacement guarantee.

## Rollout

- Version bump `apps/web/package.json` to `0.3.0` (surfaced on the login footer
  via `next.config.ts`).
- Deploy through the existing `[deploy]` commit marker. No SSH step and no manual
  `pnpm db:push`; the first boot after deploy adds the column and backfills.
- **Expect the year-to-date figure to drop** on first load by the total of all
  adjustments entered to date. This is the netting change, not a bug.
- Rollback: reverting the deploy leaves the `category` column in place and unread
  by the previous build, which is harmless. Reported totals revert to gross.

## Files touched

| File | Change |
|---|---|
| `packages/domain/src/schemas.ts` | Category enum, `TransactionRow.category`, stats + expense summary schemas |
| `packages/domain/src/stats.ts` | Netting; category totals; new `computeExpenseSummary` |
| `packages/domain/src/stats.test.ts` | Netting, category, and summary tests |
| `apps/web/db/schema.ts` | `category` column |
| `apps/web/lib/db.ts` | `ensureWalletSchema()` |
| `apps/web/app/actions/wallet.ts` | Category on read/write paths; `getExpenseSummary`, `updateTransactionCategory` |
| `apps/web/components/card-detail-page.tsx` | Category picker; category chip and "Adjustment" label in History |
| `apps/web/components/wallet-home-page.tsx` | Gas / Merch / Total year-to-date tiles |
| `apps/web/components/MainNav.tsx` | New |
| `apps/web/app/(main)/layout.tsx` | Mount nav |
| `apps/web/app/(main)/expenses/page.tsx` | New |
| `apps/web/components/expenses-page.tsx` | New |
| `apps/web/app/(main)/transactions/page.tsx` | Category; "Adjustment" label; drop ad-hoc Home link |
| `apps/web/package.json` | Version 0.3.0 |
| `README.md` | Feature note; amend dual-deployment checklist; note Sheets numeric divergence |
