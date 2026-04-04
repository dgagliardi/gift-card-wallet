import type { TransactionRow } from "./schemas";

/**
 * Current balance = initial − sum(amount) for all transactions on this card
 * (same as `getCards` in Apps Script).
 */
export function computeCurrentBalance(
  initialBalance: number,
  transactionsForCard: Pick<TransactionRow, "amount">[],
): number {
  let current = initialBalance;
  for (const t of transactionsForCard) {
    current -= t.amount;
  }
  return current;
}
