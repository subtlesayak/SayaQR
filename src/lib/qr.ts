import { qrcodegen } from "./nayuki-qrcodegen";
import { encodeOptimally } from "./optimal-segments";

export type ErrorCorrectionLevel = "LOW" | "MEDIUM" | "QUARTILE" | "HIGH";

const ECC_MAP: Record<ErrorCorrectionLevel, qrcodegen.QrCode.Ecc> = {
  LOW: qrcodegen.QrCode.Ecc.LOW,
  MEDIUM: qrcodegen.QrCode.Ecc.MEDIUM,
  QUARTILE: qrcodegen.QrCode.Ecc.QUARTILE,
  HIGH: qrcodegen.QrCode.Ecc.HIGH,
};

export type NayukiQrCode = qrcodegen.QrCode;

export function createQrCode(payload: string, ecc: ErrorCorrectionLevel = "HIGH"): NayukiQrCode {
  let baseline: NayukiQrCode | undefined;
  let baselineError: unknown;
  try {
    baseline = qrcodegen.QrCode.encodeText(payload, ECC_MAP[ecc]);
  } catch (error) {
    if (!(error instanceof RangeError) || error.message !== "Data too long") throw error;
    baselineError = error;
  }
  // The original encoder remains a fallback for optimizer errors/regressions.
  try {
    const optimized = encodeOptimally(payload, ECC_MAP[ecc]);
    if (!baseline || optimized.size <= baseline.size) return optimized;
  } catch {
    if (!baseline) throw baselineError;
  }
  if (baseline) return baseline;
  throw baselineError;
}

export function qrToMatrix(qr: NayukiQrCode): boolean[][] {
  return Array.from({ length: qr.size }, (_, y) => Array.from({ length: qr.size }, (_, x) => qr.getModule(x, y)));
}
