import { describe, expect, it } from "vitest";
import { createQrCode } from "../lib/qr";
import { DEFAULT_RENDER_OPTIONS } from "../lib/render";
import { QR_STYLE_PRESETS, defaultStyleParams, getStylePreset } from "../lib/stylePresets";

describe("style preset registry", () => {
  it("loads all expected presets", () => {
    expect(QR_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      "classic",
      "rounded",
      "dots",
      "soft-square",
      "neon",
      "minimal-mono",
      "sticker",
      "glass",
      "pixel",
      "malayalam-ornamental",
      "retro-terminal",
      "business-card",
    ]);
  });

  it("falls back to classic for unknown preset ids", () => {
    expect(getStylePreset("missing").id).toBe("classic");
  });

  it("copies default style params", () => {
    const first = defaultStyleParams("rounded");
    const second = defaultStyleParams("rounded");
    first.radius = 0;
    expect(second.radius).not.toBe(0);
  });

  it("renders valid SVG for every preset", () => {
    const qr = createQrCode("https://github.com/subtlesayak/SayaQR", "HIGH");

    for (const preset of QR_STYLE_PRESETS) {
      const svg = preset.renderSvg(qr, DEFAULT_RENDER_OPTIONS, preset.defaults);
      expect(svg).toMatch(/^<svg[\s>]/);
      expect(svg).toContain("</svg>");
      expect(svg).toContain("role=\"img\"");
      expect(svg).not.toContain("undefined");
    }
  });
});

