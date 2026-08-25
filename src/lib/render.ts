import { PDFDocument } from "pdf-lib";
import { createQrCode, type ErrorCorrectionLevel, type NayukiQrCode } from "./qr";
import { contrastRatio, hexToRgb, luminance } from "./scannability";

export type FinderStyle = "square" | "rounded" | "circle";
export type ModuleStyle = "classic" | "dots" | "pixel" | "soft-square" | "neon" | "split-finders" | "sticker";
export type LogoBackgroundMode = "padded" | "none";

export interface QrRenderOptions {
  foreground: string;
  finderColor: string;
  background: string;
  transparentBackground: boolean;
  margin: number;
  moduleSize: number;
  rounded: number;
  moduleStyle: ModuleStyle;
  finderStyle: FinderStyle;
  logoDataUrl?: string;
  logoBackground: LogoBackgroundMode;
  logoStroke: boolean;
  logoStrokeColor: string;
  logoScale: number;
  ecc: ErrorCorrectionLevel;
}

export const DEFAULT_RENDER_OPTIONS: QrRenderOptions = {
  foreground: "#0f172a",
  finderColor: "#0f172a",
  background: "#ffffff",
  transparentBackground: false,
  margin: 4,
  moduleSize: 12,
  rounded: 0.12,
  moduleStyle: "classic",
  finderStyle: "square",
  logoBackground: "padded",
  logoStroke: false,
  logoStrokeColor: "#0f172a",
  logoScale: 0.18,
  ecc: "HIGH",
};

const NEON_ACCENT = "#22D3EE";
const MIN_RENDER_CONTRAST = 4.5;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nearestReadableColor(color: string, visibleBackground: string): string {
  if (contrastRatio(color, visibleBackground) >= MIN_RENDER_CONTRAST) return color;
  const bg = hexToRgb(visibleBackground);
  if (!bg) return DEFAULT_RENDER_OPTIONS.foreground;
  return luminance(bg) > 0.45 ? "#0F172A" : "#FFFFFF";
}

function readableRenderOptions(options: QrRenderOptions): QrRenderOptions {
  const visibleBackground = options.transparentBackground ? "#FFFFFF" : options.background;
  return {
    ...options,
    foreground: nearestReadableColor(options.foreground, visibleBackground),
    finderColor: nearestReadableColor(options.finderColor, visibleBackground),
  };
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
  if (options.moduleStyle === "dots") {
    return `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.42"/>`;
  }
  if (options.moduleStyle === "pixel") {
    return `<rect x="${x + 0.04}" y="${y + 0.04}" width="0.92" height="0.92"/>`;
  }
  if (options.moduleStyle === "soft-square") {
    return `<rect x="${x + 0.06}" y="${y + 0.06}" width="0.88" height="0.88" rx="0.2" ry="0.2"/>`;
  }
  if (options.moduleStyle === "neon") {
    return `<rect x="${x + 0.08}" y="${y + 0.08}" width="0.84" height="0.84" rx="0.18" ry="0.18" stroke="${NEON_ACCENT}" stroke-width="0.12"/>`;
  }
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
  const renderOptions = readableRenderOptions(options);
  const margin = Math.max(0, Math.floor(options.margin));
  const moduleSize = Math.max(1, Math.floor(options.moduleSize));
  const totalModules = qr.size + margin * 2;
  const pixelSize = totalModules * moduleSize;
  const fg = escapeXml(renderOptions.foreground);
  const finder = escapeXml(renderOptions.finderColor);
  const bg = escapeXml(renderOptions.background);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${totalModules} ${totalModules}" role="img" aria-label="QR code">`,
  ];

  if (!renderOptions.transparentBackground) {
    const backgroundRx = renderOptions.moduleStyle === "sticker" ? Math.max(2, margin) : 0;
    parts.push(`<rect width="100%" height="100%" fill="${bg}" rx="${backgroundRx}"/>`);
  }

  if (renderOptions.moduleStyle === "sticker") {
    parts.push(`<rect x="0.5" y="0.5" width="${totalModules - 1}" height="${totalModules - 1}" rx="${Math.max(2, margin)}" fill="none" stroke="${finder}" stroke-width="1" opacity="0.45"/>`);
  }

  parts.push(`<g fill="${fg}" shape-rendering="geometricPrecision">`);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y) && !isFinderArea(x, y, qr.size)) {
        parts.push(moduleRect(margin + x, margin + y, renderOptions));
      }
    }
  }
  if (finder === fg) {
    for (const origin of finderOrigins(qr.size)) {
      parts.push(drawFinder(origin, margin, renderOptions));
    }
    parts.push("</g>");
  } else {
    parts.push("</g>");
    parts.push(`<g fill="${finder}" shape-rendering="geometricPrecision">`);
    for (const origin of finderOrigins(qr.size)) {
      parts.push(drawFinder(origin, margin, renderOptions));
    }
    if (renderOptions.moduleStyle === "split-finders") {
      parts.push("</g>");
      parts.push(`<g fill="${fg}" shape-rendering="geometricPrecision">`);
      for (const origin of finderOrigins(qr.size)) {
        const x = margin + origin.x + 2;
        const y = margin + origin.y + 2;
        parts.push(`<rect x="${x}" y="${y}" width="3" height="3" rx="${renderOptions.finderStyle === "rounded" ? 0.35 : 0}"/>`);
      }
    }
    parts.push("</g>");
  }

  if (renderOptions.logoDataUrl) {
    const logoSize = Math.max(1, qr.size * Math.max(0.05, Math.min(0.35, renderOptions.logoScale)));
    const logoX = margin + (qr.size - logoSize) / 2;
    const logoY = margin + (qr.size - logoSize) / 2;
    const logoPadding = Math.max(0.6, logoSize * 0.08);
    const boxX = logoX - logoPadding;
    const boxY = logoY - logoPadding;
    const boxSize = logoSize + logoPadding * 2;
    const boxRadius = Math.max(0.8, logoPadding * 1.4);
    const backing = renderOptions.transparentBackground ? "#ffffff" : bg;
    if (renderOptions.logoBackground !== "none") {
      parts.push(`<rect x="${boxX}" y="${boxY}" width="${boxSize}" height="${boxSize}" rx="${boxRadius}" fill="${backing}"/>`);
    }
    if (renderOptions.logoStroke) {
      const strokeX = renderOptions.logoBackground === "none" ? logoX : boxX;
      const strokeY = renderOptions.logoBackground === "none" ? logoY : boxY;
      const strokeSize = renderOptions.logoBackground === "none" ? logoSize : boxSize;
      const strokeRadius = renderOptions.logoBackground === "none" ? Math.max(0.2, logoSize * 0.08) : boxRadius;
      parts.push(`<rect x="${strokeX}" y="${strokeY}" width="${strokeSize}" height="${strokeSize}" rx="${strokeRadius}" fill="none" stroke="${escapeXml(renderOptions.logoStrokeColor)}" stroke-width="0.28"/>`);
    }
    parts.push(`<image href="${escapeXml(renderOptions.logoDataUrl)}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`);
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

export interface SvgRasterOptions {
  minimumSize?: number;
  background?: string;
}

export interface PdfPageLayout {
  pageSize: number;
  imageWidth: number;
  imageHeight: number;
  x: number;
  y: number;
}

export function calculatePdfPageLayout(
  imageWidth: number,
  imageHeight: number,
  pageMargin = 36,
): PdfPageLayout {
  if (imageWidth <= 0 || imageHeight <= 0) throw new Error("PDF image dimensions must be positive.");
  const margin = Math.max(0, pageMargin);
  const pageSize = Math.max(imageWidth, imageHeight) + margin * 2;
  return {
    pageSize,
    imageWidth,
    imageHeight,
    x: (pageSize - imageWidth) / 2,
    y: (pageSize - imageHeight) / 2,
  };
}

function svgDimensions(svg: string): { width: number; height: number } {
  const match = svg.match(/width="([\d.]+)"\s+height="([\d.]+)"/);
  const width = match ? Number(match[1]) : 1024;
  const height = match ? Number(match[2]) : width;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("SVG dimensions are invalid.");
  }
  return { width, height };
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/png" | "image/webp",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      mimeType,
      mimeType === "image/webp" ? 0.95 : undefined,
    );
  });
}

export async function svgToRasterBlob(
  svg: string,
  mimeType: "image/png" | "image/webp",
  options: SvgRasterOptions = {},
): Promise<Blob> {
  const source = svgDimensions(svg);
  const minimumSize = Math.max(0, Math.floor(options.minimumSize ?? 0));
  const targetSize = Math.max(minimumSize, Math.ceil(source.width), Math.ceil(source.height));
  const image = new Image();
  image.decoding = "async";
  const url = URL.createObjectURL(svgBlob(svg));
  let canvas: HTMLCanvasElement | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not rasterize SVG"));
      image.src = url;
    });

    canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");

    if (options.background) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, targetSize, targetSize);
    }

    const scale = Math.min(targetSize / source.width, targetSize / source.height);
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    context.drawImage(
      image,
      (targetSize - drawWidth) / 2,
      (targetSize - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );

    return await canvasBlob(canvas, mimeType);
  } finally {
    image.onload = null;
    image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(url);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export async function svgToPdfBlob(
  svg: string,
  options: {
    pageMargin?: number;
    minimumRasterSize?: number;
  } = {},
): Promise<Blob> {
  const pageMargin = Math.max(0, options.pageMargin ?? 36);
  const minimumRasterSize = Math.max(1600, options.minimumRasterSize ?? 1600);
  const png = await svgToRasterBlob(svg, "image/png", {
    minimumSize: minimumRasterSize,
    background: "#ffffff",
  });

  const pdf = await PDFDocument.create();
  pdf.setTitle("SayaQR");
  pdf.setCreator("SayaQR");
  const image = await pdf.embedPng(await png.arrayBuffer());
  const layout = calculatePdfPageLayout(image.width, image.height, pageMargin);
  const page = pdf.addPage([layout.pageSize, layout.pageSize]);
  page.drawImage(image, {
    x: layout.x,
    y: layout.y,
    width: layout.imageWidth,
    height: layout.imageHeight,
  });

  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
