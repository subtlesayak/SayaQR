import { describe, expect, it } from "vitest";
import mainSource from "../main.ts?raw";

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
    const formatRow = mainSource.slice(
      mainSource.indexOf('<div class="format-action-row"'),
      mainSource.indexOf('id="nativeExportActions"'),
    );
    expect(mainSource).toContain("<span>Download PNG</span>");
    expect(mainSource).toContain('class="format-action-row"');
    expect(mainSource).toContain('class="alternate-format-actions"');
    expect(mainSource).toContain('data-export="svg"');
    expect(mainSource).toContain('data-export="webp"');
    expect(mainSource).toContain('data-export="pdf"');
    expect(mainSource).not.toContain("<summary>More formats</summary>");
    expect(mainSource.indexOf('id="scanTestDetails"')).toBeLessThan(mainSource.indexOf('id="formatGuidance"'));
    expect(mainSource.indexOf('id="formatGuidance"')).toBeLessThan(mainSource.indexOf('class="format-action-row"'));
    expect(formatRow.indexOf("<span>Download PNG</span>")).toBeLessThan(formatRow.indexOf('data-export="svg"'));
    expect(mainSource.indexOf('data-export="pdf"')).toBeLessThan(mainSource.indexOf('id="nativeExportActions"'));
    expect(mainSource.indexOf('id="copyImage"')).toBeLessThan(mainSource.indexOf('id="shareImage"'));
    expect(mainSource).toContain('data-count="0" hidden');
    expect(mainSource).toContain("updateFormatGuidance(format)");
    expect(mainSource).not.toContain('id="preferredExportFormat"');
  });

  it("keeps the desktop columns compact and simplifies the empty preview", () => {
    expect(mainSource.indexOf('class="tool-surface controls"')).toBeLessThan(mainSource.indexOf('class="tool-surface batch-zone'));
    expect(mainSource.indexOf('class="tool-surface batch-zone')).toBeLessThan(mainSource.indexOf('class="tool-surface preview-zone'));
    expect(mainSource).toContain('previewZone.dataset.contentState = currentPayload.trim() ? "ready" : "empty"');
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

  it("presents custom logo uploads through a styled local control", () => {
    expect(mainSource).toContain('class="logo-upload-control"');
    expect(mainSource).toContain('id="logoUploadName"');
    expect(mainSource).toContain("updateLogoUploadName(file.name);");
    expect(mainSource).toContain("rasterizeImageFileToPng(file)");
  });

  it("offers click and drag-and-drop batch file selection", () => {
    expect(mainSource).toContain('id="batchFileDropZone"');
    expect(mainSource).toContain("Drop CSV or TXT here");
    expect(mainSource).toContain("or click to choose a file");
    expect(mainSource).toContain('batchFileDropZone?.addEventListener("drop"');
    expect(mainSource).toContain("void loadBatchFile(file)");
  });

});
