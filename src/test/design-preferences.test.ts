import { describe, expect, it } from "vitest";
import {
  DESIGN_PREFERENCE_KEY,
  loadDesignPreferences,
  parseDesignPreferences,
  serializeDesignPreferences,
  validateDesignPreferences,
  type DesignPreferences,
  type StorageLike,
} from "../lib/design-preferences";

const validPreferences: DesignPreferences = {
  colorMode: "custom",
  foreground: "#112233",
  background: "#ffffff",
  transparentBackground: false,
  margin: 4,
  moduleSize: 12,
  rounded: 0.2,
  finderStyle: "rounded",
  ecc: "HIGH",
  logoScale: 0.18,
};

function memoryStorage(value: string | null): StorageLike {
  return {
    getItem: (key) => key === DESIGN_PREFERENCE_KEY ? value : null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

describe("design preferences", () => {
  it("validates the supported schema and normalizes colors", () => {
    expect(validateDesignPreferences(validPreferences)).toEqual({
      ...validPreferences,
      foreground: "#112233",
      background: "#FFFFFF",
    });
  });

  it("rejects corrupt and out-of-range values", () => {
    expect(parseDesignPreferences("{broken")).toBeNull();
    expect(validateDesignPreferences({ ...validPreferences, moduleSize: 100 })).toBeNull();
    expect(validateDesignPreferences({ ...validPreferences, logoScale: -1 })).toBeNull();
  });

  it("ignores corrupt localStorage data", () => {
    expect(loadDesignPreferences(memoryStorage("not json"))).toBeNull();
    const throwingStorage: StorageLike = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadDesignPreferences(throwingStorage)).toBeNull();
  });

  it("never serializes content, payloads, passwords, or logo data", () => {
    const input = {
      ...validPreferences,
      quickContent: "secret",
      payload: "WIFI:T:WPA;S:test;P:password;;",
      wifiPassword: "password",
      customLogoData: "data:image/png;base64,secret",
      batchRows: [{ content: "private" }],
    } as DesignPreferences;
    const serialized = serializeDesignPreferences(input);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("batchRows");
    expect(Object.keys(JSON.parse(serialized))).toHaveLength(10);
  });
});
