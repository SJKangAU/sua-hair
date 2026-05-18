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

const inputStyle = {
  width: "100%",
  padding: "0.65rem",
  border: "1px solid #ddd",
  borderRadius: "6px",
  fontSize: "1rem",
  marginTop: "0.25rem",
  boxSizing: "border-box" as const,
};

const inputErrorStyle = {
  ...inputStyle,
  border: "1px solid #e24b4a",
};

const errorTextStyle = {
  color: "#e24b4a",
  fontSize: "0.8rem",
  marginTop: "0.25rem",
  display: "block" as const,
};

const labelStyle = {
  display: "block" as const,
  marginBottom: "1rem",
  fontWeight: 500,
  fontSize: "0.95rem",
};

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
  activeTime,
  restTime,
  date,
  time,
}: Props) => {
  const phoneValid = validatePhone(customerPhone);
  const nameValid = validateName(customerName);
  const phoneHasInput = customerPhone.length > 0;
  const nameHasInput = customerName.length > 0;

  return (
    <div>
      <h3 style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
        Almost done!
      </h3>
      <p
        style={{
          color: "#6b6b6b",
          fontSize: "0.875rem",
          marginBottom: "1.5rem",
        }}
      >
        Enter your details to confirm the booking below.
      </p>

      {/* Booking summary — shown at top so they see what they're confirming */}
      <div
        style={{
          background: "#f5f0e8",
          borderRadius: "8px",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          fontSize: "0.875rem",
          lineHeight: 1.8,
          border: "1px solid #e8ddd0",
        }}
      >
        <p
          style={{ fontWeight: 600, marginBottom: "0.25rem", color: "#1a1a1a" }}
        >
          Your Booking
        </p>
        <p>
          <strong>Stylist:</strong> {stylistName}
        </p>
        <p>
          <strong>Service:</strong> {serviceName} — from ${servicePrice}
        </p>
        {restTime > 0 && (
          <p style={{ color: "#6b6b6b", fontSize: "0.8rem" }}>
            {activeTime} min active + {restTime} min setting time
          </p>
        )}
        <p>
          <strong>Date:</strong> {date}
        </p>
        <p>
          <strong>Time:</strong> {time}
        </p>
      </div>

      {/* Mobile number */}
      <label style={labelStyle}>
        Mobile Number
        <input
          style={errors.phone ? inputErrorStyle : inputStyle}
          type="tel"
          placeholder="e.g. 0412 345 678"
          value={customerPhone}
          onChange={(e) => onPhoneChange(e.target.value)}
        />
        {phoneHasInput && !phoneValid && (
          <span style={errorTextStyle}>
            Please enter a valid Australian mobile number (e.g. 0412 345 678)
          </span>
        )}
        {errors.phone && <span style={errorTextStyle}>{errors.phone}</span>}
        {lookingUp && (
          <span
            style={{
              fontSize: "0.8rem",
              color: "#6b6b6b",
              display: "block",
              marginTop: "0.25rem",
            }}
          >
            Looking up your details...
          </span>
        )}
      </label>

      {/* Phone confirmation checkbox */}
      {phoneValid && (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
            marginBottom: "1rem",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={phoneConfirmed}
            onChange={(e) => onPhoneConfirm(e.target.checked)}
            style={{ marginTop: "2px", cursor: "pointer" }}
          />
          <span>
            I confirm <strong>{customerPhone}</strong> is my correct mobile
            number
          </span>
        </label>
      )}

      {/* Returning customer banner */}
      {customerProfile && !lookingUp && (
        <div
          style={{
            background: "#fdf6ec",
            border: "1px solid #c9a96e",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}
        >
          <p style={{ fontWeight: 600, color: "#c9a96e" }}>
            Welcome back, {customerProfile.name}! 👋
          </p>
          <p style={{ color: "#6b6b6b", marginTop: "0.25rem" }}>
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
            background: "#f0f7ff",
            border: "1px solid #b5d4f4",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.9rem",
            color: "#6b6b6b",
          }}
        >
          Welcome! Looks like it's your first time with us 🎉
        </div>
      )}

      {/* Full name */}
      <label style={labelStyle}>
        Full Name
        <input
          style={errors.name ? inputErrorStyle : inputStyle}
          type="text"
          placeholder="e.g. Jane Smith"
          value={customerName}
          onChange={(e) => onNameChange(e.target.value)}
        />
        {nameHasInput && !nameValid && (
          <span style={errorTextStyle}>
            Name must be at least 2 characters and contain letters only
          </span>
        )}
        {errors.name && <span style={errorTextStyle}>{errors.name}</span>}
      </label>
    </div>
  );
};

export default StepThreeDetails;
