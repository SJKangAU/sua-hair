// tests/unit/hairEdit.test.ts
// The Manage "Hair options" edits are pure, never touch their input, keep ids stable, and
// always leave a config the booking function will accept.
import { describe, expect, it } from "vitest";
import { DEFAULT_HAIR_CONFIG, hairConfigProblem, MAX_OPTIONS_PER_QUESTION, type HairConfig } from "../../src/lib/hairProfile";
import {
  addOption, addQuestion, moveItem, moveOption, moveQuestion, removeOption, removeQuestion, renameSection,
  setVisual, updateOption, updateQuestion,
} from "../../src/lib/hairEdit";

const base = (): HairConfig => structuredClone(DEFAULT_HAIR_CONFIG);
const q = (c: HairConfig, section: 0 | 1, id: string) => c.sections[section].questions.find((x) => x.id === id)!;

describe("moveItem", () => {
  it("moves one place and stays inside the list", () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 9, 1)).toEqual([1, 2, 3]);
  });
});

describe("edits", () => {
  it("never change the config they were given", () => {
    const c = base();
    const before = JSON.stringify(c);
    addOption(c, "current", "length", "Very long");
    removeQuestion(c, "current", "length");
    renameSection(c, "desired", "What you want");
    updateOption(c, "current", "history", "never", { label: "Virgin hair" });
    expect(JSON.stringify(c)).toBe(before);
  });

  it("renames a section, a question and an option, keeping their ids", () => {
    let c = renameSection(base(), "desired", "What you want");
    c = updateQuestion(c, "current", "length", { label: "How long" });
    c = updateOption(c, "current", "length", "short", { label: "Above shoulder" });
    expect(c.sections[1].title).toBe("What you want");
    expect(q(c, 0, "length").label).toBe("How long");
    expect(q(c, 0, "length").options[0]).toMatchObject({ id: "short", label: "Above shoulder" });
    expect(hairConfigProblem(c)).toBeNull();
  });

  it("adds a question and an option with unique ids and a text visual", () => {
    let c = addQuestion(base(), "desired", "Fringe");
    c = addQuestion(c, "desired", "Fringe");
    const ids = c.sections[1].questions.map((x) => x.id);
    expect(ids.slice(-2)).toEqual(["fringe", "fringe-2"]);
    c = addOption(c, "desired", "fringe", "Curtain");
    c = addOption(c, "desired", "fringe", "Curtain");
    expect(q(c, 1, "fringe").options.map((o) => o.id)).toEqual(["curtain", "curtain-2"]);
    expect(q(c, 1, "fringe").options[0].visual).toEqual({ kind: "text", text: "Curtain" });
    expect(hairConfigProblem(c)).toBeNull();
  });

  it("ignores a blank name and stops at the limits", () => {
    const c = base();
    expect(addQuestion(c, "current", "   ")).toBe(c);
    expect(addOption(c, "current", "length", "")).toBe(c);
    let full = c;
    for (let i = 0; i < MAX_OPTIONS_PER_QUESTION + 3; i++) full = addOption(full, "current", "length", `Size ${i}`);
    expect(q(full, 0, "length").options).toHaveLength(MAX_OPTIONS_PER_QUESTION);
  });

  it("hides, shows, flags and unflags an option, storing only what is not the default", () => {
    let c = updateOption(base(), "current", "length", "short", { hidden: true, callFlag: true });
    expect(q(c, 0, "length").options[0]).toMatchObject({ hidden: true, callFlag: true });
    c = updateOption(c, "current", "length", "short", { hidden: false, callFlag: false });
    expect(q(c, 0, "length").options[0]).not.toHaveProperty("hidden");
    expect(q(c, 0, "length").options[0]).not.toHaveProperty("callFlag");
  });

  it("changes the picture of an option, to a swatch, an uploaded image or text", () => {
    let c = setVisual(base(), "current", "length", "short", { kind: "swatch", color: "#112233" });
    c = setVisual(c, "current", "length", "long", { kind: "image", url: "https://firebasestorage.googleapis.com/x.webp" });
    expect(q(c, 0, "length").options[0].visual).toEqual({ kind: "swatch", color: "#112233" });
    expect(hairConfigProblem(c)).toBeNull();
  });

  it("reorders questions and options and deletes them", () => {
    let c = moveQuestion(base(), "current", "length", -1);
    expect(c.sections[0].questions.map((x) => x.id).slice(0, 3)).toEqual(["history", "length", "colour-now"]);
    c = moveOption(c, "current", "length", "long", -1);
    expect(q(c, 0, "length").options.map((o) => o.id)).toEqual(["short", "long", "shoulder"]);
    c = removeOption(c, "current", "length", "long");
    c = removeQuestion(c, "current", "thickness");
    expect(q(c, 0, "length").options.map((o) => o.id)).toEqual(["short", "shoulder"]);
    expect(c.sections[0].questions.some((x) => x.id === "thickness")).toBe(false);
    expect(hairConfigProblem(c)).toBeNull();
  });
});
