// clientAccess.ts
// Whose clients a stylist may open (FR-025, DEC-051). By default a stylist sees only
// the clients who have a booking with them (DEC-047). The owner can widen that, per
// stylist: to named colleagues' clients, or to every client. It is a custom claim on
// the stylist's sign-in token, written only by the Admin SDK together with the role,
// and firestore.rules reads the claim, so what a stylist can open is enforced by the
// database and not by what the page draws.
//
//   clientsAll: true             every client (card, notes, and every stylist's bookings with them)
//   clientStylists: ["yuto"]     the clients of those colleagues (never the stylist's own id: that is always allowed)
//
// A claim is part of the token (about 1 KB in all), so the list is kept short.
// Pure - shared by the Cloud Functions, the Manage screen and the stylist screens.

export interface ClientAccess {
  /** Every client of every stylist */
  all: boolean;
  /** Colleagues whose clients may also be opened (empty when `all`) */
  stylistIds: string[];
}

export const NO_EXTRA_ACCESS: ClientAccess = { all: false, stylistIds: [] };

/** Most colleagues one stylist can be given: the claim must stay small. */
export const MAX_ACCESS_STYLISTS = 12;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Any input -> a safe ClientAccess for the stylist `ownId`: only well-formed ids, no
 * duplicates, never their own id, at most MAX_ACCESS_STYLISTS, and nothing listed when
 * `all` is set (it already covers everyone).
 */
export const normaliseAccess = (raw: unknown, ownId?: string): ClientAccess => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.all === true) return { all: true, stylistIds: [] };
  const list = Array.isArray(r.stylistIds) ? r.stylistIds : [];
  const ids: string[] = [];
  for (const v of list) {
    if (typeof v !== "string" || !ID.test(v) || v === ownId || ids.includes(v)) continue;
    ids.push(v);
  }
  return { all: false, stylistIds: ids.slice(0, MAX_ACCESS_STYLISTS) };
};

/** True when the owner has asked for more than the stylist's own clients. */
export const hasExtraAccess = (a: ClientAccess): boolean => a.all || a.stylistIds.length > 0;

/** The custom-claim fields for an access (none at all for the default). */
export const claimsForAccess = (a: ClientAccess): Record<string, unknown> =>
  a.all ? { clientsAll: true } : a.stylistIds.length > 0 ? { clientStylists: a.stylistIds } : {};

/** What a sign-in token says (tolerant: a malformed claim means no extra access). */
export const accessFromClaims = (claims: Record<string, unknown>, ownId?: string): ClientAccess =>
  normaliseAccess(
    { all: claims.clientsAll === true, stylistIds: claims.clientStylists },
    ownId,
  );

export type ClientScope =
  | { kind: "stylist"; stylistId: string } //  one stylist's clients (own, or a colleague's)
  | { kind: "all" }; //                        every client

/**
 * The views a stylist can choose between, own first: "My clients", each colleague
 * they may open, and "Everyone's" when all. `names` maps a stylist id to a display
 * name (the colleague's own name; a missing one falls back to the id).
 */
export const scopeOptions = (
  ownId: string,
  access: ClientAccess,
  names: Record<string, string> = {},
): { key: string; label: string; scope: ClientScope }[] => {
  const options: { key: string; label: string; scope: ClientScope }[] = [
    { key: "mine", label: "My clients", scope: { kind: "stylist", stylistId: ownId } },
  ];
  for (const id of access.stylistIds) {
    options.push({
      key: `s:${id}`,
      label: `${names[id] ?? id}'s clients`,
      scope: { kind: "stylist", stylistId: id },
    });
  }
  if (access.all) options.push({ key: "all", label: "Everyone's clients", scope: { kind: "all" } });
  return options;
};

/**
 * Which stylists' bookings a stylist may read for a client's history: their own plus
 * whoever they may open ("all" -> null, meaning no restriction on the stylist).
 */
export const historyStylists = (ownId: string, access: ClientAccess): string[] | null =>
  access.all ? null : [ownId, ...access.stylistIds];
