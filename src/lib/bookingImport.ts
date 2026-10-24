// bookingImport.ts
// Turning a Fresha "appointments" export into bookings. Pure (no Firebase, no file
// reading), so it is unit-tested with a synthetic fixture and never touches real data.
//
// The export's columns: Ref #, Channel, Created Date, Created By, Client, Service,
// Scheduled Date, Time, Duration, Staff, Price, Status, Created on, Scheduled on.
// What is imported, per row, as one booking:
//   client name, the date and start time, the Fresha service name / price / duration
//   (kept as ONE service line, hands-on for the whole duration: the export has no
//   processing time), the stylist (chosen by the owner for each Fresha staff name),
//   and the status (Booked -> confirmed, Canceled -> cancelled).
// The export has NO phone number. A client's mobile can be looked up by NAME in a Fresha
// client list, but only as a suggestion the owner confirms (see "Finding each client's
// mobile number" below); a booking without a confirmed number has none and is not linked
// to a client. The Fresha ref is kept as the
// booking's bookingRef ("FR-9AA83371"), which is how importing the same file twice
// adds nothing.
//
// Row numbers are spreadsheet rows: the header is row 1, the first booking row 2.

import { findBookingConflict } from "./scheduling";
import type { BookingStatus } from "../types";
import { addedAsIso, cleanClientName, normaliseMobile, type RawRow, type RowProblem } from "./clientImport";

export type { RawRow, RowProblem };

export const REQUIRED_HEADERS = [
  "Ref #",
  "Client",
  "Service",
  "Scheduled Date",
  "Time",
  "Duration",
  "Staff",
  "Status",
] as const;

export const MAX_NAME_LENGTH = 100;
export const MAX_SERVICE_LENGTH = 120;
export const IMPORT_SERVICE_ID = "fresha-import";
export const REF_PREFIX = "FR-";

export interface BookingEntry {
  row: number;
  ref: string; // "FR-9AA83371", also the booking's bookingRef
  customerName: string;
  serviceName: string;
  servicePrice: number;
  minutes: number;
  date: string; // YYYY-MM-DD
  time: string; // "4:30 PM"
  createdDate: string; // when the booking was made in Fresha (YYYY-MM-DD), "" if unknown
  staff: string; // the Fresha staff name, as in the file
  status: BookingStatus;
}

export interface BookingPlan {
  entries: BookingEntry[];
  problems: RowProblem[];
  staffNames: string[]; // distinct Fresha staff names in the importable rows
  summary: { rows: number; importable: number; skipped: number; cancelled: number };
}

export const missingHeaders = (headers: string[]): string[] =>
  REQUIRED_HEADERS.filter((h) => !headers.includes(h));

const tidy = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

// "4:30 pm" -> "4:30 PM"; anything that is not a clock time is null
export const normaliseTime = (raw: string): string | null => {
  const m = /^(\d{1,2}):(\d{2})\s*([ap]m)$/i.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 1 || h > 12 || min > 59) return null;
  return `${h}:${m[2]} ${m[3].toUpperCase()}`;
};

export const normaliseDate = (raw: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
    ? `${m[1]}-${m[2]}-${m[3]}`
    : null;
};

export const statusOf = (raw: string): BookingStatus | null => {
  const v = raw.trim().toLowerCase();
  if (v === "booked") return "confirmed";
  if (v === "canceled" || v === "cancelled") return "cancelled";
  return null;
};

export const refOf = (raw: string): string | null => {
  const id = raw.trim().replace(/^#/, "").replace(/[^A-Za-z0-9]/g, "");
  return id ? `${REF_PREFIX}${id.toUpperCase()}` : null;
};

export const buildPlan = (rows: RawRow[]): BookingPlan => {
  const problems: RowProblem[] = [];
  const entries: BookingEntry[] = [];
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const bad = (reason: string) => problems.push({ row: rowNumber, reason });
    const ref = refOf(row["Ref #"] ?? "");
    if (!ref) return bad("No reference");
    if (seen.has(ref)) return bad("Same reference as an earlier row");
    const customerName = tidy(row["Client"] ?? "").slice(0, MAX_NAME_LENGTH);
    if (!customerName) return bad("No client name");
    const date = normaliseDate(row["Scheduled Date"] ?? "");
    if (!date) return bad("Not a valid date");
    const time = normaliseTime(row["Time"] ?? "");
    if (!time) return bad("Not a valid time");
    const minutes = Number((row["Duration"] ?? "").trim());
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480 || minutes % 15 !== 0) {
      return bad("Duration is not a multiple of 15 minutes (15 to 480)");
    }
    const status = statusOf(row["Status"] ?? "");
    if (!status) return bad("Status is not Booked or Canceled");
    const staff = tidy(row["Staff"] ?? "");
    if (!staff) return bad("No staff");
    const price = Number((row["Price"] ?? "").trim() || "0");
    if (!Number.isFinite(price) || price < 0) return bad("Price is not a number");
    seen.add(ref);
    entries.push({
      row: rowNumber,
      ref,
      customerName,
      serviceName: tidy(row["Service"] ?? "").slice(0, MAX_SERVICE_LENGTH) || "Imported appointment",
      servicePrice: price,
      minutes,
      date,
      time,
      createdDate: normaliseDate(row["Created Date"] ?? "") ?? "",
      staff,
      status,
    });
  });
  return {
    entries,
    problems,
    staffNames: [...new Set(entries.map((e) => e.staff))],
    summary: {
      rows: rows.length,
      importable: entries.length,
      skipped: problems.length,
      cancelled: entries.filter((e) => e.status === "cancelled").length,
    },
  };
};

// Fresha staff name -> stylist id ("" = leave out). Names match ignoring case and
// spaces when the app's name equals or contains the Fresha one (or the reverse).
export const suggestStylist = (
  staff: string,
  stylists: { id: string; name: string }[],
): string => {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9ㄱ-힝]/g, "");
  const k = key(staff);
  if (!k) return "";
  const hit = stylists.find((s) => {
    const n = key(s.name);
    return n !== "" && (n === k || n.includes(k) || k.includes(n));
  });
  return hit?.id ?? "";
};

export interface StylistRef {
  id: string;
  name: string;
  level: "director" | "senior" | "junior";
}

export interface ReadyBooking extends BookingEntry {
  stylist: StylistRef;
  // The client's mobile (04xxxxxxxx), set only when the owner confirmed the match
  phone?: string;
}

export interface DryRun {
  rows: number;
  toCreate: ReadyBooking[];
  alreadyImported: number; // their reference is already on a booking: left untouched
  unmappedStaff: number; // rows whose Fresha staff name was left out
  clashes: { row: number; reason: string }[]; // would double-book a stylist (not written)
  skipped: number;
  cancelled: number; // of toCreate
  problems: RowProblem[];
}

// `existingRefs`: bookingRefs already in the app. `staffMap`: Fresha staff -> stylist.
// Clashes are looked for inside the file only; a clash with a booking already in the
// app is caught when that booking is written (the same lock and rules as a walk-in).
export const dryRun = (
  plan: BookingPlan,
  staffMap: ReadonlyMap<string, StylistRef | undefined>,
  existingRefs: ReadonlySet<string>,
): DryRun => {
  const toCreate: ReadyBooking[] = [];
  const clashes: { row: number; reason: string }[] = [];
  let alreadyImported = 0;
  let unmappedStaff = 0;
  const accepted: { id: string; stylistId: string; date: string; time: string; activeTime: number; totalTime: number; restTime: number; status: BookingStatus }[] = [];
  const byRow = [...plan.entries].sort((a, b) => a.row - b.row);
  for (const e of byRow) {
    const stylist = staffMap.get(e.staff);
    if (!stylist) {
      unmappedStaff += 1;
      continue;
    }
    if (existingRefs.has(e.ref)) {
      alreadyImported += 1;
      continue;
    }
    if (e.status !== "cancelled") {
      const clash = findBookingConflict(
        {
          stylistId: stylist.id,
          date: e.date,
          time: e.time,
          totalTime: e.minutes,
          activeTime: e.minutes,
        },
        accepted as never[],
      );
      if (clash) {
        clashes.push({ row: e.row, reason: "Overlaps another row for the same stylist" });
        continue;
      }
      accepted.push({
        id: e.ref,
        stylistId: stylist.id,
        date: e.date,
        time: e.time,
        activeTime: e.minutes,
        totalTime: e.minutes,
        restTime: 0,
        status: e.status,
      });
    }
    toCreate.push({ ...e, stylist });
  }
  return {
    rows: plan.summary.rows,
    toCreate,
    alreadyImported,
    unmappedStaff,
    clashes,
    skipped: plan.summary.skipped,
    cancelled: toCreate.filter((e) => e.status === "cancelled").length,
    problems: plan.problems,
  };
};

// The downloadable report: row numbers and reasons only (never names)
export const errorReportCsv = (problems: RowProblem[]): string =>
  ["row,reason", ...problems.map((p) => `${p.row},${p.reason}`)].join("\r\n") + "\r\n";

// ── Finding each client's mobile number ──────────────────────────────────────
// The appointments export has no phone, so a number is looked up by NAME in a Fresha
// client list. That is a guess: nothing proves the number belongs to this booking's
// client. So a match is only ever a suggestion the owner confirms one by one, with the
// reasons to doubt it shown beside it.

export const REQUIRED_CLIENT_HEADERS = ["Full Name", "Mobile Number"] as const;

export const nameKey = (name: string): string => name.toLowerCase().replace(/\s+/g, " ").trim();

export interface Candidate {
  phone: string;
  added: string; // when Fresha added the client (YYYY-MM-DD), "" if unknown
}

export interface Directory {
  byName: Map<string, Candidate[]>; // distinct numbers per name
  namesByPhone: Map<string, Set<string>>; // the names sharing a number
}

export const buildDirectory = (rows: RawRow[]): Directory => {
  const byName = new Map<string, Candidate[]>();
  const namesByPhone = new Map<string, Set<string>>();
  for (const row of rows) {
    const name = nameKey(cleanClientName(row));
    const phone = normaliseMobile(row["Mobile Number"] ?? "");
    if (!name || !phone) continue;
    const list = byName.get(name) ?? [];
    if (!list.some((c) => c.phone === phone)) list.push({ phone, added: addedAsIso(row["Added"] ?? "") });
    byName.set(name, list);
    const names = namesByPhone.get(phone) ?? new Set<string>();
    names.add(name);
    namesByPhone.set(phone, names);
  }
  return { byName, namesByPhone };
};

export type PhoneMatch =
  | { kind: "unique"; phone: string; flags: string[] }
  | { kind: "ambiguous"; count: number }
  | { kind: "none" };

export const FLAG_ADDED_AFTER = "Added to Fresha after this booking was made";
export const FLAG_SHARED = "Number is also on a client with a different name";

// One match per client name. Flags are reasons to doubt a unique match.
export const matchClient = (
  name: string,
  bookings: { createdDate: string }[],
  dir: Directory,
): PhoneMatch => {
  const found = dir.byName.get(nameKey(name)) ?? [];
  if (found.length === 0) return { kind: "none" };
  if (found.length > 1) return { kind: "ambiguous", count: found.length };
  const [{ phone, added }] = found;
  const flags: string[] = [];
  const earliest = bookings.map((b) => b.createdDate).filter(Boolean).sort()[0] ?? "";
  if (added && earliest && added > earliest) flags.push(FLAG_ADDED_AFTER);
  if ((dir.namesByPhone.get(phone)?.size ?? 0) > 1) flags.push(FLAG_SHARED);
  return { kind: "unique", phone, flags };
};

export interface ClientReview {
  key: string; // nameKey, what the owner confirms
  name: string;
  bookings: number;
  firstDate: string;
  match: PhoneMatch;
}

// The new bookings grouped by client, each with its match (strongest first: unflagged
// before flagged, then by name)
export const reviewClients = (toCreate: ReadyBooking[], dir: Directory): ClientReview[] => {
  const groups = new Map<string, ReadyBooking[]>();
  for (const b of toCreate) {
    const k = nameKey(b.customerName);
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const rank = (r: ClientReview) =>
    r.match.kind === "unique" ? (r.match.flags.length === 0 ? 0 : 1) : r.match.kind === "ambiguous" ? 2 : 3;
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      name: list[0].customerName,
      bookings: list.length,
      firstDate: list.map((b) => b.date).sort()[0],
      match: matchClient(list[0].customerName, list, dir),
    }))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
};

// Gives each booking the number its client was confirmed with (`confirmed`: nameKey -> phone)
export const withConfirmedPhones = (
  toCreate: ReadyBooking[],
  confirmed: ReadonlyMap<string, string>,
): ReadyBooking[] =>
  toCreate.map((b) => {
    const phone = confirmed.get(nameKey(b.customerName));
    return phone ? { ...b, phone } : b;
  });
