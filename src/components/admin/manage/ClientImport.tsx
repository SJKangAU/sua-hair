// ClientImport.tsx
// Manage tab section (owner only): import a Fresha client list (.csv or .xlsx)
// so returning clients are recognised when the owner types their number.
//
//   1. Choose a file. It is read in this browser and never uploaded.
//   2. Dry run: counts of new clients, ones already in the app (left exactly as
//      they are), skipped rows and merged duplicates, plus what the import
//      leaves out. A downloadable report lists row numbers and reasons only.
//      Nothing is written until the owner confirms.
//   3. Import: in batches, safe to repeat (importing the same file again adds
//      nobody).
//   4. Roll back: removes only what that import created.
// Personal data (names, numbers) is never logged and never put in a toast.

import { useCallback, useEffect, useRef, useState } from "react";
import { db, auth } from "../../../lib/firebase";
import {
  MAX_FILE_BYTES,
  buildPlan,
  dryRun,
  errorReportCsv,
  missingHeaders,
  newBatchId,
  type DryRun,
} from "../../../lib/clientImport";
import { ImportFileError, parseClientFile } from "../../../lib/clientImportFile";
import {
  findExistingRecords,
  listBatches,
  rollbackBatch,
  runImport,
  type ImportBatch,
} from "../../../lib/clientImportWrites";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

type Stage =
  | { name: "idle" }
  | { name: "reading" }
  | { name: "checking"; done: number; total: number }
  | { name: "ready"; fileName: string; result: DryRun }
  | { name: "importing"; done: number; total: number }
  | { name: "done"; created: number; existed: number; flagged: number; batchId: string };

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

const downloadReport = (result: DryRun) => {
  const blob = new Blob([errorReportCsv(result.problems)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "client-import-errors.csv";
  a.click();
  URL.revokeObjectURL(url);
};

const ClientImport = ({ onSuccess, onError }: Props) => {
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const planRef = useRef<ReturnType<typeof buildPlan> | null>(null);
  const resultRef = useRef<DryRun | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshBatches = useCallback(() => {
    listBatches(db)
      .then(setBatches)
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
    if (fileInput.current) fileInput.current.value = "";
    setStage({ name: "idle" });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setStage({ name: "reading" });
    try {
      const parsed = await parseClientFile(file);
      const missing = missingHeaders(parsed.headers);
      if (missing.length > 0) {
        onError(`That doesn't look like a client list: missing ${missing.join(" and ")}.`);
        reset();
        return;
      }
      const plan = buildPlan(parsed.rows);
      planRef.current = plan;
      const phones = plan.entries.map((e) => e.phone);
      setStage({ name: "checking", done: 0, total: phones.length });
      const existing = await findExistingRecords(db, phones, (done, total) =>
        setStage({ name: "checking", done, total }),
      );
      const result = dryRun(plan, existing);
      resultRef.current = result;
      setStage({ name: "ready", fileName: file.name, result });
    } catch (err) {
      onError(
        err instanceof ImportFileError
          ? err.message
          : "Couldn't read that file. Check it is the client list export.",
      );
      reset();
    }
  };

  const handleImport = async () => {
    const result = resultRef.current;
    const uid = auth.currentUser?.uid;
    if (!result || !uid) return;
    const batchId = newBatchId();
    setStage({ name: "importing", done: 0, total: result.toCreate.length });
    try {
      const done = await runImport(db, [...result.toCreate, ...result.toFlag], {
        batchId,
        uid,
        onProgress: (d, total) => setStage({ name: "importing", done: d, total }),
      });
      setStage({
        name: "done",
        created: done.created,
        existed: done.existed,
        flagged: done.flagged ?? 0,
        batchId,
      });
      onSuccess(`Imported ${done.created} clients.`);
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
      const done = await rollbackBatch(db, id);
      onSuccess(
        `Rolled back: ${done.removed} removed${done.kept ? `, ${done.kept} kept because they have booked since` : ""}${
          done.unblocked ? `, ${done.unblocked} unblocked` : ""
        }.`,
      );
    } catch {
      onError("The rollback didn't finish. Run it again to continue.");
    }
    setRollingBack(null);
    refreshBatches();
  };

  const busy = stage.name === "reading" || stage.name === "checking" || stage.name === "importing";
  const result = stage.name === "ready" ? stage.result : null;
  const leftOut = result ? Object.entries(result.notImported) : [];

  return (
    <div data-testid="client-import">
      <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Import clients</h3>
      <p style={{ fontSize: "0.8rem", color: "var(--grey-muted)", margin: "0.2rem 0 1rem" }}>
        Add clients from a Fresha client list (.csv or .xlsx) so they are recognised as
        returning clients when you enter their number. The file is read in this
        browser and not uploaded. Only names and mobile numbers are imported, and
        clients Fresha has blocked are imported as blocked.
      </p>

      <div style={card}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label
            style={{ ...button(true, busy), display: "inline-block" }}
            aria-disabled={busy}
          >
            Choose file
            <input
              ref={fileInput}
              data-testid="client-import-file"
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
        {stage.name === "checking" && (
          <p role="status">
            Checking existing clients… {stage.done.toLocaleString()} of {stage.total.toLocaleString()}
          </p>
        )}

        {result && (
          <div data-testid="client-import-dryrun">
            <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
              Dry run - nothing has been written yet
            </p>
            <table style={{ borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <tbody>
                {[
                  ["Rows in the file", result.rows, "rows"],
                  ["New clients to add", result.toCreate.length, "new"],
                  ["Already in the app (left as they are)", result.alreadyExist, "exist"],
                  ["Skipped (no valid mobile number or name)", result.skipped, "skipped"],
                  ["Sharing a number with another client (merged)", result.collapsed, "merged"],
                  ["Blocked in Fresha (imported as BLOCKED)", result.blocked, "blocked"],
                ].map(([label, n, key]) => (
                  <tr key={String(key)}>
                    <td style={{ padding: "0.2rem 1.5rem 0.2rem 0" }}>{label}</td>
                    <td data-testid={`dryrun-${key}`} style={{ fontWeight: 600, textAlign: "right" }}>
                      {Number(n).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(result.blocked > 0 || result.blockedUnusable > 0) && (
              <div
                role="alert"
                data-testid="dryrun-blocked-warning"
                style={{
                  margin: "0.75rem 0 0",
                  padding: "0.75rem 1rem",
                  border: "2px solid var(--ink)",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  lineHeight: 1.5,
                }}
              >
                <strong>
                  Warning: {result.blocked.toLocaleString()} blocked client
                  {result.blocked === 1 ? "" : "s"} in this file.
                </strong>{" "}
                {result.blocked > 0 &&
                  "They will be imported as BLOCKED: they cannot book online (they are told to call the salon), and the walk-in form shows a blocked warning for them. "}
                {result.toFlag.length > 0 &&
                  `${result.toFlag.length.toLocaleString()} of them already have a record here and will have only the blocked flag added. `}
                {result.alreadyBlocked > 0 &&
                  `${result.alreadyBlocked.toLocaleString()} are already blocked here. `}
                {result.blockedUnusable > 0 &&
                  `${result.blockedUnusable.toLocaleString()} blocked row${
                    result.blockedUnusable === 1 ? " has" : "s have"
                  } no usable mobile number, so cannot be blocked here. `}
                Rolling the import back removes the blocked flag it set.
              </div>
            )}
            {leftOut.length > 0 && (
              <p style={{ fontSize: "0.8rem", color: "var(--ink-muted)", margin: "0.75rem 0 0" }}>
                Not imported (nothing in the app uses them):{" "}
                {leftOut.map(([k, n]) => `${n.toLocaleString()} ${k}`).join(", ")}.
              </p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <button
                type="button"
                style={button(true, result.toCreate.length === 0 && result.toFlag.length === 0)}
                disabled={result.toCreate.length === 0 && result.toFlag.length === 0}
                onClick={() => void handleImport()}
              >
                Import {result.toCreate.length.toLocaleString()} clients
                {result.toFlag.length > 0
                  ? ` and mark ${result.toFlag.length.toLocaleString()} existing as blocked`
                  : ""}
              </button>
              {result.problems.length > 0 && (
                <button type="button" style={button(false)} onClick={() => downloadReport(result)}>
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
          <p role="status" data-testid="client-import-progress">
            Importing… {stage.done.toLocaleString()} of {stage.total.toLocaleString()}
          </p>
        )}
        {stage.name === "done" && (
          <div data-testid="client-import-done">
            <p style={{ margin: 0, fontWeight: 600 }}>
              Imported {stage.created.toLocaleString()} clients
              {stage.existed > 0 ? ` (${stage.existed.toLocaleString()} already had a record and were left alone)` : ""}
              {stage.flagged > 0 ? `; ${stage.flagged.toLocaleString()} marked blocked` : ""}.
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
          <p style={{ fontSize: "0.8rem", fontWeight: 600, margin: "0 0 0.4rem" }}>Previous imports</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {batches.map((b) => (
              <li
                key={b.id}
                data-testid="client-import-batch"
                style={{ ...card, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "0.7rem 1rem", gap: "0.75rem", flexWrap: "wrap" }}
              >
                <span style={{ fontSize: "0.85rem" }}>
                  <strong>{new Date(b.createdAt).toLocaleString("en-AU")}</strong> ·{" "}
                  {b.status === "rolled_back"
                    ? `rolled back (${b.removed ?? 0} removed${b.kept ? `, ${b.kept} kept` : ""}${b.unblocked ? `, ${b.unblocked} unblocked` : ""})`
                    : b.status === "complete"
                    ? `${b.created.toLocaleString()} clients added${b.flagged ? `, ${b.flagged.toLocaleString()} marked blocked` : ""}`
                    : b.status === "failed"
                    ? `stopped after ${b.created.toLocaleString()}`
                    : "running"}
                </span>
                {b.status !== "rolled_back" && b.status !== "running" && (
                  confirmRollback === b.id ? (
                    <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.8rem" }}>
                        Remove the clients this import added?
                      </span>
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

export default ClientImport;
