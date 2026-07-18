// BookingConfirmation.tsx
// Confirmation screen shown after a successful booking — B&W luxury theme
//
// Renders booking.services[] when present (new multi-service bookings) and
// falls back to the legacy booking.serviceName field for older single-service
// records and admin-created entries.
//
// Calendar export buttons:
//   Google Calendar — opens a pre-filled URL in a new tab (getGoogleCalendarLink)
//   Apple / Outlook — downloads an .ics file (downloadICSFile)
// Both helpers live in lib/calendar.ts and accept the full Booking object.

import { getGoogleCalendarLink, downloadICSFile } from "../../lib/calendar";
import { parseLocalDate } from "../../lib/dates";
import type { Booking } from "../../types";

interface Props {
  booking: Omit<Booking, "id">;
  onReset: () => void;
}

const CONFIRM_CSS = `
  @keyframes bkConfirmIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

const BookingConfirmation = ({ booking, onReset }: Props) => {
  const formattedDate = parseLocalDate(booking.date).toLocaleDateString(
    "en-AU",
    { weekday: "long", day: "numeric", month: "long" },
  );

  const hasMultipleServices = booking.services && booking.services.length > 0;

  return (
    <>
      <style>{CONFIRM_CSS}</style>
      <div
        style={{
          padding: "2.5rem 1.75rem",
          fontFamily: "var(--font-body)",
          textAlign: "center",
          animation: "bkConfirmIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        {/* Check circle */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#0a0a0a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12l5 5 11-11"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.65rem, 6.5vw, 2.1rem)",
            fontWeight: 300,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            margin: "0 0 0.5rem",
            lineHeight: 1.15,
          }}
        >
          We can't wait to see you,{" "}
          {booking.customerName.split(" ")[0]}.
        </h2>
        <p
          style={{
            fontSize: "0.82rem",
            color: "var(--grey-muted)",
            marginBottom: "2rem",
          }}
        >
          Your booking is confirmed — details below.
        </p>

        {/* Booking details */}
        <div
          style={{
            background: "var(--paper)",
            borderRadius: "10px",
            padding: "1.25rem",
            marginBottom: "1.75rem",
            textAlign: "left",
            border: `1px solid var(--border)`,
          }}
        >
          {/* Stylist row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.875rem",
              padding: "0.4rem 0",
              borderBottom: `1px solid var(--border)`,
            }}
          >
            <span style={{ color: "var(--ink-soft)" }}>Stylist</span>
            <span style={{ fontWeight: 500, color: "var(--ink)" }}>
              {booking.stylistName}
            </span>
          </div>

          {/* Services rows */}
          {hasMultipleServices ? (
            booking.services!.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.875rem",
                  padding: "0.4rem 0",
                  borderBottom: `1px solid var(--border)`,
                }}
              >
                <span style={{ color: "var(--ink-soft)" }}>
                  {i === 0 ? "Service" : ""}
                </span>
                <span style={{ fontWeight: 500, color: "var(--ink)" }}>
                  {s.name}
                </span>
              </div>
            ))
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.875rem",
                padding: "0.4rem 0",
                borderBottom: `1px solid var(--border)`,
              }}
            >
              <span style={{ color: "var(--ink-soft)" }}>Service</span>
              <span style={{ fontWeight: 500, color: "var(--ink)" }}>
                {booking.serviceName}
              </span>
            </div>
          )}

          {/* Date */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.875rem",
              padding: "0.4rem 0",
              borderBottom: `1px solid var(--border)`,
            }}
          >
            <span style={{ color: "var(--ink-soft)" }}>Date</span>
            <span style={{ fontWeight: 500, color: "var(--ink)" }}>
              {formattedDate}
            </span>
          </div>

          {/* Time */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.875rem",
              padding: "0.4rem 0",
              borderBottom: `1px solid var(--border)`,
            }}
          >
            <span style={{ color: "var(--ink-soft)" }}>Time</span>
            <span style={{ fontWeight: 500, color: "var(--ink)" }}>
              {booking.time}
            </span>
          </div>

          {/* Total */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.875rem",
              padding: "0.5rem 0 0",
            }}
          >
            <span style={{ color: "var(--ink-soft)" }}>Estimated Total</span>
            <span style={{ fontWeight: 700, color: "var(--ink)" }}>
              {booking.stylistId === "any"
                ? `from $${booking.servicePrice}`
                : `$${booking.servicePrice}`}
            </span>
          </div>

          {booking.restTime > 0 && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--grey-muted)",
                marginTop: "0.75rem",
                marginBottom: 0,
              }}
            >
              {booking.activeTime} min active + {booking.restTime} min setting
              time
            </p>
          )}
        </div>

        {/* Calendar buttons */}
        <p
          style={{
            fontSize: "0.68rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--grey-muted)",
            marginBottom: "0.75rem",
          }}
        >
          Add to calendar
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            justifyContent: "center",
            marginBottom: "1.75rem",
          }}
        >
          <a
            href={getGoogleCalendarLink(booking)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "0.65rem 1.25rem",
              background: "#ffffff",
              border: `1.5px solid var(--border)`,
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "0.82rem",
              color: "var(--ink)",
              fontFamily: "var(--font-body)",
              fontWeight: 500,
              transition: "border-color 0.15s ease",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = "var(--ink)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = "var(--border)")
            }
          >
            Google Calendar
          </a>
          <button
            onClick={() => downloadICSFile(booking)}
            style={{
              padding: "0.65rem 1.25rem",
              background: "#ffffff",
              border: `1.5px solid var(--border)`,
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.82rem",
              color: "var(--ink)",
              fontFamily: "var(--font-body)",
              fontWeight: 500,
              transition: "border-color 0.15s ease",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = "var(--ink)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = "var(--border)")
            }
          >
            Apple / Outlook
          </button>
        </div>

        {/* Contact note */}
        <p
          style={{
            fontSize: "0.82rem",
            color: "var(--grey-muted)",
            marginBottom: "1.75rem",
          }}
        >
          Need to make changes? Call us on{" "}
          <a
            href="tel:0395690840"
            style={{
              color: "var(--ink)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            (03) 9569 0840
          </a>
        </p>

        {/* Book again */}
        <button
          onClick={onReset}
          style={{
            padding: "0.75rem 2.5rem",
            background: "#0a0a0a",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 500,
            fontFamily: "var(--font-body)",
            letterSpacing: "0.04em",
          }}
        >
          Make another booking
        </button>
      </div>
    </>
  );
};

export default BookingConfirmation;
