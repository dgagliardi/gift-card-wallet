import { describe, expect, it } from "vitest";
import { computeCurrentBalance } from "./balance";
import { computeExpenseSummary, computeWalletStats } from "./stats";
import { categoryForCardType } from "./schemas";

const CARDS = [
  { id: "p", brand: "Costco", type: "Physical", initialBalance: 100, archived: false },
  { id: "d", brand: "Costco", type: "Digital", initialBalance: 100, archived: true },
];

describe("categoryForCardType", () => {
  it("maps digital to merchandise and everything else to gas", () => {
    expect(categoryForCardType("Digital")).toBe("merchandise");
    expect(categoryForCardType("Physical")).toBe("gas");
    expect(categoryForCardType("")).toBe("gas");
  });
});

describe("computeWalletStats", () => {
  it("includes all transactions regardless of card archive status", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const transactions = [
      { cardId: "p", date: new Date("2026-06-10"), amount: 10, category: "gas" as const },
      { cardId: "p", date: new Date("2026-06-01"), amount: 5, category: "gas" as const },
      { cardId: "d", date: new Date("2026-06-14"), amount: 100, category: "merchandise" as const },
    ];
    const s = computeWalletStats(CARDS, transactions, now);
    expect(s.spentLast30).toBe(115);
    expect(s.yearLabel).toBe("2026");
    expect(s.spentYear).toBe(115);
    expect(s.avgPurchaseLast30).toBe(38.33);
  });

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
});

describe("computeWalletStats categories and adjustments", () => {
  it("splits year-to-date spend by category", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const s = computeWalletStats(
      CARDS,
      [
        { cardId: "p", date: new Date("2026-06-10"), amount: 60, category: "gas" },
        { cardId: "d", date: new Date("2026-06-11"), amount: 25, category: "merchandise" },
      ],
      now,
    );
    expect(s.spentYearGas).toBe(60);
    expect(s.spentYearMerchandise).toBe(25);
    expect(s.spentYearGas + s.spentYearMerchandise).toBe(s.spentYear);
  });

  it("reconciles the year total with amounts that sum imprecisely in binary", () => {
    // Regression: 112.4 + 164.55 === 276.95000000000005, so rounding the year
    // total from its own raw sum left the three displayed figures unable to
    // add up. The total is derived from the rounded parts instead.
    const now = new Date("2026-06-15T12:00:00Z");
    const s = computeWalletStats(
      CARDS,
      [
        { cardId: "p", date: new Date("2026-06-10"), amount: 62.4, category: "gas" },
        { cardId: "p", date: new Date("2026-06-11"), amount: 58.1, category: "gas" },
        { cardId: "p", date: new Date("2026-06-12"), amount: -8.1, category: "gas" },
        { cardId: "d", date: new Date("2026-06-13"), amount: 124.55, category: "merchandise" },
        { cardId: "d", date: new Date("2026-01-05"), amount: 40, category: "merchandise" },
      ],
      now,
    );
    expect(s.spentYearGas).toBe(112.4);
    expect(s.spentYearMerchandise).toBe(164.55);
    expect(s.spentYear).toBe(276.95);
    expect(
      Math.round((s.spentYearGas + s.spentYearMerchandise) * 100) / 100,
    ).toBe(s.spentYear);
  });

  it("nets an adjustment against its own category", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const s = computeWalletStats(
      CARDS,
      [
        { cardId: "p", date: new Date("2026-06-10"), amount: 50, category: "gas" },
        { cardId: "p", date: new Date("2026-06-12"), amount: -10, category: "gas" },
      ],
      now,
    );
    expect(s.spentYearGas).toBe(40);
    expect(s.spentYearMerchandise).toBe(0);
    expect(s.spentYear).toBe(40);
    expect(s.spentLast30).toBe(40);
  });

  it("keeps avgPurchaseLast30 gross of adjustments", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const s = computeWalletStats(
      CARDS,
      [
        { cardId: "p", date: new Date("2026-06-10"), amount: 50, category: "gas" },
        { cardId: "p", date: new Date("2026-06-12"), amount: -10, category: "gas" },
      ],
      now,
    );
    expect(s.avgPurchaseLast30).toBe(50);
  });

  it("excludes prior-year transactions from year-to-date", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const s = computeWalletStats(
      CARDS,
      [
        { cardId: "p", date: new Date("2025-12-20"), amount: 30, category: "gas" },
        { cardId: "p", date: new Date("2026-01-10"), amount: 20, category: "gas" },
      ],
      now,
    );
    expect(s.spentYear).toBe(20);
    expect(s.spentYearGas).toBe(20);
  });

  it("does not accumulate float drift across cent-valued amounts", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const txs = Array.from({ length: 10 }, () => ({
      cardId: "p",
      date: new Date("2026-06-10"),
      amount: 0.1,
      category: "gas" as const,
    }));
    expect(computeWalletStats(CARDS, txs, now).spentYearGas).toBe(1);
  });
});

describe("computeExpenseSummary", () => {
  it("groups years descending and nets adjustments into their category", () => {
    const r = computeExpenseSummary(
      [
        { cardId: "p", date: new Date("2025-03-02"), amount: 40, category: "gas" },
        { cardId: "p", date: new Date("2026-03-02"), amount: 50, category: "gas" },
        { cardId: "p", date: new Date("2026-03-09"), amount: -10, category: "gas" },
        { cardId: "d", date: new Date("2026-04-01"), amount: 25, category: "merchandise" },
      ],
      new Date("2026-06-15T12:00:00Z"),
    );

    expect(r.years.map((y) => y.year)).toEqual([2026, 2025]);
    const y26 = r.years[0].totals;
    expect(y26.gas).toBe(40);
    expect(y26.merchandise).toBe(25);
    expect(y26.adjustments).toBe(10);
    expect(y26.total).toBe(65);
    expect(r.years[1].totals.gas).toBe(40);
    expect(r.years[1].totals.adjustments).toBe(0);
  });

  it("emits all twelve months of every year present, including zeroes", () => {
    const r = computeExpenseSummary(
      [{ cardId: "p", date: new Date("2026-03-02"), amount: 50, category: "gas" }],
      new Date("2026-06-15T12:00:00Z"),
    );

    const m2026 = r.months.filter((m) => m.year === 2026);
    expect(m2026).toHaveLength(12);
    expect(m2026.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(m2026[2].totals.gas).toBe(50);
    expect(m2026[0].totals.total).toBe(0);
  });

  it("returns empty arrays for no transactions", () => {
    const r = computeExpenseSummary([], new Date("2026-06-15T12:00:00Z"));
    expect(r.years).toEqual([]);
    expect(r.months).toEqual([]);
  });
});

describe("computeCurrentBalance", () => {
  it("subtracts transaction amounts from initial", () => {
    expect(computeCurrentBalance(100, [{ amount: 10 }, { amount: 25.5 }])).toBe(64.5);
  });

  it("adds negative transaction amounts back to the current balance", () => {
    expect(computeCurrentBalance(100, [{ amount: 50 }, { amount: -40.74 }])).toBe(90.74);
  });
});
