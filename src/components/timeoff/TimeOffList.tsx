// TimeOffList.tsx
// Time-off requests (FR-029): waiting for a decision, coming up, and earlier. Someone allowed
// to approve can Review a waiting request - see the bookings in the way, choose which (if any)
// to cancel, add a note, then approve or decline - and can take back approved time off. A
// stylist can withdraw their own request while it waits.

import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import { todayString } from "../../lib/dates";
import { smsDate } from "../../lib/sms";
import type { Clash, TimeOffRecord } from "../../lib/timeOff";
import { TimeOffError, decideTimeOff, previewTimeOff, withdrawTimeOff } from "../../lib/timeOffCommands";

interface Props {
  records: TimeOffRecord[];
  /** The owner, or a stylist allowed to approve */
  canApprove: boolean;
  /** This person's own uid, so nobody reviews their own request (the owner may) */
  ownUid: string;
  isOwner: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

const when = (r: TimeOffRecord): string =>
  r.kind === "dayoff"
    ? r.startDate === r.endDate
      ? `${smsDate(r.startDate)} (the day)`
      : `${smsDate(r.startDate)} to ${smsDate(r.endDate)}`
    : `${smsDate(r.startDate)}, ${r.startTime} to ${r.endTime}`;

const pill: React.CSSProperties = {
  display: "inline-block",
  border: "1px solid var(--ink)",
  borderRadius: 999,
  padding: "1px 9px",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
};

const button = (primary = false): React.CSSProperties => ({
  padding: "0.4rem 0.9rem",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "0.82rem",
  border: primary ? "none" : "1px solid var(--border-strong)",
  background: primary ? "var(--accent)" : "transparent",
  color: primary ? "var(--surface)" : "var(--ink)",
});

const Review = ({ record, onClose, onDone, onError }: { record: TimeOffRecord; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) => {
  const [clashes, setClashes] = useState<Clash[] | null>(null);
  const [cancelIds, setCancelIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewTimeOff({ stylistId: record.stylistId, kind: record.kind, startDate: record.startDate, endDate: record.endDate, startTime: record.startTime, endTime: record.endTime, reason: record.reason })
      .then((r) => {
        if (!cancelled) setClashes(r.clashes);
      })
      .catch((err) => {
        if (!cancelled) {
          setClashes([]);
          onError(err instanceof TimeOffError ? err.message : "Couldn't check for clashes.");
        }
      });
    return () => {
      cancelled = true;
    };
    // look up once per request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  const decide = async (decision: "approve" | "decline") => {
    setBusy(true);
    try {
      const r = await decideTimeOff({ id: record.id, decision, ...(decision === "approve" ? { cancelBookingIds: cancelIds } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      onDone(
        decision === "decline"
          ? "Declined. The held time is released."
          : r.cancelled.length > 0
            ? `Approved. ${r.cancelled.length} booking${r.cancelled.length === 1 ? " was" : "s were"} cancelled: contact ${r.cancelled.length === 1 ? "that client" : "those clients"}.`
            : "Approved.",
      );
      onClose();
    } catch (err) {
      onError(err instanceof TimeOffError ? err.message : "That didn't work. Please try again.");
    }
    setBusy(false);
  };

  return (
    <Modal title={`${record.stylistName}: ${when(record)}`} onClose={() => (busy ? undefined : onClose())} width="560px">
      <p style={{ marginTop: 0 }}>
        {record.requestedByName} asked on {new Date(record.requestedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
        {record.reason ? `: "${record.reason}"` : "."}
      </p>
      {clashes === null ? (
        <p role="status">Checking for bookings in that time...</p>
      ) : clashes.length === 0 ? (
        <p data-testid="review-no-clashes">No bookings are in that time.</p>
      ) : (
        <div data-testid="review-clashes">
          <strong>
            {clashes.length} booking{clashes.length === 1 ? " is" : "s are"} in that time
          </strong>
          <p style={{ fontSize: "0.82rem", color: "var(--ink-muted)", margin: "0.2rem 0 0.5rem" }}>
            They stay as they are unless you tick them. A client whose booking you cancel isn't emailed: please contact them.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {clashes.map((c) => (
              <li key={c.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.3rem 0" }}>
                <input
                  type="checkbox"
                  aria-label={`Cancel ${c.customerName}'s booking`}
                  data-testid="review-cancel"
                  checked={cancelIds.includes(c.id)}
                  onChange={(e) => setCancelIds((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                  style={{ accentColor: "var(--ink)" }}
                />
                <span>
                  {smsDate(c.date)} {c.time} · {c.customerName} · {c.serviceName}
                  {c.customerPhone ? ` · ${c.customerPhone}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label style={{ display: "block", margin: "1rem 0 0.25rem", fontSize: "0.8rem", color: "var(--ink-muted)" }} htmlFor="review-note">
        A note for them (optional)
      </label>
      <input id="review-note" data-testid="review-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 6 }} />
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button type="button" style={button(true)} disabled={busy || clashes === null} data-testid="review-approve" onClick={() => void decide("approve")}>
          {busy ? "Working…" : cancelIds.length > 0 ? `Approve and cancel ${cancelIds.length}` : "Approve"}
        </button>
        <button type="button" style={button()} disabled={busy} data-testid="review-decline" onClick={() => void decide("decline")}>
          Decline
        </button>
      </div>
    </Modal>
  );
};

const TimeOffList = ({ records, canApprove, ownUid, isOwner, onDone, onError }: Props) => {
  const today = todayString();
  const [reviewing, setReviewing] = useState<TimeOffRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const waiting = records.filter((r) => r.status === "pending");
  const coming = records.filter((r) => r.status === "approved" && r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const earlier = records.filter((r) => !waiting.includes(r) && !coming.includes(r));

  const withdraw = async (r: TimeOffRecord) => {
    setBusyId(r.id);
    try {
      await withdrawTimeOff(r.id);
      onDone(r.status === "pending" ? "Request withdrawn." : "Time off removed.");
    } catch (err) {
      onError(err instanceof TimeOffError ? err.message : "That didn't work. Please try again.");
    }
    setBusyId(null);
  };

  const row = (r: TimeOffRecord) => {
    const mine = r.requestedByUid === ownUid;
    const mayReview = canApprove && r.status === "pending" && (isOwner || !mine);
    const mayWithdraw = (r.status === "pending" && (mine || canApprove)) || (r.status === "approved" && canApprove && r.endDate >= today);
    return (
      <li key={r.id} data-testid="timeoff-row" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", padding: "0.75rem 0", borderTop: "1px solid var(--border)" }}>
        <div>
          <strong style={{ fontSize: "0.9rem" }}>{r.stylistName}</strong>{" "}
          <span style={pill} data-testid="timeoff-status">
            {r.status === "pending" ? "Waiting" : r.status === "approved" ? (r.auto ? "Applied" : "Approved") : r.status === "declined" ? "Declined" : "Withdrawn"}
          </span>
          <div style={{ fontSize: "0.85rem" }}>{when(r)}</div>
          {r.reason && <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>{r.reason}</div>}
          {r.decisionNote && <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>Note: {r.decisionNote}</div>}
          {r.decidedByName && r.status !== "pending" && !r.auto && (
            <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>{r.status === "withdrawn" ? "Taken back" : "Decided"} by {r.decidedByName}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          {mayReview && (
            <button type="button" style={button(true)} data-testid="timeoff-review" onClick={() => setReviewing(r)}>
              Review
            </button>
          )}
          {mayWithdraw && (
            <button type="button" style={button()} disabled={busyId === r.id} data-testid="timeoff-withdraw" onClick={() => void withdraw(r)}>
              {r.status === "pending" ? "Withdraw" : "Remove"}
            </button>
          )}
        </div>
      </li>
    );
  };

  const section = (title: string, list: TimeOffRecord[], testId: string, empty: string) => (
    <section aria-label={title} data-testid={testId}>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.25rem" }}>{title}</h3>
      {list.length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)", margin: 0 }}>{empty}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{list.map(row)}</ul>
      )}
    </section>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }} data-testid="timeoff-list">
      {section("Waiting for a decision", waiting, "timeoff-waiting", "Nothing is waiting.")}
      {section("Coming up", coming, "timeoff-coming", "No time off is booked in.")}
      {earlier.length > 0 && section("Earlier", earlier.slice(0, 20), "timeoff-earlier", "")}
      {reviewing && <Review record={reviewing} onClose={() => setReviewing(null)} onDone={onDone} onError={onError} />}
    </div>
  );
};

export default TimeOffList;
