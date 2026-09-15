import type { NayukiQrCode } from "./qr";
import type { QrRenderOptions } from "./render";
import { createZip, type ZipInputFile } from "./zip";

export interface Qr3dModelOptions {
  sizeMm?: number;
  baseHeightMm?: number;
  moduleHeightMm?: number;
  quietZone?: number;
  moduleColor?: string;
  finderColor?: string;
  baseColor?: string;
}

interface Vertex {
  x: number;
  y: number;
  z: number;
}

interface Triangle {
  a: Vertex;
  b: Vertex;
  c: Vertex;
  material: MaterialIndex;
}

type MaterialIndex = 0 | 1 | 2;

const DEFAULT_3D_OPTIONS = {
  sizeMm: 100,
  baseHeightMm: 2,
  moduleHeightMm: 1.2,
  quietZone: 4,
  moduleColor: "#0F172A",
  finderColor: "#0F172A",
  baseColor: "#FFFFFF",
} satisfies Required<Qr3dModelOptions>;

function optionValue<T extends keyof typeof DEFAULT_3D_OPTIONS>(options: Qr3dModelOptions, key: T): (typeof DEFAULT_3D_OPTIONS)[T] {
  return (options[key] ?? DEFAULT_3D_OPTIONS[key]) as (typeof DEFAULT_3D_OPTIONS)[T];
}

function normalizeColor(color: string): string {
  const normalized = color.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(normalized)) return normalized;
  return "#0F172A";
}

function colorToObjRgb(color: string): string {
  const normalized = normalizeColor(color);
  const values = [1, 3, 5].map((start) => parseInt(normalized.slice(start, start + 2), 16) / 255);
  return values.map((value) => number(value)).join(" ");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function isFinderArea(x: number, y: number, size: number): boolean {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
}

function addBox(
  triangles: Triangle[],
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  material: MaterialIndex,
): void {
  const x2 = x + width;
  const y2 = y + depth;
  const z2 = z + height;
  const v = {
    nwb: { x, y, z },
    neb: { x: x2, y, z },
    seb: { x: x2, y: y2, z },
    swb: { x, y: y2, z },
    nwt: { x, y, z: z2 },
    net: { x: x2, y, z: z2 },
    set: { x: x2, y: y2, z: z2 },
    swt: { x, y: y2, z: z2 },
  };

  triangles.push(
    { a: v.nwt, b: v.net, c: v.set, material },
    { a: v.nwt, b: v.set, c: v.swt, material },
    { a: v.swb, b: v.seb, c: v.neb, material },
    { a: v.swb, b: v.neb, c: v.nwb, material },
    { a: v.nwb, b: v.neb, c: v.net, material },
    { a: v.nwb, b: v.net, c: v.nwt, material },
    { a: v.seb, b: v.swb, c: v.swt, material },
    { a: v.seb, b: v.swt, c: v.set, material },
    { a: v.neb, b: v.seb, c: v.set, material },
    { a: v.neb, b: v.set, c: v.net, material },
    { a: v.swb, b: v.nwb, c: v.nwt, material },
    { a: v.swb, b: v.nwt, c: v.swt, material },
  );
}

function addQuad(triangles: Triangle[], a: Vertex, b: Vertex, c: Vertex, d: Vertex, material: MaterialIndex): void {
  triangles.push({ a, b, c, material }, { a, b: c, c: d, material });
}

function modelTriangles(qr: NayukiQrCode, inputOptions: Qr3dModelOptions = {}): Triangle[] {
  const quietZone = Math.max(0, Math.floor(optionValue(inputOptions, "quietZone")));
  const sizeMm = Math.max(30, optionValue(inputOptions, "sizeMm"));
  const baseHeight = Math.max(0.8, optionValue(inputOptions, "baseHeightMm"));
  const moduleHeight = Math.max(0.4, optionValue(inputOptions, "moduleHeightMm"));
  const cellSize = sizeMm / (qr.size + quietZone * 2);
  const origin = -sizeMm / 2;
  const triangles: Triangle[] = [];

  addBox(triangles, origin, origin, 0, sizeMm, sizeMm, baseHeight, 0);

  function cellMaterial(x: number, y: number): MaterialIndex | null {
    if (x < 0 || y < 0 || x >= qr.size || y >= qr.size || !qr.getModule(x, y)) return null;
    return isFinderArea(x, y, qr.size) ? 2 : 1;
  }

  for (const material of [1, 2] as const) {
    for (let y = 0; y < qr.size; y++) {
      let runStart = -1;

      for (let x = 0; x <= qr.size; x++) {
        const matches = x < qr.size && cellMaterial(x, y) === material;
        if (runStart >= 0 && !matches) {
          const x1 = origin + (quietZone + runStart) * cellSize;
          const x2 = origin + (quietZone + x) * cellSize;
          const y1 = origin + (quietZone + y) * cellSize;
          const y2 = y1 + cellSize;
          addQuad(
            triangles,
            { x: x1, y: y1, z: baseHeight + moduleHeight },
            { x: x2, y: y1, z: baseHeight + moduleHeight },
            { x: x2, y: y2, z: baseHeight + moduleHeight },
            { x: x1, y: y2, z: baseHeight + moduleHeight },
            material,
          );
          addQuad(
            triangles,
            { x: x1, y: y2, z: baseHeight },
            { x: x2, y: y2, z: baseHeight },
            { x: x2, y: y1, z: baseHeight },
            { x: x1, y: y1, z: baseHeight },
            material,
          );
          runStart = -1;
        }
        if (matches && runStart < 0) runStart = x;
      }
    }

    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (cellMaterial(x, y) !== material) continue;
        const x1 = origin + (quietZone + x) * cellSize;
        const x2 = x1 + cellSize;
        const y1 = origin + (quietZone + y) * cellSize;
        const y2 = y1 + cellSize;
        const z1 = baseHeight;
        const z2 = baseHeight + moduleHeight;

        if (cellMaterial(x, y - 1) !== material) {
          addQuad(triangles, { x: x2, y: y1, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y1, z: z2 }, { x: x2, y: y1, z: z2 }, material);
        }
        if (cellMaterial(x + 1, y) !== material) {
          addQuad(triangles, { x: x2, y: y2, z: z1 }, { x: x2, y: y1, z: z1 }, { x: x2, y: y1, z: z2 }, { x: x2, y: y2, z: z2 }, material);
        }
        if (cellMaterial(x, y + 1) !== material) {
          addQuad(triangles, { x: x1, y: y2, z: z1 }, { x: x2, y: y2, z: z1 }, { x: x2, y: y2, z: z2 }, { x: x1, y: y2, z: z2 }, material);
        }
        if (cellMaterial(x - 1, y) !== material) {
          addQuad(triangles, { x: x1, y: y1, z: z1 }, { x: x1, y: y2, z: z1 }, { x: x1, y: y2, z: z2 }, { x: x1, y: y1, z: z2 }, material);
        }
      }
    }
  }

  return triangles;
}

function normal(a: Vertex, b: Vertex, c: Vertex): Vertex {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / length, y: ny / length, z: nz / length };
}

export function qr3dOptionsFromRenderOptions(renderOptions: QrRenderOptions): Qr3dModelOptions {
  return {
    quietZone: renderOptions.margin,
    moduleColor: renderOptions.foreground,
    finderColor: renderOptions.finderColor,
    baseColor: renderOptions.transparentBackground ? "#FFFFFF" : renderOptions.background,
  };
}

export function qrToStl(qr: NayukiQrCode, options: Qr3dModelOptions = {}): string {
  const triangles = modelTriangles(qr, options);
  const lines = [
    "solid SayaQR_coaster",
    "  // Geometry-only STL. Use the 3MF export when printer color/material metadata is needed.",
  ];

  for (const triangle of triangles) {
    const n = normal(triangle.a, triangle.b, triangle.c);
    lines.push(
      `  facet normal ${number(n.x)} ${number(n.y)} ${number(n.z)}`,
      "    outer loop",
      `      vertex ${number(triangle.a.x)} ${number(triangle.a.y)} ${number(triangle.a.z)}`,
      `      vertex ${number(triangle.b.x)} ${number(triangle.b.y)} ${number(triangle.b.z)}`,
      `      vertex ${number(triangle.c.x)} ${number(triangle.c.y)} ${number(triangle.c.z)}`,
      "    endloop",
      "  endfacet",
    );
  }

  lines.push("endsolid SayaQR_coaster");
  return lines.join("\n");
}

export function stlBlob(qr: NayukiQrCode, options: Qr3dModelOptions = {}): Blob {
  return new Blob([qrToStl(qr, options)], { type: "model/stl;charset=utf-8" });
}

export function qrToObj(qr: NayukiQrCode, options: Qr3dModelOptions = {}, materialLibraryName = "sayaqr-coaster.mtl"): string {
  const triangles = modelTriangles(qr, options);
  const vertices: string[] = [];
  const faces: string[] = [];
  const materialNames = ["base", "modules", "finders"];
  let activeMaterial = "";
  let activeGroup = "";

  for (const triangle of triangles) {
    const start = vertices.length + 1;
    vertices.push(
      `v ${number(triangle.a.x)} ${number(triangle.a.y)} ${number(triangle.a.z)}`,
      `v ${number(triangle.b.x)} ${number(triangle.b.y)} ${number(triangle.b.z)}`,
      `v ${number(triangle.c.x)} ${number(triangle.c.y)} ${number(triangle.c.z)}`,
    );
    const material = materialNames[triangle.material];
    if (activeGroup !== material) {
      faces.push(`g ${material}`);
      activeGroup = material;
    }
    if (activeMaterial !== material) {
      faces.push(`usemtl ${material}`);
      activeMaterial = material;
    }
    faces.push(`f ${start} ${start + 1} ${start + 2}`);
  }

  return [
    "# SayaQR print-ready QR coaster",
    "# OBJ export for Blender and 3D tools. Units are millimeters.",
    `mtllib ${materialLibraryName}`,
    "o SayaQR_coaster",
    ...vertices,
    ...faces,
    "",
  ].join("\n");
}

export function qrToMtl(options: Qr3dModelOptions = {}): string {
  const materials = [
    ["base", optionValue(options, "baseColor")],
    ["modules", optionValue(options, "moduleColor")],
    ["finders", optionValue(options, "finderColor")],
  ] as const;

  return materials.map(([name, color]) => [
    `newmtl ${name}`,
    `Kd ${colorToObjRgb(color)}`,
    "Ka 0 0 0",
    "Ks 0.08 0.08 0.08",
    "Ns 12",
    "d 1",
  ].join("\n")).join("\n\n") + "\n";
}

export async function objZipBlob(qr: NayukiQrCode, options: Qr3dModelOptions = {}): Promise<Blob> {
  const objName = "sayaqr-coaster.obj";
  const mtlName = "sayaqr-coaster.mtl";
  return createZip([
    { name: objName, data: qrToObj(qr, options, mtlName) },
    { name: mtlName, data: qrToMtl(options) },
  ]);
}

function build3mfModel(qr: NayukiQrCode, options: Qr3dModelOptions): string {
  const triangles = modelTriangles(qr, options);
  const partNames = ["Coaster base", "QR modules", "Finder modules"];
  const colors = [
    normalizeColor(optionValue(options, "baseColor")),
    normalizeColor(optionValue(options, "moduleColor")),
    normalizeColor(optionValue(options, "finderColor")),
  ];

  function objectXml(material: MaterialIndex): string {
    const vertices: string[] = [];
    const triangleXml: string[] = [];
    const vertexKeys = new Map<string, number>();

    function vertexIndex(vertex: Vertex): number {
      const key = `${number(vertex.x)},${number(vertex.y)},${number(vertex.z)}`;
      const existing = vertexKeys.get(key);
      if (existing !== undefined) return existing;
      const index = vertices.length;
      vertexKeys.set(key, index);
      vertices.push(`<vertex x="${number(vertex.x)}" y="${number(vertex.y)}" z="${number(vertex.z)}"/>`);
      return index;
    }

    for (const triangle of triangles) {
      if (triangle.material !== material) continue;
      triangleXml.push(
        `<triangle v1="${vertexIndex(triangle.a)}" v2="${vertexIndex(triangle.b)}" v3="${vertexIndex(triangle.c)}" pid="1" p1="${material}" p2="${material}" p3="${material}"/>`,
      );
    }

    return `<object id="${material + 2}" type="model" name="${escapeXml(partNames[material])}">
      <mesh>
        <vertices>
          ${vertices.join("\n          ")}
        </vertices>
        <triangles>
          ${triangleXml.join("\n          ")}
        </triangles>
      </mesh>
    </object>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <metadata name="Title">SayaQR print-ready QR coaster</metadata>
  <metadata name="Designer">SayaQR</metadata>
  <resources>
    <basematerials id="1">
      <base name="Coaster base" displaycolor="${escapeXml(colors[0])}"/>
      <base name="QR modules" displaycolor="${escapeXml(colors[1])}"/>
      <base name="Finder modules" displaycolor="${escapeXml(colors[2])}"/>
    </basematerials>
    ${objectXml(0)}
    ${objectXml(1)}
    ${objectXml(2)}
  </resources>
  <build>
    <item objectid="2"/>
    <item objectid="3"/>
    <item objectid="4"/>
  </build>
</model>`;
}

export async function threeMfBlob(qr: NayukiQrCode, options: Qr3dModelOptions = {}): Promise<Blob> {
  const files: ZipInputFile[] = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`,
    },
    {
      name: "3D/3dmodel.model",
      data: build3mfModel(qr, options),
    },
  ];
  return createZip(files);
}
