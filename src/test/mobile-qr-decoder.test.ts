import { describe, expect, it } from "vitest";
import { calculateScanCrops } from "../lib/qr-decoder";

describe("mobile photo QR crop passes", () => {
  it("creates overlapping corner and center crops within the source image", () => {
    const crops = calculateScanCrops(4000, 3000);
    expect(crops).toHaveLength(5);
    expect(crops[0]).toEqual({ x: 0, y: 0, width: 2480, height: 1860 });
    expect(crops[4]).toEqual({ x: 760, y: 570, width: 2480, height: 1860 });
    for (const crop of crops) {
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(4000);
      expect(crop.y + crop.height).toBeLessThanOrEqual(3000);
    }
  });

  it("returns no passes for invalid dimensions", () => {
    expect(calculateScanCrops(0, 100)).toEqual([]);
  });
});
