import type { CardRow, TransactionRow, WalletStats } from "./schemas";

export function computeWalletStats(
  cards: CardRow[],
  transactions: TransactionRow[],
  now: Date = new Date(),
): WalletStats {
  const activeIds = new Set<string>();
  for (const c of cards) {
    if (!c.archived && c.id) activeIds.add(c.id);
  }

  const cutoff30 = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 30,
  );
  cutoff30.setHours(0, 0, 0, 0);
  const currentYear = now.getFullYear();

  let spentLast30 = 0;
  let spentYear = 0;
  let count30 = 0;

  for (const t of transactions) {
    if (!activeIds.has(t.cardId)) continue;

    const amount = t.amount;
    if (amount <= 0) continue;

    const transDate = t.date instanceof Date ? t.date : new Date(t.date);
    if (Number.isNaN(transDate.getTime())) continue;

    if (transDate.getTime() >= cutoff30.getTime()) {
      spentLast30 += amount;
      count30++;
    }

    if (transDate.getFullYear() === currentYear) {
      spentYear += amount;
    }
  }

  const avgPurchaseLast30 = count30 > 0 ? spentLast30 / count30 : 0;

  return {
    spentLast30: Math.round(spentLast30 * 100) / 100,
    spentYear: Math.round(spentYear * 100) / 100,
    avgPurchaseLast30: Math.round(avgPurchaseLast30 * 100) / 100,
    yearLabel: String(currentYear),
  };
}
