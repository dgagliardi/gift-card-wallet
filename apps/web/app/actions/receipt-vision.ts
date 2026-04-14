"use server";

import { requireSession } from "@/lib/session";

const VISION_URL =
  "https://vision.googleapis.com/v1/images:annotate";

type VisionResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    error?: { message?: string };
  }>;
};

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

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No image" };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) {
    return { ok: false, error: "Image too large" };
  }

  const content = buf.toString("base64");

  const res = await fetch(`${VISION_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      ok: false,
      error: `Vision HTTP ${res.status}: ${errText.slice(0, 200)}`,
    };
  }

  const json = (await res.json()) as VisionResponse;
  const first = json.responses?.[0];
  if (first?.error?.message) {
    return { ok: false, error: first.error.message };
  }
  const text = first?.fullTextAnnotation?.text?.trim() ?? "";
  if (!text) {
    return { ok: false, error: "No text returned from Vision" };
  }
  return { ok: true, text };
}
