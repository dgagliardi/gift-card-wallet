export type ParsedGiftCardOcr = {
  cardNumber: string;
  pin: string;
  balance: number | null;
};

function normalizeCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return "";
  return digits.match(/.{1,4}/g)?.join(" ") ?? digits;
}

function parseBalance(raw: string): number | null {
  const normalized = raw.replace(/[^0-9.,]/g, "");
  if (!normalized) return null;

  // Handle values like 1,234.56 and 1234.56
  const asDotDecimal = normalized.replace(/,/g, "");
  const value = Number.parseFloat(asDotDecimal);
  return Number.isFinite(value) ? value : null;
}

export function parseGiftCardOcrText(text: string): ParsedGiftCardOcr {
  const out: ParsedGiftCardOcr = {
    cardNumber: "",
    pin: "",
    balance: null,
  };

  const cardMatch = text.match(
    /card\s*number[\s:.-]*([0-9][0-9\s-]{7,})/i,
  ) ?? text.match(/\b([0-9]{4}(?:[\s-][0-9]{4}){1,5})\b/);
  if (cardMatch?.[1]) {
    out.cardNumber = normalizeCardNumber(cardMatch[1]);
  }

  const pinMatch = text.match(/\bpin[\s:.-]*([0-9]{3,8})\b/i);
  if (pinMatch?.[1]) {
    out.pin = pinMatch[1];
  }

  const balanceMatch = text.match(
    /(?:current\s*balance|balance|value|initial\s*value)[^\d]*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
  ) ?? text.match(/(?:CA\$|C\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
  if (balanceMatch?.[1]) {
    out.balance = parseBalance(balanceMatch[1]);
  }

  return out;
}
