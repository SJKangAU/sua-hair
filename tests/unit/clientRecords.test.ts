// tests/unit/clientRecords.test.ts
// Colour formulas and patch tests (FR-031, DEC-057): what makes an entry valid, how long a clear
// patch test covers a client, a reaction outranking an old clear test until a newer clear one,
// and the formula to repeat. Pure.
import { describe, expect, it } from "vitest";
import {
  addMonthsToDate,
  cleanRecord,
  latestFormula,
  MAX_FORMULA_LENGTH,
  patchStatus,
  recordProblem,
  sortRecords,
  type ClientRecord,
} from "../../src/lib/clientRecords";

const rec = (over: Partial<ClientRecord>): ClientRecord => ({
  id: "r",
  kind: "formula",
  date: "2026-05-01",
  text: "6.1 + 20vol 1:1.5",
  product: "",
  result: "",
  authorUid: "u",
  authorName: "Steve",
  createdAt: "2026-05-01T01:00:00.000Z",
  ...over,
});
const patch = (date: string, result: "clear" | "reaction", over: Partial<ClientRecord> = {}) =>
  rec({ kind: "patch", date, text: "", product: "Brand X permanent", result, ...over });

describe("recordProblem", () => {
  it("a formula needs a date and some text, within the limit", () => {
    expect(recordProblem({ kind: "formula", date: "2026-05-01", text: "6.1 + 20vol", product: "", result: "" })).toBeNull();
    expect(recordProblem({ kind: "formula", date: "", text: "x", product: "", result: "" })).toMatch(/date/);
    expect(recordProblem({ kind: "formula", date: "2026-05-01", text: "   ", product: "", result: "" })).toMatch(/formula/);
    expect(recordProblem({ kind: "formula", date: "2026-05-01", text: "x".repeat(MAX_FORMULA_LENGTH + 1), product: "", result: "" })).toMatch(/up to/);
  });

  it("a patch test needs the product and how the skin was; the note is optional", () => {
    expect(recordProblem({ kind: "patch", date: "2026-05-01", text: "", product: "Brand X", result: "clear" })).toBeNull();
    expect(recordProblem({ kind: "patch", date: "2026-05-01", text: "", product: " ", result: "clear" })).toMatch(/product/);
    expect(recordProblem({ kind: "patch", date: "2026-05-01", text: "", product: "Brand X", result: "" })).toMatch(/skin/);
  });
});

describe("cleanRecord", () => {
  it("trims, and leaves the fields that do not apply empty", () => {
    expect(cleanRecord({ kind: "formula", date: "2026-05-01", text: "  6.1  ", product: "ignored", result: "clear" })).toEqual({
      kind: "formula",
      date: "2026-05-01",
      text: "6.1",
      product: "",
      result: "",
    });
    expect(cleanRecord({ kind: "patch", date: "2026-05-01", text: " itchy ", product: " Brand X ", result: "reaction" })).toEqual({
      kind: "patch",
      date: "2026-05-01",
      text: "itchy",
      product: "Brand X",
      result: "reaction",
    });
  });
});

describe("addMonthsToDate", () => {
  it("adds whole months, clamping to the end of a shorter month and crossing years", () => {
    expect(addMonthsToDate("2026-03-15", 6)).toBe("2026-09-15");
    expect(addMonthsToDate("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonthsToDate("2027-08-31", 6)).toBe("2028-02-29");
    expect(addMonthsToDate("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsToDate("2026-12-01", 1)).toBe("2027-01-01");
  });
});

describe("patchStatus", () => {
  it("no test on record", () => {
    expect(patchStatus([], "2026-10-22")).toEqual({ state: "none" });
    expect(patchStatus([rec({})], "2026-10-22")).toEqual({ state: "none" }); // formulas are not tests
  });

  it("a clear test covers the client for six months, up to and including the last day", () => {
    const records = [patch("2026-05-01", "clear")];
    expect(patchStatus(records, "2026-10-22")).toEqual({ state: "clear", date: "2026-05-01", product: "Brand X permanent", validUntil: "2026-11-01" });
    expect(patchStatus(records, "2026-11-01").state).toBe("clear");
    expect(patchStatus(records, "2026-11-02").state).toBe("expired");
  });

  it("a reaction stays a reaction, even a long time after, until a newer clear test", () => {
    const records = [patch("2024-01-10", "reaction")];
    expect(patchStatus(records, "2026-10-22")).toEqual({ state: "reaction", date: "2024-01-10", product: "Brand X permanent" });
    expect(patchStatus([...records, patch("2026-09-01", "clear")], "2026-10-22").state).toBe("clear");
  });

  it("the newest test decides; a reaction after a clear test is a reaction", () => {
    expect(patchStatus([patch("2026-06-01", "clear"), patch("2026-08-01", "reaction")], "2026-10-22").state).toBe("reaction");
    // same day: the one recorded later wins
    const a = patch("2026-08-01", "clear", { createdAt: "2026-08-01T01:00:00.000Z" });
    const b = patch("2026-08-01", "reaction", { createdAt: "2026-08-01T02:00:00.000Z" });
    expect(patchStatus([a, b], "2026-10-22").state).toBe("reaction");
  });
});

describe("latestFormula and sortRecords", () => {
  it("the formula to repeat is the newest one", () => {
    const old = rec({ id: "old", date: "2026-01-01", text: "old" });
    const recent = rec({ id: "new", date: "2026-07-01", text: "new" });
    expect(latestFormula([old, patch("2026-09-01", "clear"), recent])?.id).toBe("new");
    expect(latestFormula([patch("2026-09-01", "clear")])).toBeNull();
  });

  it("lists newest first", () => {
    const ids = sortRecords([rec({ id: "a", date: "2026-01-01" }), rec({ id: "c", date: "2026-09-01" }), rec({ id: "b", date: "2026-05-01" })]).map((r) => r.id);
    expect(ids).toEqual(["c", "b", "a"]);
  });
});
