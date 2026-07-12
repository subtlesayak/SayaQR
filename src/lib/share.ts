import { suggestExportName } from "./export-name";
import type { PayloadFields, QrMode } from "./payloads";

export type ExportExtension = "svg" | "png" | "webp" | "pdf";

export function selectShareTargetValue(params: URLSearchParams): string {
  return params.get("url")?.trim()
    || params.get("text")?.trim()
    || params.get("title")?.trim()
    || "";
}

export function removeShareTargetParams(inputUrl: string): string {
  const url = new URL(inputUrl);
  url.searchParams.delete("title");
  url.searchParams.delete("text");
  url.searchParams.delete("url");
  const query = url.searchParams.toString();
  return url.pathname + (query ? `?${query}` : "") + url.hash;
}

export function exportFilename(
  mode: QrMode,
  fields: PayloadFields,
  extension: ExportExtension,
): string {
  return `${suggestExportName(mode, fields)}.${extension}`;
}

export function isShareCancellation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError",
  );
}

export function supportsPngClipboard(): boolean {
  return typeof ClipboardItem !== "undefined"
    && typeof navigator !== "undefined"
    && typeof navigator.clipboard?.write === "function";
}

export function supportsPngFileShare(file: File): boolean {
  if (typeof navigator === "undefined"
    || typeof navigator.share !== "function"
    || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function makeShareData(file: File): ShareData {
  return {
    title: "SayaQR",
    text: "QR code generated locally with SayaQR",
    files: [file],
  };
}
