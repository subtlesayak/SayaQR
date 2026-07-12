export interface CsvData {
  headers: string[];
  rows: Record<string, string>[];
}

function parseDelimitedRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  return rows;
}

export function parseCsv(input: string): CsvData {
  const rows = parseDelimitedRows(input);
  const headers = rows.shift()?.map((header, index) => header.trim() || "Column " + (index + 1)) ?? [];
  return {
    headers,
    rows: rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))),
  };
}

export function parseTextList(input: string): CsvData {
  const values = parseDelimitedRows(input)
    .flat()
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    headers: ["Content"],
    rows: values.map((value) => ({ Content: value })),
  };
}

export function safeFileName(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}
