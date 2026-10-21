// ClientBackfill.tsx
// Manage tab section (owner only): build the client list from what already exists -
// every booking with a valid phone, plus the clients the Fresha import added. The
// owner sees a dry run first (counts and a downloadable report of rows to look at:
// a row number and a reason only), then applies it; each run can be rolled back.
// Safe to run again: it never changes a client the owner has edited, and creates
// nothing twice. (functions/src/clientBackfill.ts, DEC-045)

import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import {
  ClientCommandError,
  backfillClients,
  recomputeClients,
  reportCsv,
  type BackfillResult,
} from "../../../lib/clientCommands";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

interface Batch {
  id: string;
  status: string;
  createdAt: string;
  counts?: { clientsToCreate?: number };
  created?: number;
  linked?: number;
  removed?: number;
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
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
  borderRadius: 6,
  cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 500,
  fontSize: "0.875rem",
});

const LINES: [keyof NonNullable<BackfillResult["counts"]>, string][] = [
  ["bookingsScanned", "Bookings looked at"],
  ["clientsFound", "Clients found"],
  ["clientsToCreate", "New clients to add"],
  ["clientsExisting", "Already in the client list"],
  ["visitRecordsOnly", "From the Fresha import (no bookings yet)"],
  ["bookingsToLink", "Bookings to link to their client"],
  ["skippedNoPhone", "Skipped: no phone number"],
  ["skippedInvalidPhone", "Skipped: not a valid mobile number"],
  ["legacyAnyStylist", "Old bookings with no stylist yet"],
  ["breaksAndTraining", "Breaks and training (not clients)"],
];

const ClientBackfill = ({ onSuccess, onError }: Props) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [dry, setDry] = useState<BackfillResult | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getDocs(query(collection(db, "clientBackfills"), orderBy("createdAt", "desc"), limit(10)))
      .then((snap) => setBatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Batch)))
      .catch(() => setBatches([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const fail = (err: unknown, fallback: string) =>
    onError(err instanceof ClientCommandError ? err.message : fallback);

  const runDry = async () => {
    setBusy("dry");
    setDry(null);
    try {
      setDry(await backfillClients({ mode: "dry" }));
    } catch (err) {
      fail(err, "Couldn't run the check.");
    }
    setBusy(null);
  };

  const apply = async () => {
    setBusy("apply");
    try {
      const r = await backfillClients({ mode: "apply" });
      setDry(null);
      onSuccess(`Client list built: ${r.created ?? 0} added, ${r.linked ?? 0} bookings linked.`);
      refresh();
    } catch (err) {
      fail(err, "The client list didn't finish building. Run the check again; nothing is lost.");
    }
    setBusy(null);
  };

  const rollback = async (id: string) => {
    setConfirmRollback(null);
    setBusy(id);
    try {
      const r = await backfillClients({ mode: "rollback", batchId: id });
      onSuccess(`Rolled back: ${r.removed ?? 0} clients removed${r.kept ? `, ${r.kept} kept because they have notes` : ""}.`);
      refresh();
    } catch (err) {
      fail(err, "The rollback didn't finish. Run it again to continue.");
    }
    setBusy(null);
  };

  const recomputeAll = async () => {
    setBusy("recompute");
    try {
      const r = await recomputeClients();
      onSuccess(`Checked ${r.checked} clients; ${r.changed} had out-of-date figures and were corrected.`);
    } catch (err) {
      fail(err, "Couldn't recalculate.");
    }
    setBusy(null);
  };

  const downloadReport = () => {
    if (!dry?.report) return;
    const blob = new Blob([reportCsv(dry.report)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "client-list-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="client-backfill">
      <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Build the client list</h3>
      <p style={{ fontSize: "0.8rem", color: "var(--grey-muted)", margin: "0.2rem 0 1rem" }}>
        Creates a client for every mobile number in your bookings and for everyone the Fresha import added, so
        Clients can search them all. It changes nothing until you press Build, never touches a client you have edited,
        and can be rolled back.
      </p>
      <div style={card}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button type="button" style={button(true, busy !== null)} disabled={busy !== null} onClick={() => void runDry()} data-testid="backfill-dry">
            {busy === "dry" ? "Checking..." : "Check first (dry run)"}
          </button>
          <button type="button" style={button(false, busy !== null)} disabled={busy !== null} onClick={() => void recomputeAll()} data-testid="backfill-recompute">
            {busy === "recompute" ? "Working..." : "Recalculate every client's figures"}
          </button>
        </div>

        {dry?.counts && (
          <div data-testid="backfill-result">
            <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>Dry run - nothing has been written yet</p>
            <table style={{ borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <tbody>
                {LINES.map(([key, label]) => (
                  <tr key={key}>
                    <td style={{ padding: "0.2rem 1.5rem 0.2rem 0" }}>{label}</td>
                    <td data-testid={`backfill-${key}`} style={{ fontWeight: 600, textAlign: "right" }}>
                      {dry.counts![key].toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <button type="button" style={button(true, busy !== null)} disabled={busy !== null} onClick={() => void apply()} data-testid="backfill-apply">
                {busy === "apply" ? "Building..." : `Build ${dry.counts.clientsToCreate.toLocaleString()} clients`}
              </button>
              {dry.report && dry.report.length > 0 && (
                <button type="button" style={button(false)} onClick={downloadReport} data-testid="backfill-report">
                  Download report ({dry.report.length}{dry.reportTruncated ? "+" : ""} rows)
                </button>
              )}
              <button type="button" style={button(false)} onClick={() => setDry(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {batches.length > 0 && (
        <ul style={{ listStyle: "none", margin: "1rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {batches.map((b) => (
            <li key={b.id} data-testid="backfill-batch" style={{ ...card, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "0.7rem 1rem", flexWrap: "wrap", gap: "0.75rem" }}>
              <span style={{ fontSize: "0.85rem" }}>
                <strong>{new Date(b.createdAt).toLocaleString("en-AU")}</strong> ·{" "}
                {b.status === "rolled_back"
                  ? `rolled back (${b.removed ?? 0} removed)`
                  : b.status === "complete"
                  ? `${(b.created ?? 0).toLocaleString()} clients added, ${(b.linked ?? 0).toLocaleString()} bookings linked`
                  : b.status}
              </span>
              {b.status !== "rolled_back" &&
                b.status !== "running" &&
                (confirmRollback === b.id ? (
                  <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem" }}>Remove the clients this run added?</span>
                    <button type="button" style={button(true)} onClick={() => void rollback(b.id)}>
                      Yes, roll back
                    </button>
                    <button type="button" style={button(false)} onClick={() => setConfirmRollback(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" style={button(false, busy !== null)} disabled={busy !== null} onClick={() => setConfirmRollback(b.id)}>
                    {busy === b.id ? "Rolling back..." : "Roll back"}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ClientBackfill;
