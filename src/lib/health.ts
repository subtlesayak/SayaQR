import { getScannabilityWarnings, type ScannabilityWarning } from "./scannability";

export type QrHealthLevel = "good" | "risky" | "hard";

export interface QrHealthInput {
  foreground: string;
  background: string;
  transparentBackground: boolean;
  margin: number;
  logoScale: number;
  payloadLength: number;
}

export interface QrHealthBadge {
  level: QrHealthLevel;
  label: "Good" | "Risky" | "Hard to scan";
  tone: "green" | "yellow" | "red";
  message: string;
  warnings: ScannabilityWarning[];
}

function shortMessage(warnings: ScannabilityWarning[]): string {
  if (warnings.some((warning) => warning.id === "contrast")) return "Increase color contrast.";
  if (warnings.some((warning) => warning.id === "quiet-zone")) return "Use a larger quiet zone.";
  if (warnings.some((warning) => warning.id === "logo")) return "Make the logo smaller.";
  if (warnings.some((warning) => warning.id === "length")) return "Shorten the QR content.";
  if (warnings.some((warning) => warning.id === "transparent")) return "Test on the final background.";
  return "Ready to scan.";
}

export function getQrHealthBadge(input: QrHealthInput): QrHealthBadge {
  const warnings = getScannabilityWarnings(input);
  const hasDanger = warnings.some((warning) => warning.level === "danger");
  const hasWarning = warnings.some((warning) => warning.level === "warning");
  if (hasDanger || input.payloadLength > 2200) {
    return { level: "hard", label: "Hard to scan", tone: "red", message: shortMessage(warnings), warnings };
  }
  if (hasWarning || input.payloadLength > 1200) {
    return { level: "risky", label: "Risky", tone: "yellow", message: shortMessage(warnings), warnings };
  }
  return { level: "good", label: "Good", tone: "green", message: shortMessage(warnings), warnings };
}