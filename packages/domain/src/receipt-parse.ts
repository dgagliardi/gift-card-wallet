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

/** Collapse whitespace so mobile OCR line breaks do not break regexes. */
function collapseText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Costco-style: SUBTOTAL + TAX when TOTAL line is unreadable or obscured. */
function extractSubtotalPlusTax(text: string): { amount: number; summary: string } | null {
  const flat = collapseText(text);
  const multi = flat.match(
    /(?:SUB\s*TOTAL|SUBTOTAL|SUBT0TAL|SUB\s*T0TAL)[^\d]{0,60}([0-9oOsSbB.,]+)[^\d]{0,140}?(?:TAX|HST|GST|PST)[^\d]{0,60}([0-9oOsSbB.,]+)/i,
  );
  if (multi?.[1] && multi?.[2]) {
    const s = parseMoney(multi[1]);
    const t = parseMoney(multi[2]);
    if (s !== null && t !== null && s > 0.5 && t >= 0) {
      return {
        amount: Math.round((s + t) * 100) / 100,
        summary: `SUBTOTAL+TAX ${s.toFixed(2)}+${t.toFixed(2)}`,
      };
    }
  }
  const sub = flat.match(
    /(?:SUB\s*TOTAL|SUBT0TAL|SUBTOTAL|SUB\s*T0TAL)[^\d]{0,40}([0-9oOsSbB.,]+)/i,
  );
  const tax = flat.match(
    /(?:\bTAX\b|\bHST\b|\bGST\b|\bPST\b)[^\d]{0,40}([0-9oOsSbB.,]+)/i,
  );
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

/**
 * When OCR drops keywords but numbers remain: find a,b,c on receipt where a+b≈c (subtotal+tax=total).
 * Only used if text looks like a receipt footer (has SUB/TAX/TOTAL-ish cues).
 */
function extractByPairSumTriple(text: string): { amount: number; summary: string } | null {
  const nums = [...text.matchAll(/\b(\d{1,4}\.\d{2})\b/g)]
    .map((m) => parseMoney(m[1]))
    .filter((x): x is number => x !== null && x >= 0.01);
  if (nums.length < 3) return null;
  const receiptLike =
    /(SUB|TAX|TOTAL|HST|GST|SCANNED|WHOLESALE|CHECKOUT|MEMBER)/i.test(text) ||
    (text.length > 120 && nums.length >= 6);
  if (!receiptLike) return null;
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  const sortedDesc = [...uniq].sort((a, b) => b - a);
  for (const c of sortedDesc) {
    if (c < 25) continue;
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const a = uniq[i]!;
        const b = uniq[j]!;
        if (a === c || b === c) continue;
        const sum = Math.round((a + b) * 100) / 100;
        if (sum < 25) continue;
        if (Math.abs(c - sum) < 0.03) {
          return {
            amount: c,
            summary: `pair-sum ${a.toFixed(2)}+${b.toFixed(2)}≈${c.toFixed(2)}`,
          };
        }
      }
    }
  }
  return null;
}

/** Last resort: TOTAL / AMOUNT DUE / BALANCE DUE (avoid bare AMOUNT — matches item lines). */
function extractAmountNearKeyword(text: string): { amount: number; summary: string } | null {
  const flat = collapseText(text);
  const patterns = [
    /\*{0,4}\s*TOTAL[^\d]{0,40}([0-9][0-9]{1,4}[.,][0-9]{2,4})/i,
    /(?:AMOUNT|BALANCE)\s*DUE[^\d]{0,40}([0-9][0-9]{1,4}[.,][0-9]{2,4})/i,
    /GRAND\s*TOTAL[^\d]{0,40}([0-9][0-9]{1,4}[.,][0-9]{2,4})/i,
  ];
  for (const re of patterns) {
    const m = flat.match(re);
    if (m?.[1]) {
      const v = parseMoney(m[1]);
      if (v !== null && v >= 1) return { amount: v, summary: m[0].slice(0, 100) };
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
  if (amount === null) {
    const near = extractAmountNearKeyword(text);
    if (near) {
      amount = near.amount;
      summary = near.summary;
    }
  }
  if (amount === null) {
    const triple = extractByPairSumTriple(text);
    if (triple) {
      amount = triple.amount;
      summary = triple.summary;
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
