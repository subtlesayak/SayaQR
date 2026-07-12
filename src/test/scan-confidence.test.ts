import { describe, expect, it } from "vitest";
import {
  calculateAutoFixValues,
  decodedPayloadMatches,
  gradeScanResults,
  LatestScanRun,
  type ScanCaseResult,
} from "../lib/scan-confidence";

function casesPassing(count: number): ScanCaseResult[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `case-${index}`,
    label: `Case ${index}`,
    passed: index < count,
  }));
}

describe("scan confidence grading", () => {
  it.each([
    [6, "excellent"],
    [5, "good"],
    [4, "risky"],
    [3, "risky"],
    [2, "poor"],
    [0, "poor"],
  ] as const)("grades %i of 6 as %s", (passed, level) => {
    expect(gradeScanResults(casesPassing(passed))).toMatchObject({ passed, total: 6, level });
  });

  it("uses unavailable when no simulation can run", () => {
    expect(gradeScanResults([])).toEqual({ level: "unavailable", passed: 0, total: 0, cases: [] });
  });

  it("requires an exact decoded payload match", () => {
    expect(decodedPayloadMatches({ data: "https://example.com" }, "https://example.com")).toBe(true);
    expect(decodedPayloadMatches({ data: "https://example.com/" }, "https://example.com")).toBe(false);
    expect(decodedPayloadMatches(null, "https://example.com")).toBe(false);
  });
});

describe("Guardian conservative fixes", () => {
  it("changes only bounded safety values and repairs low contrast", () => {
    expect(calculateAutoFixValues({
      margin: 1,
      ecc: "LOW",
      logoScale: 0.32,
      rounded: 0.5,
      transparentBackground: true,
      foreground: "#AAAAAA",
      background: "#FFFFFF",
    })).toEqual({
      margin: 4,
      ecc: "HIGH",
      logoScale: 0.2,
      rounded: 0.15,
      transparentBackground: false,
      foreground: "#0F172A",
      background: "#FFFFFF",
    });
  });

  it("preserves already-safe colors and conservative values", () => {
    expect(calculateAutoFixValues({
      margin: 6,
      ecc: "MEDIUM",
      logoScale: 0.12,
      rounded: 0.1,
      transparentBackground: false,
      foreground: "#111827",
      background: "#FFFFFF",
    })).toEqual({
      margin: 6,
      ecc: "HIGH",
      logoScale: 0.12,
      rounded: 0.1,
      transparentBackground: false,
      foreground: "#111827",
      background: "#FFFFFF",
    });
  });

  it("prevents stale scan runs from becoming current", () => {
    const runs = new LatestScanRun();
    const first = runs.next();
    const second = runs.next();
    expect(runs.isCurrent(first)).toBe(false);
    expect(runs.isCurrent(second)).toBe(true);
    runs.invalidate();
    expect(runs.isCurrent(second)).toBe(false);
  });
});
