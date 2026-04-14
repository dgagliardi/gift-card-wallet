export type ParsedReceiptOcr = {
  amount: number | null;
  merchant: string;
  dateText: string;
  remainingBalance: number | null;
  summary: string;
};

function parseMoney(raw: string): number | null {
  const ocrNormalized = raw
    .replace(/[oO]/g, "0")
    .replace(/[sS]/g, "5")
    .replace(/[bB]/g, "8");
  const cleaned = ocrNormalized.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
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

  const totalCandidates = lines.filter(
    (l) =>
      /\b(total|amount|purchase)\b/i.test(l) &&
      !/\b(number|items?)\b/i.test(l),
  );
  const rankedCandidates = totalCandidates
    .map((line) => {
      const tokenMatch = line.match(/([0-9oOsSbB.,]{2,})/g);
      const lastToken = tokenMatch?.at(-1) ?? "";
      const parsed = parseMoney(lastToken);
      return { line, parsed, hasDecimal: /[.,][0-9]{2,3}/.test(lastToken) };
    })
    .filter((x) => x.parsed !== null);
  rankedCandidates.sort((a, b) => {
    if (a.hasDecimal !== b.hasDecimal) return a.hasDecimal ? -1 : 1;
    return b.parsed! - a.parsed!;
  });
  const best = rankedCandidates[0];
  const amount = best?.parsed ?? null;

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
    summary: best?.line ?? "",
  };
}
