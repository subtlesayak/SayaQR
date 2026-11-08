import { describe, expect, it } from "vitest";
import { createQrCode } from "../lib/qr";
import { modelTriangles, QR3D_PRINT_PROFILES, validateQr3dMesh } from "../lib/model3d";

describe("complete print profiles", () => {
  it.each(QR3D_PRINT_PROFILES)("keeps $id closed with consistent materials", (preset) => {
    const qr = createQrCode("hello");
    expect(validateQr3dMesh(qr, preset).watertight).toBe(true);
    const materials = new Set(modelTriangles(qr, preset).map((triangle) => triangle.material));
    expect(materials.size).toBe(preset.colorStrategy === "three" ? 3 : preset.colorStrategy === "two" ? 2 : 1);
  });

  it("keeps manual-swap color entirely above the base", () => {
    const preset = QR3D_PRINT_PROFILES.find((item) => item.id === "filament-swap")!;
    expect(preset.undersideThicknessMm).toBe(0);
    for (const triangle of modelTriangles(createQrCode("hello"), preset)) {
      if (triangle.material !== 0) expect(Math.min(triangle.a.z, triangle.b.z, triangle.c.z)).toBeGreaterThanOrEqual(preset.baseHeightMm);
    }
  });
});
