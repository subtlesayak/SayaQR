import type { NayukiQrCode } from "./qr";
import { compactFaces, triangulateFaces, type MeshFace } from "./mesh-faces";

export interface MeshVertex { x: number; y: number; z: number }
export interface MeshTriangle { a: MeshVertex; b: MeshVertex; c: MeshVertex; material: 0 | 1 | 2 }
export interface CoasterMeshOptions {
  size: number;
  base: number;
  relief: number;
  bottom: number;
  margin: number;
  engraved: boolean;
  colorStrategy?: "single" | "two" | "three";
  bridgeWidth?: number;
}

export function buildCoasterFaces(qr: NayukiQrCode, options: CoasterMeshOptions, separateParts = true): MeshFace[] {
  const { size, base, relief, margin, engraved } = options;
  const count = qr.size + margin * 2;
  const cell = size / count;
  const divisions = engraved ? 5 : 3;
  const subdivisions = count * divisions;
  const inset = engraved ? Math.min((options.bridgeWidth ?? 0.4) / 2, cell * 0.15) : Math.min(0.04, cell * 0.04);
  const coordinates = Array.from({ length: subdivisions + 1 }, (_, i) => {
    const whole = Math.floor(i / divisions);
    const offsets = engraved ? [0, inset, cell * 0.3 - inset / 2, cell * 0.3 + inset * 1.5, cell - inset] : [0, inset, cell - inset];
    return -size / 2 + whole * cell + offsets[i % divisions];
  });
  const source = new Int8Array(count * count);
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
    const qx = x - margin;
    const qy = y - margin;
    if (!qr.getModule(qx, qy)) continue;
    source[y * count + x] = options.colorStrategy !== "two" && ((qx < 7 && qy < 7) || (qx >= qr.size - 7 && qy < 7) || (qx < 7 && qy >= qr.size - 7)) ? 2 : 1;
  }
  const bottom = Math.max(0, Math.min(options.bottom, base - 0.0001));
  const heights = engraved ? [0, base] : bottom > 0 ? [0, bottom, base, base + relief] : [0, base, base + relief];
  const layers: Int8Array[] = [];
  for (let z = 0; z < heights.length - 1; z++) {
    const layer = new Int8Array(subdivisions * subdivisions);
    for (let y = 0; y < subdivisions; y++) for (let x = 0; x < subdivisions; x++) {
      const material = source[Math.floor(y / divisions) * count + Math.floor(x / divisions)];
      layer[y * subdivisions + x] = engraved
        ? material ? -1 : 0
        : heights[z] >= base ? material || -1 : bottom > 0 && z === 0 ? material : 0;
    }
    if (engraved) {
      const connected = new Uint8Array(count * count);
      const neighbors = (index: number): number[] => {
        const x = index % count, y = Math.floor(index / count);
        return [x > 0 ? index - 1 : -1, y > 0 ? index - count : -1, x + 1 < count ? index + 1 : -1, y + 1 < count ? index + count : -1].filter((next) => next >= 0);
      };
      const region = (start: number): number[] => {
        const queue = [start], seen = new Set(queue);
        for (let i = 0; i < queue.length; i++) for (const next of neighbors(queue[i])) {
          if (source[next] === 0 && !seen.has(next)) { seen.add(next); queue.push(next); }
        }
        return queue;
      };
      for (const index of region(0)) connected[index] = 1;
      for (let target = 0; target < source.length; target++) {
        if (source[target] || connected[target]) continue;
        const island = region(target);
        const previous = new Int32Array(source.length).fill(-2);
        const queue = [...island];
        for (const index of island) previous[index] = -1;
        let hit = -1;
        for (let i = 0; i < queue.length && hit < 0; i++) {
          const current = queue[i];
          if (connected[current]) { hit = current; break; }
          for (const next of neighbors(current)) if (previous[next] === -2) { previous[next] = current; queue.push(next); }
        }
        const path: number[] = [];
        for (let index = hit; index >= 0; index = previous[index]) path.push(index);
        for (let i = 0; i < path.length; i++) {
          const index = path[i];
          connected[index] = 1;
          if (!source[index]) continue;
          const x = index % count, y = Math.floor(index / count);
          const fill = (sx: number, sy: number) => { layer[(y * divisions + sy) * subdivisions + x * divisions + sx] = 0; };
          fill(2, 2);
          for (const neighbor of [path[i - 1], path[i + 1]]) {
            if (neighbor === undefined) continue;
            if (neighbor === index - 1) for (let sx = 0; sx <= 2; sx++) fill(sx, 2);
            if (neighbor === index + 1) for (let sx = 2; sx < divisions; sx++) fill(sx, 2);
            if (neighbor === index - count) for (let sy = 0; sy <= 2; sy++) fill(2, sy);
            if (neighbor === index + count) for (let sy = 2; sy < divisions; sy++) fill(2, sy);
          }
        }
        for (const index of island) connected[index] = 1;
      }
    }
    {
      // Resolve checkerboard point contacts with finite clearance/bridges.
      const coarse = (x: number, y: number): number => {
        const material = source[y * count + x];
        return engraved ? material ? -1 : 0 : heights[z] >= base ? material || -1 : bottom > 0 && z === 0 ? material : 0;
      };
      for (let y = 1; y < count; y++) for (let x = 1; x < count; x++) {
        const a = coarse(x - 1, y - 1), b = coarse(x, y - 1);
        const c = coarse(x - 1, y), d = coarse(x, y);
        if (a !== d || b !== c || a === b) continue;
        const fill = Math.min(a, b);
        for (const sy of [y * divisions - 1, y * divisions]) for (const sx of [x * divisions - 1, x * divisions]) layer[sy * subdivisions + sx] = engraved ? 0 : fill;
      }
    }
    layers.push(layer);
  }
  const at = (x: number, y: number, z: number): number => x < 0 || y < 0 || z < 0 || x >= subdivisions || y >= subdivisions || z >= layers.length ? -1 : layers[z][y * subdivisions + x];
  const triangles: MeshTriangle[] = [];
  const quad = (vertices: MeshVertex[], material: number): void => {
    const [a, b, c, d] = vertices;
    triangles.push({ a, b, c, material: material as 0 | 1 | 2 }, { a, b: c, c: d, material: material as 0 | 1 | 2 });
  };
  for (let z = 0; z < layers.length; z++) for (let y = 0; y < subdivisions; y++) for (let x = 0; x < subdivisions; x++) {
    const material = at(x, y, z);
    if (material < 0) continue;
    const exposed = (nx: number, ny: number, nz: number): boolean => {
      const neighbor = at(nx, ny, nz);
      return neighbor < 0 || (separateParts && options.colorStrategy !== "single" && neighbor !== material);
    };
    const x1 = coordinates[x], x2 = coordinates[x + 1], y1 = coordinates[y], y2 = coordinates[y + 1];
    const z1 = heights[z], z2 = heights[z + 1];
    const v = (vx: number, vy: number, vz: number): MeshVertex => ({ x: vx, y: vy, z: vz });
    if (exposed(x, y, z - 1)) quad([v(x1,y2,z1), v(x2,y2,z1), v(x2,y1,z1), v(x1,y1,z1)], material);
    if (exposed(x, y, z + 1)) quad([v(x1,y1,z2), v(x2,y1,z2), v(x2,y2,z2), v(x1,y2,z2)], material);
    if (exposed(x - 1, y, z)) quad([v(x1,y1,z1), v(x1,y1,z2), v(x1,y2,z2), v(x1,y2,z1)], material);
    if (exposed(x + 1, y, z)) quad([v(x2,y2,z1), v(x2,y2,z2), v(x2,y1,z2), v(x2,y1,z1)], material);
    if (exposed(x, y - 1, z)) quad([v(x2,y1,z1), v(x2,y1,z2), v(x1,y1,z2), v(x1,y1,z1)], material);
    if (exposed(x, y + 1, z)) quad([v(x1,y2,z1), v(x1,y2,z2), v(x2,y2,z2), v(x2,y2,z1)], material);
  }
  return compactFaces(options.colorStrategy === "single" ? triangles.map((triangle) => ({ ...triangle, material: 0 as const })) : triangles);
}

export function buildCoasterMesh(qr: NayukiQrCode, options: CoasterMeshOptions, separateParts = true): MeshTriangle[] {
  return triangulateFaces(buildCoasterFaces(qr, options, separateParts));
}
