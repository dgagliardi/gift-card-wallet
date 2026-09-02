import { z } from "zod";

/** Mirrors Sheets `Cards` row (after header). */
export const cardRowSchema = z.object({
  id: z.string(),
  brand: z.string(),
  type: z.string(),
  initialBalance: z.number(),
  archived: z.boolean(),
});

/**
 * Every transaction is exactly one of these. A negative amount is an
 * adjustment correcting an overstated charge, so it carries the same category
 * as the charge it corrects — "adjustment" is never a stored category.
 */
export const transactionCategorySchema = z.enum(["gas", "merchandise"]);

export const transactionRowSchema = z.object({
  cardId: z.string(),
  date: z.coerce.date(),
  amount: z.number(),
  category: transactionCategorySchema,
});

export const walletStatsSchema = z.object({
  spentLast30: z.number(),
  spentYear: z.number(),
  spentYearGas: z.number(),
  spentYearMerchandise: z.number(),
  avgPurchaseLast30: z.number(),
  yearLabel: z.string(),
});

export const categoryTotalsSchema = z.object({
  gas: z.number(),
  merchandise: z.number(),
  /**
   * Memo figure: the sum of negative amounts, reported as a positive number.
   * Already netted into `gas` and `merchandise` — never subtract it again.
   */
  adjustments: z.number(),
  total: z.number(),
});

export const expenseSummarySchema = z.object({
  years: z.array(z.object({ year: z.number(), totals: categoryTotalsSchema })),
  months: z.array(
    z.object({
      year: z.number(),
      month: z.number(),
      totals: categoryTotalsSchema,
    }),
  ),
});

export type CardRow = z.infer<typeof cardRowSchema>;
export type TransactionCategory = z.infer<typeof transactionCategorySchema>;
export type TransactionRow = z.infer<typeof transactionRowSchema>;
export type WalletStats = z.infer<typeof walletStatsSchema>;
export type CategoryTotals = z.infer<typeof categoryTotalsSchema>;
export type ExpenseSummary = z.infer<typeof expenseSummarySchema>;

/** Physical cards buy gas; digital cards buy merchandise. Sign is irrelevant. */
export function categoryForCardType(cardType: string): TransactionCategory {
  return cardType === "Digital" ? "merchandise" : "gas";
}
