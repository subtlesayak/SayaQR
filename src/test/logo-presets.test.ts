import { describe, expect, it } from "vitest";
import { detectLogoPresetFromText, getLogoPreset, logoPresetToDataUrl } from "../lib/logo-presets";

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
