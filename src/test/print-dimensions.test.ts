import { describe, expect, it } from "vitest";
import { printDimensions } from "../lib/print-dimensions";
import { getQr3dPrintabilityWarnings, modelTriangles, validateQr3dMesh } from "../lib/model3d";
import { createQrCode } from "../lib/qr";

describe("printer-aware dimensions", () => {
  it("snaps upward to complete layers and leaves base material above an inlay", () => {
    expect(printDimensions({ layerHeightMm: 0.16, baseHeightMm: 0.4, moduleHeightMm: 0.5, undersideThicknessMm: 1 })).toMatchObject({ baseLayers: 3, baseHeightMm: 0.48, reliefLayers: 4, moduleHeightMm: 0.64, bottomLayers: 2, undersideThicknessMm: 0.32 });
  });

  it.each([0.05, 0.1, 0.16, 0.2, 0.24, 0.28])("exports a closed two-layer base at %s mm", (layerHeightMm) => {
    const qr = createQrCode("hello");
    const options = { layerHeightMm, baseHeightMm: layerHeightMm * 2, undersideThicknessMm: layerHeightMm };
    for (const reliefMode of ["raised", "engraved"] as const) {
      expect(validateQr3dMesh(qr, { ...options, reliefMode }).watertight).toBe(true);
      if (reliefMode === "engraved") expect(Math.max(...modelTriangles(qr, { ...options, reliefMode }).flatMap((t) => [t.a.z, t.b.z, t.c.z]))).toBeCloseTo(layerHeightMm * 2);
    }
  });

  it("rejects non-finite dimensions and warns about unprintable bridge targets", () => {
    const dimensions = printDimensions({ layerHeightMm: NaN, baseHeightMm: Infinity, nozzleMm: NaN });
    expect(dimensions).toMatchObject({ baseHeightMm: 2, layerHeightMm: 0.2, nozzleMm: 0.4 });
    const warnings = getQr3dPrintabilityWarnings(createQrCode("x".repeat(240)), { reliefMode: "engraved", nozzleMm: 0.8, baseHeightMm: 0.4 });
    expect(warnings.some((w) => w.message.includes("bridges are narrower"))).toBe(true);
    expect(warnings.some((w) => w.message.includes("Two-layer"))).toBe(true);
  });
});
