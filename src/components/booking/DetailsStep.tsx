// DetailsStep.tsx
// Step 3 — customer details form with a compact booking summary at the top
//
// Receives selectedServices with priceDisplay already computed (accounting
// for the chosen stylist level), so this component does no price maths.
//
// Phone number is entered manually — the public form deliberately never
// looks up a customer's identity by phone: `customerLookups` reads are
// staff-only (see firestore.rules), because a get-by-phone would let an
// anonymous visitor learn another customer's name and visit count just
// by knowing/guessing their number. See BookingForm.handlePhoneChange.
//
// Validation errors (phone / name) are set by BookingForm on submit and
// cleared here on each keystroke so feedback disappears as soon as the user
// starts correcting.

import { parseLocalDate } from "../../lib/dates";

interface SelectedServiceDisplay {
  id: string;
  name: string;
  priceDisplay: string; // "$45" or "$45 – $80" for first-available
  totalTime: number;
}

interface Props {
  selectedServices: SelectedServiceDisplay[];
  stylistName: string;
  date: string;
  time: string;
  totalTime: number;
  estimatedTotalDisplay: string; // "$120" or "$120 – $180"
  customerName: string;
  customerPhone: string;
  notes: string;
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
  color: "var(--ink-soft)",
  marginBottom: "0.5rem",
};

const INPUT_BASE: React.CSSProperties = {
  width: "100%",
  padding: "0.875rem 1rem",
  border: `1.5px solid var(--border)`,
  borderRadius: "8px",
  fontSize: "1rem", // 16px minimum — below this iOS Safari auto-zooms on focus
  background: "var(--surface)",
  color: "var(--ink)",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "var(--font-body)",
  transition: "border-color var(--transition-fast)",
};

const DetailsStep = ({
  selectedServices,
  stylistName,
  date,
  time,
  totalTime,
  estimatedTotalDisplay,
  customerName,
  customerPhone,
  notes,
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
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            margin: "0 0 0.25rem",
            lineHeight: 1.15,
          }}
        >
          Your Details
        </h2>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--grey-muted)",
            margin: 0,
          }}
        >
          Almost there — just a few details
        </p>
      </div>

      {/* Compact booking summary */}
      <div
        style={{
          background: "var(--paper)",
          borderRadius: "10px",
          padding: "1.125rem",
          marginBottom: "1.75rem",
        }}
      >
        <p
          style={{
            fontSize: "var(--text-2xs)",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--grey-muted)",
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
            <span style={{ fontSize: "var(--text-sm)", color: "var(--ink)" }}>
              {s.name}
            </span>
            <span
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              {s.priceDisplay}
            </span>
          </div>
        ))}

        {/* Stylist / date / time */}
        <div
          style={{
            borderTop: `1px solid var(--border)`,
            marginTop: "0.75rem",
            paddingTop: "0.75rem",
          }}
        >
          <p
            style={{
              margin: "0 0 2px",
              fontSize: "var(--text-xs)",
              color: "var(--ink-muted)",
            }}
          >
            {stylistName}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-xs)",
              color: "var(--ink-muted)",
            }}
          >
            {formattedDate}
            {time ? ` · ${time}` : ""}
            {totalTime ? ` · ${totalTime} min` : ""}
          </p>
        </div>

        {/* Total */}
        <div
          style={{
            borderTop: `1px solid var(--border)`,
            marginTop: "0.75rem",
            paddingTop: "0.75rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            Estimated Total
          </span>
          <span
            style={{
              fontSize: "var(--text-md)",
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            {estimatedTotalDisplay}
          </span>
        </div>
      </div>

      {/* Form fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Phone */}
        <div>
          <label htmlFor="booking-phone" style={LABEL_STYLE}>
            Mobile Number
          </label>
          <input
            id="booking-phone"
            type="tel"
            autoComplete="tel"
            value={customerPhone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="e.g. 0412 345 678"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "booking-phone-error" : undefined}
            style={{
              ...INPUT_BASE,
              borderColor: errors.phone ? "var(--error)" : "var(--border)",
            }}
          />
          {errors.phone && (
            <p
              id="booking-phone-error"
              role="alert"
              style={{
                color: "var(--error)",
                fontSize: "0.75rem",
                marginTop: "0.375rem",
              }}
            >
              {errors.phone}
            </p>
          )}
        </div>

        {/* Name */}
        <div>
          <label htmlFor="booking-name" style={LABEL_STYLE}>
            Full Name
          </label>
          <input
            id="booking-name"
            type="text"
            autoComplete="name"
            value={customerName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Your full name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "booking-name-error" : undefined}
            style={{
              ...INPUT_BASE,
              borderColor: errors.name ? "var(--error)" : "var(--border)",
            }}
          />
          {errors.name && (
            <p
              id="booking-name-error"
              role="alert"
              style={{
                color: "var(--error)",
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
          <label htmlFor="booking-notes" style={LABEL_STYLE}>
            Notes{" "}
            <span
              style={{
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: 0,
                color: "var(--grey-muted)",
              }}
            >
              (optional)
            </span>
          </label>
          <textarea
            id="booking-notes"
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
