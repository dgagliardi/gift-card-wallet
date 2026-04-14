import { describe, expect, it } from "vitest";
import { getLikelyBarcodeCropArea } from "./image";

describe("getLikelyBarcodeCropArea", () => {
  it("returns a centered lower-band crop tuned for barcode screenshots", () => {
    expect(getLikelyBarcodeCropArea(1000, 2000)).toEqual({
      x: 80,
      y: 1100,
      width: 840,
      height: 660,
    });
  });

  it("never returns out-of-bounds dimensions", () => {
    const r = getLikelyBarcodeCropArea(320, 480);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(320);
    expect(r.y + r.height).toBeLessThanOrEqual(480);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });
});
