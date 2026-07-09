import { describe, expect, it } from "vitest";
import { getQrHealthBadge } from "../lib/health";

const baseInput = {
  foreground: "#000000",
  background: "#ffffff",
  transparentBackground: false,
  margin: 4,
  logoScale: 0,
  payloadLength: 40,
};

describe("QR health badge", () => {
  it("returns green for scan-friendly QR settings", () => {
    const health = getQrHealthBadge(baseInput);
    expect(health.level).toBe("good");
    expect(health.tone).toBe("green");
    expect(health.label).toBe("Good");
  });

  it("returns yellow for risky warning-level settings", () => {
    const health = getQrHealthBadge({ ...baseInput, margin: 3 });
    expect(health.level).toBe("risky");
    expect(health.tone).toBe("yellow");
    expect(health.message).toBe("Use a larger quiet zone.");
  });

  it("returns red for hard-to-scan settings", () => {
    const health = getQrHealthBadge({ ...baseInput, foreground: "#777777", background: "#777777" });
    expect(health.level).toBe("hard");
    expect(health.tone).toBe("red");
    expect(health.label).toBe("Hard to scan");
  });
});
