// PolicySettings.tsx
// Manage tab section (owner only) - the cancellation and change policy (FR-028, DEC-054):
// what a customer may do to their own booking from the link in their email or text. Stored
// in "salonSettings/policy" (readable by the public page, writable by the owner only); the
// server applies it on every action, the customer page shows what it will allow.

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import {
  DEFAULT_CHANGE_POLICY,
  MAX_CUTOFF_HOURS,
  MAX_MESSAGE_LENGTH,
  effectivePolicy,
  policyProblems,
  type ChangePolicy,
} from "../../../lib/changePolicy";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const SETTINGS_PATH = ["salonSettings", "policy"] as const;

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const input: React.CSSProperties = {
  padding: "0.5rem 0.65rem",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  fontSize: "0.9rem",
  background: "var(--surface)",
  color: "var(--ink)",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const PolicySettingsEditor = ({ onSuccess, onError }: Props) => {
  const [policy, setPolicy] = useState<ChangePolicy>(DEFAULT_CHANGE_POLICY);
  const [saved, setSaved] = useState(JSON.stringify(DEFAULT_CHANGE_POLICY));
  const [cutoffText, setCutoffText] = useState(String(DEFAULT_CHANGE_POLICY.cutoffHours));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, ...SETTINGS_PATH))
      .then((snap) => {
        if (cancelled) return;
        const loaded = effectivePolicy(snap.exists() ? snap.data() : undefined);
        setPolicy(loaded);
        setCutoffText(String(loaded.cutoffHours));
        setSaved(JSON.stringify(loaded));
      })
      .catch((err) => {
        console.error("PolicySettings load:", err);
        if (!cancelled) onError("Failed to load the cancellation policy.");
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

  const cutoff = /^\d+$/.test(cutoffText.trim()) ? Number(cutoffText.trim()) : NaN;
  const candidate: ChangePolicy = { ...policy, cutoffHours: cutoff };
  const problems = policyProblems(candidate);
  const dirty = JSON.stringify(candidate) !== saved;

  const handleSave = async () => {
    if (problems.length > 0) {
      onError(problems[0]);
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, ...SETTINGS_PATH), candidate);
      setPolicy(candidate);
      setSaved(JSON.stringify(candidate));
      onSuccess("Cancellation policy saved.");
    } catch (err) {
      console.error("PolicySettings save:", err);
      onError("Failed to save the cancellation policy. Please try again.");
    }
    setSaving(false);
  };

  const busy = saving || loading;

  return (
    <div data-testid="policy-settings">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Cancellation &amp; change policy</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--grey-muted)", margin: "0.2rem 0 0" }}>
            What a client can do to their own booking from the link in their email or text.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !dirty || problems.length > 0}
          data-testid="policy-save"
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

      <div style={card}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontSize: "0.9rem" }}>
          <input
            type="checkbox"
            checked={policy.allowCancel}
            disabled={loading}
            data-testid="policy-allow-cancel"
            onChange={(e) => setPolicy((p) => ({ ...p, allowCancel: e.target.checked }))}
            style={{ accentColor: "var(--ink)" }}
          />
          Clients can cancel a confirmed booking
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontSize: "0.9rem" }}>
          <input
            type="checkbox"
            checked={policy.allowReschedule}
            disabled={loading}
            data-testid="policy-allow-reschedule"
            onChange={(e) => setPolicy((p) => ({ ...p, allowReschedule: e.target.checked }))}
            style={{ accentColor: "var(--ink)" }}
          />
          Clients can ask to move a confirmed booking to another time
        </label>

        <div>
          <label htmlFor="policy-cutoff" style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "0.3rem" }}>
            Changes close this many hours before the appointment (0 = right up to the start)
          </label>
          <input
            id="policy-cutoff"
            inputMode="numeric"
            value={cutoffText}
            disabled={loading}
            data-testid="policy-cutoff"
            onChange={(e) => setCutoffText(e.target.value)}
            aria-invalid={Number.isNaN(cutoff) || problems.some((p) => /cutoff/i.test(p))}
            style={{ ...input, width: 100 }}
          />
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
            Up to {MAX_CUTOFF_HOURS} hours. A request that is still waiting for you can always be cancelled by the client.
          </p>
          {problems.filter((p) => /cutoff/i.test(p)).map((p) => (
            <p key={p} role="alert" data-testid="policy-problem-cutoff" style={{ color: "var(--error)", fontSize: "0.78rem", margin: "0.3rem 0 0" }}>
              {p}
            </p>
          ))}
        </div>

        <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <legend style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem", padding: 0 }}>When a client asks to move a booking</legend>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.88rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="reschedule-mode"
              checked={policy.rescheduleMode === "request"}
              disabled={loading}
              data-testid="policy-mode-request"
              onChange={() => setPolicy((p) => ({ ...p, rescheduleMode: "request" }))}
              style={{ accentColor: "var(--ink)", marginTop: 3 }}
            />
            <span>
              It's a new request you approve (recommended)
              <span style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                The new time is held, the original stays booked until you approve, and declining or letting it lapse leaves the original as it was.
              </span>
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.88rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="reschedule-mode"
              checked={policy.rescheduleMode === "instant"}
              disabled={loading}
              data-testid="policy-mode-instant"
              onChange={() => setPolicy((p) => ({ ...p, rescheduleMode: "instant" }))}
              style={{ accentColor: "var(--ink)", marginTop: 3 }}
            />
            <span>
              It moves straight away if the time is free
              <span style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)" }}>You're told afterwards. Nothing to approve.</span>
            </span>
          </label>
        </fieldset>

        <div>
          <label htmlFor="policy-message" style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "0.3rem" }}>
            What a client reads once it's too late to change online (your phone number is shown beside it)
          </label>
          <textarea
            id="policy-message"
            rows={3}
            value={policy.pastCutoffMessage}
            maxLength={MAX_MESSAGE_LENGTH + 40}
            disabled={loading}
            data-testid="policy-message"
            onChange={(e) => setPolicy((p) => ({ ...p, pastCutoffMessage: e.target.value }))}
            aria-invalid={problems.some((p) => !/cutoff/i.test(p))}
            style={{ ...input, width: "100%", resize: "vertical" }}
          />
          {problems.filter((p) => !/cutoff/i.test(p)).map((p) => (
            <p key={p} role="alert" data-testid="policy-problem-message" style={{ color: "var(--error)", fontSize: "0.78rem", margin: "0.3rem 0 0" }}>
              {p}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PolicySettingsEditor;
