// clientImport.ts
// Turning a Fresha "client list" export into customerLookups records. Pure (no
// Firebase, no file reading), so it is unit-tested with a synthetic fixture and
// never touches real data.
//
// What is imported: a client's name and mobile number, as
//   customerLookups/{04xxxxxxxx} = { name, lastVisit: "", visitCount: 0 }
// (a later online booking by that client merges into the record), plus ONE flag:
//   blocked: true     for a client Fresha has Blocked (DEC-039)
// The flag is what keeps a blocked client from booking online (the booking function
// refuses them with "Please call the salon to book") and what the walk-in form warns
// about; customerLookups is owner-only, so it is never readable by the public.
// Everything else in the export (email, gender, birth date, marketing flags, Staff
// alert, Block Reason...) has no home in the app and is NOT imported; the dry run only
// reports counts.
//
// Row numbers are spreadsheet rows: the header is row 1, the first client row 2.

import { SALON_CONFIG } from "./config";

export type RawRow = Record<string, string>;

// Headers the file must have. "Added" is optional (used only to decide which of
// two clients sharing a number is the newer one).
export const REQUIRED_HEADERS = ["Full Name", "Mobile Number"] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Lowered from 50,000 (DEC-042): a 10,000-row import measured 2m54s end to end in the emulator
// (one lookup pass ~40 s, import 3.8 s, rollback 3.3 s), but a 50,000-row run was stopped at
// 30 minutes without finishing, so that size is not demonstrated. 20,000 is well above the real
// export (12,286 clients) and comfortably inside what was measured.
export const MAX_ROWS = 20_000;
// Lookups written per transaction: 400 + 1 ledger document stays well under
// Firestore's 500-write limit
export const IMPORT_CHUNK = 400;
export const MAX_NAME_LENGTH = 100;

export interface ImportEntry {
  phone: string; // 04xxxxxxxx, the document ID
  name: string;
  row: number; // the row that won, for the error report
  // Fresha's Blocked column said "Yes" (for any row sharing this number)
  blocked?: boolean;
}

export interface RowProblem {
  row: number;
  reason: string;
}

export interface ImportPlan {
  entries: ImportEntry[]; // one per distinct phone, before checking what exists
  problems: RowProblem[]; // skipped rows (row number + reason only, never the data)
  summary: {
    rows: number;
    importable: number; // distinct phones that can be written
    skipped: number;
    collapsed: number; // rows dropped because another client has the same number
    blocked: number; // distinct importable phones Fresha has Blocked
    blockedUnusable: number; // Blocked rows with no usable number: nothing to enforce
  };
  // Columns with data that the import deliberately leaves out
  notImported: Record<string, number>;
}

// What was left out, by column: how many rows had a value (Blocked: how many are
// "Yes"). Shown in the dry run so nothing is silently dropped.
const LEFT_OUT: { header: string; label: string; counts: (v: string) => boolean }[] = [
  { header: "Email", label: "emails", counts: (v) => v.trim() !== "" },
  { header: "Telephone", label: "landline / other numbers", counts: (v) => v.trim() !== "" },
  { header: "Gender", label: "genders", counts: (v) => v.trim() !== "" },
  { header: "Date of Birth", label: "birth dates", counts: (v) => v.trim() !== "" },
  { header: "Staff alert", label: "staff alerts", counts: (v) => v.trim() !== "" },
];

// Fresha's Blocked column: "Yes" (any case) is blocked; "No", empty and anything else is not.
export const isBlockedRow = (row: RawRow): boolean =>
  (row["Blocked"] ?? "").trim().toLowerCase() === "yes";

// A number as Fresha exports it ("61 412 345 678", no plus) or already local
// ("0412 345 678") -> "0412345678". Anything else is null: a number is never
// guessed at.
export const normaliseMobile = (raw: string): string | null => {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return null;
  let local: string | null = null;
  if (/^614\d{8}$/.test(digits)) local = `0${digits.slice(2)}`;
  else if (/^04\d{8}$/.test(digits)) local = digits;
  return local !== null && SALON_CONFIG.phoneRegex.test(local) ? local : null;
};

// Full Name, else First + Last. Trimmed, runs of spaces collapsed, control
// characters removed, kept to a sensible length. Any script is allowed.
export const cleanClientName = (row: RawRow): string => {
  const tidy = (s: string) =>
    // eslint-disable-next-line no-control-regex
    s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const full = tidy(row["Full Name"] ?? "");
  const name = full || tidy(`${row["First Name"] ?? ""} ${row["Last Name"] ?? ""}`);
  return name.slice(0, MAX_NAME_LENGTH);
};

// "Added" as a sortable ISO date: an ISO string as it is, an Excel date serial
// (what the xlsx holds) converted, anything else "".
export const addedAsIso = (raw: string): string => {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const ms = Math.round((Number(v) - 25569) * 86_400_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return "";
};

export const missingHeaders = (headers: string[]): string[] =>
  REQUIRED_HEADERS.filter((h) => !headers.includes(h));

// Rows -> what would be written. Two clients sharing a number collapse into one
// record: the most recently added keeps the name (the later row on a tie).
export const buildPlan = (rows: RawRow[]): ImportPlan => {
  const problems: RowProblem[] = [];
  const byPhone = new Map<string, { entry: ImportEntry; added: string }>();
  const notImported: Record<string, number> = {};
  let collapsed = 0;
  let blockedUnusable = 0;

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    for (const col of LEFT_OUT) {
      if (col.counts(row[col.header] ?? "")) {
        notImported[col.label] = (notImported[col.label] ?? 0) + 1;
      }
    }
    const name = cleanClientName(row);
    const phone = normaliseMobile(row["Mobile Number"] ?? "");
    const blocked = isBlockedRow(row);
    if (!name) {
      problems.push({ row: rowNumber, reason: "No name" });
      if (blocked) blockedUnusable += 1;
      return;
    }
    if (!(row["Mobile Number"] ?? "").trim()) {
      problems.push({ row: rowNumber, reason: "No mobile number" });
      if (blocked) blockedUnusable += 1;
      return;
    }
    if (!phone) {
      problems.push({ row: rowNumber, reason: "Not an Australian mobile number" });
      if (blocked) blockedUnusable += 1;
      return;
    }
    const added = addedAsIso(row["Added"] ?? "");
    const seen = byPhone.get(phone);
    if (seen) {
      collapsed += 1;
      // Two clients share this number: the newer one's name wins, but if EITHER is
      // blocked the number is (the safer reading: one person's block must not be
      // lost because another client at the same number was added later)
      const either = blocked || seen.entry.blocked === true;
      if (added >= seen.added) {
        byPhone.set(phone, { entry: { phone, name, row: rowNumber, ...(either ? { blocked: true } : {}) }, added });
      } else if (either) {
        seen.entry.blocked = true;
      }
      return;
    }
    byPhone.set(phone, { entry: { phone, name, row: rowNumber, ...(blocked ? { blocked: true } : {}) }, added });
  });

  const entries = [...byPhone.values()].map((v) => v.entry).sort((a, b) => a.row - b.row);
  return {
    entries,
    problems,
    summary: {
      rows: rows.length,
      importable: entries.length,
      skipped: problems.length,
      collapsed,
      blocked: entries.filter((e) => e.blocked).length,
      blockedUnusable,
    },
    notImported,
  };
};

// The dry run's outcome once the existing lookups are known
export interface DryRun {
  rows: number;
  toCreate: ImportEntry[];
  alreadyExist: number; // phone already has a customerLookups record: left untouched...
  // ...except that a client Fresha has Blocked who is not yet blocked here gets the
  // flag (and nothing else on their record changes)
  toFlag: ImportEntry[];
  skipped: number;
  collapsed: number;
  problems: RowProblem[];
  notImported: Record<string, number>;
  // Blocked clients (DEC-039): distinct numbers that will be blocked after the import
  // (new ones, existing ones to flag, and existing ones already blocked) ...
  blocked: number;
  // ... how many of those are already blocked in the app, and how many Blocked rows
  // have no usable mobile number (nothing to enforce)
  alreadyBlocked: number;
  blockedUnusable: number;
}

// What the dry run needs to know about a number that already has a record
export interface ExistingRecord {
  blocked: boolean;
}

export const dryRun = (
  plan: ImportPlan,
  existing: ReadonlySet<string> | ReadonlyMap<string, ExistingRecord>,
): DryRun => {
  const exists = (phone: string) => existing.has(phone);
  const isBlockedHere = (phone: string) =>
    existing instanceof Map ? existing.get(phone)?.blocked === true : false;
  const present = plan.entries.filter((e) => exists(e.phone));
  return {
    rows: plan.summary.rows,
    toCreate: plan.entries.filter((e) => !exists(e.phone)),
    alreadyExist: present.length,
    toFlag: present.filter((e) => e.blocked && !isBlockedHere(e.phone)),
    skipped: plan.summary.skipped,
    collapsed: plan.summary.collapsed,
    problems: plan.problems,
    notImported: plan.notImported,
    blocked: plan.summary.blocked,
    alreadyBlocked: present.filter((e) => e.blocked && isBlockedHere(e.phone)).length,
    blockedUnusable: plan.summary.blockedUnusable,
  };
};

export const chunkEntries = <T,>(items: T[], size = IMPORT_CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// The downloadable error report: row numbers and reasons only
export const errorReportCsv = (problems: RowProblem[]): string =>
  ["row,reason", ...problems.map((p) => `${p.row},${p.reason}`)].join("\r\n") + "\r\n";

// New batch IDs are time-ordered and readable: "import-20261020-1341-ab12"
export const newBatchId = (now = new Date(), rand = Math.random()): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
  return `import-${stamp}-${Math.floor(rand * 36 ** 4).toString(36).padStart(4, "0")}`;
};
