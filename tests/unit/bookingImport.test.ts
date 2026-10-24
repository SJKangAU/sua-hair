// tests/unit/bookingImport.test.ts
// The Fresha appointments import's rules, on synthetic rows (fake people only): time,
// date, status and reference handling, invalid rows, staff matching, overlaps and the
// booking built from a row. Pure functions; `npm run test:unit`. No real data is read.
import { describe, expect, it } from "vitest";
import {
  FLAG_ADDED_AFTER,
  FLAG_SHARED,
  buildDirectory,
  buildPlan,
  dryRun,
  errorReportCsv,
  missingHeaders,
  normaliseDate,
  normaliseTime,
  refOf,
  reviewClients,
  statusOf,
  suggestStylist,
  withConfirmedPhones,
  type RawRow,
  type StylistRef,
} from "../../src/lib/bookingImport";
import { bookingFor } from "../../src/lib/bookingImportWrites";

const row = (over: RawRow = {}): RawRow => ({
  "Ref #": "#AAAA0001",
  Client: "Test Person",
  Service: "Cut",
  "Scheduled Date": "2027-01-30",
  Time: "4:30 pm",
  Duration: "30",
  Staff: "Sam",
  Price: "40.00",
  Status: "Booked",
  ...over,
});

const sam: StylistRef = { id: "st-1", name: "Sam", level: "director" };
const map = new Map<string, StylistRef | undefined>([["Sam", sam]]);

describe("field rules", () => {
  it("normalises times, dates, statuses and references", () => {
    expect(normaliseTime("4:30 pm")).toBe("4:30 PM");
    expect(normaliseTime("12:00 am")).toBe("12:00 AM");
    expect(normaliseTime("13:00")).toBeNull();
    expect(normaliseDate("2027-02-30")).toBeNull();
    expect(normaliseDate("2027-01-30")).toBe("2027-01-30");
    expect(statusOf("Booked")).toBe("confirmed");
    expect(statusOf("Canceled")).toBe("cancelled");
    expect(statusOf("Completed")).toBeNull();
    expect(refOf("#9aa83371")).toBe("FR-9AA83371");
    expect(refOf("  ")).toBeNull();
  });

  it("reports missing headers", () => {
    expect(missingHeaders(["Ref #", "Client"])).toContain("Staff");
    expect(missingHeaders(Object.keys(row()))).toEqual([]);
  });
});

describe("buildPlan", () => {
  it("keeps good rows and says why it skipped the others, by spreadsheet row", () => {
    const plan = buildPlan([
      row(),
      row({ "Ref #": "#AAAA0002", Client: "  " }),
      row({ "Ref #": "#AAAA0003", Time: "late" }),
      row({ "Ref #": "#AAAA0004", Duration: "20" }),
      row({ "Ref #": "#AAAA0005", Status: "No show" }),
      row({ "Ref #": "#AAAA0001" }),
      row({ "Ref #": "#AAAA0006", Status: "Canceled" }),
    ]);
    expect(plan.entries.map((e) => e.ref)).toEqual(["FR-AAAA0001", "FR-AAAA0006"]);
    expect(plan.problems.map((p) => p.row)).toEqual([3, 4, 5, 6, 7]);
    expect(plan.summary).toMatchObject({ rows: 7, importable: 2, skipped: 5, cancelled: 1 });
    expect(plan.staffNames).toEqual(["Sam"]);
    expect(errorReportCsv(plan.problems).split("\r\n")[0]).toBe("row,reason");
  });
});

describe("suggestStylist", () => {
  const list = [{ id: "a", name: "Steve Kim" }, { id: "b", name: "Jin-E" }];
  it("matches by name ignoring case and punctuation, else leaves out", () => {
    expect(suggestStylist("STEVE", list)).toBe("a");
    expect(suggestStylist("JIN-E Heo", list)).toBe("b");
    expect(suggestStylist("스티브", list)).toBe("");
  });
});

describe("dryRun", () => {
  it("counts new, already imported, unmapped staff and overlaps", () => {
    const plan = buildPlan([
      row(),
      row({ "Ref #": "#AAAA0002", Time: "4:45 pm" }), // overlaps the first
      row({ "Ref #": "#AAAA0003", Time: "5:00 pm" }),
      row({ "Ref #": "#AAAA0004", Staff: "Other" }),
      row({ "Ref #": "#AAAA0005", Time: "9:00 am" }),
      row({ "Ref #": "#AAAA0006", Time: "4:30 pm", Status: "Canceled" }), // holds no slot
    ]);
    const r = dryRun(plan, map, new Set(["FR-AAAA0005"]));
    expect(r.toCreate.map((e) => e.ref)).toEqual(["FR-AAAA0001", "FR-AAAA0003", "FR-AAAA0006"]);
    expect(r).toMatchObject({ alreadyImported: 1, unmappedStaff: 1, cancelled: 1 });
    expect(r.clashes).toEqual([{ row: 3, reason: expect.any(String) }]);
  });
});

describe("bookingFor", () => {
  it("builds a walk-in type booking with one hands-on service and the Fresha ref", () => {
    const [e] = dryRun(buildPlan([row({ Duration: "45" })]), map, new Set()).toCreate;
    const b = bookingFor(e, "2026-10-24T00:00:00.000Z");
    expect(b).toMatchObject({
      bookingType: "walkin",
      status: "confirmed",
      customerPhone: "",
      stylistId: "st-1",
      bookingRef: "FR-AAAA0001",
      date: "2027-01-30",
      time: "4:30 PM",
      activeTime: 45,
      restTime: 0,
      totalTime: 45,
      servicePrice: 40,
    });
    expect(b.phases).toEqual([{ type: "active", minutes: 45 }]);
  });

  it("marks a cancelled one so Restore brings it back confirmed", () => {
    const [e] = dryRun(buildPlan([row({ Status: "Canceled" })]), map, new Set()).toCreate;
    expect(bookingFor(e, "x")).toMatchObject({
      status: "cancelled",
      cancelReason: "cancelled",
      restoreStatus: "confirmed",
    });
  });
});

describe("finding mobile numbers by name", () => {
  const clients: RawRow[] = [
    { "Full Name": "Test Person", "Mobile Number": "61 400 000 001", Added: "2026-01-01" },
    { "Full Name": "Late Joiner", "Mobile Number": "61 400 000 002", Added: "2026-12-01" },
    { "Full Name": "Twin Name", "Mobile Number": "61 400 000 003", Added: "2026-01-01" },
    { "Full Name": "Twin Name", "Mobile Number": "61 400 000 004", Added: "2026-01-01" },
    { "Full Name": "Shared A", "Mobile Number": "61 400 000 005", Added: "2026-01-01" },
    { "Full Name": "Shared B", "Mobile Number": "61 400 000 005", Added: "2026-01-01" },
    { "Full Name": "No Mobile", "Mobile Number": "" },
  ];
  const dir = buildDirectory(clients);
  const toCreate = dryRun(
    buildPlan([
      row({ "Ref #": "#B1", Client: "test person", "Created Date": "2026-06-01" }),
      row({ "Ref #": "#B2", Client: "Test  Person", Time: "10:00 am", "Created Date": "2026-06-02" }),
      row({ "Ref #": "#B3", Client: "Late Joiner", Time: "11:00 am", "Created Date": "2026-06-01" }),
      row({ "Ref #": "#B4", Client: "Twin Name", Time: "12:00 pm" }),
      row({ "Ref #": "#B5", Client: "Shared A", Time: "1:00 pm" }),
      row({ "Ref #": "#B6", Client: "Nobody Here", Time: "2:00 pm" }),
      row({ "Ref #": "#B7", Client: "No Mobile", Time: "3:00 pm" }),
    ]),
    map,
    new Set(),
  ).toCreate;

  it("matches a name ignoring case and spacing, one match per client", () => {
    const reviews = reviewClients(toCreate, dir);
    const person = reviews.find((r) => r.key === "test person")!;
    expect(person.bookings).toBe(2);
    expect(person.match).toEqual({ kind: "unique", phone: "0400000001", flags: [] });
  });

  it("warns when the client was added to Fresha after the booking was made", () => {
    const late = reviewClients(toCreate, dir).find((r) => r.key === "late joiner")!;
    expect(late.match).toEqual({ kind: "unique", phone: "0400000002", flags: [FLAG_ADDED_AFTER] });
  });

  it("warns when the number is also on a client with another name", () => {
    const shared = reviewClients(toCreate, dir).find((r) => r.key === "shared a")!;
    expect(shared.match).toMatchObject({ kind: "unique", flags: [FLAG_SHARED] });
  });

  it("never guesses between several numbers, and finds nothing for an unknown or number-less client", () => {
    const reviews = reviewClients(toCreate, dir);
    expect(reviews.find((r) => r.key === "twin name")!.match).toEqual({ kind: "ambiguous", count: 2 });
    expect(reviews.find((r) => r.key === "nobody here")!.match).toEqual({ kind: "none" });
    expect(reviews.find((r) => r.key === "no mobile")!.match).toEqual({ kind: "none" });
  });

  it("lists clean matches first, then warned ones, then the rest", () => {
    const order = reviewClients(toCreate, dir).map((r) => r.match.kind === "unique" ? r.match.flags.length : r.match.kind);
    expect(order).toEqual([0, 1, 1, "ambiguous", "none", "none"]);
  });

  it("gives a booking a number only for clients the owner confirmed", () => {
    const out = withConfirmedPhones(toCreate, new Map([["test person", "0400000001"]]));
    expect(out.filter((b) => b.phone).map((b) => b.ref)).toEqual(["FR-B1", "FR-B2"]);
    const built = bookingFor(out[0], "x");
    expect(built).toMatchObject({ customerPhone: "0400000001", clientId: "0400000001", importedFrom: "fresha-appointments" });
    expect(bookingFor(out[2], "x")).toMatchObject({ customerPhone: "", importedFrom: "fresha-appointments" });
    expect(bookingFor(out[2], "x")).not.toHaveProperty("clientId");
  });
});
