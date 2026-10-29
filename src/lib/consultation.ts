// consultation.ts
// The colour consultation questionnaire a client fills in when booking a service that
// needs a phone consultation first (Service.requiresConsultation). One fixed question
// set, shared by the booking form (which builds it), the booking function (which
// validates it and stores it on the booking) and the admin (which shows it). Pure, so
// it is unit-tested. The answers are health-related, so everything is whitelisted:
// choices are fixed values, free text is one tidy line with a length cap, and anything
// not listed here is dropped.

export const TREATED_BEFORE = ["yes", "no"] as const;
export const LAST_COLOURED = ["never", "under4weeks", "1to3months", "3to6months", "over6months"] as const;
export const TREATMENTS = ["boxDye", "bleach", "perm", "relaxer", "keratin", "henna", "none"] as const;
export const DYE_REACTION = ["yes", "no", "unsure"] as const;
export const PATCH_TEST = ["yes", "no", "unsure"] as const;
export const CALL_TIMES = ["any", "morning", "afternoon", "evening"] as const;

export type TreatedBefore = (typeof TREATED_BEFORE)[number];
export type LastColoured = (typeof LAST_COLOURED)[number];
export type Treatment = (typeof TREATMENTS)[number];
export type DyeReaction = (typeof DYE_REACTION)[number];
export type PatchTest = (typeof PATCH_TEST)[number];
export type CallTime = (typeof CALL_TIMES)[number];

export const MAX_CURRENT_COLOUR = 100;
export const MAX_DESIRED_COLOUR = 300;
export const MAX_HEALTH_NOTES = 300;

export interface Consultation {
  treatedBefore: TreatedBefore; // has the hair been coloured or chemically treated before?
  lastColoured: LastColoured; // "never" whenever treatedBefore is "no"
  currentColour: string; // optional: natural or coloured, and the shade
  desiredColour: string; // what they are after
  treatments: Treatment[]; // anything else in the past year; ["none"] alone, or a list
  dyeReaction: DyeReaction; // ever reacted to hair dye?
  patchTest: PatchTest; // a patch test in the last 6 months?
  healthNotes: string; // optional: sensitive scalp, pregnancy, medication
  callTime: CallTime; // best time for the salon to ring
}

// What the form holds while the client is answering: nothing is pre-selected, so an answer is
// always a choice the client made. checkConsultation turns it into a Consultation.
export interface ConsultationDraft {
  treatedBefore: "" | TreatedBefore;
  lastColoured: "" | LastColoured;
  currentColour: string;
  desiredColour: string;
  treatments: Treatment[];
  dyeReaction: "" | DyeReaction;
  patchTest: "" | PatchTest;
  healthNotes: string;
  callTime: "" | CallTime;
}

export const EMPTY_DRAFT: ConsultationDraft = {
  treatedBefore: "",
  lastColoured: "",
  currentColour: "",
  desiredColour: "",
  treatments: [],
  dyeReaction: "",
  patchTest: "",
  healthNotes: "",
  callTime: "",
};

export const LABELS = {
  treatedBefore: { yes: "Yes", no: "No, never" },
  lastColoured: {
    never: "Never",
    under4weeks: "Under 4 weeks ago",
    "1to3months": "1 to 3 months ago",
    "3to6months": "3 to 6 months ago",
    over6months: "Over 6 months ago",
  },
  treatments: {
    boxDye: "Box dye at home",
    bleach: "Bleach / lightener",
    perm: "Perm",
    relaxer: "Relaxer / straightening",
    keratin: "Keratin treatment",
    henna: "Henna",
    none: "None of these",
  },
  dyeReaction: { yes: "Yes", no: "No", unsure: "Not sure" },
  patchTest: { yes: "Yes", no: "No", unsure: "Not sure" },
  callTime: { any: "Any time", morning: "Morning", afternoon: "Afternoon", evening: "Evening" },
} as const;

// One tidy line: control characters become spaces, runs of space collapse, capped
const line = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? null : t;
};

const oneOf = <T extends string>(allowed: readonly T[], v: unknown): T | null =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;

export type ConsultationResult = { ok: true; value: Consultation } | { ok: false; problem: string };

// Validates and cleans whatever arrived. Unknown keys are dropped; a wrong type, an unknown
// choice or too-long text is a problem. Never throws.
export const checkConsultation = (raw: unknown): ConsultationResult => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, problem: "Please answer the colour consultation questions." };
  }
  const r = raw as Record<string, unknown>;

  const treatedBefore = oneOf(TREATED_BEFORE, r.treatedBefore);
  if (!treatedBefore) return { ok: false, problem: "Please say whether your hair has been coloured or treated before." };

  const lastColoured = treatedBefore === "no" ? "never" : oneOf(LAST_COLOURED, r.lastColoured);
  if (!lastColoured) return { ok: false, problem: "Please say when your hair was last coloured." };

  const currentColour = line(r.currentColour, MAX_CURRENT_COLOUR);
  if (currentColour === null) return { ok: false, problem: `Your current colour can be at most ${MAX_CURRENT_COLOUR} characters.` };

  const desiredColour = line(r.desiredColour, MAX_DESIRED_COLOUR);
  if (desiredColour === null) return { ok: false, problem: `What you would like can be at most ${MAX_DESIRED_COLOUR} characters.` };
  if (!desiredColour) return { ok: false, problem: "Please tell us what you would like done." };

  if (!Array.isArray(r.treatments) || r.treatments.length > TREATMENTS.length) {
    return { ok: false, problem: "Please choose any other treatments you have had, or 'None of these'." };
  }
  const picked = new Set<Treatment>();
  for (const t of r.treatments) {
    const known = oneOf(TREATMENTS, t);
    if (!known) return { ok: false, problem: "Please choose any other treatments you have had, or 'None of these'." };
    picked.add(known);
  }
  if (picked.size === 0) return { ok: false, problem: "Please choose any other treatments you have had, or 'None of these'." };
  // "none" cannot sit beside a real treatment
  const treatments = picked.has("none") && picked.size > 1 ? TREATMENTS.filter((t) => t !== "none" && picked.has(t)) : [...picked];

  const dyeReaction = oneOf(DYE_REACTION, r.dyeReaction);
  if (!dyeReaction) return { ok: false, problem: "Please say whether you have ever reacted to hair dye." };

  const patchTest = oneOf(PATCH_TEST, r.patchTest);
  if (!patchTest) return { ok: false, problem: "Please say whether you have had a patch test in the last 6 months." };

  const healthNotes = line(r.healthNotes, MAX_HEALTH_NOTES);
  if (healthNotes === null) return { ok: false, problem: `Anything we should know can be at most ${MAX_HEALTH_NOTES} characters.` };

  const callTime = oneOf(CALL_TIMES, r.callTime);
  if (!callTime) return { ok: false, problem: "Please choose the best time for us to call." };

  return {
    ok: true,
    value: { treatedBefore, lastColoured, currentColour, desiredColour, treatments, dyeReaction, patchTest, healthNotes, callTime },
  };
};

// Does any chosen service need the consultation?
export const needsConsultation = (services: readonly { requiresConsultation?: boolean }[]): boolean =>
  services.some((s) => s.requiresConsultation === true);

// For the admin: the answers as label / value rows. Anything worth a second look is flagged.
export interface ConsultationRow {
  label: string;
  value: string;
  alert?: boolean;
}

export const consultationRows = (c: Consultation): ConsultationRow[] => [
  { label: "Coloured or treated before", value: LABELS.treatedBefore[c.treatedBefore] },
  { label: "Last coloured", value: LABELS.lastColoured[c.lastColoured] },
  { label: "Current colour", value: c.currentColour || "-" },
  { label: "What they would like", value: c.desiredColour },
  {
    label: "Other treatments, past year",
    value: c.treatments.map((t) => LABELS.treatments[t]).join(", "),
    alert: c.treatments.some((t) => t !== "none"),
  },
  { label: "Ever reacted to hair dye", value: LABELS.dyeReaction[c.dyeReaction], alert: c.dyeReaction !== "no" },
  { label: "Patch test in last 6 months", value: LABELS.patchTest[c.patchTest], alert: c.patchTest !== "yes" },
  { label: "Anything we should know", value: c.healthNotes || "-", alert: c.healthNotes !== "" },
  { label: "Best time to call", value: LABELS.callTime[c.callTime] },
];

// One short sentence for the owner's notification and the "copy to client record" text
export const consultationSummary = (c: Consultation): string => {
  const bits = [
    `wants: ${c.desiredColour}`,
    c.treatedBefore === "yes" ? `last coloured ${LABELS.lastColoured[c.lastColoured].toLowerCase()}` : "never coloured",
    c.dyeReaction !== "no" ? `dye reaction: ${LABELS.dyeReaction[c.dyeReaction].toLowerCase()}` : "",
    c.patchTest !== "yes" ? `patch test: ${LABELS.patchTest[c.patchTest].toLowerCase()}` : "",
    c.healthNotes ? `notes: ${c.healthNotes}` : "",
  ].filter(Boolean);
  return bits.join("; ");
};

// Allergy text for the client record, only when the answers point to a possible reaction
export const allergyFromConsultation = (c: Consultation): string => {
  const parts = [
    c.dyeReaction === "yes" ? "Has reacted to hair dye before" : c.dyeReaction === "unsure" ? "Unsure about past hair dye reactions" : "",
    c.healthNotes,
  ].filter(Boolean);
  return parts.join("; ").slice(0, 500);
};
