// ConsultationSection.tsx
// In the booking drawer for a colour booking: the number to ring, when to ring, what the
// client answered, and a button to copy any allergy information onto their client record
// (the stylists see allergies on the client page and in the list). Nothing is copied unless
// the owner presses the button.

import { useState } from "react";
import { PhoneCall } from "lucide-react";
import { auth, db } from "../../../lib/firebase";
import { addClientAllergies } from "../../../lib/clientActions";
import { LABELS, allergyFromConsultation } from "../../../lib/consultation";
import { useToastContext } from "../../../context/ToastContext";
import ConsultationAnswers from "../ConsultationAnswers";
import type { Booking } from "../../../types";

interface Props {
  booking: Booking;
}

const button: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0.5rem 0.9rem",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--ink)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-body)",
};

const ConsultationSection = ({ booking }: Props) => {
  const { addToast } = useToastContext();
  const [saving, setSaving] = useState(false);
  const c = booking.consultation;
  if (!c) return null;

  const allergy = allergyFromConsultation(c);
  const waiting = booking.status === "pending";

  const copyToRecord = async () => {
    if (!booking.clientId || !allergy) return;
    setSaving(true);
    try {
      const user = auth.currentUser;
      const result = await addClientAllergies(db, booking.clientId, allergy, {
        uid: user?.uid ?? "",
        name: user?.displayName || user?.email || "Staff",
      });
      addToast(result === "added" ? "Added to the client's allergies." : "That is already on the client's record.", "success");
    } catch (err) {
      console.error("ConsultationSection copy:", err);
      addToast("Couldn't update the client record. Please try again.", "error");
    }
    setSaving(false);
  };

  return (
    <div data-testid="consultation-section">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem 1rem",
          marginBottom: "0.75rem",
          padding: "0.65rem 0.75rem",
          border: "1px solid var(--ink)",
          borderRadius: 8,
          fontSize: "var(--text-sm)",
        }}
      >
        <span>
          {waiting ? "Ring the client, then confirm this booking." : "Consultation call."} Best time:{" "}
          <strong>{LABELS.callTime[c.callTime]}</strong>
        </span>
        {booking.customerPhone && (
          <a
            href={`tel:${booking.customerPhone}`}
            data-testid="consultation-call"
            style={{ ...button, background: "var(--ink)", color: "var(--surface)", textDecoration: "none", fontWeight: 600 }}
          >
            <PhoneCall size={14} aria-hidden="true" /> Call {booking.customerPhone}
          </a>
        )}
      </div>

      <ConsultationAnswers consultation={c} />

      {allergy && booking.clientId && (
        <div style={{ marginTop: "0.75rem" }}>
          <button type="button" style={button} disabled={saving} onClick={() => void copyToRecord()} data-testid="consultation-copy">
            {saving ? "Saving..." : "Copy allergy notes to the client record"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ConsultationSection;
