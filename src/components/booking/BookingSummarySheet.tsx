// BookingSummarySheet.tsx
// Slide-up bottom sheet shown between Step 2 and Step 3
//
// Appears after the user selects a time on Step 2 and taps "Review Booking".
// Shows all selected services with individual prices, stylist, date, time,
// duration, and the estimated total before the customer commits.
//
// The backdrop click dismisses the sheet (returns to Step 2).
// "Confirm & Continue" advances to Step 3 (DetailsStep).
//
// CSS keyframes are injected locally via a <style> tag so this component is
// self-contained and does not depend on BookingForm's ANIM_CSS block.

import { parseLocalDate } from "../../lib/dates";

const SHEET_CSS = `
  @keyframes bkSheetUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  @keyframes bkOverlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

interface ServiceLine {
  id: string;
  name: string;
  priceDisplay: string; // "$45" or "$45 – $80" for first-available
  totalTime: number;
}

interface Props {
  services: ServiceLine[];
  stylistName: string;
  date: string;
  time: string;
  estimatedTotalDisplay: string; // "$120" or "$120 – $180"
  totalTime: number;
  onConfirm: () => void;
  onClose: () => void;
}

const BookingSummarySheet = ({
  services,
  stylistName,
  date,
  time,
  estimatedTotalDisplay,
  totalTime,
  onConfirm,
  onClose,
}: Props) => {
  const formattedDate = date
    ? parseLocalDate(date).toLocaleDateString("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <>
      <style>{SHEET_CSS}</style>

      {/* Fixed overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        {/* Backdrop */}
        <div
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            animation: "bkOverlayIn 0.25s ease both",
          }}
        />

        {/* Sheet card */}
        <div
          style={{
            position: "relative",
            background: "#ffffff",
            borderRadius: "20px 20px 0 0",
            padding: "1.75rem 1.5rem 2.5rem",
            maxHeight: "88vh",
            overflowY: "auto",
            animation: "bkSheetUp 0.38s cubic-bezier(0.34, 1.4, 0.64, 1) both",
          }}
        >
          {/* Drag handle */}
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "#d8d8d8",
              margin: "0 auto 1.5rem",
            }}
          />

          {/* Heading */}
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.85rem",
              fontWeight: 300,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              margin: "0 0 0.25rem",
            }}
          >
            Review Booking
          </h3>
          <p
            style={{
              fontSize: "0.82rem",
              color: "var(--grey-muted)",
              margin: "0 0 1.5rem",
            }}
          >
            Confirm everything looks right before proceeding
          </p>

          {/* Services */}
          <div
            style={{
              borderTop: "1.5px solid #0a0a0a",
              marginBottom: "1rem",
            }}
          >
            {services.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem 0",
                  borderBottom: `1px solid var(--border)`,
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      color: "var(--ink)",
                    }}
                  >
                    {s.name}
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: "0.75rem",
                      color: "var(--grey-muted)",
                    }}
                  >
                    {s.totalTime} min
                  </p>
                </div>
                <span
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  {s.priceDisplay}
                </span>
              </div>
            ))}
          </div>

          {/* Details card */}
          <div
            style={{
              background: "var(--paper)",
              borderRadius: "10px",
              padding: "1rem",
              marginBottom: "1.25rem",
              fontSize: "0.82rem",
            }}
          >
            {[
              { label: "Stylist", value: stylistName },
              { label: "Date", value: formattedDate },
              { label: "Time", value: time },
              { label: "Duration", value: `${totalTime} min` },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.375rem 0",
                }}
              >
                <span style={{ color: "var(--ink-soft)" }}>{row.label}</span>
                <span style={{ fontWeight: 500, color: "#0a0a0a" }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem 0",
              borderTop: "2px solid #0a0a0a",
              marginBottom: "1.5rem",
            }}
          >
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              Estimated Total
            </span>
            <span
              style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0a0a0a" }}
            >
              {estimatedTotalDisplay}
            </span>
          </div>

          {/* Actions */}
          <button
            onClick={onConfirm}
            style={{
              display: "block",
              width: "100%",
              padding: "1rem",
              background: "#0a0a0a",
              color: "#ffffff",
              border: "none",
              borderRadius: "10px",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.03em",
              fontFamily: "var(--font-body)",
              marginBottom: "0.75rem",
            }}
          >
            Confirm &amp; Continue
          </button>
          <button
            onClick={onClose}
            style={{
              display: "block",
              width: "100%",
              padding: "0.875rem",
              background: "transparent",
              color: "var(--ink-soft)",
              border: `1.5px solid var(--border)`,
              borderRadius: "10px",
              fontSize: "0.875rem",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            Edit Booking
          </button>
        </div>
      </div>
    </>
  );
};

export default BookingSummarySheet;
