/**
 * Shrink phone camera photos before they are uploaded.
 *
 * A card photo is downloaded again at the checkout counter, on whatever signal
 * the store has. A 4 MB original and a 250 KB downscale look identical on a
 * phone screen and behave completely differently on one bar.
 */

/** Long edge, in pixels. Comfortably above what a phone screen can show. */
export const MAX_UPLOAD_DIMENSION = 1600;

const JPEG_QUALITY = 0.85;

export type ScaledDimensions = {
  width: number;
  height: number;
  scaled: boolean;
};

/**
 * Fit an image inside a square of `maxDimension` without distorting it.
 *
 * Bounds the *long* edge. Scaling on width alone (as the older inline crop
 * helper did) leaves portrait photos — the common case for a card held
 * upright — far larger than intended.
 */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxDimension: number,
): ScaledDimensions {
  const longEdge = Math.max(width, height);
  if (!(longEdge > 0) || !(maxDimension > 0) || longEdge <= maxDimension) {
    return { width, height, scaled: false };
  }

  const scale = maxDimension / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Image decode failed"));
    el.src = src;
  });
}

/**
 * Re-encode `file` so its long edge fits `maxDimension`.
 *
 * Best effort by design: anything unexpected (a non-image, a codec the browser
 * cannot decode, no canvas context) returns the original file. Failing to
 * shrink a photo must never block saving the card.
 */
export async function downscaleImageFile(
  file: File,
  maxDimension: number = MAX_UPLOAD_DIMENSION,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const src = URL.createObjectURL(file);
  try {
    const img = await decode(src);
    const target = computeScaledDimensions(
      img.naturalWidth,
      img.naturalHeight,
      maxDimension,
    );
    if (!target.scaled) return file;

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "card";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(src);
  }
}
