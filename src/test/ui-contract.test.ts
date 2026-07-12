import { describe, expect, it } from "vitest";
import mainSource from "../main.ts?raw";
import styleSource from "../style.css?inline";

describe("intent-first UI contract", () => {
  it("starts empty without demo payload defaults", () => {
    expect(mainSource).not.toContain('defaultValue: "Generated locally by SayaQR"');
    expect(mainSource).not.toContain('defaultValue: "https://github.com/subtlesayak/SayaQR"');
    expect(mainSource).toContain("Enter content to generate a QR code.");
    expect(mainSource).toContain("Type or paste content; SayaQR detects the QR type automatically.");
    expect(mainSource).not.toContain("Paste content above, then auto-detect its category.");
  });

  it("keeps advanced capabilities collapsed in native details", () => {
    expect(mainSource).toContain('<details class="disclosure" id="editDetails">');
    expect(mainSource).toContain('<details class="disclosure" id="customizeDetails">');
    expect(mainSource).toContain('<details class="technical-payload">');
    expect(mainSource).toContain("Batch generate");
    expect(mainSource).not.toContain('<details class="disclosure" id="editDetails" open>');
  });

  it("uses PNG as the primary export and keeps alternate formats", () => {
    expect(mainSource).toContain("<span>Download PNG</span>");
    expect(mainSource).toContain("<summary>More formats</summary>");
    expect(mainSource).toContain('data-export="svg"');
    expect(mainSource).toContain('data-export="webp"');
    expect(mainSource).toContain('data-export="pdf"');
    expect(mainSource.indexOf('id="copyImage"')).toBeLessThan(mainSource.indexOf('<details class="more-formats">'));
    expect(mainSource.indexOf('<details class="more-formats">')).toBeLessThan(mainSource.indexOf('id="shareImage"'));
  });

  it("keeps the desktop columns compact and simplifies the empty preview", () => {
    expect(mainSource.indexOf('class="tool-surface controls"')).toBeLessThan(mainSource.indexOf('class="tool-surface batch-zone'));
    expect(mainSource.indexOf('class="tool-surface batch-zone')).toBeLessThan(mainSource.indexOf('class="tool-surface preview-zone'));
    expect(mainSource).toContain('previewZone.dataset.contentState = currentPayload.trim() ? "ready" : "empty"');
    expect(styleSource).toContain('.preview-zone[data-content-state="empty"] .intent-preview');
    expect(styleSource).toMatch(/input\[type="range"\]\s*\{[^}]*min-height: 42px;/);
  });

  it("selects the square finder style by default", () => {
    expect(mainSource).toContain('<option value="square" selected>Square</option>');
    expect(mainSource).not.toContain('<option value="rounded" selected>Rounded</option>');
  });

  it("preserves custom color, logo, and offline controls", () => {
    expect(mainSource).toContain('id="foregroundHex"');
    expect(mainSource).toContain('id="backgroundHex"');
    expect(mainSource).toContain('id="logoPresetSelect"');
    expect(mainSource).toContain('id="logoUpload"');
    expect(mainSource).toContain("registerServiceWorker();");
  });

});
