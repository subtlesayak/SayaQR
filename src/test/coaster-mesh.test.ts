import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { zipText } from "./zip-reader";
import { createQrCode } from "../lib/qr";
import { modelTriangles, qrToObj, threeMfBlob, validateQr3dMesh } from "../lib/model3d";

const vertexKey = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z].map((n) => n.toFixed(6)).join(",");

describe("closed printable coaster geometry", () => {
  it.each(["hello", "https://example.com"])("closes and orients all material parts: %s", (payload) => {
    for (const reliefMode of ["raised", "engraved"] as const) {
      const qr = createQrCode(payload);
      const result = validateQr3dMesh(qr, { reliefMode });
      expect(result).toEqual({ watertight: true, boundaryEdges: 0, nonManifoldEdges: 0, degenerateFacets: 0, inconsistentEdges: 0 });
      const volumes = [0, 0, 0];
      for (const t of modelTriangles(qr, { reliefMode })) {
        volumes[t.material] += (t.a.x * (t.b.y * t.c.z - t.b.z * t.c.y) + t.a.y * (t.b.z * t.c.x - t.b.x * t.c.z) + t.a.z * (t.b.x * t.c.y - t.b.y * t.c.x)) / 6;
      }
      expect(volumes[0]).toBeGreaterThan(0);
      if (reliefMode === "raised") {
        expect(volumes[1]).toBeGreaterThan(0);
        expect(volumes[2]).toBeGreaterThan(0);
      }
    }
  });

  it("STL shell has no internal material walls and the correct total volume", () => {
    const qr = createQrCode("https://example.com");
    const triangles = modelTriangles(qr, {}, false);
    const edges = new Map<string, number>();
    let volume = 0;
    for (const t of triangles) {
      for (const [a, b] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const key = [vertexKey(a), vertexKey(b)].sort().join("|");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      volume += (t.a.x * (t.b.y * t.c.z - t.b.z * t.c.y) + t.a.y * (t.b.z * t.c.x - t.b.x * t.c.z) + t.a.z * (t.b.x * t.c.y - t.b.y * t.c.x)) / 6;
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    expect(volume).toBeGreaterThan(100 * 100 * 2);
    expect(volume).toBeLessThan(100 * 100 * 3.2);
  });

  it("keeps the stencil connected and decodable on a dark backing", () => {
    const payload = "https://example.com";
    const triangles = modelTriangles(createQrCode(payload), { reliefMode: "engraved" });
    const parent = new Map<string, string>();
    const root = (key: string): string => {
      if (!parent.has(key)) parent.set(key, key);
      let current = key;
      while (parent.get(current) !== current) current = parent.get(current)!;
      while (key !== current) { const next = parent.get(key)!; parent.set(key, current); key = next; }
      return current;
    };
    const width = 300, pixels = new Uint8ClampedArray(width * width * 4);
    for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
    for (const t of triangles) {
      const keys = [t.a, t.b, t.c].map(vertexKey);
      for (const key of keys.slice(1)) parent.set(root(key), root(keys[0]));
      if (![t.a, t.b, t.c].every((v) => v.z === 2)) continue;
      const xs = [t.a.x, t.b.x, t.c.x].map((x) => (x + 50) * width / 100);
      const ys = [t.a.y, t.b.y, t.c.y].map((y) => (y + 50) * width / 100);
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(width, Math.ceil(Math.max(...ys))); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(width, Math.ceil(Math.max(...xs))); x++) {
        const cross = (i: number, j: number) => (xs[j] - xs[i]) * (y + 0.5 - ys[i]) - (ys[j] - ys[i]) * (x + 0.5 - xs[i]);
        const signs = [cross(0, 1), cross(1, 2), cross(2, 0)];
        if (!signs.every((value) => value >= -1e-8) && !signs.every((value) => value <= 1e-8)) continue;
        const offset = (y * width + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
      }
    }
    expect(new Set([...parent.keys()].map(root)).size).toBe(1);
    expect(jsQR(pixels, width, width)?.data).toBe(payload);
  });

  it("preserves thin OBJ heights and builds a single 3MF assembly", async () => {
    const qr = createQrCode("hello");
    const obj = qrToObj(qr, { undersideThicknessMm: 0.4 });
    expect(obj).toContain("0.0004");
    const points = obj.split("\n").filter((line) => line.startsWith("v "));
    // Material interfaces may coincide, but distinct heights must survive output.
    expect(new Set(points.map((line) => line.split(" ")[3]))).toEqual(new Set(["0", "0.0004", "0.002", "0.0032"]));
    const xml = await zipText(await threeMfBlob(qr));
    expect((xml.match(/<item objectid=/g) ?? []).length).toBe(1);
    expect((xml.match(/<component objectid=/g) ?? []).length).toBe(3);
    const engraved = await zipText(await threeMfBlob(qr, { reliefMode: "engraved" }));
    expect((engraved.match(/<component objectid=/g) ?? []).length).toBe(1);
    expect(engraved).not.toMatch(/<vertices>\s*<\/vertices>/);
  });
});
