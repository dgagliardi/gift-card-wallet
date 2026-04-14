import { describe, expect, it } from "vitest";
import { parseReceiptOcrText } from "./receipt-parse";

describe("parseReceiptOcrText", () => {
  it("extracts amount, merchant, date, and remaining balance", () => {
    const text = `
      COSTCO WHOLESALE
      2026-04-14 10:15
      Total CA$ 37.49
      Remaining Balance: CA$ 462.51
    `;

    expect(parseReceiptOcrText(text)).toEqual({
      amount: 37.49,
      merchant: "COSTCO WHOLESALE",
      dateText: "2026-04-14 10:15",
      remainingBalance: 462.51,
      summary: "Total CA$ 37.49",
    });
  });

  it("returns null amount when no purchase total is found", () => {
    const text = `
      THANK YOU
      ITEM 123
      BALANCE INQUIRY ONLY
    `;

    expect(parseReceiptOcrText(text)).toEqual({
      amount: null,
      merchant: "",
      dateText: "",
      remainingBalance: null,
      summary: "",
    });
  });
});
