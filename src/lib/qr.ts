import { qrcodegen } from "./nayuki-qrcodegen";

export type ErrorCorrectionLevel = "LOW" | "MEDIUM" | "QUARTILE" | "HIGH";

const ECC_MAP: Record<ErrorCorrectionLevel, qrcodegen.QrCode.Ecc> = {
  LOW: qrcodegen.QrCode.Ecc.LOW,
  MEDIUM: qrcodegen.QrCode.Ecc.MEDIUM,
  QUARTILE: qrcodegen.QrCode.Ecc.QUARTILE,
  HIGH: qrcodegen.QrCode.Ecc.HIGH,
};

export type NayukiQrCode = qrcodegen.QrCode;

export function createQrCode(payload: string, ecc: ErrorCorrectionLevel = "HIGH"): NayukiQrCode {
  return qrcodegen.QrCode.encodeText(payload, ECC_MAP[ecc]);
}

export function qrToMatrix(qr: NayukiQrCode): boolean[][] {
  return Array.from({ length: qr.size }, (_, y) => Array.from({ length: qr.size }, (_, x) => qr.getModule(x, y)));
}
