import type { MeshTriangle, MeshVertex } from "./coaster-mesh";

export interface MeshFace { vertices: MeshVertex[]; material: 0 | 1 | 2 }
type Axis = "x" | "y" | "z";
const axes: Axis[] = ["x", "y", "z"];
const key = (value: number): string => value.toFixed(8);

// Merge rectangles first, then split every boundary at all incident vertices.
// Keeping those collinear vertices prevents T-junctions between perpendicular faces.
export function compactFaces(triangles: MeshTriangle[]): MeshFace[] {
  interface Rectangle { axis: Axis; u: Axis; v: Axis; plane: number; sign: number; lo: number[]; hi: number[]; material: 0 | 1 | 2 }
  const groups = new Map<string, Rectangle[]>();
  for (let i = 0; i < triangles.length; i += 2) {
    const t = triangles[i], points = [t.a, t.b, t.c, triangles[i + 1].c];
    const axis = axes.find((a) => points.every((p) => p[a] === points[0][a]))!;
    const [u, v] = axes.filter((a) => a !== axis);
    const sign = Math.sign((t.b[u] - t.a[u]) * (t.c[v] - t.a[v]) - (t.b[v] - t.a[v]) * (t.c[u] - t.a[u]));
    const rectangle = { axis, u, v, plane: t.a[axis], sign, lo: [Math.min(...points.map((p) => p[u])), Math.min(...points.map((p) => p[v]))], hi: [Math.max(...points.map((p) => p[u])), Math.max(...points.map((p) => p[v]))], material: t.material };
    const id = `${axis}:${key(rectangle.plane)}:${sign}:${t.material}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(rectangle);
  }
  const rectangles: Rectangle[] = [];
  for (const group of groups.values()) {
    let merged = group;
    for (const direction of [0, 1]) {
      const other = 1 - direction;
      const strips = new Map<string, Rectangle[]>();
      for (const r of merged) {
        const id = `${key(r.lo[other])}:${key(r.hi[other])}`;
        if (!strips.has(id)) strips.set(id, []);
        strips.get(id)!.push(r);
      }
      merged = [];
      for (const strip of strips.values()) {
        strip.sort((a, b) => a.lo[direction] - b.lo[direction]);
        let previous: Rectangle | undefined;
        for (const r of strip) {
          if (previous && key(previous.hi[direction]) === key(r.lo[direction])) previous.hi[direction] = r.hi[direction];
          else { previous = { ...r, lo: [...r.lo], hi: [...r.hi] }; merged.push(previous); }
        }
      }
    }
    rectangles.push(...merged);
  }
  const polygons = rectangles.map((r): MeshFace => {
    const point = (u: number, v: number): MeshVertex => ({ x: 0, y: 0, z: 0, [r.axis]: r.plane, [r.u]: u, [r.v]: v });
    const vertices = [point(r.lo[0], r.lo[1]), point(r.hi[0], r.lo[1]), point(r.hi[0], r.hi[1]), point(r.lo[0], r.hi[1])];
    if (r.sign < 0) vertices.reverse();
    return { vertices, material: r.material };
  });
  const lines = new Map<string, Set<number>>();
  const lineKey = (a: MeshVertex, b: MeshVertex): [string, Axis] => {
    const axis = axes.find((axis) => a[axis] !== b[axis])!;
    return [`${axis}:${axes.filter((other) => other !== axis).map((other) => key(a[other])).join(":")}`, axis];
  };
  for (const face of polygons) for (let i = 0; i < 4; i++) {
    const a = face.vertices[i], b = face.vertices[(i + 1) % 4], [id, axis] = lineKey(a, b);
    if (!lines.has(id)) lines.set(id, new Set());
    lines.get(id)!.add(a[axis]); lines.get(id)!.add(b[axis]);
  }
  const sorted = new Map([...lines].map(([id, values]) => [id, [...values].sort((a, b) => a - b)]));
  return polygons.map((face) => {
    const vertices: MeshVertex[] = [];
    for (let i = 0; i < 4; i++) {
      const a = face.vertices[i], b = face.vertices[(i + 1) % 4], [id, axis] = lineKey(a, b);
      vertices.push(a);
      const values = sorted.get(id)!.filter((n) => n > Math.min(a[axis], b[axis]) + 1e-8 && n < Math.max(a[axis], b[axis]) - 1e-8);
      if (a[axis] > b[axis]) values.reverse();
      for (const value of values) vertices.push({ ...a, [axis]: value });
    }
    return { ...face, vertices };
  });
}

export function triangulateFaces(faces: MeshFace[]): MeshTriangle[] {
  const triangles: MeshTriangle[] = [];
  for (const { vertices, material } of faces) {
    if (vertices.length === 4) {
      const [a, b, c, d] = vertices;
      triangles.push({ a, b, c, material }, { a, b: c, c: d, material });
    } else {
      const center = { x: 0, y: 0, z: 0 };
      for (const axis of axes) center[axis] = (Math.min(...vertices.map((v) => v[axis])) + Math.max(...vertices.map((v) => v[axis]))) / 2;
      for (let i = 0; i < vertices.length; i++) triangles.push({ a: center, b: vertices[i], c: vertices[(i + 1) % vertices.length], material });
    }
  }
  return triangles;
}
