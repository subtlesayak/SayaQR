import { describe, expect, it } from "vitest";
import { createQrCode } from "../lib/qr";
import { DEFAULT_RENDER_OPTIONS } from "../lib/render";
import { getQr3dPrintabilityWarnings, objZipBlob, qr3dCellSizeMm, qr3dOptionsFromRenderOptions, qrToMtl, qrToObj, qrToStl, stlBlob, threeMfBlob } from "../lib/model3d";

describe("3D QR exports", () => {
  it("renders an STL coaster mesh", async () => {
    const qr = createQrCode("https://example.com", "HIGH");
    const stl = qrToStl(qr, { quietZone: 4 });
    expect(stl).toMatch(/^solid SayaQR_coaster/);
    expect(stl).toContain("Geometry-only STL");
    expect(stl).toContain("facet normal");
    expect(stl).toContain("vertex -50 -50 0");
    expect(stl).toMatch(/vertex .* 3\.2/);

    const blob = stlBlob(qr);
    expect(blob.type).toBe("model/stl;charset=utf-8");
    expect(await blob.text()).toContain("endsolid SayaQR_coaster");
  });

  it("maps render colors into 3D model options", () => {
    expect(qr3dOptionsFromRenderOptions({
      ...DEFAULT_RENDER_OPTIONS,
      foreground: "#123456",
      finderColor: "#654321",
      background: "#ABCDEF",
      margin: 6,
    })).toEqual({
      quietZone: 6,
      moduleColor: "#123456",
      finderColor: "#654321",
      baseColor: "#ABCDEF",
    });
  });

  it("creates a 3MF package with color materials", async () => {
    const qr = createQrCode("hello", "HIGH");
    const blob = await threeMfBlob(qr, {
      moduleColor: "#123456",
      finderColor: "#654321",
      baseColor: "#FFFFFF",
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(blob.type).toBe("application/zip");
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(text).toContain("3D/3dmodel.model");
    expect(text).toContain("displaycolor=\"#123456\"");
    expect(text).toContain("displaycolor=\"#654321\"");
    expect(text).toContain("name=\"Coaster base\"");
    expect(text).toContain("name=\"QR modules\"");
    expect(text).toContain("name=\"Finder modules\"");
    expect(text).toContain('p1="1" p2="1" p3="1"');
    expect(text).toContain('<item objectid="4"/>');
    expect(text).toContain("unit=\"millimeter\"");
    expect(text).toContain("README.txt");
  });

  it("creates Blender-ready OBJ and MTL files", async () => {
    const qr = createQrCode("hello", "HIGH");
    const obj = qrToObj(qr, { moduleColor: "#123456", finderColor: "#654321", baseColor: "#FFFFFF" }, "test.mtl");
    const mtl = qrToMtl({ moduleColor: "#123456", finderColor: "#654321", baseColor: "#FFFFFF" });
    const zip = await objZipBlob(qr, { moduleColor: "#123456", finderColor: "#654321", baseColor: "#FFFFFF" });
    const zipText = new TextDecoder().decode(new Uint8Array(await zip.arrayBuffer()));

    expect(obj).toContain("mtllib test.mtl");
    expect(obj).toContain("Coordinates are meters");
    expect(obj).toContain("v -0.05 -0.05 0");
    expect(obj).toContain("g modules");
    expect(obj).toContain("g finders");
    expect(obj).toContain("usemtl modules");
    expect(obj).toContain("Planar source faces are welded and exported as quads");
    expect(obj).toMatch(/f \d+ \d+ \d+ \d+/);
    expect(mtl).toContain("newmtl modules");
    expect(mtl).toContain("Kd 0.0706 0.2039 0.3373");
    expect(zipText).toContain("sayaqr-coaster.obj");
    expect(zipText).toContain("sayaqr-coaster.mtl");
    expect(zipText).toContain("README.txt");
  });

  it("reports printability risks from actual cell size and raised height", () => {
    const qr = createQrCode("https://example.com", "HIGH");
    expect(qr3dCellSizeMm(qr, { sizeMm: 100, quietZone: 4 })).toBeGreaterThan(1);
    expect(getQr3dPrintabilityWarnings(qr, { sizeMm: 60, quietZone: 4, moduleHeightMm: 0.4 })).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: "warning" }),
      expect.objectContaining({ message: expect.stringContaining("Raised height") }),
    ]));
    expect(getQr3dPrintabilityWarnings(qr, { sizeMm: 100, quietZone: 4, moduleHeightMm: 1.2 })).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: "info", message: expect.stringContaining("3MF") }),
    ]));
  });
});
