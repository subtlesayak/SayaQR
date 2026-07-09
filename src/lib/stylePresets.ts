import type { NayukiQrCode } from "./qr";

export type StyleParamValue = string | number | boolean;
export type StyleParams = Record<string, StyleParamValue>;

export interface StyleParamControl {
  id: string;
  label: string;
  type: "range" | "select" | "checkbox";
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface QrStyleRenderOptions {
  foreground: string;
  background: string;
  transparentBackground: boolean;
  margin: number;
  moduleSize: number;
  rounded: number;
  logoDataUrl?: string;
  logoScale: number;
}

export interface QrStylePreset {
  id: string;
  name: string;
  description: string;
  defaults: StyleParams;
  controls: StyleParamControl[];
  renderSvg: (qr: NayukiQrCode, options: QrStyleRenderOptions, params: StyleParams) => string;
  renderCanvas: (qr: NayukiQrCode, options: QrStyleRenderOptions, params: StyleParams, canvas: HTMLCanvasElement | OffscreenCanvas) => void;
}

type ModuleShape = "square" | "round" | "dot" | "soft" | "diamond";
type FinderShape = "square" | "rounded" | "circle";

interface DrawingStyle {
  moduleShape: ModuleShape;
  finderShape: FinderShape;
  scale: number;
  radius: number;
  opacity: number;
  glow: number;
  bgFrame: "plain" | "sticker" | "glass" | "terminal" | "card" | "none";
  ornament: "none" | "malayalam" | "scanline";
}

const PRESET_BASE: DrawingStyle = {
  moduleShape: "square",
  finderShape: "square",
  scale: 1,
  radius: 0,
  opacity: 1,
  glow: 0,
  bgFrame: "plain",
  ornament: "none",
};

function numberParam(params: StyleParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolParam(params: StyleParams, key: string, fallback: boolean): boolean {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

function stringParam(params: StyleParams, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
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

function moduleShape(x: number, y: number, style: DrawingStyle): string {
  const scale = Math.max(0.48, Math.min(1, style.scale));
  const inset = (1 - scale) / 2;
  const size = scale;
  if (style.moduleShape === "dot") return `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="${size / 2}"/>`;
  if (style.moduleShape === "diamond") {
    const c = x + 0.5;
    const d = y + 0.5;
    const r = size / 2;
    return `<path d="M${c} ${d - r} L${c + r} ${d} L${c} ${d + r} L${c - r} ${d} Z"/>`;
  }
  const rx = style.moduleShape === "round" || style.moduleShape === "soft" ? Math.max(0, Math.min(0.48, style.radius)) : 0;
  return `<rect x="${x + inset}" y="${y + inset}" width="${size}" height="${size}" rx="${rx}" ry="${rx}"/>`;
}

function drawFinder(origin: { x: number; y: number }, margin: number, style: DrawingStyle): string {
  const x = margin + origin.x;
  const y = margin + origin.y;
  if (style.finderShape === "circle") {
    const parts: string[] = [];
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        if (finderDark(dx, dy)) {
          const radius = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4 ? 0.52 : 0.42;
          parts.push(`<circle cx="${x + dx + 0.5}" cy="${y + dy + 0.5}" r="${radius}"/>`);
        }
      }
    }
    return parts.join("");
  }

  const rx = style.finderShape === "rounded" ? 0.45 : 0;
  return [
    `<rect x="${x}" y="${y}" width="7" height="1" rx="${rx}"/>`,
    `<rect x="${x}" y="${y + 6}" width="7" height="1" rx="${rx}"/>`,
    `<rect x="${x}" y="${y + 1}" width="1" height="5" rx="${rx}"/>`,
    `<rect x="${x + 6}" y="${y + 1}" width="1" height="5" rx="${rx}"/>`,
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${style.finderShape === "rounded" ? 0.35 : 0}"/>`,
  ].join("");
}

function frameBackground(totalModules: number, options: QrStyleRenderOptions, style: DrawingStyle, id: string): string[] {
  if (options.transparentBackground && style.bgFrame !== "glass" && style.bgFrame !== "sticker" && style.bgFrame !== "card") return [];
  const bg = escapeXml(options.background);
  if (style.bgFrame === "none") return [];
  if (style.bgFrame === "sticker") {
    return [
      `<rect x="0.35" y="0.35" width="${totalModules - 0.7}" height="${totalModules - 0.7}" rx="3" fill="#ffffff" stroke="#111827" stroke-width="0.7"/>`,
      `<rect x="1.35" y="1.35" width="${totalModules - 2.7}" height="${totalModules - 2.7}" rx="2.3" fill="${bg}"/>`,
    ];
  }
  if (style.bgFrame === "glass") {
    return [
      `<defs><linearGradient id="${id}-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="${bg}" stop-opacity="0.62"/></linearGradient></defs>`,
      `<rect width="100%" height="100%" rx="3" fill="url(#${id}-glass)" stroke="rgba(15,23,42,0.18)"/>`,
    ];
  }
  if (style.bgFrame === "terminal") {
    return [
      `<rect width="100%" height="100%" fill="#06130f"/>`,
      `<path d="M0 3.5H${totalModules}M0 7.5H${totalModules}M0 11.5H${totalModules}M0 15.5H${totalModules}M0 19.5H${totalModules}M0 23.5H${totalModules}M0 27.5H${totalModules}M0 31.5H${totalModules}" stroke="#12382f" stroke-width="0.08"/>`,
    ];
  }
  if (style.bgFrame === "card") {
    return [
      `<rect width="100%" height="100%" rx="2.2" fill="#ffffff"/>`,
      `<rect x="0" y="${Math.max(0, totalModules - 4)}" width="${totalModules}" height="4" fill="#f1f5f9"/>`,
      `<path d="M2 ${totalModules - 2.2}H${totalModules - 2}" stroke="#94a3b8" stroke-width="0.18" stroke-linecap="round"/>`,
    ];
  }
  return [`<rect width="100%" height="100%" fill="${bg}"/>`];
}

function ornaments(totalModules: number, margin: number, style: DrawingStyle, foreground: string): string[] {
  if (style.ornament === "malayalam") {
    const s = totalModules;
    const color = escapeXml(foreground);
    return [
      `<path d="M${margin * 0.5} ${margin * 1.6}c1.1-1.4 3-.8 2.7.8-.2 1.2-1.8 1.2-2.1.2-.5-1.4 1.2-2.6 2.7-1.4" fill="none" stroke="${color}" stroke-width="0.28" stroke-linecap="round" opacity="0.55"/>`,
      `<path d="M${s - margin * 0.5} ${s - margin * 1.6}c-1.1 1.4-3 .8-2.7-.8.2-1.2 1.8-1.2 2.1-.2.5 1.4-1.2 2.6-2.7 1.4" fill="none" stroke="${color}" stroke-width="0.28" stroke-linecap="round" opacity="0.55"/>`,
    ];
  }
  if (style.ornament === "scanline") {
    return [`<path d="M0 0H${totalModules}V${totalModules}H0Z" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.08" stroke-dasharray="0.1 0.9"/>`];
  }
  return [];
}

function renderStyledSvg(qr: NayukiQrCode, options: QrStyleRenderOptions, params: StyleParams, style: DrawingStyle, id: string): string {
  const margin = Math.max(0, Math.floor(options.margin));
  const moduleSize = Math.max(1, Math.floor(options.moduleSize));
  const totalModules = qr.size + margin * 2;
  const pixelSize = totalModules * moduleSize;
  const fg = escapeXml(options.foreground);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${totalModules} ${totalModules}" role="img" aria-label="QR code">`,
    ...frameBackground(totalModules, options, style, id),
    ...ornaments(totalModules, margin, style, options.foreground),
  ];

  if (style.glow > 0) {
    parts.push(`<defs><filter id="${id}-glow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="${style.glow}" flood-color="${fg}" flood-opacity="0.9"/></filter></defs>`);
  }

  const groupAttrs = [`fill="${fg}"`, `shape-rendering="geometricPrecision"`];
  if (style.opacity < 1) groupAttrs.push(`opacity="${style.opacity}"`);
  if (style.glow > 0) groupAttrs.push(`filter="url(#${id}-glow)"`);
  parts.push(`<g ${groupAttrs.join(" ")}>`);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y) && !isFinderArea(x, y, qr.size)) {
        parts.push(moduleShape(margin + x, margin + y, style));
      }
    }
  }
  for (const origin of finderOrigins(qr.size)) parts.push(drawFinder(origin, margin, style));
  parts.push("</g>");

  if (boolParam(params, "frame", false)) {
    parts.push(`<rect x="0.5" y="0.5" width="${totalModules - 1}" height="${totalModules - 1}" rx="2" fill="none" stroke="${fg}" stroke-width="0.2" opacity="0.55"/>`);
  }

  if (options.logoDataUrl) {
    const logoSize = Math.max(1, qr.size * Math.max(0.05, Math.min(0.35, options.logoScale)));
    const logoX = margin + (qr.size - logoSize) / 2;
    const logoY = margin + (qr.size - logoSize) / 2;
    const backing = options.transparentBackground ? "#ffffff" : escapeXml(options.background);
    parts.push(`<rect x="${logoX - 0.8}" y="${logoY - 0.8}" width="${logoSize + 1.6}" height="${logoSize + 1.6}" rx="1.4" fill="${backing}"/>`);
    parts.push(`<image href="${escapeXml(options.logoDataUrl)}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`);
  }

  parts.push("</svg>");
  return parts.join("");
}

function renderCanvasBasic(qr: NayukiQrCode, options: QrStyleRenderOptions, params: StyleParams, canvas: HTMLCanvasElement | OffscreenCanvas): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const margin = Math.max(0, Math.floor(options.margin));
  const moduleSize = Math.max(1, Math.floor(options.moduleSize));
  const totalModules = qr.size + margin * 2;
  canvas.width = totalModules * moduleSize;
  canvas.height = totalModules * moduleSize;
  if (!options.transparentBackground) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = options.foreground;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) ctx.fillRect((margin + x) * moduleSize, (margin + y) * moduleSize, moduleSize, moduleSize);
    }
  }
}

function preset(id: string, name: string, description: string, defaults: StyleParams, controls: StyleParamControl[], makeStyle: (params: StyleParams) => DrawingStyle): QrStylePreset {
  return {
    id,
    name,
    description,
    defaults,
    controls,
    renderSvg: (qr, options, params) => renderStyledSvg(qr, options, { ...defaults, ...params }, makeStyle({ ...defaults, ...params }), id),
    renderCanvas: renderCanvasBasic,
  };
}

const radiusControl: StyleParamControl = { id: "radius", label: "Softness", type: "range", min: 0, max: 0.48, step: 0.04 };
const scaleControl: StyleParamControl = { id: "scale", label: "Module scale", type: "range", min: 0.58, max: 1, step: 0.04 };
const frameControl: StyleParamControl = { id: "frame", label: "Fine border", type: "checkbox" };

export const QR_STYLE_PRESETS: QrStylePreset[] = [
  preset("classic", "Classic", "Crisp, standard QR modules.", { scale: 1, radius: 0, frame: false }, [frameControl], (params) => ({ ...PRESET_BASE, scale: numberParam(params, "scale", 1), radius: 0 })),
  preset("rounded", "Rounded", "Friendly rounded modules with rounded finder marks.", { scale: 0.96, radius: 0.28, frame: false }, [radiusControl, frameControl], (params) => ({ ...PRESET_BASE, moduleShape: "round", finderShape: "rounded", scale: 0.96, radius: numberParam(params, "radius", 0.28) })),
  preset("dots", "Dots", "Circular modules with generous spacing.", { scale: 0.78, frame: false }, [scaleControl, frameControl], (params) => ({ ...PRESET_BASE, moduleShape: "dot", finderShape: "circle", scale: numberParam(params, "scale", 0.78) })),
  preset("soft-square", "Soft Square", "A square QR with subtle softened corners.", { scale: 0.86, radius: 0.18 }, [scaleControl, radiusControl], (params) => ({ ...PRESET_BASE, moduleShape: "soft", finderShape: "rounded", scale: numberParam(params, "scale", 0.86), radius: numberParam(params, "radius", 0.18) })),
  preset("neon", "Neon", "Bright modules with a restrained glow.", { glow: 0.2, scale: 0.84 }, [{ id: "glow", label: "Glow", type: "range", min: 0.05, max: 0.42, step: 0.05 }, scaleControl], (params) => ({ ...PRESET_BASE, moduleShape: "soft", finderShape: "rounded", scale: numberParam(params, "scale", 0.84), radius: 0.2, glow: numberParam(params, "glow", 0.2) })),
  preset("minimal-mono", "Minimal Mono", "Quiet monochrome with clean spacing.", { scale: 0.9, frame: false }, [scaleControl, frameControl], (params) => ({ ...PRESET_BASE, moduleShape: "square", finderShape: "square", scale: numberParam(params, "scale", 0.9) })),
  preset("sticker", "Sticker", "A printable sticker frame around the QR.", { scale: 0.86, radius: 0.18, frame: false }, [scaleControl, radiusControl], (params) => ({ ...PRESET_BASE, moduleShape: "soft", finderShape: "rounded", bgFrame: "sticker", scale: numberParam(params, "scale", 0.86), radius: numberParam(params, "radius", 0.18) })),
  preset("glass", "Glass", "Light translucent card treatment.", { scale: 0.86, radius: 0.22, opacity: 0.92 }, [scaleControl, radiusControl, { id: "opacity", label: "Ink opacity", type: "range", min: 0.72, max: 1, step: 0.04 }], (params) => ({ ...PRESET_BASE, moduleShape: "soft", finderShape: "rounded", bgFrame: "glass", scale: numberParam(params, "scale", 0.86), radius: numberParam(params, "radius", 0.22), opacity: numberParam(params, "opacity", 0.92) })),
  preset("pixel", "Pixel", "Chunky pixel modules with sharp finder marks.", { scale: 0.92, frame: false }, [scaleControl, frameControl], (params) => ({ ...PRESET_BASE, moduleShape: "square", finderShape: "square", scale: numberParam(params, "scale", 0.92) })),
  preset("malayalam-ornamental", "Malayalam Ornamental", "Subtle ornamental corner strokes inspired by Malayalam letterforms.", { scale: 0.84, radius: 0.24 }, [scaleControl, radiusControl], (params) => ({ ...PRESET_BASE, moduleShape: "soft", finderShape: "rounded", ornament: "malayalam", scale: numberParam(params, "scale", 0.84), radius: numberParam(params, "radius", 0.24) })),
  preset("retro-terminal", "Retro Terminal", "Terminal-inspired scanlines and compact pixels.", { scale: 0.88, glow: 0.08 }, [scaleControl, { id: "glow", label: "Glow", type: "range", min: 0, max: 0.2, step: 0.04 }], (params) => ({ ...PRESET_BASE, moduleShape: "square", finderShape: "square", bgFrame: "terminal", ornament: "scanline", scale: numberParam(params, "scale", 0.88), glow: numberParam(params, "glow", 0.08) })),
  preset("business-card", "Business Card", "A restrained card frame for professional sharing.", { scale: 0.86, radius: 0.16 }, [scaleControl, radiusControl], (params) => ({ ...PRESET_BASE, moduleShape: "soft", finderShape: "rounded", bgFrame: "card", scale: numberParam(params, "scale", 0.86), radius: numberParam(params, "radius", 0.16) })),
];

export function getStylePreset(id: string | undefined): QrStylePreset {
  return QR_STYLE_PRESETS.find((presetItem) => presetItem.id === id) ?? QR_STYLE_PRESETS[0];
}

export function defaultStyleParams(id: string | undefined): StyleParams {
  return { ...getStylePreset(id).defaults };
}