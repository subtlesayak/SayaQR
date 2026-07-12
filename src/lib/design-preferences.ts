import type { FinderStyle } from "./render";
import type { ErrorCorrectionLevel } from "./qr";

export const DESIGN_PREFERENCE_KEY = "sayaqr:design:v1";

export type DesignColorMode = "default" | "logo" | "custom";
export type PreferredExportFormat = "png" | "svg" | "webp" | "pdf";

export interface DesignPreferences {
  colorMode: DesignColorMode;
  foreground: string;
  background: string;
  transparentBackground: boolean;
  margin: number;
  moduleSize: number;
  rounded: number;
  finderStyle: FinderStyle;
  ecc: ErrorCorrectionLevel;
  logoScale: number;
  preferredExportFormat: PreferredExportFormat;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const COLOR_MODES: DesignColorMode[] = ["default", "logo", "custom"];
const FINDER_STYLES: FinderStyle[] = ["square", "rounded", "circle"];
const ECC_LEVELS: ErrorCorrectionLevel[] = ["LOW", "MEDIUM", "QUARTILE", "HIGH"];
const EXPORT_FORMATS: PreferredExportFormat[] = ["png", "svg", "webp", "pdf"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumberInRange(value, minimum, maximum) && Number.isInteger(value);
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

export function validateDesignPreferences(value: unknown): DesignPreferences | null {
  if (!isRecord(value)) return null;

  const {
    colorMode,
    foreground,
    background,
    transparentBackground,
    margin,
    moduleSize,
    rounded,
    finderStyle,
    ecc,
    logoScale,
    preferredExportFormat,
  } = value;

  if (
    !isOneOf(colorMode, COLOR_MODES) ||
    typeof foreground !== "string" ||
    !COLOR_PATTERN.test(foreground) ||
    typeof background !== "string" ||
    !COLOR_PATTERN.test(background) ||
    typeof transparentBackground !== "boolean" ||
    !isIntegerInRange(margin, 0, 10) ||
    !isIntegerInRange(moduleSize, 4, 28) ||
    !isFiniteNumberInRange(rounded, 0, 1) ||
    !isOneOf(finderStyle, FINDER_STYLES) ||
    !isOneOf(ecc, ECC_LEVELS) ||
    !isFiniteNumberInRange(logoScale, 0.05, 0.35) ||
    !isOneOf(preferredExportFormat, EXPORT_FORMATS)
  ) {
    return null;
  }

  return {
    colorMode,
    foreground: foreground.toUpperCase(),
    background: background.toUpperCase(),
    transparentBackground,
    margin,
    moduleSize,
    rounded,
    finderStyle,
    ecc,
    logoScale,
    preferredExportFormat,
  };
}

export function serializeDesignPreferences(value: DesignPreferences): string {
  const validated = validateDesignPreferences(value);
  if (!validated) throw new Error("Invalid design preferences");

  return JSON.stringify({
    colorMode: validated.colorMode,
    foreground: validated.foreground,
    background: validated.background,
    transparentBackground: validated.transparentBackground,
    margin: validated.margin,
    moduleSize: validated.moduleSize,
    rounded: validated.rounded,
    finderStyle: validated.finderStyle,
    ecc: validated.ecc,
    logoScale: validated.logoScale,
    preferredExportFormat: validated.preferredExportFormat,
  });
}

export function parseDesignPreferences(raw: string | null): DesignPreferences | null {
  if (!raw) return null;
  try {
    return validateDesignPreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadDesignPreferences(storage: StorageLike): DesignPreferences | null {
  try {
    return parseDesignPreferences(storage.getItem(DESIGN_PREFERENCE_KEY));
  } catch {
    return null;
  }
}

export function saveDesignPreferences(storage: StorageLike, value: DesignPreferences): boolean {
  try {
    storage.setItem(DESIGN_PREFERENCE_KEY, serializeDesignPreferences(value));
    return true;
  } catch {
    return false;
  }
}

export function clearDesignPreferences(storage: StorageLike): boolean {
  try {
    storage.removeItem(DESIGN_PREFERENCE_KEY);
    return true;
  } catch {
    return false;
  }
}
