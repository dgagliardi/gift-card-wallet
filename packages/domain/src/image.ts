export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Best-effort crop targeting where barcodes typically appear in gift card screenshots:
 * centered and in the lower half.
 */
export function getLikelyBarcodeCropArea(
  width: number,
  height: number,
): CropArea {
  const cropWidth = Math.max(1, Math.floor(width * 0.84));
  const cropHeight = Math.max(1, Math.floor(height * 0.33));
  const x = Math.max(0, Math.floor((width - cropWidth) / 2));
  const y = Math.max(0, Math.floor(height * 0.55));

  return {
    x,
    y,
    width: Math.min(cropWidth, width - x),
    height: Math.min(cropHeight, height - y),
  };
}
