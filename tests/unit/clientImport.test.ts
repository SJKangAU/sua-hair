// tests/unit/clientImport.test.ts
// The Fresha client-list import's rules, on a synthetic fixture (fake people
// only, tests/fixtures/make-clients-fixture.py): phone and name normalisation,
// invalid rows, duplicate numbers, what is left out, batching and the error
// report. Pure functions; `npm run test:unit`. No real data is read.
import { describe, expect, it } from "vitest";
import {
  IMPORT_CHUNK,
  addedAsIso,
  buildPlan,
  chunkEntries,
  cleanClientName,
  dryRun,
  errorReportCsv,
  missingHeaders,
  newBatchId,
  normaliseMobile,
  type RawRow,
} from "../../src/lib/clientImport";

const row = (over: RawRow): RawRow => ({ Blocked: "No", ...over });

describe("normaliseMobile", () => {
  it("turns Fresha's international form into the local number", () => {
    expect(normaliseMobile("61 400 000 001")).toBe("0400000001");
    expect(normaliseMobile("61400000001")).toBe("0400000001");
    expect(normaliseMobile("+61 400 000 001")).toBe("0400000001");
  });

  it("keeps a local number and strips its spaces and dashes", () => {
    expect(normaliseMobile("0400 000 003")).toBe("0400000003");
    expect(normaliseMobile("0400-000-003")).toBe("0400000003");
  });

  it("never guesses: invalid, missing, landline, overseas and short numbers are null", () => {
    for (const bad of ["", "   ", "61 3 9000 0000", "44 7700 900123", "0400 000 00", "04000000012", "61 500 000 001", "4 0000 0000", "abc"]) {
      expect(normaliseMobile(bad), bad).toBeNull();
    }
  });
});

describe("cleanClientName", () => {
  it("trims and collapses spaces, keeps any script", () => {
    expect(cleanClientName({ "Full Name": "  Test   Client  1 " })).toBe("Test Client 1");
    expect(cleanClientName({ "Full Name": "Tést Ünïcode" })).toBe("Tést Ünïcode");
    expect(cleanClientName({ "Full Name": "테스트 고객" })).toBe("테스트 고객");
  });

  it("falls back to first + last, removes control characters and limits the length", () => {
    expect(cleanClientName({ "Full Name": "", "First Name": "Test", "Last Name": "Split" })).toBe("Test Split");
    expect(cleanClientName({ "Full Name": "Test\u0000\nClient" })).toBe("Test Client");
    expect(cleanClientName({ "Full Name": "x".repeat(300) })).toHaveLength(100);
    expect(cleanClientName({ "Full Name": "" })).toBe("");
  });
});

describe("addedAsIso", () => {
  it("reads an ISO date and an Excel date serial", () => {
    expect(addedAsIso("2026-01-10")).toBe("2026-01-10");
    expect(addedAsIso("2026-01-10T03:00:00Z")).toBe("2026-01-10");
    expect(addedAsIso("43664")).toBe("2019-07-18");
    expect(addedAsIso("46315")).toBe("2026-10-20");
    expect(addedAsIso("")).toBe("");
    expect(addedAsIso("garbage")).toBe("");
  });
});

describe("buildPlan", () => {
  const rows: RawRow[] = [
    row({ "Full Name": "Test Client 1", "Mobile Number": "61 400 000 001", Added: "2026-01-10" }),
    row({ "Full Name": "Shared Older", "Mobile Number": "61 400 000 005", Added: "2026-02-01" }),
    row({ "Full Name": "Shared Newer", "Mobile Number": "0400 000 005", Added: "2026-03-01" }),
    row({ "Full Name": "No Phone", "Mobile Number": "" }),
    row({ "Full Name": "Overseas", "Mobile Number": "44 7700 900123" }),
    row({ "Full Name": "", "Mobile Number": "61 400 000 007" }),
    row({ "Full Name": "Test Client 2", "Mobile Number": "61 400 000 002", Email: "a@example.test", "Staff alert": "x", Gender: "Female", Blocked: "Yes", Telephone: "+61 3 9000 0001", "Date of Birth": "2000-01-01" }),
  ];

  it("keeps one record per number: the most recently added name", () => {
    const plan = buildPlan(rows);
    expect(plan.entries.map((e) => [e.phone, e.name])).toEqual([
      ["0400000001", "Test Client 1"],
      ["0400000005", "Shared Newer"],
      ["0400000002", "Test Client 2"],
    ]);
    expect(plan.summary).toEqual({ rows: 7, importable: 3, skipped: 3, collapsed: 1 });
  });

  it("the older row can come later in the file and still loses", () => {
    const plan = buildPlan([
      row({ "Full Name": "Newer", "Mobile Number": "61 400 000 005", Added: "2026-03-01" }),
      row({ "Full Name": "Older", "Mobile Number": "61 400 000 005", Added: "2026-02-01" }),
    ]);
    expect(plan.entries.map((e) => e.name)).toEqual(["Newer"]);
  });

  it("an added date given as an Excel serial compares correctly", () => {
    const plan = buildPlan([
      row({ "Full Name": "Newer", "Mobile Number": "61 400 000 005", Added: "46315" }),
      row({ "Full Name": "Older", "Mobile Number": "61 400 000 005", Added: "43664" }),
    ]);
    expect(plan.entries[0].name).toBe("Newer");
  });

  it("reports skipped rows by spreadsheet row number (header is row 1) and reason only", () => {
    const plan = buildPlan(rows);
    expect(plan.problems).toEqual([
      { row: 5, reason: "No mobile number" },
      { row: 6, reason: "Not an Australian mobile number" },
      { row: 7, reason: "No name" },
    ]);
    const report = errorReportCsv(plan.problems);
    expect(report).toBe("row,reason\r\n5,No mobile number\r\n6,Not an Australian mobile number\r\n7,No name\r\n");
    expect(report).not.toMatch(/Overseas|44 7700|Test Client/); // no names or numbers
  });

  it("counts what it leaves out, by column", () => {
    const plan = buildPlan(rows);
    expect(plan.notImported).toEqual({
      emails: 1,
      "landline / other numbers": 1,
      genders: 1,
      "birth dates": 1,
      "staff alerts": 1,
      "blocked clients": 1,
    });
    // and none of it is in what would be written
    expect(JSON.stringify(plan.entries)).not.toMatch(/example\.test|Female|9000/);
  });

  it("an empty file or one with no valid rows plans nothing", () => {
    expect(buildPlan([]).entries).toEqual([]);
    expect(buildPlan([row({ "Full Name": "X", "Mobile Number": "" })]).summary.importable).toBe(0);
  });
});

describe("dryRun", () => {
  it("separates new clients from ones that already have a record, which are never touched", () => {
    const plan = buildPlan([
      row({ "Full Name": "Test Client 1", "Mobile Number": "61 400 000 001" }),
      row({ "Full Name": "Existing Client", "Mobile Number": "61 400 000 009" }),
      row({ "Full Name": "Bad", "Mobile Number": "" }),
    ]);
    const result = dryRun(plan, new Set(["0400000009"]));
    expect(result.toCreate.map((e) => e.phone)).toEqual(["0400000001"]);
    expect(result.alreadyExist).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.rows).toBe(3);
  });

  it("importing the same file again creates nothing: everything now exists", () => {
    const plan = buildPlan([
      row({ "Full Name": "A", "Mobile Number": "61 400 000 001" }),
      row({ "Full Name": "B", "Mobile Number": "61 400 000 002" }),
    ]);
    const second = dryRun(plan, new Set(plan.entries.map((e) => e.phone)));
    expect(second.toCreate).toEqual([]);
    expect(second.alreadyExist).toBe(2);
  });
});

describe("batching", () => {
  it("splits into chunks under the 500-write limit (400 lookups + 1 ledger entry)", () => {
    expect(IMPORT_CHUNK + 1).toBeLessThanOrEqual(500);
    const items = Array.from({ length: 1250 }, (_, i) => i);
    const chunks = chunkEntries(items);
    expect(chunks.map((c) => c.length)).toEqual([400, 400, 400, 50]);
    expect(chunks.flat()).toEqual(items);
    expect(chunkEntries([])).toEqual([]);
  });

  it("handles a file far larger than one batch without losing or repeating a row", () => {
    const rows = Array.from({ length: 12_286 }, (_, i) =>
      row({ "Full Name": `Test Client ${i}`, "Mobile Number": `61 4${String(i).padStart(2, "0")} ${String(i).padStart(3, "0")} ${String(i % 1000).padStart(3, "0")}` }),
    );
    // a synthetic number per row: 0400000000 + i
    rows.forEach((r, i) => (r["Mobile Number"] = `04${String(i).padStart(8, "0")}`));
    const plan = buildPlan(rows);
    expect(plan.entries).toHaveLength(12_286);
    const chunks = chunkEntries(plan.entries);
    expect(chunks).toHaveLength(31);
    expect(new Set(chunks.flat().map((e) => e.phone)).size).toBe(12_286);
  });
});

describe("file checks", () => {
  it("names the required headers that are missing", () => {
    expect(missingHeaders(["Full Name", "Mobile Number", "Email"])).toEqual([]);
    expect(missingHeaders(["Name", "Phone"])).toEqual(["Full Name", "Mobile Number"]);
  });

  it("batch ids are readable and time-ordered", () => {
    const id = newBatchId(new Date("2026-10-20T13:41:00Z"), 0.5);
    expect(id).toMatch(/^import-20261020-1341-[0-9a-z]{4}$/);
    expect(newBatchId(new Date("2026-10-21T00:00:00Z"), 0.1) > newBatchId(new Date("2026-10-20T23:59:00Z"), 0.9)).toBe(true);
  });
});
