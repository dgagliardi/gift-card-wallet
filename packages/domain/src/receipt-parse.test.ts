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

  it("handles Costco OCR noise and ignores total item count lines", () => {
    const text = `
      TOTAL NUMB R OF PRE-SCANNED ITEMS= 15
      we TOTAL 301.585°
    `;

    expect(parseReceiptOcrText(text)).toEqual({
      amount: 301.58,
      merchant: "",
      dateText: "",
      remainingBalance: null,
      summary: "we TOTAL 301.585°",
    });
  });

  it("uses SUBTOTAL + TAX when TOTAL line is missing", () => {
    const text = `
      SUBTOTAL 294.79
      TAX 6.50
      **** TOTAL (unreadable)
    `;

    const r = parseReceiptOcrText(text);
    expect(r.amount).toBe(301.29);
    expect(r.summary).toContain("SUBTOTAL");
    expect(r.summary).toContain("TAX");
  });

  it("infers total from pair-sum when keywords are garbled but amounts remain", () => {
    const lines = [];
    for (let i = 0; i < 8; i++) lines.push(`ITEM ${i} 12.99`);
    lines.push("294.79");
    lines.push("6.50");
    lines.push("301.29");
    const text = lines.join("\n");

    const r = parseReceiptOcrText(text);
    expect(r.amount).toBe(301.29);
    expect(r.summary).toContain("pair-sum");
  });
});
