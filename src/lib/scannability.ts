export type WarningLevel = "info" | "warning" | "danger";

export interface ScannabilityWarning {
  id: "contrast" | "quiet-zone" | "logo" | "length" | "transparent";
  level: WarningLevel;
  message: string;
}

export interface ScannabilityInput {
  foreground: string;
  background: string;
  transparentBackground: boolean;
  margin: number;
  logoScale: number;
  payloadLength: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const cleaned = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    return {
      r: parseInt(cleaned[0] + cleaned[0], 16),
      g: parseInt(cleaned[1] + cleaned[1], 16),
      b: parseInt(cleaned[2] + cleaned[2], 16),
    };
  }
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(cleaned)) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16),
      g: parseInt(cleaned.slice(2, 4), 16),
      b: parseInt(cleaned.slice(4, 6), 16),
    };
  }
  return null;
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(color: Rgb): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) return 1;
  const a = luminance(fg);
  const b = luminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getScannabilityWarnings(input: ScannabilityInput): ScannabilityWarning[] {
  const warnings: ScannabilityWarning[] = [];
  const contrast = contrastRatio(input.foreground, input.background);

  if (!input.transparentBackground && contrast < 4.5) {
    warnings.push({
      id: "contrast",
      level: contrast < 3 ? "danger" : "warning",
      message: `Contrast ratio is ${contrast.toFixed(2)}:1. Use a darker foreground or lighter background.`,
    });
  }

  if (input.transparentBackground) {
    warnings.push({
      id: "transparent",
      level: "info",
      message: "Transparent exports depend on the final surface behind the QR code.",
    });
  }

  if (input.margin < 4) {
    warnings.push({
      id: "quiet-zone",
      level: input.margin < 2 ? "danger" : "warning",
      message: "Quiet zone is smaller than the recommended 4 modules.",
    });
  }

  if (input.logoScale > 0.22) {
    warnings.push({
      id: "logo",
      level: input.logoScale > 0.3 ? "danger" : "warning",
      message: "Logo covers a large center area. Keep it near 20% of the QR width for reliable scans.",
    });
  }

  if (input.payloadLength > 1200) {
    warnings.push({
      id: "length",
      level: input.payloadLength > 2200 ? "danger" : "warning",
      message: "Payload is long, which creates a dense QR code that can be harder to scan.",
    });
  }

  return warnings;
}
