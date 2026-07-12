import { describe, expect, it } from "vitest";
import mainSource from "../main.ts?raw";
import decoderSource from "../lib/qr-decoder.ts?raw";
import scanSource from "../lib/scan-confidence.ts?raw";
import packageJson from "../../package.json";

describe("SayaQR Guardian UI contract", () => {
  it("bundles local decoding and exposes secondary image import paths", () => {
    expect(packageJson.dependencies?.jsqr).toBeTruthy();
    expect(mainSource).toContain("Import QR image");
    expect(mainSource).toContain('addEventListener("drop"');
    expect(mainSource).toContain('addEventListener("paste"');
    expect(mainSource).toContain("QR imported locally");
    expect(mainSource).not.toMatch(/getUserMedia|camera/i);
  });

  it("debounces local checks and guards stale results", () => {
    expect(mainSource).toContain("}, 550);");
    expect(mainSource).toContain("latestScanRun.isCurrent(runId)");
    expect(mainSource).toContain("Checking locally...");
  });

  it("keeps simulation details collapsed and offers conservative repair", () => {
    expect(mainSource).toContain("<summary>Scan test details</summary>");
    expect(mainSource).toContain("Fix automatically");
    expect(mainSource).not.toContain("<details id=\"scanTestDetails\" class=\"scan-test-details\" open");
  });

  it("rasterizes custom uploads and decodes locally", () => {
    expect(mainSource).toContain("rasterizeImageFileToPng(file)");
    expect(decoderSource).toContain('canvas.toDataURL("image/png")');
    expect(decoderSource).toContain('inversionAttempts: "attemptBoth"');
    expect(scanSource).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/);
  });
});
