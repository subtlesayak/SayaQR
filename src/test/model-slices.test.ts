import { describe, expect, it } from "vitest";
import { createQrCode } from "../lib/qr";
import { modelTriangles } from "../lib/model3d";
import type { MeshTriangle } from "../lib/coaster-mesh";

function crossings(mesh: MeshTriangle[], z: number, y: number): number[][] {
  const result: number[][] = [[], [], []];
  for (const triangle of mesh) {
    const vertices = [triangle.a, triangle.b, triangle.c], points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 3; i++) {
      const a = vertices[i], b = vertices[(i + 1) % 3];
      if ((a.z > z) === (b.z > z)) continue;
      const t = (z - a.z) / (b.z - a.z);
      points.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
    if (points.length !== 2 || (points[0].y > y) === (points[1].y > y)) continue;
    const [a, b] = points;
    result[triangle.material].push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
  }
  return result.map((values) => values.sort((a, b) => a - b));
}

describe("slicer-plane QR occupancy", () => {
  it.each([0.4, 2])("preserves flush bottom colors and raised top above a %s mm base without overlapping materials", (baseHeightMm) => {
    const qr = createQrCode("https://example.com"), cell = 100 / (qr.size + 8);
    const mesh = modelTriangles(qr, { baseHeightMm, undersideThicknessMm: 0.2, moduleHeightMm: 0.4 });
    for (const z of [0.1, baseHeightMm - 0.1, baseHeightMm + 0.1]) for (let row = 0; row < qr.size; row++) {
      const cuts = crossings(mesh, z, -50 + (row + 4.5) * cell);
      for (const values of cuts) expect(values.length % 2).toBe(0);
      for (let column = 0; column < qr.size; column++) {
        const x = -50 + (column + 4.5) * cell;
        const occupied = cuts.map((values) => values.filter((value) => value < x).length % 2 === 1);
        const count = occupied.filter(Boolean).length;
        const dark = qr.getModule(column, row);
        expect(count).toBe(z > baseHeightMm ? Number(dark) : 1);
        if (z < 0.2 && dark) expect(occupied[0]).toBe(false);
        if (z > 0.2 && z < baseHeightMm) expect(occupied[0]).toBe(true);
      }
    }
  });

  it("keeps dark module centers open through the entire stencil thickness", () => {
    const qr = createQrCode("https://example.com"), cell = 100 / (qr.size + 8);
    const mesh = modelTriangles(qr, { reliefMode: "engraved" });
    for (const z of [0.1, 1, 1.9]) for (let row = 0; row < qr.size; row++) {
      const values = crossings(mesh, z, -50 + (row + 4.5) * cell)[0];
      for (let column = 0; column < qr.size; column++) {
        const x = -50 + (column + 4.5) * cell;
        expect(values.filter((value) => value < x).length % 2 === 1).toBe(!qr.getModule(column, row));
      }
    }
  });
});
