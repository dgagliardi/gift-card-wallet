import { describe, expect, it } from "vitest";
import { parseGiftCardOcrText } from "./ocr-parse";

describe("parseGiftCardOcrText", () => {
  it("extracts card number, pin, and balance from Costco-like OCR text", () => {
    const text = `
      Digital Costco Shop Card
      Current Balance: CA$ 500.00
      Card Number: 6349 4456 8830 3401
      PIN: 6422
    `;

    expect(parseGiftCardOcrText(text)).toEqual({
      brand: "Digital Costco Shop Card",
      cardNumber: "6349 4456 8830 3401",
      pin: "6422",
      balance: 500,
    });
  });

  it("handles noisy OCR with separators and currency variants", () => {
    const text = `
      Current Balance CA $1,234.56
      CARD NUMBER 6349-4456-8830-3401
      pin  6422
    `;

    expect(parseGiftCardOcrText(text)).toEqual({
      brand: "",
      cardNumber: "6349 4456 8830 3401",
      pin: "6422",
      balance: 1234.56,
    });
  });

  it("returns partial results when only some fields are found", () => {
    const text = `
      Costco
      PIN: 9876
    `;

    expect(parseGiftCardOcrText(text)).toEqual({
      brand: "Costco",
      cardNumber: "",
      pin: "9876",
      balance: null,
    });
  });

  it("extracts a bare barcode value as the card number", () => {
    expect(parseGiftCardOcrText("6349445688303401")).toEqual({
      brand: "",
      cardNumber: "6349 4456 8830 3401",
      pin: "",
      balance: null,
    });
  });

  it("handles alternate physical card labels", () => {
    const text = `
      Starbucks Gift Card
      Card #: 6098 1234 5678 9012
      Access Code: 123456
      Initial Value $25.00
    `;

    expect(parseGiftCardOcrText(text)).toEqual({
      brand: "Starbucks Gift Card",
      cardNumber: "6098 1234 5678 9012",
      pin: "123456",
      balance: 25,
    });
  });
});
