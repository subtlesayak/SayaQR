import { describe, expect, it } from "vitest";
import mainSource from "../main.ts?raw";

describe("intent-first UI contract", () => {
  it("starts empty without demo payload defaults", () => {
    expect(mainSource).not.toContain('defaultValue: "Generated locally by SayaQR"');
    expect(mainSource).not.toContain('defaultValue: "https://github.com/subtlesayak/SayaQR"');
    expect(mainSource).toContain("Enter content to generate a QR code.");
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
  });

  it("preserves custom color, logo, and offline controls", () => {
    expect(mainSource).toContain('id="foregroundHex"');
    expect(mainSource).toContain('id="backgroundHex"');
    expect(mainSource).toContain('id="logoPresetSelect"');
    expect(mainSource).toContain('id="logoUpload"');
    expect(mainSource).toContain("registerServiceWorker();");
  });

});
