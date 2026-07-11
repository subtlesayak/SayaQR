import { describe, expect, it } from "vitest";
import { detectLogoPresetFromText, getLogoMismatchWarning, getLogoPreset, LOGO_PRESETS, logoPresetToDataUrl } from "../lib/logo-presets";

describe("logo presets", () => {
  it.each([
    ["https://www.instagram.com/subtlesayak/", "instagram"],
    ["youtu.be/dQw4w9WgXcQ", "youtube"],
    ["github.com/subtlesayak/SayaQR", "github"],
    ["https://wa.me/15551234567", "whatsapp"],
    ["https://x.com/subtlesayak", "x"],
    ["upi://pay?pa=name@bank&pn=Name", "upi"],
  ])("detects %s as %s", (input, expected) => {
    expect(detectLogoPresetFromText(input)?.id).toBe(expected);
  });

  it("warns when the selected logo does not match the QR content", () => {
    expect(getLogoMismatchWarning("instagram", "https://instagram.com/subtlesayak")).toBeNull();
    expect(getLogoMismatchWarning("instagram", "https://youtube.com/watch?v=123")).toBe("Instagram logo does not match the detected YouTube link.");
    expect(getLogoMismatchWarning("instagram", "https://example.com")).toBe("Instagram logo does not match this QR content.");
    expect(getLogoMismatchWarning("none", "https://example.com")).toBeNull();
  });

  it("provides a primary color for every logo preset", () => {
    expect(LOGO_PRESETS.every((preset) => /^#[0-9A-F]{6}$/.test(preset.color))).toBe(true);
    expect(getLogoPreset("instagram")?.color).toBe("#E4405F");
    expect(getLogoPreset("upi")?.color).toBe("#66686C");
  });

  it("returns undefined for generic links", () => {
    expect(detectLogoPresetFromText("https://example.com/path")).toBeUndefined();
  });

  it("uses the official UPI vector preset", () => {
    const preset = getLogoPreset("upi");
    expect(preset?.label).toContain("official");
    expect(preset?.svg).toContain('viewBox="0 0 130.54 46.118"');
    expect(preset?.svg).not.toContain("<text");
    expect(preset?.svg).not.toMatch(/<script|onload=|onclick=|foreignObject|href="https?:/i);
  });

  it("exports preset SVGs as local data URLs", () => {
    const preset = getLogoPreset("instagram");
    expect(preset).toBeTruthy();
    expect(logoPresetToDataUrl(preset!)).toMatch(/^data:image\/svg\+xml,/);
  });
});
