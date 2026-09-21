import { describe, expect, it } from "vitest";
import { computeScaledDimensions } from "./image-downscale";

describe("computeScaledDimensions", () => {
  it("leaves an image that is already small enough untouched", () => {
    expect(computeScaledDimensions(1200, 800, 1600)).toEqual({
      width: 1200,
      height: 800,
      scaled: false,
    });
  });

  it("never upscales a small image to the limit", () => {
    expect(computeScaledDimensions(400, 300, 1600).scaled).toBe(false);
  });

  it("bounds a landscape photo by its width", () => {
    expect(computeScaledDimensions(4032, 3024, 1600)).toEqual({
      width: 1600,
      height: 1200,
      scaled: true,
    });
  });

  it("bounds a portrait photo by its height, not its width", () => {
    // Scaling on width alone leaves a 3024x4032 phone photo at 1600x2133 —
    // still a multi-megabyte upload on the connection it has to survive.
    expect(computeScaledDimensions(3024, 4032, 1600)).toEqual({
      width: 1200,
      height: 1600,
      scaled: true,
    });
  });

  it("keeps a very wide barcode strip at least one pixel tall", () => {
    const { height } = computeScaledDimensions(8000, 40, 1600);

    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("reports dimensions as whole pixels", () => {
    const { width, height } = computeScaledDimensions(4001, 3001, 1600);

    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  it("treats an unusable size as not scalable rather than producing NaN", () => {
    expect(computeScaledDimensions(0, 0, 1600)).toEqual({
      width: 0,
      height: 0,
      scaled: false,
    });
  });
});
