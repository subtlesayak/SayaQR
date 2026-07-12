import jsQR from "jsqr";

const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_LOGO_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_LOGO_MAX_DIMENSION = 1024;

export interface DecodedQr {
  data: string;
  version?: number;
}

export interface ImageFileLike {
  type: string;
  size: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageFileOptions {
  maxDimension?: number;
  maxBytes?: number;
}

export function validateImageFile(file: ImageFileLike, maxBytes = DEFAULT_MAX_BYTES): void {
  if (!file.type.toLowerCase().startsWith("image/")) {
    throw new Error("Choose a supported image file.");
  }
  if (!Number.isFinite(file.size) || file.size < 0) {
    throw new Error("This image file is unreadable.");
  }
  if (file.size > maxBytes) {
    throw new Error(`Image is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
}

export function calculateContainedDimensions(width: number, height: number, maxDimension: number): ImageDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("This image has invalid dimensions.");
  }
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    throw new Error("Maximum image dimension must be positive.");
  }

  const scale = Math.min(1, Math.floor(maxDimension) / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function assertSafeSvg(svg: string): void {
  const unsafeMarkup = /<\s*(?:script|foreignObject)\b|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:javascript:|https?:|\/\/)|@import\b|url\(\s*["']?\s*(?:https?:|\/\/)/i;
  if (unsafeMarkup.test(svg)) {
    throw new Error("This SVG contains unsupported active or remote content.");
  }
}

async function localImageBlob(file: File): Promise<Blob> {
  if (file.type.toLowerCase() !== "image/svg+xml") return file;
  const svg = await file.text();
  assertSafeSvg(svg);
  return new Blob([svg], { type: "image/svg+xml" });
}

async function withImageCanvas<T>(
  file: File,
  options: Required<ImageFileOptions>,
  useCanvas: (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => T | Promise<T>,
): Promise<T> {
  validateImageFile(file, options.maxBytes);
  if (typeof Image === "undefined" || typeof document === "undefined") {
    throw new Error("Image decoding is unavailable in this browser.");
  }

  const source = await localImageBlob(file);
  const objectUrl = URL.createObjectURL(source);
  const image = new Image();
  image.decoding = "async";
  let canvas: HTMLCanvasElement | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be decoded."));
      image.src = objectUrl;
    });

    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const dimensions = calculateContainedDimensions(naturalWidth, naturalHeight, options.maxDimension);
    canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas image processing is unavailable.");

    context.clearRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    return await useCanvas(canvas, context);
  } finally {
    image.onload = null;
    image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(objectUrl);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export function decodeQrImageData(imageData: ImageData): DecodedQr | null {
  const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  if (!decoded) return null;
  return { data: decoded.data, version: decoded.version };
}

export async function decodeQrImageFile(
  file: File,
  options: ImageFileOptions = {},
): Promise<DecodedQr | null> {
  return withImageCanvas(
    file,
    {
      maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
      maxDimension: options.maxDimension ?? DEFAULT_MAX_DIMENSION,
    },
    (_canvas, context) => {
      const imageData = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
      return decodeQrImageData(imageData);
    },
  );
}

export async function rasterizeImageFileToPng(
  file: File,
  options: ImageFileOptions = {},
): Promise<string> {
  return withImageCanvas(
    file,
    {
      maxBytes: options.maxBytes ?? DEFAULT_LOGO_MAX_BYTES,
      maxDimension: options.maxDimension ?? DEFAULT_LOGO_MAX_DIMENSION,
    },
    (canvas) => canvas.toDataURL("image/png"),
  );
}
