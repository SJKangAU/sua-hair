// tests/unit/hairProfile.test.ts
// The "Your hair" answers: validated against the CURRENT owner-edited options, stored as a
// label snapshot, with the call flag worked out. Unknown or hidden options are refused.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAIR_CONFIG, checkHairAnswers, hairConfigProblem, hairSummary, slugId, visibleQuestions,
  type HairConfig,
} from "../../src/lib/hairProfile";

const clone = (): HairConfig => structuredClone(DEFAULT_HAIR_CONFIG);
const ok = { current: { picks: { history: ["never"] } }, desired: { picks: { "colour-want": ["blonde"] } } };

describe("the seed", () => {
  it("is itself a valid config", () => expect(hairConfigProblem(DEFAULT_HAIR_CONFIG)).toBeNull());
  it("flags coloured, highlights and bleached for a call, and never-coloured does not", () => {
    const history = DEFAULT_HAIR_CONFIG.sections[0].questions[0].options;
    const flagged = history.filter((o) => o.callFlag).map((o) => o.id);
    expect(flagged).toEqual(["coloured", "highlights", "bleached"]);
  });
});

describe("checkHairAnswers", () => {
  it("accepts a clean set and snapshots the labels", () => {
    const r = checkHairAnswers(ok, DEFAULT_HAIR_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.callFlagged).toBe(false);
    expect(r.value.sections[0].items[0]).toMatchObject({ question: "Hair history", answers: [{ label: "Never coloured or treated" }] });
    expect(hairSummary(r.value)).toContain("Desired hair - Colour family: Blonde");
  });

  it("raises the call flag when a flagged option is chosen", () => {
    const r = checkHairAnswers({ ...ok, current: { picks: { history: ["never", "bleached"] } } }, DEFAULT_HAIR_CONFIG);
    expect(r.ok && r.value.callFlagged).toBe(true);
  });

  it("requires a required question", () => {
    expect(checkHairAnswers({ current: { picks: {} } }, DEFAULT_HAIR_CONFIG)).toMatchObject({ ok: false });
  });

  it("refuses two answers to a single-choice question", () => {
    const r = checkHairAnswers({ ...ok, current: { picks: { history: ["never"], length: ["short", "long"] } } }, DEFAULT_HAIR_CONFIG);
    expect(r).toMatchObject({ ok: false });
  });

  it("refuses an unknown option and a hidden one", () => {
    expect(checkHairAnswers({ ...ok, current: { picks: { history: ["nope"] } } }, DEFAULT_HAIR_CONFIG)).toMatchObject({ ok: false });
    const c = clone();
    c.sections[0].questions[0].options[1].hidden = true; // coloured
    expect(checkHairAnswers({ ...ok, current: { picks: { history: ["coloured"] } } }, c)).toMatchObject({ ok: false });
  });

  it("drops an answer for a question that no longer exists instead of failing", () => {
    const r = checkHairAnswers({ ...ok, current: { picks: { history: ["never"], deleted: ["x"] } } }, DEFAULT_HAIR_CONFIG);
    expect(r.ok).toBe(true);
  });

  it("does not require a hidden required question", () => {
    const c = clone();
    c.sections[0].questions[0].hidden = true;
    expect(checkHairAnswers({ current: { picks: {} } }, c).ok).toBe(true);
  });

  it("tidies notes and refuses long ones, wrong types and junk shapes", () => {
    const r = checkHairAnswers({ ...ok, desired: { picks: {}, notes: "  a \n\n b\u0007 " } }, DEFAULT_HAIR_CONFIG);
    expect(r.ok && r.value.sections[1].notes).toBe("a b");
    expect(checkHairAnswers({ ...ok, desired: { notes: "x".repeat(301) } }, DEFAULT_HAIR_CONFIG)).toMatchObject({ ok: false });
    for (const junk of [undefined, null, "x", [], 5]) expect(checkHairAnswers(junk, DEFAULT_HAIR_CONFIG)).toMatchObject({ ok: false });
    expect(checkHairAnswers({ current: { picks: { history: "never" } } }, DEFAULT_HAIR_CONFIG)).toMatchObject({ ok: false });
  });

  it("keeps the old label in a stored snapshot even after the option is renamed", () => {
    const r = checkHairAnswers(ok, DEFAULT_HAIR_CONFIG);
    const c = clone();
    c.sections[0].questions[0].options[0].label = "Virgin hair";
    expect(r.ok && r.value.sections[0].items[0].answers[0].label).toBe("Never coloured or treated");
    expect(c.sections[0].questions[0].options[0].label).toBe("Virgin hair");
  });
});

describe("visibleQuestions", () => {
  it("leaves out hidden questions, hidden options and questions with no visible option", () => {
    const c = clone();
    const s = c.sections[0];
    s.questions[2].hidden = true; // length
    s.questions[3].options.forEach((o) => (o.hidden = true)); // thickness
    s.questions[4].options[0].hidden = true; // healthy
    const ids = visibleQuestions(s).map((q) => q.id);
    expect(ids).not.toContain("length");
    expect(ids).not.toContain("thickness");
    expect(visibleQuestions(s).find((q) => q.id === "condition")!.options.map((o) => o.id)).toEqual(["dry", "damaged"]);
  });
});

describe("hairConfigProblem (the owner's edits)", () => {
  it("accepts every kind of visual", () => {
    const c = clone();
    const o = c.sections[0].questions[2].options;
    o[0].visual = { kind: "swatch", color: "#aabbcc" };
    o[1].visual = { kind: "image", url: "https://firebasestorage.googleapis.com/v0/b/x/o/y.png" };
    o[2].visual = { kind: "text", text: "Short" };
    expect(hairConfigProblem(c)).toBeNull();
  });

  it("rejects bad colours, non-https images, unknown icons and long text", () => {
    const bad = (v: unknown) => {
      const c = clone();
      (c.sections[0].questions[2].options[0] as { visual: unknown }).visual = v;
      return hairConfigProblem(c);
    };
    expect(bad({ kind: "swatch", color: "red" })).not.toBeNull();
    expect(bad({ kind: "image", url: "http://x.test/a.png" })).not.toBeNull();
    expect(bad({ kind: "image", url: "javascript:alert(1)" })).not.toBeNull();
    expect(bad({ kind: "icon", icon: "rocket" })).not.toBeNull();
    expect(bad({ kind: "text", text: "x".repeat(21) })).not.toBeNull();
    expect(bad(null)).not.toBeNull();
  });

  it("rejects duplicate ids, empty names, bad ids and the wrong shape", () => {
    const dupe = clone();
    dupe.sections[0].questions[2].options[1].id = dupe.sections[0].questions[2].options[0].id;
    expect(hairConfigProblem(dupe)).not.toBeNull();
    const noName = clone();
    noName.sections[0].questions[0].label = "  ";
    expect(hairConfigProblem(noName)).not.toBeNull();
    const badId = clone();
    badId.sections[0].questions[0].id = "Has Spaces";
    expect(hairConfigProblem(badId)).not.toBeNull();
    expect(hairConfigProblem({ sections: [] })).not.toBeNull();
    expect(hairConfigProblem(null)).not.toBeNull();
  });
});

describe("slugId", () => {
  it("makes a safe id and avoids ones already taken", () => {
    expect(slugId("Rose Gold!", [])).toBe("rose-gold");
    expect(slugId("Rose Gold", ["rose-gold"])).toBe("rose-gold-2");
    expect(slugId("???", [])).toBe("option");
  });
});
