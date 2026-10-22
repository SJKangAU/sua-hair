// EmailSettings.tsx
// Manage tab section (owner, or a stylist allowed to edit message wording) - the emails
// customers get about a booking (FR-027, DEC-053). For each of the four emails: switch it
// on or off, edit the subject, preview line, headline, opening and closing messages with
// {placeholders}, choose whether the booking details, the reference and the call button
// show, see exactly what the customer will get (a live preview of the real email), reset to
// the default, and send yourself a test. The layout is fixed so no wording can break it.
// Stored in "privateSettings/email"; the booking functions read it with the Admin SDK.

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { SALON_CONFIG } from "../../../lib/config";
import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_FIELD_LABELS,
  EMAIL_LIMITS,
  EMAIL_PLACEHOLDERS,
  EMAIL_TEXT_FIELDS,
  effectiveEmailSettings,
  emailTemplateProblems,
  renderEmail,
  type EmailSettings,
  type EmailTemplate,
  type EmailTextField,
} from "../../../lib/emailRender";
import { PLACEHOLDER_HELP, SAMPLE_BOOKING, SMS_KINDS, SMS_KIND_LABELS, type SmsKind } from "../../../lib/sms";
import { SmsCommandError, sendTestEmail } from "../../../lib/smsCommands";
import { validateEmail } from "../../../lib/validation";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const SETTINGS_PATH = ["privateSettings", "email"] as const;

const SALON = {
  name: SALON_CONFIG.salonName,
  address: SALON_CONFIG.salonAddress,
  phoneDisplay: SALON_CONFIG.salonPhone,
  phoneHref: `tel:${SALON_CONFIG.salonPhone.replace(/[^\d]/g, "")}`,
};

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
};

const input: React.CSSProperties = {
  padding: "0.5rem 0.65rem",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  fontSize: "0.9rem",
  background: "var(--surface)",
  color: "var(--ink)",
  boxSizing: "border-box",
  width: "100%",
  fontFamily: "inherit",
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

const SAMPLE = { ...SAMPLE_BOOKING, servicePrice: 95 };

const EmailSettingsEditor = ({ onSuccess, onError }: Props) => {
  const [settings, setSettings] = useState<EmailSettings>(() => effectiveEmailSettings(undefined));
  const [saved, setSaved] = useState(() => JSON.stringify(effectiveEmailSettings(undefined)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState<SmsKind | null>(null);
  const [open, setOpen] = useState<SmsKind | null>("confirmed");
  // the field a placeholder button inserts into, per email
  const focus = useRef<{ kind: SmsKind; field: EmailTextField }>({ kind: "confirmed", field: "intro" });
  const fields = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, ...SETTINGS_PATH))
      .then((snap) => {
        if (cancelled) return;
        const loaded = effectiveEmailSettings(snap.exists() ? snap.data() : undefined);
        setSettings(loaded);
        setSaved(JSON.stringify(loaded));
      })
      .catch((err) => {
        console.error("EmailSettings load:", err);
        if (!cancelled) onError("Failed to load the email settings.");
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

  const dirty = JSON.stringify(settings) !== saved;
  const problems = useMemo(
    () => Object.fromEntries(SMS_KINDS.map((k) => [k, emailTemplateProblems(settings.templates[k])])),
    [settings],
  ) as Record<SmsKind, Partial<Record<EmailTextField, string>>>;
  const anyProblem = SMS_KINDS.some((k) => Object.keys(problems[k]).length > 0);

  const patch = (kind: SmsKind, change: Partial<EmailTemplate>) =>
    setSettings((s) => ({ templates: { ...s.templates, [kind]: { ...s.templates[kind], ...change } } }));

  const insert = (kind: SmsKind, placeholder: string) => {
    const target = focus.current.kind === kind ? focus.current.field : "intro";
    const el = fields.current[`${kind}-${target}`];
    const text = settings.templates[kind][target];
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    patch(kind, { [target]: `${text.slice(0, start)}{${placeholder}}${text.slice(end)}` });
    requestAnimationFrame(() => {
      el?.focus();
      const caret = start + placeholder.length + 2;
      el?.setSelectionRange(caret, caret);
    });
  };

  const handleSave = async () => {
    if (anyProblem) {
      onError("Fix the highlighted wording first.");
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, ...SETTINGS_PATH), settings);
      setSaved(JSON.stringify(settings));
      onSuccess("Email settings saved.");
    } catch (err) {
      console.error("EmailSettings save:", err);
      onError("Failed to save the email settings. Please try again.");
    }
    setSaving(false);
  };

  const handleTest = async (kind: SmsKind) => {
    if (!validateEmail(testTo.trim())) {
      onError("Enter your email address below first.");
      return;
    }
    setTesting(kind);
    try {
      await sendTestEmail(kind, testTo.trim());
      onSuccess("Test email sent.");
    } catch (err) {
      onError(err instanceof SmsCommandError ? err.message : "Couldn't send the test email.");
    }
    setTesting(null);
  };

  const busy = saving || loading;

  return (
    <div data-testid="email-settings">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Emails</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--grey-muted)", margin: "0.2rem 0 0" }}>
            The emails clients get about their booking. You choose the words; the look is fixed.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !dirty}
          data-testid="email-save"
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

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {SMS_KINDS.map((kind) => {
          const t = settings.templates[kind];
          const label = SMS_KIND_LABELS[kind];
          const isOpen = open === kind;
          const kindProblems = problems[kind];
          const changed = JSON.stringify(t) !== JSON.stringify(DEFAULT_EMAIL_TEMPLATES[kind]);
          const built = isOpen ? renderEmail(t, SAMPLE, SALON) : null;
          return (
            <div key={kind} style={card} data-testid={`email-kind-${kind}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : kind)}
                  aria-expanded={isOpen}
                  data-testid={`email-toggle-${kind}`}
                  style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "var(--ink)" }}
                >
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>
                    {label.title} {Object.keys(kindProblems).length > 0 && <span style={{ color: "var(--error)" }}>· fix wording</span>}
                  </h4>
                  <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", margin: "0.15rem 0 0" }}>{label.when}</p>
                </button>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", cursor: "pointer", flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    disabled={loading}
                    data-testid={`email-on-${kind}`}
                    onChange={(e) => patch(kind, { enabled: e.target.checked })}
                    style={{ accentColor: "var(--ink)" }}
                  />
                  Send
                </label>
              </div>

              {isOpen && built && (
                <>
                  {EMAIL_TEXT_FIELDS.filter((f) => f !== "calendarTitle" || t.attachCalendar).map((f) => {
                    const multiline = f === "intro" || f === "closing";
                    const common = {
                      value: t[f],
                      disabled: loading,
                      "aria-label": `${label.title}: ${EMAIL_FIELD_LABELS[f]}`,
                      "aria-invalid": Boolean(kindProblems[f]),
                      "data-testid": `email-${f}-${kind}`,
                      onFocus: () => {
                        focus.current = { kind, field: f };
                      },
                      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => patch(kind, { [f]: e.target.value }),
                      style: { ...input, borderColor: kindProblems[f] ? "var(--error)" : "var(--border)" },
                    };
                    return (
                      <div key={f}>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "0.25rem" }}>
                          {EMAIL_FIELD_LABELS[f]}
                        </label>
                        {multiline ? (
                          <textarea
                            {...common}
                            ref={(el) => {
                              fields.current[`${kind}-${f}`] = el;
                            }}
                            rows={3}
                            maxLength={EMAIL_LIMITS[f] + 40}
                          />
                        ) : (
                          <input
                            {...common}
                            ref={(el) => {
                              fields.current[`${kind}-${f}`] = el;
                            }}
                            maxLength={EMAIL_LIMITS[f] + 40}
                          />
                        )}
                        {kindProblems[f] && (
                          <p role="alert" data-testid={`email-problem-${f}-${kind}`} style={{ color: "var(--error)", fontSize: "0.78rem", margin: "0.25rem 0 0" }}>
                            {kindProblems[f]}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>Add to the field you're editing:</span>
                    {EMAIL_PLACEHOLDERS.map((p) => (
                      <button key={p} type="button" style={smallButton} title={PLACEHOLDER_HELP[p]} data-testid={`email-add-${kind}-${p}`} onClick={() => insert(kind, p)}>
                        {`{${p}}`}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1.25rem" }}>
                    {(
                      [
                        ["showDetails", "Show the booking details"],
                        ["showReference", "Show the booking reference"],
                        ["callButton", "Show the call button"],
                        ["manageButton", "Show the \"Change or cancel this booking\" button"],
                        ["attachCalendar", "Attach the appointment, to add to their calendar"],
                      ] as const
                    ).map(([flag, text]) => (
                      <label key={flag} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={t[flag]}
                          disabled={loading}
                          data-testid={`email-${flag}-${kind}`}
                          onChange={(e) => patch(kind, { [flag]: e.target.checked })}
                          style={{ accentColor: "var(--ink)" }}
                        />
                        {text}
                      </label>
                    ))}
                  </div>

                  <div>
                    <div style={{ fontSize: "0.72rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: "0.3rem" }}>
                      What the client gets
                    </div>
                    <p data-testid={`email-preview-subject-${kind}`} style={{ margin: "0 0 0.4rem", fontSize: "0.85rem" }}>
                      <strong>Subject:</strong> {built.subject}
                    </p>
                    <iframe
                      title={`${label.title} preview`}
                      data-testid={`email-preview-${kind}`}
                      srcDoc={built.html}
                      sandbox=""
                      style={{ width: "100%", height: 560, border: "1px solid var(--border)", borderRadius: 8, background: "#faf9f7" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={{ ...smallButton, opacity: changed ? 1 : 0.5 }}
                      disabled={!changed || loading}
                      data-testid={`email-reset-${kind}`}
                      onClick={() => patch(kind, DEFAULT_EMAIL_TEMPLATES[kind])}
                    >
                      Reset to default
                    </button>
                    <button
                      type="button"
                      style={smallButton}
                      disabled={testing !== null || dirty || loading}
                      title={dirty ? "Save your changes first - the test sends the saved wording" : undefined}
                      data-testid={`email-test-${kind}`}
                      onClick={() => void handleTest(kind)}
                    >
                      {testing === kind ? "Sending…" : "Send me a test"}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        <div style={card}>
          <label htmlFor="email-test-to" style={{ fontSize: "0.85rem" }}>
            Send tests to my email
          </label>
          <input
            id="email-test-to"
            type="email"
            autoComplete="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            data-testid="email-test-to"
            style={{ ...input, maxWidth: 280 }}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--ink-muted)", margin: 0 }}>
            A test uses the saved wording and a made-up booking, and works even while an email is switched off. It is sent from the
            salon's sending address, so it only arrives once the email account is set up.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmailSettingsEditor;
