// tests/unit/consultation.test.ts
// The colour consultation questionnaire (src/lib/consultation.ts): what is accepted,
// what is cleaned, what is refused, and how the answers read back to the owner.
// Fake data only. `npm run test:unit`.
import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  allergyFromConsultation,
  checkConsultation,
  consultationRows,
  consultationSummary,
  needsConsultation,
} from "../../src/lib/consultation";

const good = {
  treatedBefore: "yes",
  lastColoured: "3to6months",
  currentColour: "Dark brown, coloured",
  desiredColour: "Soft caramel balayage",
  treatments: ["boxDye"],
  dyeReaction: "no",
  patchTest: "yes",
  healthNotes: "",
  callTime: "afternoon",
};

const problem = (over: Record<string, unknown>) => {
  const r = checkConsultation({ ...good, ...over });
  return r.ok ? null : r.problem;
};

describe("checkConsultation", () => {
  it("accepts a complete questionnaire", () => {
    const r = checkConsultation(good);
    expect(r).toEqual({ ok: true, value: { ...good } });
  });

  it("cleans free text into one tidy line and drops unknown keys", () => {
    const r = checkConsultation({
      ...good,
      desiredColour: "  Soft   caramel\nbalayage\t ",
      extra: "ignored",
      admin: true,
    });
    expect(r.ok && r.value.desiredColour).toBe("Soft caramel balayage");
    expect(r.ok && Object.keys(r.value).sort()).toEqual(Object.keys(good).sort());
  });

  it("someone who has never coloured is 'never', whatever else was sent", () => {
    const r = checkConsultation({ ...good, treatedBefore: "no", lastColoured: "under4weeks" });
    expect(r.ok && r.value.lastColoured).toBe("never");
  });

  it("'none' cannot sit beside a real treatment, and a list is deduplicated", () => {
    const mixed = checkConsultation({ ...good, treatments: ["none", "bleach", "bleach"] });
    expect(mixed.ok && mixed.value.treatments).toEqual(["bleach"]);
    const none = checkConsultation({ ...good, treatments: ["none"] });
    expect(none.ok && none.value.treatments).toEqual(["none"]);
  });

  it("refuses what is missing or not one of the choices", () => {
    expect(checkConsultation(undefined).ok).toBe(false);
    expect(checkConsultation("yes").ok).toBe(false);
    expect(checkConsultation([good]).ok).toBe(false);
    expect(problem({ treatedBefore: "maybe" })).toMatch(/coloured or treated/);
    expect(problem({ lastColoured: "yesterday" })).toMatch(/last coloured/);
    expect(problem({ desiredColour: "   " })).toMatch(/what you would like/);
    expect(problem({ treatments: [] })).toMatch(/treatments/);
    expect(problem({ treatments: ["boxDye", "magic"] })).toMatch(/treatments/);
    expect(problem({ treatments: "boxDye" })).toMatch(/treatments/);
    expect(problem({ dyeReaction: true })).toMatch(/reacted/);
    expect(problem({ patchTest: "" })).toMatch(/patch test/);
    expect(problem({ callTime: "midnight" })).toMatch(/best time/);
  });

  it("refuses text that is too long or not text", () => {
    expect(problem({ currentColour: "x".repeat(101) })).toMatch(/at most 100/);
    expect(problem({ desiredColour: "x".repeat(301) })).toMatch(/at most 300/);
    expect(problem({ healthNotes: "x".repeat(301) })).toMatch(/at most 300/);
    expect(problem({ desiredColour: { toString: () => "x" } })).toMatch(/what you would like|at most/);
    expect(checkConsultation({ ...good, currentColour: "x".repeat(100) }).ok).toBe(true);
  });

  it("the empty form is not a valid answer until the client has said what they want", () => {
    expect(checkConsultation(EMPTY_DRAFT).ok).toBe(false);
    // nothing is pre-selected: every choice has to be made, then it is valid
    const answered = {
      ...EMPTY_DRAFT,
      treatedBefore: "no",
      desiredColour: "Blonde",
      treatments: ["none"],
      dyeReaction: "no",
      patchTest: "no",
      callTime: "any",
    };
    expect(checkConsultation(answered).ok).toBe(true);
    expect(checkConsultation({ ...answered, callTime: "" }).ok).toBe(false);
  });
});

describe("needsConsultation", () => {
  it("is true when any chosen service asks for it", () => {
    expect(needsConsultation([{}, { requiresConsultation: false }])).toBe(false);
    expect(needsConsultation([{}, { requiresConsultation: true }])).toBe(true);
    expect(needsConsultation([])).toBe(false);
  });
});

describe("how the answers read back", () => {
  const c = (over: Record<string, unknown> = {}) => {
    const r = checkConsultation({ ...good, ...over });
    if (!r.ok) throw new Error(r.problem);
    return r.value;
  };

  it("lists every answer in words and flags the ones to look at", () => {
    const rows = consultationRows(c({ treatments: ["bleach"], dyeReaction: "unsure", patchTest: "no", healthNotes: "Pregnant" }));
    const get = (label: string) => rows.find((r) => r.label === label);
    expect(get("Last coloured")?.value).toBe("3 to 6 months ago");
    expect(get("Other treatments, past year")).toMatchObject({ value: "Bleach / lightener", alert: true });
    expect(get("Ever reacted to hair dye")).toMatchObject({ value: "Not sure", alert: true });
    expect(get("Patch test in last 6 months")).toMatchObject({ value: "No", alert: true });
    expect(get("Anything we should know")).toMatchObject({ value: "Pregnant", alert: true });
    expect(get("Best time to call")?.value).toBe("Afternoon");
    // a clear answer is not flagged
    const clear = consultationRows(c({ treatments: ["none"] }));
    expect(clear.filter((r) => r.alert)).toEqual([]);
  });

  it("summarises for a notification, mentioning only what matters", () => {
    expect(consultationSummary(c())).toBe("wants: Soft caramel balayage; last coloured 3 to 6 months ago");
    expect(consultationSummary(c({ treatedBefore: "no", dyeReaction: "yes", patchTest: "no", healthNotes: "Sensitive scalp" }))).toBe(
      "wants: Soft caramel balayage; never coloured; dye reaction: yes; patch test: no; notes: Sensitive scalp",
    );
  });

  it("suggests allergy text for the client record only when the answers point to one", () => {
    expect(allergyFromConsultation(c())).toBe("");
    expect(allergyFromConsultation(c({ dyeReaction: "yes" }))).toBe("Has reacted to hair dye before");
    expect(allergyFromConsultation(c({ dyeReaction: "unsure", healthNotes: "Sensitive scalp" }))).toBe(
      "Unsure about past hair dye reactions; Sensitive scalp",
    );
  });
});
