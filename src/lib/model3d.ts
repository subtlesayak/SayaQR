import type { NayukiQrCode } from "./qr";
import { buildCoasterMesh } from "./coaster-mesh";
import type { QrRenderOptions } from "./render";
import { createZip, type ZipInputFile } from "./zip";

export interface Qr3dModelOptions {
  profile?: Qr3dPrintProfile;
  reliefMode?: "raised" | "engraved";
  colorStrategy?: "single" | "two" | "three";
  hasLogo?: boolean;
  stylized?: boolean;
  sizeMm?: number;
  baseHeightMm?: number;
  moduleHeightMm?: number;
  undersideThicknessMm?: number;
  quietZone?: number;
  moduleColor?: string;
  finderColor?: string;
  baseColor?: string;
}

export type Qr3dPrintProfile = "bambu-ams" | "single-color" | "filament-swap" | "laser-cnc" | "resin";

export interface Qr3dPrintProfilePreset {
  id: Qr3dPrintProfile;
  name: string;
  description: string;
  baseHeightMm: number;
  moduleHeightMm: number;
  materialNote: string;
  reliefMode: "raised" | "engraved";
  colorStrategy: "single" | "two" | "three";
  undersideThicknessMm: number;
}

export const QR3D_PRINT_PROFILES: readonly Qr3dPrintProfilePreset[] = [
  { id: "bambu-ams", name: "Bambu AMS / multi-color", description: "Separate base, modules, and finder parts for material assignment.", baseHeightMm: 2, moduleHeightMm: 1.2, materialNote: "3MF keeps three material regions separate." },
  { id: "single-color", name: "Single-color raised QR", description: "One filament with a readable raised QR.", baseHeightMm: 2, moduleHeightMm: 1.2, materialNote: "STL is suitable for a single filament." },
  { id: "filament-swap", name: "Two-color filament swap", description: "Pause-friendly base and QR height for a manual swap.", baseHeightMm: 2.4, moduleHeightMm: 0.8, materialNote: "Swap filament at the raised QR layer." },
  { id: "laser-cnc", name: "Laser / CNC engraved", description: "Flat layout reference for subtractive workflows.", baseHeightMm: 3, moduleHeightMm: 0.8, materialNote: "Use the model as a millimetre layout reference." },
  { id: "resin", name: "Resin print", description: "Lower relief for fine-detail resin printers.", baseHeightMm: 1.8, moduleHeightMm: 0.7, materialNote: "Orient and support according to your resin workflow." },
].map((preset) => ({
  ...preset,
  reliefMode: preset.id === "laser-cnc" ? "engraved" : "raised",
  colorStrategy: preset.id === "bambu-ams" ? "three" : preset.id === "filament-swap" ? "two" : "single",
  undersideThicknessMm: preset.id === "bambu-ams" ? 0.4 : 0,
})) as readonly Qr3dPrintProfilePreset[];

export const COASTER_SIZE_PRESETS = [
  { value: 90, label: "90 mm · compact" },
  { value: 95, label: "95 mm · standard" },
  { value: 100, label: "100 mm · cup coaster" },
  { value: 105, label: "105 mm · generous" },
] as const;

export interface Qr3dPrintabilityWarning {
  level: "info" | "warning";
  message: string;
}

export interface Qr3dMeshValidation {
  watertight: boolean;
  boundaryEdges: number;
  nonManifoldEdges: number;
  degenerateFacets: number;
  inconsistentEdges: number;
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
  profile: "bambu-ams" as Qr3dPrintProfile,
  reliefMode: "raised" as "raised" | "engraved",
  colorStrategy: "three" as "single" | "two" | "three",
  hasLogo: false,
  stylized: false,
  sizeMm: 100,
  baseHeightMm: 2,
  moduleHeightMm: 1.2,
  undersideThicknessMm: 0.4,
  quietZone: 4,
  moduleColor: "#0F172A",
  finderColor: "#0F172A",
  baseColor: "#FFFFFF",
} satisfies Required<Qr3dModelOptions>;

export function qr3dCellSizeMm(qr: NayukiQrCode, options: Qr3dModelOptions = {}): number {
  const quietZone = Math.max(0, Math.floor(optionValue(options, "quietZone")));
  const sizeMm = Math.max(30, optionValue(options, "sizeMm"));
  return sizeMm / (qr.size + quietZone * 2);
}

export function getQr3dPrintabilityWarnings(qr: NayukiQrCode, options: Qr3dModelOptions = {}): Qr3dPrintabilityWarning[] {
  const cellSize = qr3dCellSizeMm(qr, options);
  const moduleHeight = Math.max(0.4, optionValue(options, "moduleHeightMm"));
  const undersideThickness = Math.max(0.2, optionValue(options, "undersideThicknessMm"));
  const warnings: Qr3dPrintabilityWarning[] = [];
  if (cellSize < 1.2) warnings.push({ level: "warning", message: `Small QR cells (${cellSize.toFixed(2)} mm). Use 100 mm or larger for easier printing.` });
  else if (cellSize < 1.5) warnings.push({ level: "warning", message: `Fine QR cells (${cellSize.toFixed(2)} mm). A 0.4 mm nozzle may soften detail.` });
  if (options.reliefMode !== "engraved" && moduleHeight < 0.6) warnings.push({ level: "warning", message: "Raised height below 0.6 mm may disappear on the first layers." });
  if (options.reliefMode !== "engraved" && undersideThickness > Math.max(0.2, Math.max(0.8, optionValue(options, "baseHeightMm")) - 0.2)) {
    warnings.push({ level: "warning", message: "Bottom QR thickness is limited to keep a solid top layer." });
  }
  const islandStats = qr3dIslandStats(qr);
  if (islandStats.smallestCells > 0 && cellSize * islandStats.smallestCells < 1.2) {
    warnings.push({ level: "warning", message: `Smallest QR island is ${islandStats.smallestCells} cell${islandStats.smallestCells === 1 ? "" : "s"}; it may be fragile at this size.` });
  }
  if (options.reliefMode === "engraved") warnings.push({ level: "info", message: "Through-hole QR includes support bridges. Place it on a contrasting surface and test scanning before printing." });
  if (options.hasLogo) warnings.push({ level: "info", message: "Center logos are not represented in 3D exports." });
  if (options.stylized) warnings.push({ level: "info", message: "Decorative 2D module styling is simplified to square 3D cells." });
  if (options.profile === "laser-cnc") warnings.push({ level: "info", message: "Laser/CNC output is a geometric reference; verify tool diameter and depth separately." });
  warnings.push({ level: "info", message: "STL is single-material; use 3MF for Bambu material assignment or OBJ for Blender." });
  return warnings;
}

export function qr3dIslandStats(qr: NayukiQrCode): { count: number; smallestCells: number } {
  const visited = Array.from({ length: qr.size }, () => Array<boolean>(qr.size).fill(false));
  const sizes: number[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (visited[y][x] || !qr.getModule(x, y)) continue;
      const queue: Array<[number, number]> = [[x, y]];
      visited[y][x] = true;
      let size = 0;
      while (queue.length > 0) {
        const [currentX, currentY] = queue.pop()!;
        size += 1;
        for (const [nextX, nextY] of [[currentX - 1, currentY], [currentX + 1, currentY], [currentX, currentY - 1], [currentX, currentY + 1]] as Array<[number, number]>) {
          if (nextX < 0 || nextY < 0 || nextX >= qr.size || nextY >= qr.size || visited[nextY][nextX] || !qr.getModule(nextX, nextY)) continue;
          visited[nextY][nextX] = true;
          queue.push([nextX, nextY]);
        }
      }
      sizes.push(size);
    }
  }
  return { count: sizes.length, smallestCells: sizes.length > 0 ? Math.min(...sizes) : 0 };
}

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

function objNumber(value: number): string {
  // Blender treats an imported OBJ unit as one metre by default. Encoding
  // coordinates in metres makes the 100 mm coaster import at the right size.
  return (value / 1000).toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
}

export function modelTriangles(qr: NayukiQrCode, options: Qr3dModelOptions = {}, separateParts = true): Triangle[] {
  return buildCoasterMesh(qr, {
    size: Math.max(30, optionValue(options, "sizeMm")),
    base: Math.max(0.8, optionValue(options, "baseHeightMm")),
    relief: Math.max(0.4, optionValue(options, "moduleHeightMm")),
    bottom: optionValue(options, "undersideThicknessMm"),
    margin: Math.max(0, Math.floor(optionValue(options, "quietZone"))),
    engraved: optionValue(options, "reliefMode") === "engraved",
    colorStrategy: optionValue(options, "colorStrategy"),
  }, separateParts);
}

function vertexKey(vertex: Vertex): string {
  return `${number(vertex.x)},${number(vertex.y)},${number(vertex.z)}`;
}

export function validateQr3dMesh(qr: NayukiQrCode, options: Qr3dModelOptions = {}): Qr3dMeshValidation {
  const edgeCounts = new Map<string, number>();
  const edgeDirections = new Map<string, number>();
  let degenerateFacets = 0;
  const addEdge = (a: Vertex, b: Vertex, material: MaterialIndex): void => {
    const first = vertexKey(a);
    const second = vertexKey(b);
    const edge = first < second ? `${material}:${first}|${second}` : `${material}:${second}|${first}`;
    edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
    edgeDirections.set(edge, (edgeDirections.get(edge) ?? 0) + (first < second ? 1 : -1));
  };
  for (const triangle of modelTriangles(qr, options)) {
    const area = Math.hypot(...Object.values(normal(triangle.a, triangle.b, triangle.c))) > 0;
    if (!area || (vertexKey(triangle.a) === vertexKey(triangle.b)) || (vertexKey(triangle.b) === vertexKey(triangle.c)) || (vertexKey(triangle.c) === vertexKey(triangle.a))) {
      degenerateFacets += 1;
      continue;
    }
    addEdge(triangle.a, triangle.b, triangle.material);
    addEdge(triangle.b, triangle.c, triangle.material);
    addEdge(triangle.c, triangle.a, triangle.material);
  }
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  let inconsistentEdges = 0;
  for (const [edge, count] of edgeCounts) {
    if (count === 1) boundaryEdges += 1;
    else if (count > 2) nonManifoldEdges += 1;
    else if (edgeDirections.get(edge) !== 0) inconsistentEdges++;
  }
  return { watertight: boundaryEdges === 0 && nonManifoldEdges === 0 && degenerateFacets === 0 && inconsistentEdges === 0, boundaryEdges, nonManifoldEdges, degenerateFacets, inconsistentEdges };
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
  const triangles = modelTriangles(qr, options, false);
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
  const vertexKeys = new Map<string, number>();
  const materialNames = ["base", "modules", "finders"];
  let activeMaterial = "";
  let activeGroup = "";

  function vertexIndex(vertex: Vertex): number {
    const key = `${activeMaterial}:${objNumber(vertex.x)},${objNumber(vertex.y)},${objNumber(vertex.z)}`;
    const existing = vertexKeys.get(key);
    if (existing !== undefined) return existing;
    const index = vertexKeys.size + 1;
    vertexKeys.set(key, index);
    vertices.push(`v ${objNumber(vertex.x)} ${objNumber(vertex.y)} ${objNumber(vertex.z)}`);
    return index;
  }

  // The shared model is triangulated for STL and 3MF compatibility. OBJ can
  // retain each source quad and weld shared coordinates for clean Blender topology.
  for (let index = 0; index < triangles.length; index += 2) {
    const triangle = triangles[index];
    const next = triangles[index + 1];
    if (!triangle) continue;
    const material = materialNames[triangle.material];
    if (activeGroup !== material) {
      faces.push(`g ${material}`);
      activeGroup = material;
    }
    if (activeMaterial !== material) {
      faces.push(`usemtl ${material}`);
      activeMaterial = material;
    }
    if (next && next.material === triangle.material) {
      faces.push(`f ${vertexIndex(triangle.a)} ${vertexIndex(triangle.b)} ${vertexIndex(triangle.c)} ${vertexIndex(next.c)}`);
    } else {
      faces.push(`f ${vertexIndex(triangle.a)} ${vertexIndex(triangle.b)} ${vertexIndex(triangle.c)}`);
    }
  }

  return [
    "# SayaQR print-ready QR coaster",
    "# OBJ export for Blender and 3D tools. Coordinates are meters; coaster dimensions are 100 mm by default.",
    "# Planar source faces are welded and exported as quads for easier editing and beveling.",
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

export function qr3dReadme(options: Qr3dModelOptions = {}): string {
  const profile = QR3D_PRINT_PROFILES.find((item) => item.id === options.profile) ?? QR3D_PRINT_PROFILES[0];
  return [
    "SayaQR 3D QR coaster",
    "Generated locally in the browser.",
    `Profile: ${profile.name}`,
    `Size: ${optionValue(options, "sizeMm")} mm square`,
    `Base: ${optionValue(options, "baseHeightMm")} mm`,
    options.reliefMode === "engraved" ? "Through-hole stencil with printable support bridges" : `Raised QR height: ${optionValue(options, "moduleHeightMm")} mm`,
    options.reliefMode === "engraved" ? "Engraved QR cells are through-holes; the surface beneath the coaster shows through." : "The underside is flat; QR modules are raised above the base.",
    options.reliefMode === "engraved" ? "Engraved exports have no bottom QR material; STL and OBJ preserve the openings." : "Raised exports can include a flush underside QR inlay for multi-material 3MF workflows; STL cannot preserve colors.",
    "STL is single-material. Raised 3MF contains separate base, module, and finder parts in one assembly; stencil 3MF contains only the base.",
    "OBJ coordinates are encoded in metres for Blender's default importer and include an MTL file.",
    "Check the exported model in your slicer before printing.",
    "",
  ].join("\n");
}

export async function objZipBlob(qr: NayukiQrCode, options: Qr3dModelOptions = {}): Promise<Blob> {
  const objName = "sayaqr-coaster.obj";
  const mtlName = "sayaqr-coaster.mtl";
  return createZip([
    { name: objName, data: qrToObj(qr, options, mtlName) },
    { name: mtlName, data: qrToMtl(options) },
    { name: "README.txt", data: qr3dReadme(options) },
  ]);
}

function build3mfModel(qr: NayukiQrCode, options: Qr3dModelOptions): string {
  const triangles = modelTriangles(qr, options);
  const materials = ([0, 1, 2] as const).filter((material) => triangles.some((triangle) => triangle.material === material));
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
    ${materials.map((material) => objectXml(material)).join("\n")}
    <object id="5" type="model" name="SayaQR coaster assembly">
      <components>${materials.map((material) => `<component objectid="${material + 2}"/>`).join("")}</components>
    </object>
  </resources>
  <build>
    <item objectid="5"/>
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
    {
      name: "README.txt",
      data: qr3dReadme(options),
    },
  ];
  return createZip(files);
}
