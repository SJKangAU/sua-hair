// tests/unit/clientImportFile.test.ts
// Reading the synthetic client-list fixtures (fake people only) as .csv and as
// .xlsx, and checking the two give the same plan: same headers, same rows, the
// xlsx's Excel date serials comparing like the csv's ISO dates. Also the file
// size and type limits. `npm run test:unit`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ImportFileError, parseClientFile } from "../../src/lib/clientImportFile";
import { MAX_FILE_BYTES, buildPlan, missingHeaders } from "../../src/lib/clientImport";

const fixture = (name: string, type: string) =>
  new File([readFileSync(`tests/fixtures/${name}`)], name, { type });

describe("reading the synthetic fixtures", () => {
  it("reads the csv: 23 headers, 14 client rows, the blank last line skipped", async () => {
    const parsed = await parseClientFile(fixture("clients-synthetic.csv", "text/csv"));
    expect(parsed.headers).toHaveLength(23);
    expect(missingHeaders(parsed.headers)).toEqual([]);
    expect(parsed.rows).toHaveLength(14);
    expect(parsed.rows[0]["Full Name"]).toBe("Test Client 1");
  });

  it("reads the xlsx the same way", async () => {
    const parsed = await parseClientFile(fixture("clients-synthetic.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    expect(parsed.headers).toHaveLength(23);
    expect(parsed.rows).toHaveLength(14);
    expect(parsed.rows[0]["Full Name"]).toBe("Test Client 1");
  });

  it("csv and xlsx give the same plan", async () => {
    const csv = buildPlan((await parseClientFile(fixture("clients-synthetic.csv", "text/csv"))).rows);
    const xlsx = buildPlan((await parseClientFile(fixture("clients-synthetic.xlsx", "application/octet-stream"))).rows);
    expect(xlsx.entries).toEqual(csv.entries);
    expect(xlsx.problems).toEqual(csv.problems);
    expect(xlsx.summary).toEqual(csv.summary);
    expect(xlsx.notImported).toEqual(csv.notImported);
  });

  it("the synthetic plan: 9 clients, 4 skipped rows, 1 merged, the newer of two sharing a number wins", async () => {
    const plan = buildPlan((await parseClientFile(fixture("clients-synthetic.csv", "text/csv"))).rows);
    expect(plan.summary).toEqual({ rows: 14, importable: 9, skipped: 4, collapsed: 1, blocked: 1, blockedUnusable: 0 });
    expect(plan.problems.map((p) => p.row)).toEqual([9, 10, 11, 13]);
    expect(plan.entries.find((e) => e.phone === "0400000005")?.name).toBe("Shared Newer");
    expect(plan.entries.find((e) => e.phone === "0400000008")?.name).toBe("Test Ünïcöde Client");
    expect(plan.entries.find((e) => e.phone === "0400000006")?.name).toBe("Test Split");
    expect(plan.notImported).toMatchObject({ emails: 1, "staff alerts": 1 });
    expect(plan.entries.find((e) => e.phone === "0400000004")?.blocked).toBe(true); // the Blocked: Yes client
  });
});

describe("file limits", () => {
  it("refuses a file that is too big or the wrong type, before reading it", async () => {
    const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "clients.csv");
    await expect(parseClientFile(big)).rejects.toBeInstanceOf(ImportFileError);
    await expect(parseClientFile(new File(["x"], "clients.pdf"))).rejects.toBeInstanceOf(ImportFileError);
  });

  it("a file without the right headers is read but flagged by missingHeaders", async () => {
    const parsed = await parseClientFile(new File(["Name,Phone\nA,0400000001\n"], "other.csv"));
    expect(missingHeaders(parsed.headers)).toEqual(["Full Name", "Mobile Number"]);
  });
});
