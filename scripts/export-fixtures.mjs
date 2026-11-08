import { createServer } from "vite";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { createQrCode } = await server.ssrLoadModule("/src/lib/qr.ts");
  const { stlBlob, threeMfBlob, qrToObj, qrToMtl, modelTriangles } = await server.ssrLoadModule("/src/lib/model3d.ts");
  const output = await mkdtemp(join(tmpdir(), "sayaqr-fixtures-"));
  const fixtures = [
    { name: "raised", options: {}, height: 3.2, materials: 3 },
    { name: "thin", options: { baseHeightMm: 0.4, undersideThicknessMm: 0.2, moduleHeightMm: 0.4 }, height: 0.8, materials: 3 },
    { name: "stencil", options: { reliefMode: "engraved" }, height: 2, materials: 1 },
    { name: "single", options: { colorStrategy: "single", undersideThicknessMm: 0 }, height: 3.2, materials: 1 },
    { name: "swap", options: { colorStrategy: "two", undersideThicknessMm: 0 }, height: 3.2, materials: 2 },
  ];
  const qr = createQrCode("https://example.com");
  for (const fixture of fixtures) {
    const { name, options } = fixture;
    const stl = stlBlob(qr, options), threeMf = await threeMfBlob(qr, options);
    await writeFile(join(output, name + ".stl"), new Uint8Array(await stl.arrayBuffer()));
    await writeFile(join(output, name + ".3mf"), new Uint8Array(await threeMf.arrayBuffer()));
    await writeFile(join(output, name + ".obj"), qrToObj(qr, options, name + ".mtl"));
    await writeFile(join(output, name + ".mtl"), qrToMtl(options));
    console.log(`${name}: ${modelTriangles(qr, options).length} triangles, STL ${stl.size} bytes, 3MF ${threeMf.size} bytes`);
  }
  await writeFile(join(output, "fixtures.json"), JSON.stringify(fixtures));
  console.log("FIXTURE_DIRECTORY=" + output);
} finally { await server.close(); }
