// StepThreeDetails.tsx
// Step 3 of the booking flow (was StepOneDetails)
// Customer enters name and phone — shown last so they see the booking first
// Includes a booking summary card for final review before confirmation
// Phone lookup still works — recognises returning customers

import { validatePhone, validateName } from "../../lib/validation";
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
  // Booking summary props
  stylistName: string;
  serviceName: string;
  servicePrice: number;
  activeTime: number;
  restTime: number;
  date: string;
  time: string;
}

const StepThreeDetails = ({
  customerName,
  customerPhone,
  phoneConfirmed,
  lookingUp,
  customerProfile,
  errors,
  onPhoneChange,
  onNameChange,
  onPhoneConfirm,
  stylistName,
  serviceName,
  servicePrice,
  date,
  time,
}: Props) => {
  const phoneValid = validatePhone(customerPhone);
  const nameValid = validateName(customerName);
  const phoneHasInput = customerPhone.length > 0;
  const nameHasInput = customerName.length > 0;

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
        Enter your details to confirm the booking below.
      </p>

      {/* Booking summary */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-md)",
          padding: "1.25rem",
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
            marginBottom: "0.875rem",
          }}
        >
          Booking Summary
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            fontSize: "0.875rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Stylist</span>
            <span style={{ fontWeight: 500 }}>{stylistName}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Service</span>
            <span style={{ fontWeight: 500 }}>{serviceName}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Date</span>
            <span style={{ fontWeight: 500 }}>{date}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Time</span>
            <span style={{ fontWeight: 500 }}>{time}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: "0.5rem",
              borderTop: "1px solid var(--border)",
              marginTop: "0.25rem",
            }}
          >
            <span style={{ color: "var(--text-secondary)" }}>From</span>
            <span
              style={{
                fontWeight: 600,
                color: "var(--text-primary)",
                fontSize: "1rem",
              }}
            >
              ${servicePrice}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile number */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label
          style={{
            display: "block",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          Mobile Number
        </label>
        <input
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: `1.5px solid ${
              errors.phone ? "var(--error)" : "var(--border)"
            }`,
            borderRadius: "var(--radius-md)",
            fontSize: "0.9rem",
            color: "var(--text-primary)",
            background: "var(--white)",
            fontFamily: "var(--font-body)",
            outline: "none",
            boxSizing: "border-box" as const,
          }}
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

      {/* Phone confirmation */}
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

      {/* Returning customer banner */}
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
              ? "This will be your 2nd visit — we appreciate you coming back!"
              : `You've visited us ${customerProfile.visitCount} times — thank you for your loyalty!`}
          </p>
        </div>
      )}

      {/* New customer banner */}
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

      {/* Full name */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          Full Name
        </label>
        <input
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: `1.5px solid ${
              errors.name ? "var(--error)" : "var(--border)"
            }`,
            borderRadius: "var(--radius-md)",
            fontSize: "0.9rem",
            color: "var(--text-primary)",
            background: "var(--white)",
            fontFamily: "var(--font-body)",
            outline: "none",
            boxSizing: "border-box" as const,
          }}
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

export default StepThreeDetails;
