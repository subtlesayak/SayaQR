import { describe, expect, it } from "vitest";
import { detectQrContent } from "../lib/autodetect";
import {
  calculateContainedDimensions,
  validateImageFile,
  validateSvgMarkup,
} from "../lib/qr-decoder";

describe("local QR image validation", () => {
  it("rejects non-image and oversized files", () => {
    expect(() => validateImageFile({ type: "text/plain", size: 20 })).toThrow("supported image");
    expect(() => validateImageFile({ type: "image/png", size: 13 * 1024 * 1024 })).toThrow("12 MB");
    expect(() => validateImageFile({ type: "image/png", size: 5 * 1024 * 1024 }, 5 * 1024 * 1024)).not.toThrow();
  });

  it("calculates bounded dimensions while preserving aspect ratio", () => {
    expect(calculateContainedDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(calculateContainedDimensions(600, 900, 1600)).toEqual({ width: 600, height: 900 });
    expect(calculateContainedDimensions(1000, 3000, 1024)).toEqual({ width: 341, height: 1024 });
  });

  it("rejects scriptable or remotely-referencing SVG markup", () => {
    expect(() => validateSvgMarkup('<svg><script>alert(1)</script></svg>')).toThrow("active or remote");
    expect(() => validateSvgMarkup('<svg><image href="https://example.com/logo.png"/></svg>')).toThrow("active or remote");
    expect(() => validateSvgMarkup('<svg><rect width="10" height="10" fill="#000"/></svg>')).not.toThrow();
  });

  it("passes imported content through the existing detector", () => {
    const imported = "WIFI:T:WPA;S:Guardian;P:local-only;;";
    const detection = detectQrContent(imported);
    expect(detection.mode).toBe("wifi");
    expect(detection.fields).toMatchObject({ ssid: "Guardian", password: "local-only" });
  });
});
