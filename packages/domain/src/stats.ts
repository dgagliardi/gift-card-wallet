import type {
  CardRow,
  CategoryTotals,
  ExpenseSummary,
  TransactionRow,
  WalletStats,
} from "./schemas";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeWalletStats(
  _cards: CardRow[],
  transactions: TransactionRow[],
  now: Date = new Date(),
): WalletStats {
  const cutoff30 = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 30,
  );
  cutoff30.setHours(0, 0, 0, 0);
  const currentYear = now.getFullYear();

  let spentLast30 = 0;
  let spentYearGas = 0;
  let spentYearMerchandise = 0;
  let purchaseTotal30 = 0;
  let purchaseCount30 = 0;

  for (const t of transactions) {
    const transDate = t.date instanceof Date ? t.date : new Date(t.date);
    if (Number.isNaN(transDate.getTime())) continue;

    if (transDate.getTime() >= cutoff30.getTime()) {
      spentLast30 += t.amount;
      // Average purchase size answers "how big is a typical purchase", so
      // adjustments are excluded from both numerator and denominator.
      if (t.amount > 0) {
        purchaseTotal30 += t.amount;
        purchaseCount30++;
      }
    }

    if (transDate.getFullYear() === currentYear) {
      if (t.category === "merchandise") spentYearMerchandise += t.amount;
      else spentYearGas += t.amount;
    }
  }

  const avgPurchaseLast30 =
    purchaseCount30 > 0 ? purchaseTotal30 / purchaseCount30 : 0;

  // Derive the year total from the rounded category figures rather than from
  // its own raw sum, so the three numbers shown together always reconcile.
  // Rounding independently would not: 112.4 + 164.55 is 276.95000000000005.
  const gas = round2(spentYearGas);
  const merchandise = round2(spentYearMerchandise);

  return {
    spentLast30: round2(spentLast30),
    spentYear: round2(gas + merchandise),
    spentYearGas: gas,
    spentYearMerchandise: merchandise,
    avgPurchaseLast30: round2(avgPurchaseLast30),
    yearLabel: String(currentYear),
  };
}

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

/**
 * Spending broken down by year and by month, net of adjustments.
 *
 * `months` covers all twelve months of every year present, including months
 * with no activity, so the view layer never has to gap-fill a calendar.
 */
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
