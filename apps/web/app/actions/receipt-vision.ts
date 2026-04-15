"use server";

import { requireSession } from "@/lib/session";

const VISION_URL =
  "https://vision.googleapis.com/v1/images:annotate";

type VisionResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    textAnnotations?: Array<{ description?: string }>;
    error?: { message?: string };
  }>;
};

function extractVisionText(
  first: NonNullable<VisionResponse["responses"]>[0] | undefined,
): string {
  const fromDoc = first?.fullTextAnnotation?.text?.trim();
  if (fromDoc) return fromDoc;
  const fromLegacy = first?.textAnnotations?.[0]?.description?.trim();
  return fromLegacy ?? "";
}

async function visionAnnotate(
  key: string,
  content: string,
  features: Array<{ type: string; maxResults?: number }>,
): Promise<VisionResponse> {
  const res = await fetch(`${VISION_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ image: { content }, features }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  return (await res.json()) as VisionResponse;
}

/**
 * Server-side OCR via Google Cloud Vision (DOCUMENT_TEXT_DETECTION).
 * Set GOOGLE_VISION_API_KEY in env. Key must not be exposed to the client.
 */
export async function extractReceiptTextWithGoogleVision(
  formData: FormData,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requireSession();

  const key = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: "Vision API not configured" };
  }

  const raw = formData.get("image");
  // Next.js / Node may supply Blob rather than File for multipart parts.
  if (!(raw instanceof Blob) || raw.size === 0) {
    return { ok: false, error: "No image" };
  }

  const buf = Buffer.from(await raw.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) {
    return { ok: false, error: "Image too large" };
  }

  const content = buf.toString("base64");

  try {
    const docJson = await visionAnnotate(key, content, [
      { type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 },
    ]);
    const first = docJson.responses?.[0];
    if (first?.error?.message) {
      return { ok: false, error: first.error.message };
    }
    let text = extractVisionText(first);
    if (!text) {
      const textJson = await visionAnnotate(key, content, [
        { type: "TEXT_DETECTION", maxResults: 1 },
      ]);
      const t0 = textJson.responses?.[0];
      if (t0?.error?.message) {
        return { ok: false, error: t0.error.message };
      }
      text = extractVisionText(t0);
    }
    if (!text) {
      return { ok: false, error: "No text returned from Vision" };
    }
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 240) };
  }
}
