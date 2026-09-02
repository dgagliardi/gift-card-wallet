export type ParsedGiftCardOcr = {
  brand: string;
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
    brand: "",
    cardNumber: "",
    pin: "",
    balance: null,
  };

  const cardMatch = text.match(
    /(?:card|account|barcode|number|no\.?|#)\s*(?:number|no\.?|#)?[\s:.-]*([0-9][0-9\s-]{7,})/i,
  ) ?? text.match(/\b([0-9]{4}(?:[\s-][0-9]{4}){1,5})\b/)
    ?? text.match(/\b([0-9]{12,30})\b/);
  if (cardMatch?.[1]) {
    out.cardNumber = normalizeCardNumber(cardMatch[1]);
  }

  const pinMatch = text.match(
    /\b(?:pin|security\s*code|access\s*code|claim\s*code)[\s:.-]*([0-9]{3,8})\b/i,
  );
  if (pinMatch?.[1]) {
    out.pin = pinMatch[1];
  }

  const balanceMatch = text.match(
    /(?:current\s*balance|balance|value|initial\s*value)[^\d]*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
  ) ?? text.match(/(?:CA\$|C\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
  if (balanceMatch?.[1]) {
    out.balance = parseBalance(balanceMatch[1]);
  }

  const brandLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => {
      if (line.length < 3 || line.length > 48) return false;
      if (!/[a-z]/i.test(line)) return false;
      if (
        /\d{4,}|balance|initial\s*value|card\s*(number|no\.?|#)|barcode|pin|security|access|claim/i.test(
          line,
        )
      ) {
        return false;
      }
      return true;
    });
  if (brandLine) {
    out.brand = brandLine.replace(/\s+/g, " ");
  }

  return out;
}
