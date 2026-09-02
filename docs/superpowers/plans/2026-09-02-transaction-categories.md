# Transaction Categories, Expenses View, and Top Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify every gift-card transaction as gas or merchandise, backfill the existing database from card type, report year-to-date spend by category net of adjustments, add an expenses view across years, and add persistent top navigation.

**Architecture:** Category is a `NOT NULL` column on `gift_card_transaction` holding exactly `"gas"` or `"merchandise"`. Pure functions in `packages/domain` compute all money figures; `apps/web` reads them through server actions. The column is added and backfilled at SQLite handle construction in `lib/db.ts`, because the deploy workflow never runs `pnpm db:push`. "Adjustment" is derived from a negative amount at render time and never stored.

**Tech Stack:** pnpm workspaces, TypeScript, Zod, Vitest, Next.js 15 (App Router, server actions), Drizzle ORM, better-sqlite3, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-02-transaction-categories-design.md`

## Global Constraints

- Category values are exactly `"gas"` and `"merchandise"`. No third value, no empty string, no null, at any layer.
- A negative amount is an adjustment. It takes the same category as any other transaction on that card and is **never** stored as a distinct category.
- Money is rounded with the existing convention: `Math.round(x * 100) / 100`.
- Card type mapping is `Digital → merchandise`, everything else → `gas`.
- `apps/sheets/**` is not modified. The Sheets app is the superseded MVP.
- `components/wallet-home.tsx` (dead code) is not modified or deleted.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Do not add a `[deploy]` marker to any commit in this plan; deployment is a separate decision.

## File Structure

| File | Responsibility |
|---|---|
| `packages/domain/src/schemas.ts` | Category enum, `TransactionRow.category`, stats and expense-summary shapes |
| `packages/domain/src/stats.ts` | `computeWalletStats` (netted, category-split), `computeExpenseSummary` |
| `packages/domain/src/stats.test.ts` | Domain tests |
| `apps/web/lib/schema-bootstrap.ts` | **New.** Pure `ensureWalletSchema(sqlite)` — column add + backfill + per-boot repair. Isolated from `lib/db.ts` so it is testable without importing Next.js module graph. |
| `apps/web/lib/schema-bootstrap.test.ts` | **New.** Migration correctness and idempotency against a temp SQLite file |
| `apps/web/lib/db.ts` | Calls `ensureWalletSchema` before `drizzle()` |
| `apps/web/db/schema.ts` | `category` column |
| `apps/web/app/actions/wallet.ts` | Category on read/write paths; `updateTransactionCategory`; `getExpenseSummary` |
| `apps/web/components/category-toggle.tsx` | **New.** Shared Gas/Merchandise segmented control, used by the entry form and the history chip |
| `apps/web/components/card-detail-page.tsx` | Entry-form category picker; history chip; "Adjustment" label |
| `apps/web/components/wallet-home-page.tsx` | Gas / Merchandise / Total year-to-date tiles |
| `apps/web/components/MainNav.tsx` | **New.** Sticky nav row with active-route highlight |
| `apps/web/app/(main)/layout.tsx` | Mount `MainNav` |
| `apps/web/components/expenses-page.tsx` | **New.** Year-over-year table + monthly detail + year selector |
| `apps/web/app/(main)/expenses/page.tsx` | **New.** Server component route |
| `apps/web/app/(main)/transactions/page.tsx` | Category display, "Adjustment" label, drop ad-hoc Home link |

**Deviation from the spec's file list:** the spec put the bootstrap inside `lib/db.ts`. Splitting it into `lib/schema-bootstrap.ts` is required to test it — `lib/db.ts` opens a real database as a module side effect and cannot be imported under test. This also adds `vitest` as a devDependency of `apps/web` and a `test` script, so the root `pnpm test` (`pnpm -r test`) picks it up.

---

### Task 1: Category type and transaction shape

**Files:**
- Modify: `packages/domain/src/schemas.ts`

**Interfaces:**
- Produces: `transactionCategorySchema`, `type TransactionCategory = "gas" | "merchandise"`, `TransactionRow.category`, `categoryForCardType(cardType: string): TransactionCategory`

- [ ] **Step 1: Add the enum, the field, and the mapping helper**

In `packages/domain/src/schemas.ts`, after `cardRowSchema`:

```ts
export const transactionCategorySchema = z.enum(["gas", "merchandise"]);

export const transactionRowSchema = z.object({
  cardId: z.string(),
  date: z.coerce.date(),
  amount: z.number(),
  category: transactionCategorySchema,
});
```

Replace the existing `transactionRowSchema` rather than adding a second one. Then extend the exported types:

```ts
export type TransactionCategory = z.infer<typeof transactionCategorySchema>;
```

And add the single source of truth for the default, which both the app and the
backfill must agree on:

```ts
/** Physical cards buy gas; digital cards buy merchandise. Sign is irrelevant. */
export function categoryForCardType(cardType: string): TransactionCategory {
  return cardType === "Digital" ? "merchandise" : "gas";
}
```

- [ ] **Step 2: Extend the stats shape**

Replace `walletStatsSchema` with:

```ts
export const walletStatsSchema = z.object({
  spentLast30: z.number(),
  spentYear: z.number(),
  spentYearGas: z.number(),
  spentYearMerchandise: z.number(),
  avgPurchaseLast30: z.number(),
  yearLabel: z.string(),
});
```

- [ ] **Step 3: Add the expense-summary shape**

```ts
export const categoryTotalsSchema = z.object({
  gas: z.number(),
  merchandise: z.number(),
  /** Memo: sum of negative amounts as a positive figure. Already netted into gas/merchandise. */
  adjustments: z.number(),
  total: z.number(),
});

export const expenseSummarySchema = z.object({
  years: z.array(z.object({ year: z.number(), totals: categoryTotalsSchema })),
  months: z.array(
    z.object({ year: z.number(), month: z.number(), totals: categoryTotalsSchema }),
  ),
});

export type CategoryTotals = z.infer<typeof categoryTotalsSchema>;
export type ExpenseSummary = z.infer<typeof expenseSummarySchema>;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @gift-card-wallet/domain exec tsc --noEmit`
Expected: FAIL — `stats.ts` does not yet return the new fields. This confirms the
type change is load-bearing. Task 2 fixes it.

- [ ] **Step 5: Do not commit yet.** Task 1 and Task 2 land together; the tree does not typecheck in between.

---

### Task 2: Net adjustments and split year-to-date by category

**Files:**
- Modify: `packages/domain/src/stats.ts`
- Test: `packages/domain/src/stats.test.ts`

**Interfaces:**
- Consumes: `TransactionRow.category`, `WalletStats` from Task 1
- Produces: `computeWalletStats(cards, transactions, now?) => WalletStats` with `spentYearGas` / `spentYearMerchandise`, all spend figures net of negatives

- [ ] **Step 1: Write the failing tests**

Add to `packages/domain/src/stats.test.ts`. Note every fixture transaction now
needs a `category`.

```ts
describe("computeWalletStats categories and adjustments", () => {
  const cards = [
    { id: "p", brand: "Costco", type: "Physical", initialBalance: 100, archived: false },
    { id: "d", brand: "Costco", type: "Digital", initialBalance: 100, archived: false },
  ];

  it("splits year-to-date spend by category", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const s = computeWalletStats(cards, [
      { cardId: "p", date: new Date("2026-06-10"), amount: 60, category: "gas" },
      { cardId: "d", date: new Date("2026-06-11"), amount: 25, category: "merchandise" },
    ], now);
    expect(s.spentYearGas).toBe(60);
    expect(s.spentYearMerchandise).toBe(25);
    expect(s.spentYearGas + s.spentYearMerchandise).toBe(s.spentYear);
  });

  it("nets an adjustment against its own category", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const s = computeWalletStats(cards, [
      { cardId: "p", date: new Date("2026-06-10"), amount: 50, category: "gas" },
      { cardId: "p", date: new Date("2026-06-12"), amount: -10, category: "gas" },
    ], now);
    expect(s.spentYearGas).toBe(40);
    expect(s.spentYear).toBe(40);
    expect(s.spentLast30).toBe(40);
  });

  it("keeps avgPurchaseLast30 gross of adjustments", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const s = computeWalletStats(cards, [
      { cardId: "p", date: new Date("2026-06-10"), amount: 50, category: "gas" },
      { cardId: "p", date: new Date("2026-06-12"), amount: -10, category: "gas" },
    ], now);
    expect(s.avgPurchaseLast30).toBe(50);
  });

  it("excludes prior-year transactions from year-to-date", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const s = computeWalletStats(cards, [
      { cardId: "p", date: new Date("2025-12-20"), amount: 30, category: "gas" },
      { cardId: "p", date: new Date("2026-01-10"), amount: 20, category: "gas" },
    ], now);
    expect(s.spentYear).toBe(20);
    expect(s.spentYearGas).toBe(20);
  });

  it("does not accumulate float drift across cent-valued amounts", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const txs = Array.from({ length: 10 }, () => ({
      cardId: "p", date: new Date("2026-06-10"), amount: 0.1, category: "gas" as const,
    }));
    expect(computeWalletStats(cards, txs, now).spentYearGas).toBe(1);
  });
});
```

Also update the two **existing** tests in this file: add `category` to every
fixture transaction, and change the "ignores non-positive amounts" test — it now
asserts the opposite behavior. Rename it and rewrite its expectations:

```ts
it("nets non-positive amounts into spend", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  const cards = [
    { id: "a", brand: "X", type: "Physical", initialBalance: 50, archived: false },
  ];
  const transactions = [
    { cardId: "a", date: new Date("2026-01-05"), amount: 0, category: "gas" as const },
    { cardId: "a", date: new Date("2026-01-04"), amount: -3, category: "gas" as const },
  ];
  const s = computeWalletStats(cards, transactions, now);
  expect(s.spentLast30).toBe(-3);
  expect(s.avgPurchaseLast30).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @gift-card-wallet/domain test`
Expected: FAIL — `spentYearGas` is `undefined`, and the netting assertions fail
because the current implementation skips `amount <= 0`.

- [ ] **Step 3: Rewrite `computeWalletStats`**

Replace the body of `packages/domain/src/stats.ts`'s `computeWalletStats`:

```ts
export function computeWalletStats(
  _cards: CardRow[],
  transactions: TransactionRow[],
  now: Date = new Date(),
): WalletStats {
  const cutoff30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  cutoff30.setHours(0, 0, 0, 0);
  const currentYear = now.getFullYear();

  let spentLast30 = 0;
  let spentYear = 0;
  let spentYearGas = 0;
  let spentYearMerchandise = 0;
  let purchaseTotal30 = 0;
  let purchaseCount30 = 0;

  for (const t of transactions) {
    const transDate = t.date instanceof Date ? t.date : new Date(t.date);
    if (Number.isNaN(transDate.getTime())) continue;

    const inLast30 = transDate.getTime() >= cutoff30.getTime();
    if (inLast30) {
      spentLast30 += t.amount;
      // Average purchase size answers "how big is a typical purchase", so
      // adjustments are excluded from both numerator and denominator.
      if (t.amount > 0) {
        purchaseTotal30 += t.amount;
        purchaseCount30++;
      }
    }

    if (transDate.getFullYear() === currentYear) {
      spentYear += t.amount;
      if (t.category === "merchandise") spentYearMerchandise += t.amount;
      else spentYearGas += t.amount;
    }
  }

  const avgPurchaseLast30 =
    purchaseCount30 > 0 ? purchaseTotal30 / purchaseCount30 : 0;

  return {
    spentLast30: round2(spentLast30),
    spentYear: round2(spentYear),
    spentYearGas: round2(spentYearGas),
    spentYearMerchandise: round2(spentYearMerchandise),
    avgPurchaseLast30: round2(avgPurchaseLast30),
    yearLabel: String(currentYear),
  };
}
```

Add at the top of the file:

```ts
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @gift-card-wallet/domain test`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @gift-card-wallet/domain exec tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/schemas.ts packages/domain/src/stats.ts packages/domain/src/stats.test.ts
git commit -m "$(printf 'Split wallet stats by category and net adjustments\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 3: `computeExpenseSummary`

**Files:**
- Modify: `packages/domain/src/stats.ts`
- Test: `packages/domain/src/stats.test.ts`

**Interfaces:**
- Consumes: `TransactionRow`, `CategoryTotals`, `ExpenseSummary`
- Produces: `computeExpenseSummary(transactions: TransactionRow[], now?: Date): ExpenseSummary`

- [ ] **Step 1: Write the failing tests**

```ts
describe("computeExpenseSummary", () => {
  it("groups years descending and nets adjustments into their category", () => {
    const r = computeExpenseSummary([
      { cardId: "p", date: new Date("2025-03-02"), amount: 40, category: "gas" },
      { cardId: "p", date: new Date("2026-03-02"), amount: 50, category: "gas" },
      { cardId: "p", date: new Date("2026-03-09"), amount: -10, category: "gas" },
      { cardId: "d", date: new Date("2026-04-01"), amount: 25, category: "merchandise" },
    ], new Date("2026-06-15T12:00:00Z"));

    expect(r.years.map((y) => y.year)).toEqual([2026, 2025]);
    const y26 = r.years[0].totals;
    expect(y26.gas).toBe(40);
    expect(y26.merchandise).toBe(25);
    expect(y26.adjustments).toBe(10);
    expect(y26.total).toBe(65);
  });

  it("emits all twelve months of every year present, including zeroes", () => {
    const r = computeExpenseSummary([
      { cardId: "p", date: new Date("2026-03-02"), amount: 50, category: "gas" },
    ], new Date("2026-06-15T12:00:00Z"));

    const m2026 = r.months.filter((m) => m.year === 2026);
    expect(m2026).toHaveLength(12);
    expect(m2026.map((m) => m.month)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
    expect(m2026[2].totals.gas).toBe(50);
    expect(m2026[0].totals.total).toBe(0);
  });

  it("returns empty arrays for no transactions", () => {
    const r = computeExpenseSummary([], new Date("2026-06-15T12:00:00Z"));
    expect(r.years).toEqual([]);
    expect(r.months).toEqual([]);
  });
});
```

Add `computeExpenseSummary` to the import at the top of `stats.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @gift-card-wallet/domain test`
Expected: FAIL — `computeExpenseSummary is not a function`

- [ ] **Step 3: Implement**

Append to `packages/domain/src/stats.ts`:

```ts
function emptyTotals(): CategoryTotals {
  return { gas: 0, merchandise: 0, adjustments: 0, total: 0 };
}

function addToTotals(totals: CategoryTotals, t: TransactionRow): void {
  if (t.category === "merchandise") totals.merchandise += t.amount;
  else totals.gas += t.amount;
  if (t.amount < 0) totals.adjustments += -t.amount;
}

function finalizeTotals(totals: CategoryTotals): CategoryTotals {
  const gas = round2(totals.gas);
  const merchandise = round2(totals.merchandise);
  return {
    gas,
    merchandise,
    adjustments: round2(totals.adjustments),
    total: round2(gas + merchandise),
  };
}

export function computeExpenseSummary(
  transactions: TransactionRow[],
  _now: Date = new Date(),
): ExpenseSummary {
  const byYear = new Map<number, CategoryTotals>();
  const byMonth = new Map<string, CategoryTotals>();

  for (const t of transactions) {
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    const yearTotals = byYear.get(year) ?? emptyTotals();
    addToTotals(yearTotals, t);
    byYear.set(year, yearTotals);

    const key = `${year}-${month}`;
    const monthTotals = byMonth.get(key) ?? emptyTotals();
    addToTotals(monthTotals, t);
    byMonth.set(key, monthTotals);
  }

  const years = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, totals]) => ({ year, totals: finalizeTotals(totals) }));

  // Every month of every year present, so the view never gap-fills.
  const months = years
    .map((y) => y.year)
    .flatMap((year) =>
      Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const totals = byMonth.get(`${year}-${month}`) ?? emptyTotals();
        return { year, month, totals: finalizeTotals(totals) };
      }),
    );

  return { years, months };
}
```

Import `CategoryTotals` and `ExpenseSummary` from `./schemas` at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @gift-card-wallet/domain test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/stats.ts packages/domain/src/stats.test.ts
git commit -m "$(printf 'Add computeExpenseSummary for year and month breakdowns\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 4: Database column and boot-time backfill

**Files:**
- Modify: `apps/web/db/schema.ts`
- Create: `apps/web/lib/schema-bootstrap.ts`
- Create: `apps/web/lib/schema-bootstrap.test.ts`
- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/lib/db.ts`, `apps/web/package.json`

**Interfaces:**
- Consumes: `categoryForCardType` from Task 1
- Produces: `ensureWalletSchema(sqlite: Database.Database): void`

- [ ] **Step 1: Add the column to the Drizzle schema**

In `apps/web/db/schema.ts`, inside `giftCardTransaction`, after `amount`:

```ts
    category: text("category").notNull(),
```

- [ ] **Step 2: Add vitest to `apps/web`**

In `apps/web/package.json`, add `"test": "vitest run"` to `scripts` and
`"vitest": "^4.1.0"` to `devDependencies`. Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

Run: `pnpm install`

- [ ] **Step 3: Write the failing test**

Create `apps/web/lib/schema-bootstrap.test.ts`:

```ts
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureWalletSchema } from "./schema-bootstrap";

let sqlite: Database.Database;

function seed() {
  sqlite.exec(`
    CREATE TABLE gift_card (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL
    );
    CREATE TABLE gift_card_transaction (
      id TEXT PRIMARY KEY,
      cardId TEXT NOT NULL,
      amount REAL NOT NULL
    );
    INSERT INTO gift_card (id, type) VALUES ('p', 'Physical'), ('d', 'Digital');
    INSERT INTO gift_card_transaction (id, cardId, amount) VALUES
      ('t1', 'p', 50),
      ('t2', 'p', -10),
      ('t3', 'd', 25);
  `);
}

function categories() {
  return sqlite
    .prepare("SELECT id, category FROM gift_card_transaction ORDER BY id")
    .all() as { id: string; category: string }[];
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  seed();
});

afterEach(() => sqlite.close());

describe("ensureWalletSchema", () => {
  it("adds the category column and classifies by card type", () => {
    ensureWalletSchema(sqlite);
    expect(categories()).toEqual([
      { id: "t1", category: "gas" },
      { id: "t2", category: "gas" },
      { id: "t3", category: "merchandise" },
    ]);
  });

  it("leaves no row outside the two legal values", () => {
    ensureWalletSchema(sqlite);
    const bad = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM gift_card_transaction WHERE category NOT IN ('gas','merchandise')",
      )
      .get() as { n: number };
    expect(bad.n).toBe(0);
  });

  it("is idempotent and does not revert a manual re-classification", () => {
    ensureWalletSchema(sqlite);
    sqlite.prepare("UPDATE gift_card_transaction SET category = 'merchandise' WHERE id = 't1'").run();
    ensureWalletSchema(sqlite);
    expect(categories()).toEqual([
      { id: "t1", category: "merchandise" },
      { id: "t2", category: "gas" },
      { id: "t3", category: "merchandise" },
    ]);
  });

  it("repairs a row holding an illegal value", () => {
    ensureWalletSchema(sqlite);
    sqlite.prepare("UPDATE gift_card_transaction SET category = '' WHERE id = 't3'").run();
    ensureWalletSchema(sqlite);
    expect(categories().find((r) => r.id === "t3")?.category).toBe("merchandise");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @gift-card-wallet/web test`
Expected: FAIL — cannot resolve `./schema-bootstrap`

- [ ] **Step 5: Implement the bootstrap**

Create `apps/web/lib/schema-bootstrap.ts`:

```ts
import type Database from "better-sqlite3";

const TABLE = "gift_card_transaction";

/**
 * Converge the live SQLite file on the current schema.
 *
 * The deploy workflow never runs `pnpm db:push`, so a column that exists only
 * in the Drizzle schema would not exist in the database and every transaction
 * query would throw. Running the DDL here guarantees schema-before-first-query
 * ordering that a separate deploy step cannot.
 */
export function ensureWalletSchema(sqlite: Database.Database): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${TABLE})`).all() as {
    name: string;
  }[];

  // Physical cards buy gas; digital cards buy merchandise. Sign is irrelevant:
  // a negative amount is an adjustment to a charge in the same category.
  const classify = `
    UPDATE ${TABLE}
    SET category = (
      SELECT CASE WHEN gc.type = 'Digital' THEN 'merchandise' ELSE 'gas' END
      FROM gift_card gc WHERE gc.id = ${TABLE}."cardId"
    )
    WHERE EXISTS (SELECT 1 FROM gift_card gc WHERE gc.id = ${TABLE}."cardId")
  `;

  if (!columns.some((c) => c.name === "category")) {
    // SQLite demands a non-null default when adding a NOT NULL column to a
    // table with rows. The placeholder is overwritten before this transaction
    // commits, so no reader ever observes it.
    sqlite.transaction(() => {
      sqlite.exec(
        `ALTER TABLE ${TABLE} ADD COLUMN category TEXT NOT NULL DEFAULT 'merchandise'`,
      );
      sqlite.exec(classify);
    })();
    return;
  }

  // Per-boot repair: enforce "every row holds a legal value" as an invariant
  // rather than an assumption. Rows already holding gas or merchandise are
  // untouched, so a manual re-classification is never reverted.
  sqlite.exec(`${classify} AND category NOT IN ('gas','merchandise')`);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @gift-card-wallet/web test`
Expected: PASS (4 tests)

- [ ] **Step 7: Wire it into `lib/db.ts`**

In `apps/web/lib/db.ts`, after `sqlite.pragma("journal_mode = WAL");`:

```ts
ensureWalletSchema(sqlite);
```

with `import { ensureWalletSchema } from "./schema-bootstrap";` at the top.

- [ ] **Step 8: Commit**

```bash
git add apps/web/db/schema.ts apps/web/lib/schema-bootstrap.ts apps/web/lib/schema-bootstrap.test.ts apps/web/lib/db.ts apps/web/vitest.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "$(printf 'Add transaction category column with boot-time backfill\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 5: Server actions

**Files:**
- Modify: `apps/web/app/actions/wallet.ts`

**Interfaces:**
- Consumes: `categoryForCardType`, `computeExpenseSummary`, `TransactionCategory`
- Produces:
  - `WalletTx.category`, `AllTx.category`, `WalletCard.defaultCategory`
  - `addTransaction(cardId, amount, note, txDateInput?, category?)`
  - `updateTransactionCategory(txId, cardId, category): Promise<WalletTx[]>`
  - `getExpenseSummary(): Promise<ExpenseSummary>`

- [ ] **Step 1: Carry category on the read paths**

Add `category: TransactionCategory` to the `WalletTx` and `AllTx` types, and
`defaultCategory: TransactionCategory` to `WalletCard`. In `getWalletPayload`,
map `category: t.category` into `transRows` and set
`defaultCategory: categoryForCardType(c.type)` on each returned card. In
`getTransactions` and `getAllTransactions`, include `category` in the selected
columns and the returned objects.

- [ ] **Step 2: Accept a category when adding**

```ts
export async function addTransaction(
  cardId: string,
  amount: number,
  note: string,
  txDateInput?: string,
  category?: TransactionCategory,
) {
```

Resolve it against the card so the action is safe even if a caller omits it:

```ts
  const card = await db
    .select({ type: giftCard.type })
    .from(giftCard)
    .where(and(eq(giftCard.id, cardId), eq(giftCard.userId, uid)))
    .limit(1);
  if (card.length === 0) return getWalletPayload();
  const resolved = category ?? categoryForCardType(card[0].type);
```

and pass `category: resolved` in the insert. Note this also closes a small hole:
the previous implementation inserted against `cardId` without verifying the card
belonged to the session user.

- [ ] **Step 3: Add the re-classification action**

```ts
export async function updateTransactionCategory(
  txId: string,
  cardId: string,
  category: TransactionCategory,
): Promise<WalletTx[]> {
  const session = await requireSession();
  const uid = session.user.id;

  await db
    .update(giftCardTransaction)
    .set({ category, updatedAt: new Date() })
    .where(
      and(
        eq(giftCardTransaction.id, txId),
        eq(giftCardTransaction.cardId, cardId),
        eq(giftCardTransaction.userId, uid),
      ),
    );

  revalidatePath("/");
  return getTransactions(cardId);
}
```

- [ ] **Step 4: Add the expense summary action**

```ts
export async function getExpenseSummary(): Promise<ExpenseSummary> {
  const session = await requireSession();
  const rows = await db
    .select({
      cardId: giftCardTransaction.cardId,
      date: giftCardTransaction.date,
      amount: giftCardTransaction.amount,
      category: giftCardTransaction.category,
    })
    .from(giftCardTransaction)
    .where(eq(giftCardTransaction.userId, session.user.id));

  return computeExpenseSummary(
    rows.map((r) => ({
      cardId: r.cardId,
      date: new Date(r.date),
      amount: r.amount,
      category: r.category as TransactionCategory,
    })),
  );
}
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm --filter @gift-card-wallet/web lint`
Expected: PASS, or only errors in components that Task 6 and 7 fix. Do not
proceed to commit until `wallet.ts` itself is clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/actions/wallet.ts
git commit -m "$(printf 'Carry transaction category through server actions\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 6: Category picker and history chip

**Files:**
- Create: `apps/web/components/category-toggle.tsx`
- Modify: `apps/web/components/card-detail-page.tsx`

**Interfaces:**
- Consumes: `updateTransactionCategory`, `addTransaction`, `WalletCard.defaultCategory`
- Produces: `<CategoryToggle value onChange size? disabled? />`

- [ ] **Step 1: Build the shared toggle**

Create `apps/web/components/category-toggle.tsx`:

```tsx
"use client";

import type { TransactionCategory } from "@gift-card-wallet/domain";

const OPTIONS: { value: TransactionCategory; label: string }[] = [
  { value: "gas", label: "Gas" },
  { value: "merchandise", label: "Merchandise" },
];

export function CategoryToggle({
  value,
  onChange,
  size = "md",
  disabled = false,
}: {
  value: TransactionCategory;
  onChange: (next: TransactionCategory) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1.5 text-sm";
  return (
    <div
      className="inline-grid grid-cols-2 rounded-lg border border-slate-300 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-950"
      role="group"
      aria-label="Transaction category"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition-colors ${pad} ${
            value === o.value
              ? "bg-teal-600 text-white"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the picker to the entry form**

In `card-detail-page.tsx`, add state seeded from the card:

```tsx
const [txCategory, setTxCategory] = useState<TransactionCategory>(
  initialCard.defaultCategory,
);
```

Render `<CategoryToggle value={txCategory} onChange={setTxCategory} />` inside
the `submitTx` form, on its own full-width row above the Add button. Pass it
through: `await addTransaction(card.id, amt, txNote, txDate, txCategory);` and
reset to `card.defaultCategory` after a successful submit, alongside the existing
`setTxAmount("")` / `setTxNote("")`.

- [ ] **Step 3: Label adjustments and add the history chip**

In the History list, replace the `{t.amount < 0 ? "Credit" : "Purchase"}` text
with `{t.amount < 0 ? "Adjustment" : "Purchase"}`, and add beneath each row:

```tsx
<div className="mt-1">
  <CategoryToggle
    size="sm"
    disabled={pending}
    value={t.category}
    onChange={(next) => {
      startTransition(async () => {
        setTxList(await updateTransactionCategory(t.id, card.id, next));
        refresh();
      });
    }}
  />
</div>
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @gift-card-wallet/web lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/category-toggle.tsx apps/web/components/card-detail-page.tsx
git commit -m "$(printf 'Add category picker to transaction entry and history\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 7: Home page tiles

**Files:**
- Modify: `apps/web/components/wallet-home-page.tsx`

- [ ] **Step 1: Replace the stats grid**

Swap the existing four-cell grid for three tiles. Drop the
"Avg purchase (30d)" cell; keep the "Transaction History →" button.

```tsx
<div className="mt-2 grid grid-cols-3 gap-2 text-sm">
  <div>
    <div className="text-xs text-slate-500">Gas YTD</div>
    <div className="font-semibold">${initialStats.spentYearGas.toFixed(2)}</div>
  </div>
  <div>
    <div className="text-xs text-slate-500">Merchandise YTD</div>
    <div className="font-semibold">${initialStats.spentYearMerchandise.toFixed(2)}</div>
  </div>
  <div>
    <div className="text-xs text-slate-500">Total YTD</div>
    <div className="font-semibold">${initialStats.spentYear.toFixed(2)}</div>
  </div>
</div>
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm --filter @gift-card-wallet/web lint`

```bash
git add apps/web/components/wallet-home-page.tsx
git commit -m "$(printf 'Show year-to-date spend split by category on home\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 8: Navigation, expenses page, transactions page

**Files:**
- Create: `apps/web/components/MainNav.tsx`, `apps/web/components/expenses-page.tsx`, `apps/web/app/(main)/expenses/page.tsx`
- Modify: `apps/web/app/(main)/layout.tsx`, `apps/web/app/(main)/transactions/page.tsx`

- [ ] **Step 1: Build the nav**

`apps/web/components/MainNav.tsx` — client component using `usePathname()`.
Items: `{ href: "/", label: "Cards" }`, `{ href: "/expenses", label: "Expenses" }`,
`{ href: "/transactions", label: "History" }`. Prefix every `href` with
`process.env.NEXT_PUBLIC_BASE_PATH || ""`, matching how the header title already
builds its link. Active detection must compare against the pathname with the base
path stripped, and `/` must match exactly rather than by prefix, or every route
highlights Cards. Style: sticky row, teal text and a teal bottom border on the
active item, muted slate otherwise.

- [ ] **Step 2: Mount it in the layout**

In `apps/web/app/(main)/layout.tsx`, render `<MainNav />` as a second row inside
the existing `<header>`, below the title row, so it inherits the sticky
positioning and backdrop blur.

- [ ] **Step 3: Build the expenses page**

`apps/web/app/(main)/expenses/page.tsx`:

```tsx
import { ExpensesPage } from "@/components/expenses-page";
import { getExpenseSummary } from "@/app/actions/wallet";

export default async function Page() {
  const summary = await getExpenseSummary();
  return <ExpensesPage summary={summary} />;
}
```

`apps/web/components/expenses-page.tsx` — client component holding the selected
year in state, defaulting to `summary.years[0]?.year`. Two sections:

1. **Year over year** — a table with columns Year / Gas / Merchandise /
   Adjustments / Total, rows from `summary.years`.
2. **`{selectedYear}` by month** — a table over
   `summary.months.filter((m) => m.year === selectedYear)`, same columns with
   the month name in place of the year. Render month names via
   `new Date(2000, month - 1, 1).toLocaleString(undefined, { month: "short" })`.

The Adjustments cell is muted and parenthesised — `($10.00)` — because it is a
memo already netted into Gas and Merchandise, not an addend. Add a one-line
footnote saying exactly that.

Year selector: a row of buttons over `summary.years.map((y) => y.year)`, styled
like the existing Active/Archived switcher in `wallet-home-page.tsx`. Render it
only when there is more than one year.

Empty state: when `summary.years.length === 0`, render a single bordered message
("No transactions yet.") instead of the tables.

Wrap both tables in `overflow-x-auto` so five columns never force the page body
to scroll sideways on a phone.

- [ ] **Step 4: Update the transactions page**

In `apps/web/app/(main)/transactions/page.tsx`: remove the `Link` to `/` and its
import, change `{t.amount < 0 ? "Credit" : "Purchase"}` to
`{t.amount < 0 ? "Adjustment" : "Purchase"}`, and add the category to the
metadata line — `{t.date} · {t.cardType} · {label} · {categoryLabel}` where
`categoryLabel` is `"Gas"` or `"Merchandise"`.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @gift-card-wallet/web lint && pnpm --filter @gift-card-wallet/web build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/MainNav.tsx apps/web/components/expenses-page.tsx "apps/web/app/(main)/expenses/page.tsx" "apps/web/app/(main)/layout.tsx" "apps/web/app/(main)/transactions/page.tsx"
git commit -m "$(printf 'Add top navigation and expenses view\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 9: Documentation, version, and full verification

**Files:**
- Modify: `README.md`, `apps/web/package.json`

- [ ] **Step 1: Bump the version**

`apps/web/package.json`: `"version": "0.3.0"`. This surfaces on the login footer
through `next.config.ts`.

- [ ] **Step 2: Update the README**

- Add to **Features**: transactions are categorized as gas or merchandise,
  defaulted from card type; a negative amount is an adjustment that nets against
  its category; year-to-date spend is split by category; the Expenses view breaks
  spending down by year and month.
- Reframe the deployment table: the Google Sheets app is the **superseded MVP**,
  kept as a lightweight reference. `apps/web` is the production app.
- Replace the "Dual-deployment checklist (PRs)" section with a note that
  `apps/sheets` is no longer kept in parity, and state the concrete divergence:
  Sheets has no categories and reports spend **gross** of adjustments, so its
  year-to-date figure will read higher than the web app's for any wallet
  containing adjustments.

- [ ] **Step 3: Full verification**

```bash
pnpm test
pnpm --filter @gift-card-wallet/domain exec tsc --noEmit
pnpm lint
pnpm build
```

Expected: all PASS. Record the actual output; do not claim success without it.

- [ ] **Step 4: Manual smoke check**

Run `pnpm dev`, then confirm: nav appears and highlights the active route;
adding a transaction on a physical card defaults to Gas and on a digital card to
Merchandise; tapping a history chip flips the category and the home tiles move;
entering a negative amount shows "Adjustment" and lowers the category total;
`/expenses` renders the year row and twelve month rows.

- [ ] **Step 5: Commit**

```bash
git add README.md apps/web/package.json
git commit -m "$(printf 'Document categories and mark Sheets app as superseded MVP\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage:** §1 data model → Task 1, 4. §2 migration/backfill → Task 4.
§3 entry → Task 6. §4 re-classification → Task 5, 6. §5 adjustments (label,
totals, visibility) → Task 6, 8, 3. §6 stats → Task 2, 3. §7 expenses page →
Task 8. §8 navigation → Task 8. Testing → Tasks 2, 3, 4, 9. Rollout → Task 9.
No gaps.

**Known deviations from the spec, both deliberate:**
1. Bootstrap lives in `lib/schema-bootstrap.ts`, not `lib/db.ts`, so it is
   testable; `lib/db.ts` calls it. Adds `vitest` to `apps/web`.
2. `addTransaction` gains a card-ownership check it did not previously have,
   because it must read the card's type to resolve the default category anyway.

**Type consistency:** `TransactionCategory` is the single category type across
all tasks. `categoryForCardType` is defined once in Task 1 and used by Tasks 4,
5, 6. `CategoryTotals` field names (`gas`, `merchandise`, `adjustments`, `total`)
are identical in Tasks 1, 3, and 8.
