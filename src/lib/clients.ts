// clients.ts
// The rules for the clients collection (DEC-044), pure so the app, the Cloud
// Functions and the tests all use the same ones. Everything about a client that
// is DERIVED from their bookings is worked out here from the bookings alone, so it
// can always be recomputed and compared with what is stored.
//
//   clientId   the normalised phone, "04XXXXXXXX" (or a "deleted-..." tombstone)
//   visit      a customer or walk-in booking that has happened: status completed,
//              arrived or in_service, or confirmed and dated today or earlier.
//              Pending, cancelled and no-show are not visits; breaks and training
//              are not clients' bookings at all.
//   spend      the price of visits only (so cancelled, pending, future bookings,
//              breaks and training never count)
//   next       the earliest pending or confirmed booking dated after today
//
// "Today" is passed in (the salon's date, from businessTime), never read from the
// clock here, so the same bookings always give the same answer.

import { daysBetweenDates } from "./businessTime";
import { normaliseMobile } from "./clientImport";
import { marketingStatus, type MarketingSource } from "./marketing";
import { timeStringToMinutes } from "./scheduling";
import type {
  Booking,
  Client,
  ClientCard,
  ClientSource,
  ClientSummary,
  PreferredContact,
} from "../types";

// ── Identity ─────────────────────────────────────────────────────────────────

export const TOMBSTONE_PREFIX = "deleted-";

// Any way a phone is written -> the client id, or null when it is not a valid
// Australian mobile (never guessed at)
export const clientIdFromPhone = (raw: string | undefined | null): string | null =>
  raw ? normaliseMobile(raw) : null;

export const isTombstone = (clientId: string | undefined): boolean =>
  !!clientId && clientId.startsWith(TOMBSTONE_PREFIX);

// ── Names and search keys ────────────────────────────────────────────────────

// Trim, collapse spaces, drop control characters, limit the length
export const tidyName = (raw: string): string =>
  // eslint-disable-next-line no-control-regex
  raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

// Lower-case with accents removed, so "Zoë" is found by "zoe" and "Jose" by "josé"
export const foldText = (raw: string): string =>
  tidyName(raw)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC") // put Hangul and other composed scripts back together
    .toLocaleLowerCase("en");

export const MAX_TOKENS = 10;

// The words of a name, folded, at least 2 characters, no repeats: arrayContains
// queries match a whole word, the prefix field handles the rest
export const nameTokens = (name: string): string[] => {
  const words = foldText(name).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, MAX_TOKENS);
};

export interface NameKeys {
  nameLower: string;
  searchTokens: string[];
}

export const nameKeys = (name: string): NameKeys => ({
  nameLower: foldText(name),
  searchTokens: nameTokens(name),
});

export const MIN_SEARCH_LENGTH = 2;

export type SearchPlan =
  | { kind: "none" }
  | { kind: "name"; prefix: string; token: string | null }
  | { kind: "phone"; prefix: string };

// What a typed search means: digits are a phone prefix (a number written the
// Fresha way, "61 4...", is turned into "04..."), anything else a name. Under 2
// characters is no search at all.
export const planSearch = (raw: string): SearchPlan => {
  const text = raw.trim();
  if (text.length < MIN_SEARCH_LENGTH) return { kind: "none" };
  if (/^[\d\s+()-]+$/.test(text)) {
    let digits = text.replace(/\D/g, "");
    if (digits.length < MIN_SEARCH_LENGTH) return { kind: "none" };
    if (digits.startsWith("614")) digits = `0${digits.slice(2)}`;
    return { kind: "phone", prefix: digits };
  }
  const folded = foldText(text);
  if (folded.length < MIN_SEARCH_LENGTH) return { kind: "none" };
  // A whole-word match is possible when the text is a single word
  const token = /^[\p{L}\p{N}]+$/u.test(folded) ? folded : null;
  return { kind: "name", prefix: folded, token };
};

// The end of a prefix range: every string starting with `prefix` is < this
export const prefixEnd = (prefix: string): string => `${prefix}`;

// ── The summary ──────────────────────────────────────────────────────────────

export type SummaryBooking = Pick<
  Booking,
  | "id"
  | "bookingType"
  | "status"
  | "date"
  | "time"
  | "stylistId"
  | "serviceId"
  | "servicePrice"
> & { services?: Pick<NonNullable<Booking["services"]>[number], "id">[] };

const isServiceBooking = (b: Pick<Booking, "bookingType">): boolean =>
  b.bookingType === "customer" || b.bookingType === "walkin";

export const isVisit = (b: SummaryBooking, today: string): boolean => {
  if (!isServiceBooking(b)) return false;
  if (b.status === "completed" || b.status === "arrived" || b.status === "in_service") {
    return true;
  }
  return b.status === "confirmed" && b.date <= today;
};

const isUpcoming = (b: SummaryBooking, today: string): boolean =>
  isServiceBooking(b) &&
  (b.status === "pending" || b.status === "confirmed") &&
  b.date > today;

const byDateThenTime = (a: SummaryBooking, b: SummaryBooking): number =>
  a.date.localeCompare(b.date) ||
  timeStringToMinutes(a.time) - timeStringToMinutes(b.time) ||
  a.id.localeCompare(b.id);

const topIds = (counts: Map<string, number>, latest: Map<string, string>, n: number): string[] =>
  [...counts.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        (latest.get(b[0]) ?? "").localeCompare(latest.get(a[0]) ?? "") ||
        a[0].localeCompare(b[0]),
    )
    .slice(0, n)
    .map(([id]) => id);

export const EMPTY_SUMMARY: ClientSummary = {
  totalVisits: 0,
  totalSpend: 0,
  firstVisit: "",
  lastVisit: "",
  hasUpcoming: false,
  nextBookingDate: "",
  nextBookingTime: "",
  nextBookingId: "",
  cancelCount: 0,
  noShowCount: 0,
  hasNoShows: false,
  favouriteStylistId: "",
  favouriteServiceIds: [],
  stylistIds: [],
  avgDaysBetweenVisits: null,
  bookingCount: 0,
};

export const computeClientSummary = (
  bookings: SummaryBooking[],
  today: string,
): ClientSummary => {
  const mine = bookings.filter(isServiceBooking);
  if (mine.length === 0) return { ...EMPTY_SUMMARY };

  const visits = mine.filter((b) => isVisit(b, today)).sort(byDateThenTime);
  const dates = [...new Set(visits.map((b) => b.date))];

  const stylistCounts = new Map<string, number>();
  const stylistLatest = new Map<string, string>();
  const serviceCounts = new Map<string, number>();
  const serviceLatest = new Map<string, string>();
  for (const v of visits) {
    if (v.stylistId && v.stylistId !== "any") {
      stylistCounts.set(v.stylistId, (stylistCounts.get(v.stylistId) ?? 0) + 1);
      stylistLatest.set(v.stylistId, v.date);
    }
    const ids = v.services?.length ? v.services.map((s) => s.id) : [v.serviceId];
    for (const id of ids) {
      if (!id || id === "break") continue;
      serviceCounts.set(id, (serviceCounts.get(id) ?? 0) + 1);
      serviceLatest.set(id, v.date);
    }
  }

  const upcoming = mine.filter((b) => isUpcoming(b, today)).sort(byDateThenTime);
  const next = upcoming[0];
  const noShows = mine.filter((b) => b.status === "no_show").length;

  let avg: number | null = null;
  if (dates.length >= 2) {
    let total = 0;
    for (let i = 1; i < dates.length; i++) total += daysBetweenDates(dates[i - 1], dates[i]);
    avg = Math.round((total / (dates.length - 1)) * 10) / 10;
  }

  return {
    totalVisits: visits.length,
    totalSpend: Math.round(visits.reduce((n, v) => n + (v.servicePrice ?? 0), 0) * 100) / 100,
    firstVisit: dates[0] ?? "",
    lastVisit: dates[dates.length - 1] ?? "",
    hasUpcoming: !!next,
    nextBookingDate: next?.date ?? "",
    nextBookingTime: next?.time ?? "",
    nextBookingId: next?.id ?? "",
    cancelCount: mine.filter((b) => b.status === "cancelled").length,
    noShowCount: noShows,
    hasNoShows: noShows > 0,
    favouriteStylistId: topIds(stylistCounts, stylistLatest, 1)[0] ?? "",
    favouriteServiceIds: topIds(serviceCounts, serviceLatest, 3),
    stylistIds: [
      ...new Set(
        mine
          .filter((b) => b.status !== "cancelled" && b.stylistId && b.stylistId !== "any")
          .map((b) => b.stylistId),
      ),
    ].sort(),
    avgDaysBetweenVisits: avg,
    bookingCount: mine.length,
  };
};

// ── The whole client document, derived from bookings plus what the owner set ──

export type ProfileBooking = SummaryBooking &
  Pick<Booking, "customerName" | "customerEmail" | "createdAt">;

// What the owner has set by hand (or the import has recorded) and bookings must
// never overwrite
export interface ClientManual {
  email?: string;
  tags: string[];
  blocked: boolean;
  blockReason?: string;
  smsOptOut?: boolean;
  marketingOptIn?: boolean;
  marketingConsentAt?: string;
  marketingSource?: MarketingSource;
  marketingOptOutAt?: string;
  marketingToken?: string;
  winBackSentAt?: string;
  name?: string;
  nameOverride?: boolean;
  source?: ClientSource;
  createdAt?: string;
  aliases?: string[];
  birthday?: string;
  pronouns?: string;
  preferredContact?: PreferredContact;
  allergies?: string;
}

export const MAX_ALIASES = 10;
export const MAX_ALLERGIES = 500;
export const MAX_PRONOUNS = 30;
export const PREFERRED_CONTACTS: readonly PreferredContact[] = ["text", "call", "email"];

// "12/03" (day/month), "12-03", "1990-03-12" or "" -> "MM-DD" / "YYYY-MM-DD" / ""; null when not a real date
export const cleanBirthday = (raw: string): string | null => {
  const v = raw.trim();
  if (!v) return "";
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const short = /^(\d{1,2})[-/](\d{1,2})$/.exec(v);
  // a leap year for the short form, so 29 Feb is allowed
  const [year, month, day] = full
    ? [Number(full[1]), Number(full[2]), Number(full[3])]
    : short
      ? [2000, Number(short[2]), Number(short[1])]
      : [0, 0, 0];
  if (!month) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return full ? `${year}-${mm}-${dd}` : `${mm}-${dd}`;
};

// Free text for the profile fields: one line, trimmed, capped
export const cleanProfileText = (raw: string, max: number): string =>
  // eslint-disable-next-line no-control-regex
  raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const DELETED_NAME = "Deleted Customer";

const sourceOf = (bookings: ProfileBooking[]): ClientSource => {
  const first = [...bookings].sort(byDateThenTime)[0];
  return first?.bookingType === "walkin" ? "walk-in" : "online";
};

// Builds the document for `clientId` from its bookings and the manual fields.
// The name is the most recent booking's unless the owner set it; every other
// spelling seen becomes an alias.
export const buildClient = (
  clientId: string,
  bookings: ProfileBooking[],
  manual: ClientManual,
  today: string,
  nowIso: string,
): Omit<Client, "id"> => {
  const mine = bookings.filter(isServiceBooking);
  const summary = computeClientSummary(mine, today);
  const named = mine
    .filter((b) => tidyName(b.customerName) && tidyName(b.customerName) !== DELETED_NAME)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const latestName = named.length ? tidyName(named[named.length - 1].customerName) : "";
  const name = manual.nameOverride && manual.name ? manual.name : latestName || manual.name || "Client";

  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const candidate of [...(manual.aliases ?? []), ...named.map((b) => tidyName(b.customerName))].reverse()) {
    const key = foldText(candidate);
    if (!candidate || key === foldText(name) || seen.has(key)) continue;
    seen.add(key);
    aliases.push(candidate);
  }

  const emailFrom = [...named].reverse().find((b) => b.customerEmail?.trim());
  const email = manual.email ?? emailFrom?.customerEmail?.trim();

  const keys = nameKeys(name);
  const client: Omit<Client, "id"> = {
    phone: clientId,
    name,
    nameLower: keys.nameLower,
    searchTokens: [...new Set([...keys.searchTokens, ...aliases.flatMap((a) => nameTokens(a))])].slice(0, MAX_TOKENS),
    aliases: aliases.slice(0, MAX_ALIASES),
    tags: manual.tags,
    blocked: manual.blocked,
    source: manual.source ?? (mine.length ? sourceOf(mine) : "fresha-import"),
    createdAt: manual.createdAt ?? nowIso,
    updatedAt: nowIso,
    ...summary,
  };
  if (manual.nameOverride) client.nameOverride = true;
  if (manual.smsOptOut) client.smsOptOut = true;
  // Consent: the latest agreement (a booking with the box ticked, or the owner's record) unless they have unsubscribed since
  Object.assign(client, marketingStatus(manual, mine));
  if (manual.marketingToken) client.marketingToken = manual.marketingToken;
  if (manual.winBackSentAt) client.winBackSentAt = manual.winBackSentAt;
  if (email) client.email = email;
  if (manual.blocked && manual.blockReason) client.blockReason = manual.blockReason;
  if (manual.birthday) client.birthday = manual.birthday;
  if (manual.pronouns) client.pronouns = manual.pronouns;
  if (manual.preferredContact) client.preferredContact = manual.preferredContact;
  if (manual.allergies) client.allergies = manual.allergies;
  return client;
};

// The slim copy a stylist may read: no spend, no blocked reason, no email
export const clientCardOf = (client: Omit<Client, "id">, id: string): ClientCard => ({
  id,
  phone: client.phone,
  name: client.name,
  nameLower: client.nameLower,
  searchTokens: client.searchTokens,
  stylistIds: client.stylistIds,
  blocked: client.blocked,
  tags: client.tags,
  ...(client.allergies ? { allergies: client.allergies } : {}),
  ...(client.pronouns ? { pronouns: client.pronouns } : {}),
});

// ── Directory filters ────────────────────────────────────────────────────────

export type DirectoryFilter = "all" | "lapsed" | "new" | "blocked" | "upcoming" | "noshows";
export type DirectorySort = "lastVisit" | "name" | "visits" | "spend";

export const LAPSED_DAYS = 90;
export const NEW_DAYS = 30;

// Does a client match a filter? The directory asks Firestore for the filter; the
// search results (which come from a name query) are filtered with this instead.
export const matchesFilter = (
  c: Pick<Client, "lastVisit" | "createdAt" | "blocked" | "hasUpcoming" | "hasNoShows" | "totalVisits">,
  filter: DirectoryFilter,
  today: string,
  lapsedDays = LAPSED_DAYS,
): boolean => {
  switch (filter) {
    case "all":
      return true;
    case "lapsed":
      return c.totalVisits > 0 && c.lastVisit !== "" && daysBetweenDates(c.lastVisit, today) > lapsedDays;
    case "new":
      return daysBetweenDates(c.createdAt.slice(0, 10), today) <= NEW_DAYS;
    case "blocked":
      return c.blocked;
    case "upcoming":
      return c.hasUpcoming;
    case "noshows":
      return c.hasNoShows;
  }
};
