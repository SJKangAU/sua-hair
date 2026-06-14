// DetailsStep.tsx
// Step 3 — customer details with a compact booking summary at the top

import { parseLocalDate } from "../../lib/dates";
import type { CustomerProfile } from "../../types";

interface SelectedServiceDisplay {
  id: string;
  name: string;
  resolvedPrice: number;
  totalTime: number;
}

interface Props {
  selectedServices: SelectedServiceDisplay[];
  stylistName: string;
  date: string;
  time: string;
  totalTime: number;
  estimatedTotal: number;
  customerName: string;
  customerPhone: string;
  notes: string;
  lookingUp: boolean;
  customerProfile: CustomerProfile | null;
  errors: { name?: string; phone?: string };
  onPhoneChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: "0.65rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#555555",
  marginBottom: "0.5rem",
};

const INPUT_BASE: React.CSSProperties = {
  width: "100%",
  padding: "0.875rem 1rem",
  border: "1.5px solid #e0e0e0",
  borderRadius: "8px",
  fontSize: "0.9rem",
  background: "#ffffff",
  color: "#0a0a0a",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "var(--font-body)",
  transition: "border-color 0.15s ease",
};

const DetailsStep = ({
  selectedServices,
  stylistName,
  date,
  time,
  totalTime,
  estimatedTotal,
  customerName,
  customerPhone,
  notes,
  lookingUp,
  customerProfile,
  errors,
  onPhoneChange,
  onNameChange,
  onNotesChange,
}: Props) => {
  const formattedDate = date
    ? parseLocalDate(date).toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "long",
      })
    : "";

  return (
    <div>
      {/* Heading */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2rem",
            fontWeight: 300,
            color: "#0a0a0a",
            letterSpacing: "-0.01em",
            margin: "0 0 0.25rem",
            lineHeight: 1.15,
          }}
        >
          Your Details
        </h2>
        <p style={{ fontSize: "0.85rem", color: "#999999", margin: 0 }}>
          Almost there — just a few details
        </p>
      </div>

      {/* Compact booking summary */}
      <div
        style={{
          background: "#f8f8f8",
          borderRadius: "10px",
          padding: "1.125rem",
          marginBottom: "1.75rem",
        }}
      >
        <p
          style={{
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#aaaaaa",
            margin: "0 0 0.875rem",
          }}
        >
          Your Booking
        </p>

        {/* Services */}
        {selectedServices.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.375rem",
            }}
          >
            <span style={{ fontSize: "0.82rem", color: "#0a0a0a" }}>
              {s.name}
            </span>
            <span
              style={{ fontSize: "0.82rem", fontWeight: 600, color: "#0a0a0a" }}
            >
              ${s.resolvedPrice}
            </span>
          </div>
        ))}

        {/* Stylist / date / time */}
        <div
          style={{
            borderTop: "1px solid #e8e8e8",
            marginTop: "0.75rem",
            paddingTop: "0.75rem",
          }}
        >
          <p
            style={{ margin: "0 0 2px", fontSize: "0.78rem", color: "#555555" }}
          >
            {stylistName}
          </p>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "#555555" }}>
            {formattedDate}
            {time ? ` · ${time}` : ""}
            {totalTime ? ` · ${totalTime} min` : ""}
          </p>
        </div>

        {/* Total */}
        <div
          style={{
            borderTop: "1px solid #e8e8e8",
            marginTop: "0.75rem",
            paddingTop: "0.75rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{ fontSize: "0.78rem", fontWeight: 600, color: "#0a0a0a" }}
          >
            Estimated Total
          </span>
          <span style={{ fontSize: "1rem", fontWeight: 700, color: "#0a0a0a" }}>
            ${estimatedTotal}
          </span>
        </div>
      </div>

      {/* Form fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Phone */}
        <div>
          <label style={LABEL_STYLE}>Mobile Number</label>
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="e.g. 0412 345 678"
            style={{
              ...INPUT_BASE,
              borderColor: errors.phone ? "#e24b4a" : "#e0e0e0",
            }}
          />
          {errors.phone && (
            <p
              style={{
                color: "#e24b4a",
                fontSize: "0.75rem",
                marginTop: "0.375rem",
              }}
            >
              {errors.phone}
            </p>
          )}
          {lookingUp && (
            <p
              style={{
                color: "#aaaaaa",
                fontSize: "0.75rem",
                marginTop: "0.375rem",
              }}
            >
              Looking up your details...
            </p>
          )}
          {customerProfile && !lookingUp && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "#f0f7f0",
                border: "1px solid #c0d8c0",
                borderRadius: "6px",
                fontSize: "0.75rem",
                color: "#2d6a4f",
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
            >
              <span>✓</span>
              <span>
                Welcome back, <strong>{customerProfile.name}</strong>!{" "}
                {customerProfile.visitCount} previous visit
                {customerProfile.visitCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Name */}
        <div>
          <label style={LABEL_STYLE}>Full Name</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Your full name"
            style={{
              ...INPUT_BASE,
              borderColor: errors.name ? "#e24b4a" : "#e0e0e0",
            }}
          />
          {errors.name && (
            <p
              style={{
                color: "#e24b4a",
                fontSize: "0.75rem",
                marginTop: "0.375rem",
              }}
            >
              {errors.name}
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label style={LABEL_STYLE}>
            Notes{" "}
            <span
              style={{
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: 0,
                color: "#aaaaaa",
              }}
            >
              (optional)
            </span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Any special requests or preferences..."
            rows={3}
            style={{
              ...INPUT_BASE,
              resize: "vertical",
              lineHeight: 1.5,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DetailsStep;
