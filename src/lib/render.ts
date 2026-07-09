import { createQrCode, type ErrorCorrectionLevel, type NayukiQrCode } from "./qr";

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
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function finderOrigins(size: number): Array<{ x: number; y: number }> {
  return [
    { x: 0, y: 0 },
    { x: size - 7, y: 0 },
    { x: 0, y: size - 7 },
  ];
}

function isFinderArea(x: number, y: number, size: number): boolean {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
}

function finderDark(dx: number, dy: number): boolean {
  const distance = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
  return distance !== 2;
}

function moduleRect(x: number, y: number, options: QrRenderOptions): string {
  const round = Math.max(0, Math.min(0.48, options.rounded * 0.48));
  return `<rect x="${x}" y="${y}" width="1" height="1" rx="${round}" ry="${round}"/>`;
}

function drawFinder(origin: { x: number; y: number }, margin: number, options: QrRenderOptions): string {
  const x = margin + origin.x;
  const y = margin + origin.y;
  const rx = options.finderStyle === "rounded" ? 0.45 : 0;

  if (options.finderStyle === "circle") {
    const circles: string[] = [];
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        if (finderDark(dx, dy)) {
          const radius = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4 ? 0.53 : 0.43;
          circles.push(`<circle cx="${x + dx + 0.5}" cy="${y + dy + 0.5}" r="${radius}"/>`);
        }
      }
    }
    return circles.join("");
  }

  return [
    `<rect x="${x}" y="${y}" width="7" height="1" rx="${rx}"/>`,
    `<rect x="${x}" y="${y + 6}" width="7" height="1" rx="${rx}"/>`,
    `<rect x="${x}" y="${y + 1}" width="1" height="5" rx="${rx}"/>`,
    `<rect x="${x + 6}" y="${y + 1}" width="1" height="5" rx="${rx}"/>`,
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${options.finderStyle === "rounded" ? 0.35 : 0}"/>`,
  ].join("");
}

export function buildSvgFromQr(qr: NayukiQrCode, options: QrRenderOptions): string {
  const margin = Math.max(0, Math.floor(options.margin));
  const moduleSize = Math.max(1, Math.floor(options.moduleSize));
  const totalModules = qr.size + margin * 2;
  const pixelSize = totalModules * moduleSize;
  const fg = escapeXml(options.foreground);
  const bg = escapeXml(options.background);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${totalModules} ${totalModules}" role="img" aria-label="QR code">`,
  ];

  if (!options.transparentBackground) {
    parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
  }

  parts.push(`<g fill="${fg}" shape-rendering="geometricPrecision">`);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y) && !isFinderArea(x, y, qr.size)) {
        parts.push(moduleRect(margin + x, margin + y, options));
      }
    }
  }
  for (const origin of finderOrigins(qr.size)) {
    parts.push(drawFinder(origin, margin, options));
  }
  parts.push("</g>");

  if (options.logoDataUrl) {
    const logoSize = Math.max(1, qr.size * Math.max(0.05, Math.min(0.35, options.logoScale)));
    const logoX = margin + (qr.size - logoSize) / 2;
    const logoY = margin + (qr.size - logoSize) / 2;
    const backing = options.transparentBackground ? "#ffffff" : bg;
    parts.push(`<rect x="${logoX - 0.8}" y="${logoY - 0.8}" width="${logoSize + 1.6}" height="${logoSize + 1.6}" rx="1.4" fill="${backing}"/>`);
    parts.push(`<image href="${escapeXml(options.logoDataUrl)}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`);
  }

  parts.push("</svg>");
  return parts.join("");
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
  const cleaned = color.replace(/^#/, "");
  const full = cleaned.length === 3 ? cleaned.split("").map((char) => char + char).join("") : cleaned.slice(0, 6);
  return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255];
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function qrPdfBlob(payload: string, options: QrRenderOptions): Blob {
  const qr = createQrCode(payload, options.ecc);
  const margin = Math.max(0, Math.floor(options.margin));
  const totalModules = qr.size + margin * 2;
  const unit = Math.max(3, Math.floor(options.moduleSize * 0.75));
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
  commands.push("BT /F1 8 Tf 36 18 Td (Generated locally by SayaQR) Tj ET");

  const stream = commands.join("\n");
  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page} ${page}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
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
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return new Blob([body.replace("Generated locally by SayaQR", pdfEscape("Generated locally by SayaQR"))], { type: "application/pdf" });
}
