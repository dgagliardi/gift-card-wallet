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

/** Costco-style: SUBTOTAL + TAX when TOTAL line is unreadable or obscured. */
function extractSubtotalPlusTax(text: string): { amount: number; summary: string } | null {
  const sub = text.match(/SUBTOTAL[^\d]*([0-9oOsSbB.,]+)/i);
  const tax = text.match(/\bTAX\b[^\d]*([0-9oOsSbB.,]+)/i);
  if (!sub?.[1] || !tax?.[1]) return null;
  const s = parseMoney(sub[1]);
  const t = parseMoney(tax[1]);
  if (s === null || t === null) return null;
  const amount = Math.round((s + t) * 100) / 100;
  return { amount, summary: `SUBTOTAL ${s.toFixed(2)} + TAX ${t.toFixed(2)}` };
}

/** Loose match when OCR mangles TOTAL (e.g. T0TAL, *** TOTAL). */
function extractLooseTotalLine(text: string): { amount: number; summary: string } | null {
  const patterns = [
    /\*{1,4}\s*TOTAL\s*([0-9oOsSbB.,]+)/i,
    /\bT[O0]TAL\b[^\d]*([0-9oOsSbB.,]{3,})/i,
    /\bTOTAL\b[^\d]*([0-9oOsSbB.,]{3,})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const v = parseMoney(m[1]);
      if (v !== null && v >= 1) return { amount: v, summary: m[0].slice(0, 120) };
    }
  }
  return null;
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
  let best = rankedCandidates[0];
  let amount = best?.parsed ?? null;
  let summary = best?.line ?? "";

  if (amount === null) {
    const subTax = extractSubtotalPlusTax(text);
    if (subTax) {
      amount = subTax.amount;
      summary = subTax.summary;
    }
  }
  if (amount === null) {
    const loose = extractLooseTotalLine(text);
    if (loose) {
      amount = loose.amount;
      summary = loose.summary;
    }
  }

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
    summary,
  };
}
