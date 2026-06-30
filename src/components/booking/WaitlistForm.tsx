// WaitlistForm.tsx
// Shown in the booking flow when no time slots are available for the chosen
// date and stylist. Lets the client join the waitlist with their name, phone,
// and preferred date. On submit writes to the Firestore waitlist collection
// and notifies the owner.

import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { writeBookingNotifications } from "../../lib/notifications";
import { cleanPhone, validatePhone, validateName } from "../../lib/validation";

interface Props {
  requestedDate: string;
  requestedStylistId?: string;
  onDone: () => void;
}

const WaitlistForm = ({ requestedDate, requestedStylistId, onDone }: Props) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const handleSubmit = async () => {
    const newErrors: { name?: string; phone?: string } = {};
    if (!validateName(name)) newErrors.name = "Please enter your full name";
    if (!validatePhone(phone))
      newErrors.phone = "Please enter a valid Australian mobile number";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const entry = {
        customerName: name.trim(),
        customerPhone: cleanPhone(phone),
        requestedDate,
        ...(requestedStylistId && requestedStylistId !== "any"
          ? { requestedStylistId }
          : {}),
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, "waitlist"), entry);

      // Notify the owner
      writeBookingNotifications({
        bookingId: docRef.id,
        customerName: name.trim(),
        stylistId: requestedStylistId ?? "any",
        stylistName: "Any available",
        date: requestedDate,
        time: "TBD",
        serviceName: "Waitlist request",
      }).catch(console.error);

      setSubmitted(true);
    } catch (err) {
      console.error("WaitlistForm submit:", err);
    }
    setSubmitting(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.85rem 1rem",
    border: "1.5px solid #e8e8e8",
    borderRadius: "8px",
    fontSize: "1rem",
    background: "#fafafa",
    color: "#0a0a0a",
    boxSizing: "border-box",
    outline: "none",
    transition: "border-color 0.15s",
  };

  if (submitted) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "2.5rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <div style={{ fontSize: "2.5rem" }}>✓</div>
        <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600 }}>
          You're on the waitlist
        </h3>
        <p style={{ margin: 0, color: "#555", fontSize: "0.9rem", maxWidth: 300, lineHeight: 1.6 }}>
          We'll be in touch as soon as a spot opens up for {requestedDate}.
        </p>
        <button
          onClick={onDone}
          style={{
            marginTop: "0.5rem",
            padding: "0.75rem 2rem",
            background: "#0a0a0a",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "0.9rem",
            fontWeight: 500,
          }}
        >
          Back to booking
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0.25rem" }}>
      <h3
        style={{
          margin: "0 0 0.35rem",
          fontSize: "1.15rem",
          fontWeight: 600,
          color: "#0a0a0a",
        }}
      >
        Join the waitlist
      </h3>
      <p style={{ margin: "0 0 1.5rem", fontSize: "0.9rem", color: "#555", lineHeight: 1.6 }}>
        No appointments are available for {requestedDate}. Leave your details
        and we'll contact you the moment a spot opens.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <input
            style={{
              ...inputStyle,
              ...(errors.name ? { borderColor: "#e53e3e" } : {}),
            }}
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((p) => ({ ...p, name: undefined }));
            }}
          />
          {errors.name && (
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "#e53e3e" }}>
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <input
            style={{
              ...inputStyle,
              ...(errors.phone ? { borderColor: "#e53e3e" } : {}),
            }}
            type="tel"
            placeholder="Mobile number"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setErrors((p) => ({ ...p, phone: undefined }));
            }}
          />
          {errors.phone && (
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "#e53e3e" }}>
              {errors.phone}
            </p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: "100%",
            padding: "0.95rem",
            background: submitting ? "#ccc" : "#0a0a0a",
            color: submitting ? "#888" : "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: submitting ? "not-allowed" : "pointer",
            fontWeight: 500,
            fontSize: "0.95rem",
            letterSpacing: "0.02em",
          }}
        >
          {submitting ? "Joining…" : "Join Waitlist"}
        </button>

        <button
          onClick={onDone}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: "0.85rem",
            padding: "0.25rem",
          }}
        >
          Choose a different date instead
        </button>
      </div>
    </div>
  );
};

export default WaitlistForm;
