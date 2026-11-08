// hairProfile.ts
// The "Your hair" step: what a client's hair is like now (Current hair) and what they want
// (Desired hair). The questions and options are DATA the owner edits in Manage, stored as one
// document (salonSettings/hairOptions), never code. Pure and dependency-free, so the booking
// form, the Manage editor, the booking function and the admin all share it (it is compiled into
// functions/ too). The answers are personal information, so everything is whitelisted: the
// client sends option ids, the function re-checks them against the CURRENT options, drops
// anything unknown or hidden, and stores a snapshot of the labels so a later rename or delete
// never changes an old booking.

export const MAX_HAIR_NOTES = 300;
export const MAX_LABEL = 60;
export const MAX_OPTIONS_PER_QUESTION = 20;
export const MAX_QUESTIONS_PER_SECTION = 12;

/** How an option looks: a colour swatch, a built-in icon, the owner's own image, or plain text. */
export type HairVisual =
  | { kind: "swatch"; color: string } // "#rrggbb"
  | { kind: "icon"; icon: HairIconKey }
  | { kind: "image"; url: string } // an https URL (Firebase Storage)
  | { kind: "text"; text: string }; // shown instead of a picture, e.g. "Short"

export const HAIR_ICONS = [
  "short", "shoulder", "long", // length
  "fine", "medium", "thick", // thickness
  "healthy", "dry", "damaged", // condition
  "wave", "curl", "coil", "straight", // texture
  "scissors", "colour", "bleach", "perm", "untouched", "unsure", // history and misc
] as const;
export type HairIconKey = (typeof HAIR_ICONS)[number];

export interface HairOption {
  id: string;
  label: string;
  visual: HairVisual;
  hidden?: boolean; // not offered to clients; old answers keep their label
  /** "this answer needs a phone call" (used by the call request, a later phase) */
  callFlag?: boolean;
}

export interface HairQuestion {
  id: string;
  label: string;
  multi?: boolean; // several answers allowed (default: one)
  required?: boolean;
  hidden?: boolean;
  options: HairOption[];
}

export type HairSectionId = "current" | "desired";

export interface HairSection {
  id: HairSectionId;
  title: string; // "Current hair"
  questions: HairQuestion[];
}

export interface HairConfig {
  sections: HairSection[];
}

// ── Seed (what the owner starts with; editable in Manage) ───────────────────────

const sw = (color: string): HairVisual => ({ kind: "swatch", color });
const ic = (icon: HairIconKey): HairVisual => ({ kind: "icon", icon });
const opt = (id: string, label: string, visual: HairVisual, callFlag = false): HairOption => ({
  id, label, visual, ...(callFlag ? { callFlag: true } : {}),
});

const COLOUR_FAMILIES: HairOption[] = [
  opt("natural-brown", "Natural brown", sw("#6b4a32")),
  opt("black", "Black", sw("#1c1a1a")),
  opt("blonde", "Blonde", sw("#d9bf8c")),
  opt("ash", "Ash", sw("#9a9690")),
  opt("warm", "Warm tones", sw("#b0562f")),
  opt("fashion", "Fashion colour", sw("#8a4fd1")),
];

export const DEFAULT_HAIR_CONFIG: HairConfig = {
  sections: [
    {
      id: "current",
      title: "Current hair",
      questions: [
        {
          id: "history", label: "Hair history", multi: true, required: true,
          options: [
            opt("never", "Never coloured or treated", ic("untouched")),
            opt("coloured", "Coloured", ic("colour"), true),
            opt("highlights", "Highlights, balayage or ombré", ic("colour"), true),
            opt("bleached", "Bleached", ic("bleach"), true),
            opt("permed", "Permed or straightened", ic("perm")),
            opt("not-sure", "Not sure", ic("unsure")),
          ],
        },
        { id: "colour-now", label: "Colour now", options: COLOUR_FAMILIES.map((o) => ({ ...o, id: `now-${o.id}` })) },
        {
          id: "length", label: "Length",
          options: [opt("short", "Short", ic("short")), opt("shoulder", "Shoulder", ic("shoulder")), opt("long", "Long", ic("long"))],
        },
        {
          id: "thickness", label: "Thickness",
          options: [opt("fine", "Fine", ic("fine")), opt("medium", "Medium", ic("medium")), opt("thick", "Thick", ic("thick"))],
        },
        {
          id: "condition", label: "Condition",
          options: [opt("healthy", "Healthy", ic("healthy")), opt("dry", "Dry", ic("dry")), opt("damaged", "Damaged", ic("damaged"))],
        },
      ],
    },
    {
      id: "desired",
      title: "Desired hair",
      questions: [
        { id: "colour-want", label: "Colour family", options: COLOUR_FAMILIES },
        {
          id: "texture", label: "Texture",
          options: [opt("light-wave", "Light wave", ic("wave")), opt("medium-curl", "Medium curl", ic("curl")), opt("tight-curl", "Tight curl", ic("coil"))],
        },
        {
          id: "length-change", label: "Length change",
          options: [opt("keep", "Keep", ic("scissors")), opt("shorter", "Shorter", ic("short")), opt("longer", "Longer", ic("long"))],
        },
      ],
    },
  ],
};

// ── What the client sends and what is stored ────────────────────────────────────

/** question id -> chosen option ids, per section, plus one optional note per section */
export interface HairAnswersInput {
  current?: { picks?: Record<string, string[]>; notes?: string };
  desired?: { picks?: Record<string, string[]>; notes?: string };
}

export interface HairAnswerItem {
  question: string; // label at booking time
  answers: { label: string; visual: HairVisual }[]; // labels at booking time
}

export interface HairSnapshotSection {
  id: HairSectionId;
  title: string;
  items: HairAnswerItem[];
  notes: string;
}

/** What is stored on the booking: labels frozen at booking time. */
export interface HairSnapshot {
  sections: HairSnapshotSection[];
  /** true when any chosen option carries the call flag */
  callFlagged: boolean;
}

export type HairResult = { ok: true; value: HairSnapshot } | { ok: false; problem: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const tidy = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? null : t;
};

/** Questions a client sees: not hidden, with at least one visible option. */
export const visibleQuestions = (section: HairSection): HairQuestion[] =>
  section.questions
    .filter((q) => !q.hidden)
    .map((q) => ({ ...q, options: q.options.filter((o) => !o.hidden) }))
    .filter((q) => q.options.length > 0);

// Validates and cleans whatever arrived against the current config. Unknown keys, hidden or
// unknown options are a problem (the form only offers visible ones) except unknown QUESTION
// keys, which are dropped silently so an owner deleting a question mid-booking doesn't fail it.
// Never throws.
export const checkHairAnswers = (raw: unknown, config: HairConfig): HairResult => {
  if (raw === undefined || raw === null) return { ok: false, problem: "Please tell us about your hair." };
  if (!isRecord(raw)) return { ok: false, problem: "Please tell us about your hair." };

  const sections: HairSnapshotSection[] = [];
  let callFlagged = false;

  for (const section of config.sections) {
    const input = raw[section.id];
    if (input !== undefined && !isRecord(input)) return { ok: false, problem: "Please tell us about your hair." };
    const picks = isRecord(input) && input.picks !== undefined ? input.picks : {};
    if (!isRecord(picks)) return { ok: false, problem: "Please tell us about your hair." };

    const notes = tidy(isRecord(input) ? input.notes : undefined, MAX_HAIR_NOTES);
    if (notes === null) return { ok: false, problem: `Your ${section.title.toLowerCase()} note can be at most ${MAX_HAIR_NOTES} characters.` };

    const items: HairAnswerItem[] = [];
    for (const q of visibleQuestions(section)) {
      const chosen = picks[q.id];
      const ids = chosen === undefined ? [] : chosen;
      if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string") || ids.length > MAX_OPTIONS_PER_QUESTION) {
        return { ok: false, problem: `Please check your answer for "${q.label}".` };
      }
      const unique = [...new Set(ids as string[])];
      if (!q.multi && unique.length > 1) return { ok: false, problem: `Please choose one answer for "${q.label}".` };
      const answers: HairAnswerItem["answers"] = [];
      for (const id of unique) {
        const o = q.options.find((x) => x.id === id);
        if (!o) return { ok: false, problem: `"${q.label}" has an answer that is no longer offered. Please choose again.` };
        answers.push({ label: o.label, visual: o.visual });
        if (o.callFlag) callFlagged = true;
      }
      if (q.required && answers.length === 0) return { ok: false, problem: `Please answer "${q.label}".` };
      if (answers.length > 0) items.push({ question: q.label, answers });
    }
    sections.push({ id: section.id, title: section.title, items, notes });
  }
  return { ok: true, value: { sections, callFlagged } };
};

/** One readable line for notifications and history. */
export const hairSummary = (h: HairSnapshot): string =>
  h.sections
    .map((s) => {
      const parts = s.items.map((i) => `${i.question}: ${i.answers.map((a) => a.label).join(", ")}`);
      if (s.notes) parts.push(`Note: ${s.notes}`);
      return parts.length ? `${s.title} - ${parts.join("; ")}` : "";
    })
    .filter(Boolean)
    .join(" | ");

// ── Validating the owner's edits (the Manage editor and the settings write) ─────

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Slug an owner-typed label into an id that is safe to store. */
export const slugId = (label: string, taken: Iterable<string>): string => {
  const used = new Set(taken);
  const base = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "option";
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

const visualProblem = (v: unknown): string | null => {
  if (!isRecord(v)) return "Each option needs a picture or text.";
  if (v.kind === "swatch") return typeof v.color === "string" && HEX.test(v.color) ? null : "A swatch needs a colour.";
  if (v.kind === "icon") return typeof v.icon === "string" && (HAIR_ICONS as readonly string[]).includes(v.icon) ? null : "Unknown icon.";
  if (v.kind === "image") return typeof v.url === "string" && v.url.length <= 600 && /^https:\/\//.test(v.url) ? null : "An image needs a web address that starts with https://.";
  if (v.kind === "text") return typeof v.text === "string" && v.text.trim().length > 0 && v.text.length <= 20 ? null : "Text shown in place of a picture can be 1 to 20 characters.";
  return "Each option needs a picture or text.";
};

/** The first problem with a config the owner is saving, or null when it is fine. */
export const hairConfigProblem = (c: unknown): string | null => {
  if (!isRecord(c) || !Array.isArray(c.sections) || c.sections.length !== 2) return "The hair options are not in the expected shape.";
  const sectionIds = new Set<string>();
  for (const s of c.sections as unknown[]) {
    if (!isRecord(s) || (s.id !== "current" && s.id !== "desired") || sectionIds.has(s.id)) return "The hair options are not in the expected shape.";
    sectionIds.add(s.id);
    if (typeof s.title !== "string" || !s.title.trim() || s.title.length > MAX_LABEL) return "Each section needs a title.";
    if (!Array.isArray(s.questions) || s.questions.length > MAX_QUESTIONS_PER_SECTION) return `A section can have at most ${MAX_QUESTIONS_PER_SECTION} questions.`;
    const qIds = new Set<string>();
    for (const q of s.questions as unknown[]) {
      if (!isRecord(q) || typeof q.id !== "string" || !ID.test(q.id) || qIds.has(q.id)) return "Each question needs a unique id.";
      qIds.add(q.id);
      if (typeof q.label !== "string" || !q.label.trim() || q.label.length > MAX_LABEL) return "Each question needs a name.";
      if (!Array.isArray(q.options) || q.options.length > MAX_OPTIONS_PER_QUESTION) return `A question can have at most ${MAX_OPTIONS_PER_QUESTION} options.`;
      const oIds = new Set<string>();
      for (const o of q.options as unknown[]) {
        if (!isRecord(o) || typeof o.id !== "string" || !ID.test(o.id) || oIds.has(o.id)) return "Each option needs a unique id.";
        oIds.add(o.id);
        if (typeof o.label !== "string" || !o.label.trim() || o.label.length > MAX_LABEL) return "Each option needs a name.";
        const vp = visualProblem(o.visual);
        if (vp) return vp;
      }
    }
  }
  return null;
};
