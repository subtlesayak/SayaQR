import { safeFileName, type CsvData } from "./csv";

const CONTENT_COLUMN_NAMES = ["content", "url", "link", "payload", "text", "qr", "value"] as const;
const FILENAME_COLUMN_NAMES = ["filename", "name", "title", "slug", "id"] as const;

export type BatchRowStatus = "ready" | "empty" | "invalid" | "duplicate-filename" | "too-long";

export interface BatchValidationRow {
  row: number;
  status: BatchRowStatus;
  reason: string;
  payload: string;
  requestedFilename: string;
  outputFilename: string;
  generatable: boolean;
}

export interface BatchValidationCounts {
  ready: number;
  empty: number;
  invalid: number;
  duplicateFilename: number;
  tooLong: number;
}

export interface BatchValidationResult {
  rows: BatchValidationRow[];
  counts: BatchValidationCounts;
  generatableCount: number;
  skippedCount: number;
}

export type BatchEncoderCheck = (payload: string) => boolean;

function normalizedHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function suggestColumn(headers: string[], candidates: readonly string[]): string {
  for (const candidate of candidates) {
    const match = headers.find((header) => normalizedHeader(header) === candidate);
    if (match) return match;
  }
  return "";
}

export function suggestContentColumn(headers: string[]): string {
  return suggestColumn(headers, CONTENT_COLUMN_NAMES) || headers[0] || "";
}

export function suggestFilenameColumn(headers: string[]): string {
  return suggestColumn(headers, FILENAME_COLUMN_NAMES);
}

export function resolveDuplicateFilenames(requestedFilenames: string[]): string[] {
  const used = new Set<string>();
  return requestedFilenames.map((requested) => {
    const base = requested || "qr";
    let candidate = base;
    let suffix = 1;
    while (used.has(candidate.toLowerCase())) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function isValidUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const candidate = hasScheme ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return Boolean(parsed.hostname) && (parsed.hostname.includes(".") || parsed.hostname === "localhost");
    }
    return hasScheme && Boolean(parsed.protocol);
  } catch {
    return false;
  }
}

function requiresUrlValidation(column: string): boolean {
  return ["url", "link"].includes(normalizedHeader(column));
}

function countStatuses(rows: BatchValidationRow[]): BatchValidationCounts {
  return rows.reduce<BatchValidationCounts>(
    (counts, row) => {
      if (row.status === "ready") counts.ready += 1;
      if (row.status === "empty") counts.empty += 1;
      if (row.status === "invalid") counts.invalid += 1;
      if (row.status === "duplicate-filename") counts.duplicateFilename += 1;
      if (row.status === "too-long") counts.tooLong += 1;
      return counts;
    },
    { ready: 0, empty: 0, invalid: 0, duplicateFilename: 0, tooLong: 0 },
  );
}

export function validateBatchRows(
  data: CsvData,
  contentColumn: string,
  filenameColumn: string,
  canEncode: BatchEncoderCheck,
): BatchValidationResult {
  const payloads = data.rows.map((row) => String(row[contentColumn] ?? "").trim());
  const requestedFilenames = data.rows.map((row, index) =>
    safeFileName(filenameColumn ? String(row[filenameColumn] ?? "") : "", `qr-${index + 1}`),
  );
  const outputFilenames = resolveDuplicateFilenames(requestedFilenames);
  const urlColumn = requiresUrlValidation(contentColumn);

  const rows = data.rows.map<BatchValidationRow>((_, index) => {
    const payload = payloads[index];
    const requestedFilename = requestedFilenames[index];
    const outputFilename = outputFilenames[index];

    if (!payload) {
      return {
        row: index + 1,
        status: "empty",
        reason: "Content is empty",
        payload,
        requestedFilename,
        outputFilename,
        generatable: false,
      };
    }

    if (urlColumn && !isValidUrl(payload)) {
      return {
        row: index + 1,
        status: "invalid",
        reason: "URL is malformed",
        payload,
        requestedFilename,
        outputFilename,
        generatable: false,
      };
    }

    if (!canEncode(payload)) {
      return {
        row: index + 1,
        status: "too-long",
        reason: "Content is too long for this QR setting",
        payload,
        requestedFilename,
        outputFilename,
        generatable: false,
      };
    }

    if (outputFilename !== requestedFilename) {
      return {
        row: index + 1,
        status: "duplicate-filename",
        reason: `Renamed to ${outputFilename}`,
        payload,
        requestedFilename,
        outputFilename,
        generatable: true,
      };
    }

    return {
      row: index + 1,
      status: "ready",
      reason: "Ready",
      payload,
      requestedFilename,
      outputFilename,
      generatable: true,
    };
  });

  const counts = countStatuses(rows);
  const generatableCount = rows.filter((row) => row.generatable).length;
  return {
    rows,
    counts,
    generatableCount,
    skippedCount: rows.length - generatableCount,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildBatchReportCsv(rows: BatchValidationRow[]): string {
  const header = "row,status,reason,requested_filename,output_filename";
  const lines = rows
    .filter((row) => !row.generatable)
    .map((row) =>
      [
        row.row,
        row.status,
        row.reason,
        row.requestedFilename,
        row.outputFilename,
      ].map(csvCell).join(","),
    );
  return [header, ...lines].join("\r\n") + "\r\n";
}

export class BatchCancellationController {
  private cancelled = false;

  cancel(): void {
    this.cancelled = true;
  }

  reset(): void {
    this.cancelled = false;
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }
}
