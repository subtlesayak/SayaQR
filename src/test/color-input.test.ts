import { describe, expect, it } from "vitest";
import { isCompleteHexColorEntry } from "../lib/color-input";

describe("color input helpers", () => {
  it("waits until a full 24-bit or 32-bit hex value is typed", () => {
    expect(isCompleteHexColorEntry("#12345")).toBe(false);
    expect(isCompleteHexColorEntry("#123456")).toBe(true);
    expect(isCompleteHexColorEntry("12345678")).toBe(true);
  });

  it("does not treat shorthand colors as complete while typing", () => {
    expect(isCompleteHexColorEntry("#123")).toBe(false);
  });
});
