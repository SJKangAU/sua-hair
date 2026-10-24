// BookingImport.tsx
// Manage tab section (owner only): import a Fresha appointments export (.csv or .xlsx)
// as bookings.
//
//   1. Choose a file. It is read in this browser and never uploaded.
//   2. Match each Fresha staff name to a stylist (suggested by name; "Leave out" skips
//      that person's rows). Optionally add the Fresha client list: the export has no phone
//      numbers, so a client's mobile is looked up by NAME.
//   3. Dry run: counts of new bookings, ones already imported, overlaps and skipped
//      rows. Nothing is written until the owner confirms.
//      Each looked-up number is only a suggestion. The owner ticks the clients whose number
//      they are sure of, with reasons to doubt a match shown beside it; only ticked clients
//      get a number on their bookings.
//   4. Import: one booking at a time under the same stylist-day lock as a walk-in, so a
//      clash is skipped and counted, never double-booked. Safe to repeat.
//   5. Roll back: removes only bookings that are still exactly as imported.
// Names are never logged and never put in a toast.

import { useCallback, useEffect, useRef, useState } from "react";
import { db, auth } from "../../../lib/firebase";
import useStylists from "../../../hooks/useStylists";
import { MAX_FILE_BYTES, newBatchId } from "../../../lib/clientImport";
import { missingHeaders as clientHeadersMissing } from "../../../lib/clientImport";
import {
  buildDirectory,
  buildPlan,
  dryRun,
  errorReportCsv,
  missingHeaders,
  reviewClients,
  suggestStylist,
  withConfirmedPhones,
  type BookingPlan,
  type ClientReview,
  type Directory,
  type DryRun,
  type StylistRef,
} from "../../../lib/bookingImport";
import { formatMobile } from "../../../lib/phoneSearch";
import { ImportFileError, parseClientFile } from "../../../lib/clientImportFile";
import {
  SOURCE,
  findExistingRefs,
  rollbackBookingBatch,
  runImport,
} from "../../../lib/bookingImportWrites";
import { listBatches, type ImportBatch } from "../../../lib/clientImportWrites";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

type Stage =
  | { name: "idle" }
  | { name: "reading" }
  | { name: "match"; fileName: string }
  | { name: "checking"; done: number; total: number }
  | { name: "ready"; result: DryRun; reviews: ClientReview[] }
  | { name: "importing"; done: number; total: number }
  | { name: "done"; created: number; clashed: number; batchId: string };

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const button = (primary: boolean, disabled = false): React.CSSProperties => ({
  padding: "0.55rem 1.25rem",
  background: disabled ? "var(--border-strong)" : primary ? "var(--accent)" : "transparent",
  color: disabled ? "var(--grey-muted)" : primary ? "var(--surface)" : "var(--ink)",
  border: primary || disabled ? "none" : "1px solid var(--border-strong)",
  borderRadius: "6px",
  cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 500,
  fontSize: "0.875rem",
});

const downloadReport = (problems: DryRun["problems"]) => {
  const blob = new Blob([errorReportCsv(problems)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "booking-import-errors.csv";
  a.click();
  URL.revokeObjectURL(url);
};

const BookingImport = ({ onSuccess, onError }: Props) => {
  const { stylists } = useStylists(false);
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [staffChoice, setStaffChoice] = useState<Record<string, string>>({});
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [directoryName, setDirectoryName] = useState("");
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const directoryRef = useRef<Directory | null>(null);
  const planRef = useRef<BookingPlan | null>(null);
  const resultRef = useRef<DryRun | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshBatches = useCallback(() => {
    listBatches(db)
      .then((all) => setBatches(all.filter((b) => b.source === SOURCE)))
      .catch(() => onError("Couldn't load the previous imports."));
    // onError is a fresh closure on every render of the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    refreshBatches();
  }, [refreshBatches]);

  const reset = () => {
    planRef.current = null;
    resultRef.current = null;
    setStaffChoice({});
    directoryRef.current = null;
    setDirectoryName("");
    setConfirmed(new Set());
    if (fileInput.current) fileInput.current.value = "";
    setStage({ name: "idle" });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setStage({ name: "reading" });
    try {
      const parsed = await parseClientFile(file, "the appointments export");
      const missing = missingHeaders(parsed.headers);
      if (missing.length > 0) {
        onError(`That doesn't look like an appointments export: missing ${missing.join(", ")}.`);
        reset();
        return;
      }
      const plan = buildPlan(parsed.rows);
      planRef.current = plan;
      setStaffChoice(
        Object.fromEntries(plan.staffNames.map((n) => [n, suggestStylist(n, stylists)])),
      );
      setStage({ name: "match", fileName: file.name });
    } catch (err) {
      onError(
        err instanceof ImportFileError
          ? err.message
          : "Couldn't read that file. Check it is the appointments export.",
      );
      reset();
    }
  };

  // The optional Fresha client list, for looking up mobile numbers by name
  const handleClientList = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = await parseClientFile(file);
      const missing = clientHeadersMissing(parsed.headers);
      if (missing.length > 0) {
        onError(`That doesn't look like a client list: missing ${missing.join(" and ")}.`);
        return;
      }
      directoryRef.current = buildDirectory(parsed.rows);
      setDirectoryName(file.name);
    } catch (err) {
      onError(
        err instanceof ImportFileError
          ? err.message
          : "Couldn't read that file. Check it is the client list export.",
      );
    }
  };

  const handleCheck = async () => {
    const plan = planRef.current;
    if (!plan) return;
    const staffMap = new Map<string, StylistRef | undefined>();
    for (const name of plan.staffNames) {
      const s = stylists.find((x) => x.id === staffChoice[name]);
      staffMap.set(name, s && { id: s.id, name: s.name, level: s.level });
    }
    try {
      const refs = plan.entries.map((e) => e.ref);
      setStage({ name: "checking", done: 0, total: refs.length });
      const existing = await findExistingRefs(db, refs, (done, total) =>
        setStage({ name: "checking", done, total }),
      );
      const result = dryRun(plan, staffMap, existing);
      resultRef.current = result;
      setConfirmed(new Set());
      setStage({
        name: "ready",
        result,
        reviews: directoryRef.current ? reviewClients(result.toCreate, directoryRef.current) : [],
      });
    } catch {
      onError("Couldn't check the existing bookings. Try again.");
      reset();
    }
  };

  const handleImport = async () => {
    const result = resultRef.current;
    const uid = auth.currentUser?.uid;
    if (!result || !uid) return;
    const batchId = newBatchId();
    const phones = new Map<string, string>();
    for (const r of stage.name === "ready" ? stage.reviews : []) {
      if (confirmed.has(r.key) && r.match.kind === "unique") phones.set(r.key, r.match.phone);
    }
    const toWrite = withConfirmedPhones(result.toCreate, phones);
    setStage({ name: "importing", done: 0, total: toWrite.length });
    try {
      const done = await runImport(db, toWrite, {
        batchId,
        uid,
        onProgress: (d, total) => setStage({ name: "importing", done: d, total }),
      });
      setStage({ name: "done", created: done.created, clashed: done.clashed, batchId });
      onSuccess(`Imported ${done.created} bookings.`);
    } catch {
      onError("The import stopped part-way. Nothing already added is lost: you can roll it back below, or run it again.");
      reset();
    }
    refreshBatches();
  };

  const handleRollback = async (id: string) => {
    setConfirmRollback(null);
    setRollingBack(id);
    try {
      const done = await rollbackBookingBatch(db, id);
      onSuccess(
        `Rolled back: ${done.removed} removed${done.kept ? `, ${done.kept} kept because they have changed since` : ""}.`,
      );
    } catch {
      onError("The rollback didn't finish. Run it again to continue.");
    }
    setRollingBack(null);
    refreshBatches();
  };

  const busy = stage.name === "reading" || stage.name === "checking" || stage.name === "importing";
  const plan = planRef.current;
  const result = stage.name === "ready" ? stage.result : null;
  const reviews = stage.name === "ready" ? stage.reviews : [];
  const matched = reviews.filter((r) => r.match.kind === "unique");
  const withPhone = reviews
    .filter((r) => confirmed.has(r.key))
    .reduce((n, r) => n + r.bookings, 0);
  const toggle = (key: string) =>
    setConfirmed((c) => {
      const next = new Set(c);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div data-testid="booking-import">
      <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Import bookings</h3>
      <p style={{ fontSize: "0.8rem", color: "var(--grey-muted)", margin: "0.2rem 0 1rem" }}>
        Add the appointments from a Fresha export (.csv or .xlsx) as bookings. The file is
        read in this browser and not uploaded. The export has no phone numbers, so these
        bookings are not linked to a client and no message is sent for them.
      </p>

      <div style={card}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ ...button(true, busy), display: "inline-block" }} aria-disabled={busy}>
            Choose file
            <input
              ref={fileInput}
              data-testid="booking-import-file"
              type="file"
              accept=".csv,.xlsx"
              disabled={busy}
              onChange={(e) => void handleFile(e.target.files?.[0])}
              style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            />
          </label>
          <span style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>
            Up to {MAX_FILE_BYTES / 1024 / 1024} MB
          </span>
        </div>

        {stage.name === "reading" && <p role="status">Reading the file…</p>}

        {stage.name === "match" && plan && (
          <div data-testid="booking-import-match">
            <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
              Who is who? {plan.summary.importable.toLocaleString()} bookings in {stage.fileName}
            </p>
            <table style={{ borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <tbody>
                {plan.staffNames.map((name) => (
                  <tr key={name}>
                    <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>{name}</td>
                    <td>
                      <select
                        data-testid="booking-import-staff"
                        aria-label={`Stylist for ${name}`}
                        value={staffChoice[name] ?? ""}
                        onChange={(e) => setStaffChoice((c) => ({ ...c, [name]: e.target.value }))}
                      >
                        <option value="">Leave out</option>
                        {stylists.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
              <p style={{ margin: "0 0 0.25rem", fontWeight: 600 }}>Mobile numbers (optional)</p>
              <p style={{ margin: "0 0 0.5rem", color: "var(--ink-muted)", fontSize: "0.8rem" }}>
                The appointments export has no phone numbers. Add the Fresha client list to look
                them up by name; you confirm each one before it is used.
              </p>
              <input
                data-testid="booking-import-clientlist"
                type="file"
                accept=".csv,.xlsx"
                aria-label="Client list for mobile numbers"
                onChange={(e) => void handleClientList(e.target.files?.[0])}
              />
              {directoryName && <p style={{ margin: "0.25rem 0 0" }}>Using {directoryName}</p>}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <button type="button" style={button(true)} onClick={() => void handleCheck()}>
                Dry run
              </button>
              <button type="button" style={button(false)} onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {stage.name === "checking" && (
          <p role="status">
            Checking existing bookings… {stage.done.toLocaleString()} of {stage.total.toLocaleString()}
          </p>
        )}

        {result && (
          <div data-testid="booking-import-dryrun">
            <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
              Dry run - nothing has been written yet
            </p>
            <table style={{ borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <tbody>
                {[
                  ["Rows in the file", result.rows, "rows"],
                  ["New bookings to add", result.toCreate.length, "new"],
                  ["  of which cancelled", result.cancelled, "cancelled"],
                  ["Already imported (left as they are)", result.alreadyImported, "exist"],
                  ["Staff left out", result.unmappedStaff, "unmapped"],
                  ["Overlapping another row (not added)", result.clashes.length, "clashes"],
                  ["Skipped (invalid row)", result.skipped, "skipped"],
                ].map(([label, n, key]) => (
                  <tr key={String(key)}>
                    <td style={{ padding: "0.2rem 1.5rem 0.2rem 0", whiteSpace: "pre" }}>{label}</td>
                    <td data-testid={`dryrun-${key}`} style={{ fontWeight: 600, textAlign: "right" }}>
                      {Number(n).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {directoryName && (
              <div data-testid="booking-import-review" style={{ marginTop: "1rem" }}>
                <p style={{ margin: "0 0 0.25rem", fontWeight: 600 }}>Confirm mobile numbers</p>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                  Matched by name only, so a number is a guess until you tick it. Only ticked clients
                  get a number on their bookings (which also files them under that client, and means
                  they get the day-before reminder text). {matched.length.toLocaleString()} of{" "}
                  {reviews.length.toLocaleString()} clients have exactly one number;{" "}
                  {reviews.filter((r) => r.match.kind === "ambiguous").length.toLocaleString()} have several and{" "}
                  {reviews.filter((r) => r.match.kind === "none").length.toLocaleString()} have none, so those
                  are imported without a number.
                </p>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={button(false)}
                    onClick={() =>
                      setConfirmed(
                        new Set(
                          reviews
                            .filter((r) => r.match.kind === "unique" && r.match.flags.length === 0)
                            .map((r) => r.key),
                        ),
                      )
                    }
                  >
                    Tick all without a warning
                  </button>
                  <button type="button" style={button(false)} onClick={() => setConfirmed(new Set())}>
                    Untick all
                  </button>
                </div>
                <div style={{ maxHeight: "22rem", overflow: "auto", border: "1px solid var(--border)", borderRadius: "6px" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: "0.85rem", width: "100%" }}>
                    <thead>
                      <tr style={{ textAlign: "left", position: "sticky", top: 0, background: "var(--surface)" }}>
                        <th style={{ padding: "0.35rem 0.5rem" }}>Use</th>
                        <th>Client</th>
                        <th>Bookings</th>
                        <th>Mobile found</th>
                        <th>Warnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matched.map((r) => {
                        const m = r.match.kind === "unique" ? r.match : null;
                        if (!m) return null;
                        return (
                          <tr key={r.key} data-testid="booking-import-review-row" style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.3rem 0.5rem" }}>
                              <input
                                type="checkbox"
                                aria-label={`Use the number for ${r.name}`}
                                checked={confirmed.has(r.key)}
                                onChange={() => toggle(r.key)}
                              />
                            </td>
                            <td>{r.name}</td>
                            <td>
                              {r.bookings} (from {r.firstDate})
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>{formatMobile(m.phone)}</td>
                            <td style={{ color: m.flags.length ? "var(--ink)" : "var(--ink-muted)" }}>
                              {m.flags.length ? m.flags.join("; ") : "none"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p style={{ fontSize: "0.8rem", color: "var(--ink-muted)", margin: "0.75rem 0 0" }}>
              A booking that clashes with one already in the app is skipped when it is written,
              and counted afterwards.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <button
                type="button"
                style={button(true, result.toCreate.length === 0)}
                disabled={result.toCreate.length === 0}
                onClick={() => void handleImport()}
              >
                Import {result.toCreate.length.toLocaleString()} bookings
                {withPhone > 0 ? ` (${withPhone.toLocaleString()} with a mobile number)` : ""}
              </button>
              {(result.problems.length > 0 || result.clashes.length > 0) && (
                <button
                  type="button"
                  style={button(false)}
                  onClick={() => downloadReport([...result.problems, ...result.clashes])}
                >
                  Download error report
                </button>
              )}
              <button type="button" style={button(false)} onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {stage.name === "importing" && (
          <p role="status" data-testid="booking-import-progress">
            Importing… {stage.done.toLocaleString()} of {stage.total.toLocaleString()}
          </p>
        )}
        {stage.name === "done" && (
          <div data-testid="booking-import-done">
            <p style={{ margin: 0, fontWeight: 600 }}>
              Imported {stage.created.toLocaleString()} bookings
              {stage.clashed > 0
                ? `; ${stage.clashed.toLocaleString()} skipped because the stylist was already booked`
                : ""}
              .
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--ink-muted)", margin: "0.25rem 0 0.75rem" }}>
              Batch {stage.batchId}. You can roll it back below. Delete the file from this
              computer now that it is imported.
            </p>
            <button type="button" style={button(false)} onClick={reset}>
              Done
            </button>
          </div>
        )}
      </div>

      {batches.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, margin: "0 0 0.4rem" }}>Previous booking imports</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {batches.map((b) => (
              <li
                key={b.id}
                data-testid="booking-import-batch"
                style={{ ...card, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "0.7rem 1rem", gap: "0.75rem", flexWrap: "wrap" }}
              >
                <span style={{ fontSize: "0.85rem" }}>
                  <strong>{new Date(b.createdAt).toLocaleString("en-AU")}</strong> ·{" "}
                  {b.status === "rolled_back"
                    ? `rolled back (${b.removed ?? 0} removed${b.kept ? `, ${b.kept} kept` : ""})`
                    : b.status === "complete"
                    ? `${b.created.toLocaleString()} bookings added`
                    : b.status === "failed"
                    ? `stopped after ${b.created.toLocaleString()}`
                    : "running"}
                </span>
                {b.status !== "rolled_back" && b.status !== "running" && (
                  confirmRollback === b.id ? (
                    <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.8rem" }}>Remove the bookings this import added?</span>
                      <button type="button" style={button(true)} onClick={() => void handleRollback(b.id)}>
                        Yes, roll back
                      </button>
                      <button type="button" style={button(false)} onClick={() => setConfirmRollback(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      style={button(false, rollingBack === b.id)}
                      disabled={rollingBack !== null}
                      onClick={() => setConfirmRollback(b.id)}
                    >
                      {rollingBack === b.id ? "Rolling back…" : "Roll back"}
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BookingImport;
