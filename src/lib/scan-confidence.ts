import { contrastRatio } from "./scannability";
import { decodeQrImageData, type DecodedQr } from "./qr-decoder";

export type ScanConfidenceLevel =
  | "excellent"
  | "good"
  | "risky"
  | "poor"
  | "unavailable";

export interface ScanCaseResult {
  id: string;
  label: string;
  passed: boolean;
  decodedValue?: string;
}

export interface ScanConfidenceResult {
  level: ScanConfidenceLevel;
  passed: number;
  total: number;
  cases: ScanCaseResult[];
}

export interface AutoFixValues {
  margin: number;
  ecc: string;
  logoScale: number;
  rounded: number;
  transparentBackground: boolean;
  foreground: string;
  background: string;
}

interface ScanVariant {
  id: string;
  label: string;
  size: number;
  blur?: number;
  wash?: number;
  rotation?: number;
}

const SCAN_VARIANTS: ScanVariant[] = [
  { id: "normal", label: "Normal (256 px)", size: 256 },
  { id: "small", label: "Small (128 px)", size: 128 },
  { id: "tiny", label: "Tiny (96 px)", size: 96 },
  { id: "mild-blur", label: "Mild blur", size: 160, blur: 0.65 },
  { id: "low-contrast", label: "Low contrast", size: 180, wash: 0.36 },
  { id: "slight-rotation", label: "Slight rotation", size: 192, rotation: 2 },
];

export function decodedPayloadMatches(decoded: DecodedQr | null, expectedPayload: string): boolean {
  return decoded?.data === expectedPayload;
}

export function gradeScanResults(cases: ScanCaseResult[]): ScanConfidenceResult {
  const passed = cases.filter((item) => item.passed).length;
  const total = cases.length;
  let level: ScanConfidenceLevel;

  if (total === 0) level = "unavailable";
  else if (passed === 6 && total === 6) level = "excellent";
  else if (passed === 5 && total === 6) level = "good";
  else if (passed >= 3) level = "risky";
  else level = "poor";

  return { level, passed, total, cases };
}

export function calculateAutoFixValues(values: AutoFixValues): AutoFixValues {
  const lowContrast = contrastRatio(values.foreground, values.background) < 4.5;
  return {
    margin: Math.max(4, values.margin),
    ecc: "HIGH",
    logoScale: Math.min(0.2, values.logoScale),
    rounded: Math.min(0.15, values.rounded),
    transparentBackground: false,
    foreground: lowContrast ? "#0F172A" : values.foreground,
    background: lowContrast ? "#FFFFFF" : values.background,
  };
}

export class LatestScanRun {
  private value = 0;

  next(): number {
    this.value += 1;
    return this.value;
  }

  invalidate(): number {
    return this.next();
  }

  isCurrent(runId: number): boolean {
    return runId === this.value;
  }
}

function unavailableResult(): ScanConfidenceResult {
  return gradeScanResults([]);
}

function loadSvg(svg: string): Promise<{ image: HTMLImageElement; url: string }> {
  const image = new Image();
  image.decoding = "async";
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  return new Promise((resolve, reject) => {
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("QR preview could not be rendered for local testing."));
    };
    image.src = url;
  });
}

function renderVariant(image: HTMLImageElement, variant: ScanVariant): DecodedQr | null {
  const canvas = document.createElement("canvas");
  canvas.width = variant.size;
  canvas.height = variant.size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Canvas is unavailable.");
  }

  try {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, variant.size, variant.size);
    context.save();
    if (variant.blur) context.filter = `blur(${variant.blur}px)`;

    if (variant.rotation) {
      const radians = (variant.rotation * Math.PI) / 180;
      const drawSize = Math.floor(variant.size * 0.9);
      context.translate(variant.size / 2, variant.size / 2);
      context.rotate(radians);
      context.drawImage(image, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    } else {
      context.drawImage(image, 0, 0, variant.size, variant.size);
    }
    context.restore();

    if (variant.wash) {
      context.fillStyle = `rgba(255, 255, 255, ${variant.wash})`;
      context.fillRect(0, 0, variant.size, variant.size);
    }

    return decodeQrImageData(context.getImageData(0, 0, variant.size, variant.size));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function testQrSvg(
  svg: string,
  expectedPayload: string,
): Promise<ScanConfidenceResult> {
  if (!svg || !expectedPayload || typeof document === "undefined" || typeof Image === "undefined") {
    return unavailableResult();
  }

  let loaded: { image: HTMLImageElement; url: string } | null = null;
  try {
    loaded = await loadSvg(svg);
    const cases: ScanCaseResult[] = [];
    for (const variant of SCAN_VARIANTS) {
      const decoded = renderVariant(loaded.image, variant);
      cases.push({
        id: variant.id,
        label: variant.label,
        passed: decodedPayloadMatches(decoded, expectedPayload),
        ...(decoded ? { decodedValue: decoded.data } : {}),
      });
    }
    return gradeScanResults(cases);
  } catch {
    return unavailableResult();
  } finally {
    if (loaded) {
      loaded.image.onload = null;
      loaded.image.onerror = null;
      loaded.image.src = "";
      URL.revokeObjectURL(loaded.url);
    }
  }
}
