import { createQrCode, type ErrorCorrectionLevel, type NayukiQrCode } from "./qr";
import { getStylePreset, type StyleParams } from "./stylePresets";

export type FinderStyle = "square" | "rounded" | "circle";

export interface QrRenderOptions {
  foreground: string;
  background: string;
  transparentBackground: boolean;
  margin: number;
  moduleSize: number;
  rounded: number;
  finderStyle: FinderStyle;
  logoDataUrl?: string;
  logoScale: number;
  ecc: ErrorCorrectionLevel;
  stylePresetId?: string;
  styleParams?: StyleParams;
}

export const DEFAULT_RENDER_OPTIONS: QrRenderOptions = {
  foreground: "#0f172a",
  background: "#ffffff",
  transparentBackground: false,
  margin: 4,
  moduleSize: 12,
  rounded: 0.12,
  finderStyle: "rounded",
  logoScale: 0.18,
  ecc: "HIGH",
  stylePresetId: "classic",
  styleParams: {},
};

export function buildSvgFromQr(qr: NayukiQrCode, options: QrRenderOptions): string {
  const preset = getStylePreset(options.stylePresetId);
  return preset.renderSvg(qr, options, options.styleParams ?? preset.defaults);
}

export function buildQrSvg(payload: string, options: QrRenderOptions): string {
  return buildSvgFromQr(createQrCode(payload, options.ecc), options);
}

export function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

export async function svgToRasterBlob(svg: string, mimeType: "image/png" | "image/webp"): Promise<Blob> {
  const match = svg.match(/width="(\d+)" height="(\d+)"/);
  const width = match ? Number(match[1]) : 1024;
  const height = match ? Number(match[2]) : width;
  const image = new Image();
  const url = URL.createObjectURL(svgBlob(svg));

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not rasterize SVG"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");
    context.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))), mimeType, 0.95);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function colorToRgb(color: string): [number, number, number] {
  const cleaned = color.trim().replace(/^#/, "");
  const normalized = cleaned.length === 3 ? cleaned.split("").map((char) => char + char).join("") : cleaned.padEnd(6, "0").slice(0, 6);
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [Number.isFinite(r) ? r / 255 : 0, Number.isFinite(g) ? g / 255 : 0, Number.isFinite(b) ? b / 255 : 0];
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfFromCommands(commands: string[], pageWidth: number, pageHeight: number, label: string): Blob {
  const stream = `${commands.join("\n")}\nBT /F1 8 Tf 36 18 Td (${pdfEscape(label)}) Tj ET`;
  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([body], { type: "application/pdf" });
}

function qrPdfCommands(payload: string, options: QrRenderOptions, unitScale: number): { commands: string[]; page: number; qr: NayukiQrCode; unit: number; margin: number; totalModules: number } {
  const qr = createQrCode(payload, options.ecc);
  const margin = Math.max(0, Math.floor(options.margin));
  const totalModules = qr.size + margin * 2;
  const unit = Math.max(3, Math.floor(options.moduleSize * unitScale));
  const page = totalModules * unit + 72;
  const offset = 36;
  const [fr, fg, fb] = colorToRgb(options.foreground);
  const [br, bg, bb] = colorToRgb(options.background);
  const commands: string[] = ["q"];

  if (!options.transparentBackground) {
    commands.push(`${br.toFixed(4)} ${bg.toFixed(4)} ${bb.toFixed(4)} rg`);
    commands.push(`0 0 ${page} ${page} re f`);
  }

  commands.push(`${fr.toFixed(4)} ${fg.toFixed(4)} ${fb.toFixed(4)} rg`);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        const px = offset + (margin + x) * unit;
        const py = page - offset - (margin + y + 1) * unit;
        commands.push(`${px} ${py} ${unit} ${unit} re f`);
      }
    }
  }
  commands.push("Q");
  return { commands, page, qr, unit, margin, totalModules };
}

export function qrPdfBlob(payload: string, options: QrRenderOptions): Blob {
  const { commands, page } = qrPdfCommands(payload, options, 0.75);
  return pdfFromCommands(commands, page, page, "Generated locally by SayaQR");
}

export function qrStickerSheetPdfBlob(payload: string, options: QrRenderOptions): Blob {
  const qr = createQrCode(payload, options.ecc);
  const margin = Math.max(0, Math.floor(options.margin));
  const unit = Math.max(2, Math.floor(options.moduleSize * 0.52));
  const qrModules = qr.size + margin * 2;
  const qrSize = qrModules * unit;
  const pageWidth = 612;
  const pageHeight = 792;
  const gapX = 34;
  const gapY = 44;
  const startX = 48;
  const startY = pageHeight - 56 - qrSize;
  const [fr, fg, fb] = colorToRgb(options.foreground);
  const commands: string[] = ["q", "1 1 1 rg", `0 0 ${pageWidth} ${pageHeight} re f`];

  for (let copy = 0; copy < 8; copy++) {
    const col = copy % 2;
    const row = Math.floor(copy / 2);
    const offsetX = startX + col * (qrSize + gapX);
    const offsetY = startY - row * (qrSize + gapY);
    if (offsetY < 40) continue;
    commands.push(`0.965 0.975 0.99 rg ${offsetX - 8} ${offsetY - 8} ${qrSize + 16} ${qrSize + 16} re f`);
    commands.push(`0.83 0.87 0.92 RG ${offsetX - 8} ${offsetY - 8} ${qrSize + 16} ${qrSize + 16} re S`);
    commands.push(`${fr.toFixed(4)} ${fg.toFixed(4)} ${fb.toFixed(4)} rg`);
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) {
          const px = offsetX + (margin + x) * unit;
          const py = offsetY + (qrModules - margin - y - 1) * unit;
          commands.push(`${px} ${py} ${unit} ${unit} re f`);
        }
      }
    }
  }
  commands.push("Q");
  return pdfFromCommands(commands, pageWidth, pageHeight, "SayaQR sticker sheet");
}
