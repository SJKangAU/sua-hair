// OwnerNotificationsEditor.tsx
// Manage tab section (owner only) — opt in to an email for every new online
// booking. Stored in "privateSettings/notifications", NOT in the public
// "salonSettings/main" document: salonSettings is world-readable (the public
// booking calendar needs the opening hours), which would expose the owner's
// email address to anyone. See firestore.rules → privateSettings.
//
// The onBookingCreated Cloud Function reads this document with the Admin SDK.

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { validateEmail } from "../../../lib/validation";
import type { OwnerNotificationSettings } from "../../../types";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const SETTINGS_PATH = ["privateSettings", "notifications"] as const;

const OwnerNotificationsEditor = ({ onSuccess, onError }: Props) => {
  const [enabled, setEnabled] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, ...SETTINGS_PATH))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as Partial<OwnerNotificationSettings>;
        setEnabled(data.notifyOwnerByEmail === true);
        setOwnerEmail(data.ownerEmail ?? "");
      })
      .catch((err) => {
        console.error("OwnerNotificationsEditor load:", err);
        if (!cancelled) onError("Failed to load notification settings.");
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

  const handleSave = async () => {
    const trimmed = ownerEmail.trim();
    // An enabled toggle with no usable address would silently send nothing.
    if (enabled && (trimmed === "" || !validateEmail(trimmed))) {
      setEmailError("Enter a valid email address to turn notifications on.");
      return;
    }
    if (!validateEmail(trimmed)) {
      setEmailError("That doesn't look like a valid email address.");
      return;
    }
    setEmailError(null);
    setSaving(true);
    try {
      const settings: OwnerNotificationSettings = {
        notifyOwnerByEmail: enabled,
        ownerEmail: trimmed,
      };
      await setDoc(doc(db, ...SETTINGS_PATH), settings);
      onSuccess("Notification settings saved.");
    } catch (err) {
      console.error("OwnerNotificationsEditor save:", err);
      onError("Failed to save notification settings. Please try again.");
    }
    setSaving(false);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            Email Notifications
          </h3>
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--grey-muted)",
              margin: "0.2rem 0 0",
            }}
          >
            Get an email whenever a customer books online.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          style={{
            padding: "0.55rem 1.25rem",
            background:
              saving || loading ? "var(--border-strong)" : "var(--accent)",
            color: saving || loading ? "var(--grey-muted)" : "var(--surface)",
            border: "none",
            borderRadius: "6px",
            cursor: saving || loading ? "not-allowed" : "pointer",
            fontWeight: 500,
            fontSize: "0.875rem",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <label
          htmlFor="notify-owner-toggle"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          <input
            id="notify-owner-toggle"
            type="checkbox"
            checked={enabled}
            disabled={loading}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ accentColor: "var(--ink)" }}
          />
          Email me when a new booking is made
        </label>

        <div>
          <label
            htmlFor="owner-email"
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--ink-muted)",
              marginBottom: "0.3rem",
            }}
          >
            Send notifications to
          </label>
          <input
            id="owner-email"
            type="email"
            autoComplete="email"
            value={ownerEmail}
            disabled={loading}
            onChange={(e) => {
              setOwnerEmail(e.target.value);
              setEmailError(null);
            }}
            placeholder="you@example.com"
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "owner-email-error" : undefined}
            style={{
              width: "100%",
              maxWidth: "380px",
              padding: "0.5rem 0.65rem",
              border: `1px solid ${
                emailError ? "var(--error)" : "var(--border)"
              }`,
              borderRadius: "6px",
              fontSize: "0.9rem",
              background: "var(--surface)",
              color: "var(--ink)",
              boxSizing: "border-box",
            }}
          />
          {emailError && (
            <p
              id="owner-email-error"
              role="alert"
              style={{
                color: "var(--error)",
                fontSize: "0.75rem",
                margin: "0.35rem 0 0",
              }}
            >
              {emailError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnerNotificationsEditor;
