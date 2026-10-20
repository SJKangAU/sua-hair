// clientImportFile.ts
// Reading the chosen .csv or .xlsx in the browser. The file is read into memory
// here and never uploaded anywhere. Parsing libraries are loaded on demand, so
// they cost nothing until the owner opens the import.
//
//   .csv   papaparse
//   .xlsx  read-excel-file (first sheet)
//
// Both come back as the same thing: the header names and one object per row,
// every value a string, so the rules in clientImport.ts treat them alike.

import { MAX_FILE_BYTES, MAX_ROWS, type RawRow } from "./clientImport";

export interface ParsedFile {
  headers: string[];
  rows: RawRow[];
}

export class ImportFileError extends Error {}

const toObjects = (table: string[][]): ParsedFile => {
  const [head, ...body] = table;
  const headers = (head ?? []).map((h) => h.trim());
  const rows: RawRow[] = [];
  for (const cells of body) {
    // a row with nothing in it (Fresha's CSV ends with a blank line) is skipped
    if (cells.every((c) => c.trim() === "")) continue;
    const row: RawRow = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
};

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

export const parseClientFile = async (file: File): Promise<ParsedFile> => {
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportFileError(
      `That file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Choose the client list export.`,
    );
  }
  const name = file.name.toLowerCase();
  let parsed: ParsedFile;
  if (name.endsWith(".csv")) {
    const { default: Papa } = await import("papaparse");
    const text = await file.text();
    const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: false });
    parsed = toObjects(result.data.map((r) => r.map(cellText)));
  } else if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const table = await readSheet(file); // the first sheet
    parsed = toObjects(table.map((r) => r.map(cellText)));
  } else {
    throw new ImportFileError("Choose a .csv or .xlsx file.");
  }
  if (parsed.rows.length > MAX_ROWS) {
    throw new ImportFileError(`That file has more than ${MAX_ROWS.toLocaleString()} rows.`);
  }
  return parsed;
};
