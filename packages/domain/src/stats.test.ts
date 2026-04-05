import { describe, expect, it } from "vitest";
import { computeCurrentBalance } from "./balance";
import { computeWalletStats } from "./stats";

describe("computeWalletStats", () => {
  it("includes all transactions regardless of card archive status", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const cards = [
      { id: "a", brand: "X", type: "Physical", initialBalance: 50, archived: false },
      { id: "b", brand: "Y", type: "Digital", initialBalance: 20, archived: true },
    ];
    const transactions = [
      { cardId: "a", date: new Date("2026-06-10"), amount: 10 },
      { cardId: "a", date: new Date("2026-06-01"), amount: 5 },
      { cardId: "b", date: new Date("2026-06-14"), amount: 100 },
    ];
    const s = computeWalletStats(cards, transactions, now);
    expect(s.spentLast30).toBe(115);
    expect(s.yearLabel).toBe("2026");
    expect(s.spentYear).toBe(115);
    expect(s.avgPurchaseLast30).toBe(38.33);
  });

  it("ignores non-positive amounts", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const cards = [
      { id: "a", brand: "X", type: "Physical", initialBalance: 50, archived: false },
    ];
    const transactions = [
      { cardId: "a", date: new Date("2026-01-05"), amount: 0 },
      { cardId: "a", date: new Date("2026-01-04"), amount: -3 },
    ];
    const s = computeWalletStats(cards, transactions, now);
    expect(s.spentLast30).toBe(0);
    expect(s.avgPurchaseLast30).toBe(0);
  });
});

describe("computeCurrentBalance", () => {
  it("subtracts transaction amounts from initial", () => {
    expect(
      computeCurrentBalance(100, [{ amount: 10 }, { amount: 25.5 }]),
    ).toBe(64.5);
  });
});
