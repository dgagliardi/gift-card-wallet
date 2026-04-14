export type ParsedReceiptOcr = {
  amount: number | null;
  merchant: string;
  dateText: string;
  remainingBalance: number | null;
  summary: string;
};

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function parseReceiptOcrText(text: string): ParsedReceiptOcr {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const merchant =
    lines.find(
      (l) =>
        /[A-Z]{3,}/.test(l) &&
        !/\d/.test(l) &&
        !/^(THANK YOU|RECEIPT|TRANSACTION|APPROVED)$/i.test(l),
    ) ?? "";
  const dateText =
    text.match(/\b\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\b/)?.[0] ??
    text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0] ??
    "";

  const totalLine =
    lines.find((l) => /\b(total|amount|purchase)\b/i.test(l)) ?? "";
  const totalMatch =
    totalLine.match(/(?:CA\$|C\$|\$)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i) ??
    text.match(/\btotal\b[^\d]*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
  const amount = totalMatch?.[1] ? parseMoney(totalMatch[1]) : null;

  const remainingMatch =
    text.match(
      /(?:remaining\s*balance|balance\s*remaining|new\s*balance|balance)[^\d]*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
    ) ?? null;
  const remainingBalance = remainingMatch?.[1] ? parseMoney(remainingMatch[1]) : null;

  return {
    amount,
    merchant: amount === null ? "" : merchant,
    dateText,
    remainingBalance,
    summary: totalLine,
  };
}
