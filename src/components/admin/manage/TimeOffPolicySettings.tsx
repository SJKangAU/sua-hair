// TimeOffPolicySettings.tsx
// Manage tab section (owner only) - what happens to a stylist's time-off request while it waits
// for a decision (FR-029, DEC-055): hold the time for them straight away, wait until it is
// approved, or apply a short block (an appointment) at once and tell the owner. Stored in
// "privateSettings/timeOff" (owner-only in firestore.rules); the time-off functions read it.

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import {
  DEFAULT_TIME_OFF_POLICY,
  effectiveTimeOffPolicy,
  timeOffPolicyProblems,
  type PendingBehaviour,
  type TimeOffPolicy,
} from "../../../lib/timeOff";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const SETTINGS_PATH = ["privateSettings", "timeOff"] as const;

const OPTIONS: { value: PendingBehaviour; title: string; help: string }[] = [
  {
    value: "hold",
    title: "Hold the time straight away (recommended)",
    help: "As soon as a stylist asks, customers can't book them for that time. If you decline, it's released. Nothing falls through the gap.",
  },
  {
    value: "wait",
    title: "Don't block anything until it's approved",
    help: "Simplest rule, but a customer could book that time before you've seen the request.",
  },
  {
    value: "auto",
    title: "Short blocks apply at once",
    help: "A block up to the length below (an appointment, an errand) is applied immediately and you're told. Longer blocks and days off are held until you decide.",
  },
];

const TimeOffPolicySettingsEditor = ({ onSuccess, onError }: Props) => {
  const [policy, setPolicy] = useState<TimeOffPolicy>(DEFAULT_TIME_OFF_POLICY);
  const [hoursText, setHoursText] = useState(String(DEFAULT_TIME_OFF_POLICY.autoMaxHours));
  const [saved, setSaved] = useState(JSON.stringify(DEFAULT_TIME_OFF_POLICY));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, ...SETTINGS_PATH))
      .then((snap) => {
        if (cancelled) return;
        const loaded = effectiveTimeOffPolicy(snap.exists() ? snap.data() : undefined);
        setPolicy(loaded);
        setHoursText(String(loaded.autoMaxHours));
        setSaved(JSON.stringify(loaded));
      })
      .catch((err) => {
        console.error("TimeOffPolicySettings load:", err);
        if (!cancelled) onError("Failed to load the time-off settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onError is a fresh closure each render of the parent; load once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hours = /^\d+$/.test(hoursText.trim()) ? Number(hoursText.trim()) : NaN;
  const candidate: TimeOffPolicy = { ...policy, autoMaxHours: hours };
  const problems = timeOffPolicyProblems(candidate);
  const dirty = JSON.stringify(candidate) !== saved;
  const busy = saving || loading;

  const handleSave = async () => {
    if (problems.length > 0) return;
    setSaving(true);
    try {
      await setDoc(doc(db, ...SETTINGS_PATH), candidate);
      setPolicy(candidate);
      setSaved(JSON.stringify(candidate));
      onSuccess("Time-off settings saved.");
    } catch (err) {
      console.error("TimeOffPolicySettings save:", err);
      onError("Failed to save the time-off settings. Please try again.");
    }
    setSaving(false);
  };

  return (
    <div data-testid="timeoff-policy">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Time-off requests</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--grey-muted)", margin: "0.2rem 0 0" }}>What happens to a stylist's request while it waits for you.</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !dirty || problems.length > 0}
          data-testid="timeoff-policy-save"
          style={{
            padding: "0.55rem 1.25rem",
            background: busy || !dirty || problems.length > 0 ? "var(--border-strong)" : "var(--accent)",
            color: busy || !dirty || problems.length > 0 ? "var(--grey-muted)" : "var(--surface)",
            border: "none",
            borderRadius: "6px",
            cursor: busy || !dirty || problems.length > 0 ? "not-allowed" : "pointer",
            fontWeight: 500,
            fontSize: "0.875rem",
            flexShrink: 0,
          }}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          <legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>While a request is waiting</legend>
          {OPTIONS.map((o) => (
            <label key={o.value} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.9rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="timeoff-pending"
                checked={policy.pending === o.value}
                disabled={loading}
                data-testid={`timeoff-policy-${o.value}`}
                onChange={() => setPolicy((p) => ({ ...p, pending: o.value }))}
                style={{ accentColor: "var(--ink)", marginTop: 3 }}
              />
              <span>
                {o.title}
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)" }}>{o.help}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {policy.pending === "auto" && (
          <div>
            <label htmlFor="timeoff-auto-hours" style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "0.3rem" }}>
              A "short" block is up to this many hours (1 to 12)
            </label>
            <input
              id="timeoff-auto-hours"
              inputMode="numeric"
              value={hoursText}
              disabled={loading}
              data-testid="timeoff-policy-hours"
              onChange={(e) => setHoursText(e.target.value)}
              aria-invalid={problems.length > 0}
              style={{ padding: "0.5rem 0.65rem", border: "1px solid var(--border)", borderRadius: 6, width: 90, background: "var(--surface)", color: "var(--ink)" }}
            />
            {problems.map((p) => (
              <p key={p} role="alert" data-testid="timeoff-policy-problem" style={{ color: "var(--error)", fontSize: "0.78rem", margin: "0.3rem 0 0" }}>
                {p}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeOffPolicySettingsEditor;
