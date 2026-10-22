// clientRecords.ts
// A client's colour formulas and patch tests (FR-031, DEC-057), kept on their page next to the
// notes. A FORMULA is what was mixed and applied, in the stylist's own words, so the next visit can
// repeat it. A PATCH TEST is a skin-sensitivity test before colour: the product, the date, and
// whether the skin was clear or reacted. A test is good for a limited time, so the page shows
// whether the client is covered today. Entries are never edited: a correction is a new entry (or
// the author or owner deletes the wrong one), so the history is trustworthy. Pure.

export type RecordKind = "formula" | "patch";
export type PatchResult = "clear" | "reaction";

export interface ClientRecord {
  id: string;
  kind: RecordKind;
  /** The day it was done (YYYY-MM-DD, salon time) */
  date: string;
  /** Formula: what was mixed and applied. Patch test: an optional note. */
  text: string;
  /** Patch test: the product tested. Formula: empty. */
  product: string;
  /** Patch test only: how the skin was after. Formula: empty. */
  result: PatchResult | "";
  authorUid: string;
  authorName: string;
  createdAt: string;
}

export const MAX_FORMULA_LENGTH = 1000;
export const MAX_PRODUCT_LENGTH = 200;

/** How long a clear patch test covers the client, in months (the salon's rule of thumb). */
export const PATCH_VALID_MONTHS = 6;

export interface NewRecord {
  kind: RecordKind;
  date: string;
  text: string;
  product: string;
  result: PatchResult | "";
}

/** The reason a new entry cannot be saved, or null when it is fine. */
export const recordProblem = (r: NewRecord): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return "Choose the date.";
  if (r.kind === "formula") {
    if (!r.text.trim()) return "Write the formula first.";
    if (r.text.length > MAX_FORMULA_LENGTH) return `A formula can be up to ${MAX_FORMULA_LENGTH} characters.`;
    return null;
  }
  if (!r.product.trim()) return "Say which product was tested.";
  if (r.product.length > MAX_PRODUCT_LENGTH) return `The product can be up to ${MAX_PRODUCT_LENGTH} characters.`;
  if (r.result !== "clear" && r.result !== "reaction") return "Choose how the skin was.";
  if (r.text.length > MAX_FORMULA_LENGTH) return `A note can be up to ${MAX_FORMULA_LENGTH} characters.`;
  return null;
};

/** The entry to store: tidy text, and the fields that do not apply left empty. */
export const cleanRecord = (r: NewRecord): NewRecord =>
  r.kind === "formula"
    ? { kind: "formula", date: r.date, text: r.text.trim(), product: "", result: "" }
    : { kind: "patch", date: r.date, text: r.text.trim(), product: r.product.trim(), result: r.result };

/** A date plus whole months, clamped to the end of a shorter month (31 Aug + 6 months = 28 Feb). */
export const addMonthsToDate = (date: string, months: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
};

export type PatchState =
  | { state: "none" }
  | { state: "clear"; date: string; product: string; validUntil: string }
  | { state: "expired"; date: string; product: string; validUntil: string }
  | { state: "reaction"; date: string; product: string };

const newestFirst = (a: ClientRecord, b: ClientRecord): number =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/**
 * Is this client covered for colour today? The newest patch test decides: a reaction is
 * shown as a reaction until a later clear test replaces it; a clear one covers for
 * PATCH_VALID_MONTHS and then reads as expired.
 */
export const patchStatus = (records: ClientRecord[], today: string): PatchState => {
  const latest = records.filter((r) => r.kind === "patch").sort(newestFirst)[0];
  if (!latest) return { state: "none" };
  if (latest.result === "reaction") return { state: "reaction", date: latest.date, product: latest.product };
  const validUntil = addMonthsToDate(latest.date, PATCH_VALID_MONTHS);
  return {
    state: validUntil >= today ? "clear" : "expired",
    date: latest.date,
    product: latest.product,
    validUntil,
  };
};

/** The most recent formula, to repeat at the next visit. */
export const latestFormula = (records: ClientRecord[]): ClientRecord | null =>
  records.filter((r) => r.kind === "formula").sort(newestFirst)[0] ?? null;

/** Newest first, as the page lists them. */
export const sortRecords = (records: ClientRecord[]): ClientRecord[] => [...records].sort(newestFirst);
