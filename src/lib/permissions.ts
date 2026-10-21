// permissions.ts
// What a stylist may do beyond the day-to-day (FR-026, DEC-052). The owner can do
// everything, always. Everything else is a named capability the owner grants:
//
//   to ALL stylists   (role defaults: "every stylist can edit message wording")
//   to ONE stylist    (an override: "Elly can" / "Harry can't")
//
// The effective list of a stylist is (defaults + their grants) minus their denials; a
// denial always wins. The server works it out when anything changes and stores it
//   - on the sign-in token, as short codes in the `caps` claim (what firestore.rules reads)
//   - in users/{uid}.effectiveCaps (the readable record, and what the functions check)
// so a revoked permission stops working in the functions at once. Whose clients a
// stylist may open (clientAccess.ts) is the same kind of thing and is shown beside these.
// Pure - shared by the functions, the Manage screen and the stylist screens.

export const CAPABILITIES = ["editMessages", "sendWinBack", "approveTimeOff", "editClientRecords"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_INFO: Record<Capability, { label: string; help: string; code: string }> = {
  editMessages: {
    label: "Edit message wording",
    help: "Change the emails and texts sent to clients, and send test messages.",
    code: "msg",
  },
  sendWinBack: {
    label: "Send win-back messages",
    help: "Email or text lapsed clients (who agreed to hear from us) inviting them back.",
    code: "winback",
  },
  approveTimeOff: {
    label: "Approve time off",
    help: "Approve or decline other stylists' time-off and blocked-time requests.",
    code: "timeoff",
  },
  editClientRecords: {
    label: "Edit client records",
    help: "Add colour formulas and patch tests to clients they can open, and edit their details (not block, merge or anonymise).",
    code: "records",
  },
};

export interface Permissions {
  /** Granted to this stylist on top of the role defaults */
  grant: Capability[];
  /** Taken away from this stylist even if the role default or a grant gives it */
  deny: Capability[];
}

export const NO_PERMISSIONS: Permissions = { grant: [], deny: [] };

export const isCapability = (v: unknown): v is Capability =>
  typeof v === "string" && (CAPABILITIES as readonly string[]).includes(v);

const cleanList = (raw: unknown): Capability[] => {
  const out: Capability[] = [];
  if (Array.isArray(raw)) for (const v of raw) if (isCapability(v) && !out.includes(v)) out.push(v);
  return out;
};

/** Any input -> well-formed permissions: known capabilities once each; a denial beats a grant. */
export const normalisePermissions = (raw: unknown): Permissions => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const deny = cleanList(r.deny);
  return { grant: cleanList(r.grant).filter((c) => !deny.includes(c)), deny };
};

/** The stored role defaults (any input) -> a clean list. */
export const normaliseDefaults = (raw: unknown): Capability[] => cleanList(raw);

/** What a stylist can actually do: (defaults + grants) minus denials, in the canonical order. */
export const effectiveCapabilities = (defaults: Capability[], p: Permissions): Capability[] =>
  CAPABILITIES.filter((c) => (defaults.includes(c) || p.grant.includes(c)) && !p.deny.includes(c));

/**
 * The overrides that make `wanted` the stylist's effective list, given the role
 * defaults. Used by the Manage screen, which shows plain tick-boxes: ticking something
 * the default does not give is a grant; unticking something it does is a denial.
 */
export const overridesFor = (defaults: Capability[], wanted: Capability[]): Permissions => ({
  grant: CAPABILITIES.filter((c) => wanted.includes(c) && !defaults.includes(c)),
  deny: CAPABILITIES.filter((c) => !wanted.includes(c) && defaults.includes(c)),
});

// ── The token claim ──────────────────────────────────────────────────────────

/** The `caps` claim for an effective list (nothing at all for none, keeping the token small). */
export const claimsForCapabilities = (caps: Capability[]): Record<string, unknown> =>
  caps.length > 0 ? { caps: caps.map((c) => CAPABILITY_INFO[c].code) } : {};

/** What a sign-in token says (tolerant: a malformed claim means no capabilities). */
export const capabilitiesFromClaims = (claims: Record<string, unknown>): Capability[] => {
  const raw = claims.caps;
  if (!Array.isArray(raw)) return [];
  return CAPABILITIES.filter((c) => raw.includes(CAPABILITY_INFO[c].code));
};

/** Does this person hold the capability? An owner holds every one. */
export const can = (user: { role: "owner" | "stylist"; capabilities?: Capability[] } | null | undefined, cap: Capability): boolean =>
  !!user && (user.role === "owner" || (user.capabilities ?? []).includes(cap));
