// TimeOffRequestForm.tsx
// Ask for a day off, a run of days, or a block of time (FR-029). A stylist asks for their own;
// the owner (or a stylist allowed to approve) can enter it for anyone and it applies at once.
// As the dates are filled in, the bookings the time would clash with are listed, so nobody is
// surprised. An approver's own entry can cancel the bookings they choose; a stylist's request
// leaves them for whoever decides.

import { useEffect, useMemo, useState } from "react";
import { todayString } from "../../lib/dates";
import { minutesToTimeString } from "../../lib/scheduling";
import { smsDate } from "../../lib/sms";
import { parseTimeOffInput, type Clash, type TimeOffKind } from "../../lib/timeOff";
import { TimeOffError, previewTimeOff, requestTimeOff, type TimeOffAsk } from "../../lib/timeOffCommands";

interface Props {
  /** Someone who can approve (the owner, or a stylist allowed to): enters time off for anyone, applied at once */
  canApprove: boolean;
  stylists: { id: string; name: string }[];
  /** A stylist's own id (they can only ask for themselves) */
  ownStylistId?: string;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

const TIMES: string[] = [];
for (let m = 6 * 60; m <= 22 * 60; m += 15) TIMES.push(minutesToTimeString(m));

const field: React.CSSProperties = {
  padding: "0.5rem 0.65rem",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: "0.9rem",
  background: "var(--surface)",
  color: "var(--ink)",
  boxSizing: "border-box",
};

const label: React.CSSProperties = { display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "0.25rem" };

const TimeOffRequestForm = ({ canApprove, stylists, ownStylistId, onDone, onError }: Props) => {
  const today = todayString();
  const [stylistId, setStylistId] = useState(ownStylistId ?? "");
  const [kind, setKind] = useState<TimeOffKind>("dayoff");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("1:00 PM");
  const [endTime, setEndTime] = useState("2:00 PM");
  const [reason, setReason] = useState("");
  const [clashes, setClashes] = useState<Clash[] | null>(null);
  const [cancelIds, setCancelIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const ask: TimeOffAsk = useMemo(
    () => ({
      stylistId: ownStylistId ?? stylistId,
      kind,
      startDate,
      endDate: kind === "dayoff" ? endDate || startDate : startDate,
      ...(kind === "block" ? { startTime, endTime } : {}),
      reason,
    }),
    [ownStylistId, stylistId, kind, startDate, endDate, startTime, endTime, reason],
  );
  const parsed = useMemo(() => parseTimeOffInput(ask, today), [ask, today]);
  const problem = startDate && !parsed.ok ? parsed.message : null;
  const valid = parsed.ok;

  // The bookings in the way, looked up as soon as the request is valid
  const checkKey = parsed.ok ? JSON.stringify([parsed.value.stylistId, parsed.value.kind, parsed.value.startDate, parsed.value.endDate, parsed.value.startTime, parsed.value.endTime]) : "";
  useEffect(() => {
    if (!checkKey) return;
    let cancelled = false;
    const id = setTimeout(() => {
      previewTimeOff(ask)
        .then((r) => {
          if (cancelled) return;
          setClashes(r.clashes);
          setCancelIds((prev) => prev.filter((p) => r.clashes.some((c) => c.id === p)));
        })
        .catch(() => {
          if (!cancelled) setClashes(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // `ask` is derived from the same fields as the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  const shown = checkKey ? clashes : null;

  const submit = async () => {
    if (!parsed.ok) return;
    setBusy(true);
    try {
      const r = await requestTimeOff({ ...ask, ...(canApprove && cancelIds.length > 0 ? { cancelBookingIds: cancelIds } : {}) });
      const cancelledNote = r.cancelled.length > 0 ? ` ${r.cancelled.length} booking${r.cancelled.length === 1 ? " was" : "s were"} cancelled: contact ${r.cancelled.length === 1 ? "that client" : "those clients"}.` : "";
      onDone(
        r.status === "approved"
          ? r.auto
            ? "Done - that time is blocked. The owner has been told."
            : `Time off added.${cancelledNote}`
          : r.blocked
            ? "Sent. That time is held for you while it's decided."
            : "Sent. You'll be told when it's decided.",
      );
      setStartDate("");
      setEndDate("");
      setReason("");
      setClashes(null);
      setCancelIds([]);
    } catch (err) {
      onError(err instanceof TimeOffError ? err.message : "Couldn't send that. Please try again.");
    }
    setBusy(false);
  };

  return (
    <section data-testid="timeoff-form" aria-label="Ask for time off" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>{canApprove ? "Add time off" : "Ask for time off"}</h3>
        <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", margin: "0.2rem 0 0" }}>
          {canApprove
            ? "Applied straight away. Bookings already in that time stay unless you choose to cancel them."
            : "A day off, some days, or a block of time (an appointment, an errand)."}
        </p>
      </div>

      {canApprove && (
        <div>
          <label htmlFor="to-stylist" style={label}>Stylist</label>
          <select id="to-stylist" data-testid="to-stylist" value={stylistId} onChange={(e) => setStylistId(e.target.value)} style={field}>
            <option value="">Choose a stylist</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <div role="radiogroup" aria-label="What for" style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", cursor: "pointer", fontSize: "0.9rem" }}>
          <input type="radio" name="to-kind" data-testid="to-kind-dayoff" checked={kind === "dayoff"} onChange={() => setKind("dayoff")} style={{ accentColor: "var(--ink)" }} />
          Day(s) off
        </label>
        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", cursor: "pointer", fontSize: "0.9rem" }}>
          <input type="radio" name="to-kind" data-testid="to-kind-block" checked={kind === "block"} onChange={() => setKind("block")} style={{ accentColor: "var(--ink)" }} />
          A block of time
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <label htmlFor="to-start" style={label}>{kind === "dayoff" ? "First day" : "Day"}</label>
          <input id="to-start" type="date" data-testid="to-start" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} style={field} />
        </div>
        {kind === "dayoff" ? (
          <div>
            <label htmlFor="to-end" style={label}>Last day (leave blank for one day)</label>
            <input id="to-end" type="date" data-testid="to-end" min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} style={field} />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="to-from" style={label}>From</label>
              <select id="to-from" data-testid="to-from" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={field}>
                {TIMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="to-until" style={label}>Until</label>
              <select id="to-until" data-testid="to-until" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={field}>
                {TIMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      <div>
        <label htmlFor="to-reason" style={label}>Reason (optional)</label>
        <input id="to-reason" data-testid="to-reason" value={reason} maxLength={240} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Dentist, family event" style={{ ...field, width: "100%", maxWidth: 380 }} />
      </div>

      {problem && (
        <p role="alert" data-testid="to-problem" style={{ color: "var(--error)", fontSize: "0.8rem", margin: 0 }}>{problem}</p>
      )}

      {shown && shown.length > 0 && (
        <div data-testid="to-clashes" style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "0.75rem 1rem" }}>
          <strong style={{ fontSize: "0.85rem" }}>
            {shown.length} booking{shown.length === 1 ? " is" : "s are"} already in that time
          </strong>
          <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", margin: "0.2rem 0 0.5rem" }}>
            {canApprove ? "They stay unless you tick them to cancel." : "They aren't touched. Whoever decides will choose what happens to them."}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "0.85rem" }}>
            {shown.map((c) => (
              <li key={c.id} data-testid="to-clash" style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.25rem 0" }}>
                {canApprove && (
                  <input
                    type="checkbox"
                    aria-label={`Cancel ${c.customerName}'s booking`}
                    data-testid="to-clash-cancel"
                    checked={cancelIds.includes(c.id)}
                    onChange={(e) => setCancelIds((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                    style={{ accentColor: "var(--ink)" }}
                  />
                )}
                <span>{smsDate(c.date)} {c.time} · {c.customerName} · {c.serviceName}{canApprove && c.customerPhone ? ` · ${c.customerPhone}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button
          type="button"
          data-testid="to-submit"
          disabled={!valid || busy || (canApprove && !stylistId)}
          onClick={() => void submit()}
          style={{ padding: "0.55rem 1.25rem", background: !valid || busy ? "var(--border-strong)" : "var(--accent)", color: !valid || busy ? "var(--grey-muted)" : "var(--surface)", border: "none", borderRadius: 6, cursor: !valid || busy ? "not-allowed" : "pointer", fontWeight: 500, fontSize: "0.875rem" }}
        >
          {busy ? "Sending…" : canApprove ? "Add time off" : "Send request"}
        </button>
      </div>
    </section>
  );
};

export default TimeOffRequestForm;
