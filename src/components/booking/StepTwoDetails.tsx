// StepTwoDetails.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Step 2 of the booking flow — customer details and booking confirmation
// ─────────────────────────────────────────────────────────────────────────────
// Shows a summary of the selected booking at the top so the customer can
// review before entering their details. Phone lookup recognises returning
// customers and pre-fills their name.
// ─────────────────────────────────────────────────────────────────────────────

import { validatePhone, validateName } from "../../lib/validation";
import { parseLocalDate } from "../../lib/dates";
import type { CustomerProfile } from "../../types";

interface Props {
  customerName: string;
  customerPhone: string;
  phoneConfirmed: boolean;
  lookingUp: boolean;
  customerProfile: CustomerProfile | null;
  errors: { name?: string; phone?: string };
  onPhoneChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPhoneConfirm: (confirmed: boolean) => void;
  // Booking summary
  stylistId: string;
  stylistName: string;
  serviceName: string;
  servicePrice: number;
  activeTime: number;
  restTime: number;
  date: string;
  time: string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  border: "1.5px solid var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: "0.9rem",
  color: "var(--text-primary)",
  background: "var(--white)",
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box",
};

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: "1.5px solid var(--error)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: "0.5rem",
};

// ── Component ─────────────────────────────────────────────────────────────────

const StepTwoDetails = ({
  customerName,
  customerPhone,
  phoneConfirmed,
  lookingUp,
  customerProfile,
  errors,
  onPhoneChange,
  onNameChange,
  onPhoneConfirm,
  stylistId,
  stylistName,
  serviceName,
  servicePrice,
  activeTime,
  restTime,
  date,
  time,
}: Props) => {
  const phoneValid = validatePhone(customerPhone);
  const nameValid = validateName(customerName);
  const phoneHasInput = customerPhone.length > 0;
  const nameHasInput = customerName.length > 0;
  const isAny = stylistId === "any" || stylistId === "";

  // Format date for display
  const formattedDate = date
    ? parseLocalDate(date).toLocaleDateString("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  return (
    <div>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.6rem",
          fontWeight: 400,
          color: "var(--text-primary)",
          marginBottom: "0.35rem",
          letterSpacing: "-0.01em",
        }}
      >
        Almost done
      </h3>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--text-muted)",
          marginBottom: "1.75rem",
        }}
      >
        Confirm your booking details below.
      </p>

      {/* ── Booking summary ───────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-md)",
          padding: "1.125rem",
          marginBottom: "1.75rem",
          border: "1px solid var(--border)",
        }}
      >
        <p
          style={{
            fontSize: "0.68rem",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: "0.75rem",
          }}
        >
          Your Booking
        </p>

        {[
          { label: "Stylist", value: isAny ? "Next available" : stylistName },
          { label: "Service", value: serviceName || "To be confirmed" },
          { label: "Date", value: formattedDate },
          { label: "Time", value: time },
        ].map((row) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.875rem",
              padding: "0.35rem 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ color: "var(--text-secondary)" }}>{row.label}</span>
            <span style={{ fontWeight: 500 }}>{row.value}</span>
          </div>
        ))}

        {/* Price and duration */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.875rem",
            paddingTop: "0.5rem",
            marginTop: "0.25rem",
          }}
        >
          <span style={{ color: "var(--text-secondary)" }}>
            {serviceName ? "From" : "Price TBC"}
          </span>
          {serviceName && (
            <span
              style={{
                fontWeight: 700,
                color: "var(--text-primary)",
                fontSize: "1rem",
              }}
            >
              ${servicePrice}
            </span>
          )}
        </div>

        {restTime > 0 && (
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginTop: "0.375rem",
            }}
          >
            {activeTime} min active + {restTime} min setting time
          </p>
        )}
      </div>

      {/* ── Mobile number ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label style={labelStyle}>Mobile Number</label>
        <input
          style={errors.phone ? inputErrorStyle : inputStyle}
          type="tel"
          placeholder="0412 345 678"
          value={customerPhone}
          onChange={(e) => onPhoneChange(e.target.value)}
        />
        {phoneHasInput && !phoneValid && (
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--error)",
              marginTop: "0.35rem",
            }}
          >
            Please enter a valid Australian mobile (e.g. 0412 345 678)
          </p>
        )}
        {errors.phone && (
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--error)",
              marginTop: "0.35rem",
            }}
          >
            {errors.phone}
          </p>
        )}
        {lookingUp && (
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              marginTop: "0.35rem",
            }}
          >
            Looking up your details...
          </p>
        )}
      </div>

      {/* ── Phone confirmation checkbox ───────────────────────────────────── */}
      {phoneValid && (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.6rem",
            marginBottom: "1.25rem",
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            cursor: "pointer",
            lineHeight: 1.5,
          }}
        >
          <input
            type="checkbox"
            checked={phoneConfirmed}
            onChange={(e) => onPhoneConfirm(e.target.checked)}
            style={{
              marginTop: "2px",
              cursor: "pointer",
              accentColor: "var(--text-primary)",
            }}
          />
          <span>
            I confirm{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {customerPhone}
            </strong>{" "}
            is my correct mobile number
          </span>
        </label>
      )}

      {/* ── Returning customer banner ─────────────────────────────────────── */}
      {customerProfile && !lookingUp && (
        <div
          style={{
            background: "var(--gold-subtle)",
            border: "1px solid var(--gold-light)",
            borderRadius: "var(--radius-md)",
            padding: "1rem",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
          }}
        >
          <p
            style={{
              fontWeight: 600,
              color: "var(--gold-dark)",
              marginBottom: "0.25rem",
            }}
          >
            Welcome back, {customerProfile.name}! 👋
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
            {customerProfile.visitCount === 1
              ? "This will be your 2nd visit — thank you for coming back!"
              : `You've visited us ${customerProfile.visitCount} times — we appreciate your loyalty!`}
          </p>
        </div>
      )}

      {/* ── New customer banner ───────────────────────────────────────────── */}
      {phoneValid && !customerProfile && !lookingUp && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "1rem",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
          }}
        >
          Welcome! Looks like it's your first time with us 🎉
        </div>
      )}

      {/* ── Full name ─────────────────────────────────────────────────────── */}
      <div>
        <label style={labelStyle}>Full Name</label>
        <input
          style={errors.name ? inputErrorStyle : inputStyle}
          type="text"
          placeholder="Jane Smith"
          value={customerName}
          onChange={(e) => onNameChange(e.target.value)}
        />
        {nameHasInput && !nameValid && (
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--error)",
              marginTop: "0.35rem",
            }}
          >
            Name must be at least 2 characters and contain letters only
          </p>
        )}
        {errors.name && (
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--error)",
              marginTop: "0.35rem",
            }}
          >
            {errors.name}
          </p>
        )}
      </div>
    </div>
  );
};

export default StepTwoDetails;
