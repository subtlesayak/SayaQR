import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const distDir = "dist";
const betaDir = join(distDir, "beta");
const filesToCopy = ["index.html", "icon.svg", "manifest.webmanifest", "sw.js"];

if (!existsSync(distDir)) {
  throw new Error("dist/ does not exist. Run vite build before preparing beta output.");
}

await mkdir(betaDir, { recursive: true });

for (const file of filesToCopy) {
  const source = join(distDir, file);
  if (existsSync(source)) await cp(source, join(betaDir, file));
}

const assetsDir = join(distDir, "assets");
if (existsSync(assetsDir)) {
  await cp(assetsDir, join(betaDir, "assets"), { recursive: true });
}

console.log("Prepared dist/beta for GitHub Pages beta URL.");
