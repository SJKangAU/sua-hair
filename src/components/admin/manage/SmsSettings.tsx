// SmsSettings.tsx
// Manage tab section (owner only) - text messages about a booking (FR-024, DEC-050).
// The owner switches texts on, chooses which of the four messages go out, and writes
// the wording of each one with {placeholders}. Every message has a live preview, a
// length counter (an SMS segment is 160 characters; each extra one is billed), a
// reset to the default, and a "send me a test". Stored in "privateSettings/sms"
// (owner-only in firestore.rules); the booking functions read it with the Admin SDK.

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { SALON_CONFIG } from "../../../lib/config";
import {
  DEFAULT_SENDER_NAME,
  DEFAULT_TEMPLATES,
  MAX_SENDER_LENGTH,
  MAX_TEMPLATE_LENGTH,
  PLACEHOLDERS,
  PLACEHOLDER_HELP,
  SAMPLE_BOOKING,
  SMS_KINDS,
  SMS_KIND_LABELS,
  effectiveSettings,
  isValidSenderName,
  renderSms,
  smsLength,
  smsValuesFor,
  templateProblem,
  type SmsKind,
  type SmsSettings,
} from "../../../lib/sms";
import { SmsCommandError, sendTestSms } from "../../../lib/smsCommands";
import { validatePhone } from "../../../lib/validation";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

interface LogRow {
  id: string;
  kind: SmsKind;
  status: string;
  toEnding: string;
  segments: number;
  createdAt: string;
}

const SETTINGS_PATH = ["privateSettings", "sms"] as const;

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
};

const smallButton: React.CSSProperties = {
  padding: "0.35rem 0.7rem",
  border: "1px solid var(--border-strong)",
  borderRadius: "6px",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "0.8rem",
  cursor: "pointer",
};

const sampleValues = smsValuesFor(SAMPLE_BOOKING, {
  name: SALON_CONFIG.salonName,
  phoneDisplay: SALON_CONFIG.salonPhone,
});

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

const STATUS_WORDS: Record<string, string> = {
  sent: "Sent",
  sending: "Sending",
  failed: "Failed",
  capped: "Not sent (daily limit)",
};

const SmsSettingsEditor = ({ onSuccess, onError }: Props) => {
  const [settings, setSettings] = useState<SmsSettings>(() => effectiveSettings(undefined));
  const [saved, setSaved] = useState<string>(() => JSON.stringify(effectiveSettings(undefined)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState<SmsKind | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const fields = useRef<Partial<Record<SmsKind, HTMLTextAreaElement | null>>>({});

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, ...SETTINGS_PATH))
      .then((snap) => {
        if (cancelled) return;
        const loaded = effectiveSettings(snap.exists() ? snap.data() : undefined);
        setSettings(loaded);
        setSaved(JSON.stringify(loaded));
      })
      .catch((err) => {
        console.error("SmsSettings load:", err);
        if (!cancelled) onError("Failed to load the text message settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    getDocs(query(collection(db, "smsLog"), orderBy("createdAt", "desc"), limit(8)))
      .then((snap) => {
        if (!cancelled) setLog(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LogRow, "id">) })));
      })
      .catch(() => undefined); // the list is a convenience; the settings matter more
    return () => {
      cancelled = true;
    };
    // onError is a fresh closure each render of the parent; load once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = JSON.stringify(settings) !== saved;
  const senderOk = isValidSenderName(settings.senderName);
  const problems = useMemo(
    () =>
      Object.fromEntries(SMS_KINDS.map((k) => [k, templateProblem(settings.templates[k])])) as Record<
        SmsKind,
        string | null
      >,
    [settings.templates],
  );
  const anyProblem = !senderOk || SMS_KINDS.some((k) => problems[k]);

  const setTemplate = (kind: SmsKind, text: string) =>
    setSettings((s) => ({ ...s, templates: { ...s.templates, [kind]: text } }));

  const insert = (kind: SmsKind, placeholder: string) => {
    const el = fields.current[kind];
    const text = settings.templates[kind];
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setTemplate(kind, `${text.slice(0, start)}{${placeholder}}${text.slice(end)}`);
    requestAnimationFrame(() => {
      el?.focus();
      const caret = start + placeholder.length + 2;
      el?.setSelectionRange(caret, caret);
    });
  };

  const handleSave = async () => {
    if (anyProblem) {
      onError("Fix the highlighted message wording first.");
      return;
    }
    setSaving(true);
    try {
      const toSave: SmsSettings = { ...settings, senderName: settings.senderName.trim() };
      await setDoc(doc(db, ...SETTINGS_PATH), toSave);
      setSettings(toSave);
      setSaved(JSON.stringify(toSave));
      onSuccess("Text message settings saved.");
    } catch (err) {
      console.error("SmsSettings save:", err);
      onError("Failed to save the text message settings. Please try again.");
    }
    setSaving(false);
  };

  const handleTest = async (kind: SmsKind) => {
    if (!validatePhone(testTo.replace(/\s/g, ""))) {
      onError("Enter your mobile number first, like 0412 345 678.");
      return;
    }
    setTesting(kind);
    try {
      const r = await sendTestSms(kind, testTo);
      onSuccess(`Test text sent (${r.segments} message${r.segments === 1 ? "" : "s"}).`);
    } catch (err) {
      onError(err instanceof SmsCommandError ? err.message : "Couldn't send the test text.");
    }
    setTesting(null);
  };

  const busy = saving || loading;

  return (
    <div data-testid="sms-settings">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          gap: "1rem",
        }}
      >
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Text messages</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--grey-muted)", margin: "0.2rem 0 0" }}>
            Text clients about their booking, in your own words.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !dirty}
          data-testid="sms-save"
          style={{
            padding: "0.55rem 1.25rem",
            background: busy || !dirty ? "var(--border-strong)" : "var(--accent)",
            color: busy || !dirty ? "var(--grey-muted)" : "var(--surface)",
            border: "none",
            borderRadius: "6px",
            cursor: busy || !dirty ? "not-allowed" : "pointer",
            fontWeight: 500,
            fontSize: "0.875rem",
            flexShrink: 0,
          }}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      <div style={card}>
        <label
          htmlFor="sms-enabled"
          style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontSize: "0.9rem" }}
        >
          <input
            id="sms-enabled"
            type="checkbox"
            checked={settings.enabled}
            disabled={loading}
            onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
            style={{ accentColor: "var(--ink)" }}
          />
          Send text messages to clients
        </label>

        <div>
          <label
            htmlFor="sms-sender"
            style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "0.3rem" }}
          >
            Sender name (what clients see instead of a number)
          </label>
          <input
            id="sms-sender"
            value={settings.senderName}
            maxLength={MAX_SENDER_LENGTH}
            disabled={loading}
            onChange={(e) => setSettings((s) => ({ ...s, senderName: e.target.value }))}
            aria-invalid={!senderOk}
            aria-describedby="sms-sender-help"
            style={{ ...input, width: "100%", maxWidth: 220, borderColor: senderOk ? "var(--border)" : "var(--error)" }}
          />
          <p
            id="sms-sender-help"
            role={senderOk ? undefined : "alert"}
            style={{ fontSize: "0.75rem", color: senderOk ? "var(--ink-muted)" : "var(--error)", margin: "0.35rem 0 0" }}
          >
            {senderOk
              ? `3 to ${MAX_SENDER_LENGTH} letters or numbers (default ${DEFAULT_SENDER_NAME}). Clients can't reply to a sender name, and it must be registered with the text provider before it is used.`
              : `Use 3 to ${MAX_SENDER_LENGTH} letters or numbers, with at least one letter.`}
          </p>
        </div>
      </div>

      {SMS_KINDS.map((kind) => {
        const template = settings.templates[kind];
        const rendered = renderSms(template, sampleValues);
        const length = smsLength(rendered);
        const problem = problems[kind];
        const label = SMS_KIND_LABELS[kind];
        const changed = template !== DEFAULT_TEMPLATES[kind];
        return (
          <div key={kind} style={{ ...card, marginTop: "1rem" }} data-testid={`sms-kind-${kind}`}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>{label.title}</h4>
                <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", margin: "0.15rem 0 0" }}>{label.when}</p>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.kinds[kind]}
                  disabled={loading}
                  data-testid={`sms-on-${kind}`}
                  onChange={(e) => setSettings((s) => ({ ...s, kinds: { ...s.kinds, [kind]: e.target.checked } }))}
                  style={{ accentColor: "var(--ink)" }}
                />
                Send
              </label>
            </div>

            <textarea
              ref={(el) => {
                fields.current[kind] = el;
              }}
              value={template}
              rows={4}
              maxLength={MAX_TEMPLATE_LENGTH + 40}
              disabled={loading}
              onChange={(e) => setTemplate(kind, e.target.value)}
              aria-label={`${label.title} wording`}
              aria-invalid={Boolean(problem)}
              data-testid={`sms-template-${kind}`}
              style={{
                ...input,
                width: "100%",
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.45,
                borderColor: problem ? "var(--error)" : "var(--border)",
              }}
            />
            {problem && (
              <p
                role="alert"
                data-testid={`sms-problem-${kind}`}
                style={{ color: "var(--error)", fontSize: "0.78rem", margin: "-0.5rem 0 0" }}
              >
                {problem}
              </p>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>Add:</span>
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  style={smallButton}
                  title={PLACEHOLDER_HELP[p]}
                  data-testid={`sms-add-${kind}-${p}`}
                  onClick={() => insert(kind, p)}
                >
                  {`{${p}}`}
                </button>
              ))}
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.72rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--ink-muted)",
                  marginBottom: "0.3rem",
                }}
              >
                What the client sees
              </div>
              <div
                data-testid={`sms-preview-${kind}`}
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "0.7rem 0.9rem",
                  fontSize: "0.88rem",
                  whiteSpace: "pre-wrap",
                  maxWidth: 420,
                }}
              >
                {rendered || "—"}
              </div>
              <p
                data-testid={`sms-length-${kind}`}
                style={{
                  fontSize: "0.75rem",
                  color: length.segments > 2 ? "var(--error)" : "var(--ink-muted)",
                  margin: "0.35rem 0 0",
                }}
              >
                {length.length} character{length.length === 1 ? "" : "s"} · {length.segments} text message
                {length.segments === 1 ? "" : "s"} ({length.encoding})
                {length.encoding === "UCS-2" &&
                  " - a curly quote, dash or emoji makes each message shorter; use plain characters to keep the cost down"}
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                style={{ ...smallButton, opacity: changed ? 1 : 0.5 }}
                disabled={!changed || loading}
                data-testid={`sms-reset-${kind}`}
                onClick={() => setTemplate(kind, DEFAULT_TEMPLATES[kind])}
              >
                Reset to default
              </button>
              <button
                type="button"
                style={smallButton}
                disabled={testing !== null || dirty || loading || !senderOk}
                title={dirty ? "Save your changes first - the test sends the saved wording" : undefined}
                data-testid={`sms-test-${kind}`}
                onClick={() => void handleTest(kind)}
              >
                {testing === kind ? "Sending…" : "Send me a test"}
              </button>
            </div>
          </div>
        );
      })}

      <div style={{ ...card, marginTop: "1rem" }}>
        <label htmlFor="sms-test-to" style={{ fontSize: "0.85rem" }}>
          Send tests to my mobile
        </label>
        <input
          id="sms-test-to"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
          placeholder="0412 345 678"
          style={{ ...input, width: "100%", maxWidth: 220 }}
          data-testid="sms-test-to"
        />
        <p style={{ fontSize: "0.75rem", color: "var(--ink-muted)", margin: 0 }}>
          A test uses the saved wording and a made-up booking, and works even while texts are switched off. Every text
          sent counts towards your provider bill. A client can be taken off the list from their page (Stop texts).
        </p>
      </div>

      {log.length > 0 && (
        <div style={{ ...card, marginTop: "1rem" }} data-testid="sms-log">
          <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>Recent texts</h4>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "0.82rem" }}>
            {log.map((r) => (
              <li
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.35rem 0",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <span>
                  {SMS_KIND_LABELS[r.kind]?.title ?? r.kind} to …{r.toEnding}
                </span>
                <span style={{ color: r.status === "failed" ? "var(--error)" : "var(--ink-muted)" }}>
                  {STATUS_WORDS[r.status] ?? r.status} · {when(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SmsSettingsEditor;
