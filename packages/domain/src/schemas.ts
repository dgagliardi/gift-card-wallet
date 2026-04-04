import { z } from "zod";

/** Mirrors Sheets `Cards` row (after header). */
export const cardRowSchema = z.object({
  id: z.string(),
  brand: z.string(),
  type: z.string(),
  initialBalance: z.number(),
  archived: z.boolean(),
});

export const transactionRowSchema = z.object({
  cardId: z.string(),
  date: z.coerce.date(),
  amount: z.number(),
});

export const walletStatsSchema = z.object({
  spentLast30: z.number(),
  spentYear: z.number(),
  avgPurchaseLast30: z.number(),
  yearLabel: z.string(),
});

export type CardRow = z.infer<typeof cardRowSchema>;
export type TransactionRow = z.infer<typeof transactionRowSchema>;
export type WalletStats = z.infer<typeof walletStatsSchema>;
