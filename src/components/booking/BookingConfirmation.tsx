// BookingConfirmation.tsx
// "Request received" screen shown after the server accepts a booking request —
// B&W luxury theme. It is NOT a confirmation: the booking is confirmed only when
// the salon approves it (DEC-038). It shows what the SERVER decided: the stylist
// who was assigned (which matters for "Any Available Stylist") and the exact price.
//
// Calendar export buttons (marked "requested"/tentative until confirmed):
//   Google Calendar — opens a pre-filled URL in a new tab (getGoogleCalendarLink)
//   Apple / Outlook — downloads an .ics file (downloadICSFile)

import { getGoogleCalendarLink, downloadICSFile } from "../../lib/calendar";
import { parseLocalDate } from "../../lib/dates";
import { SALON_CONFIG } from "../../lib/config";
import type { BookingRequestResult } from "../../lib/bookingApi";

interface Props {
  result: BookingRequestResult;
  customerName: string;
  onReset: () => void;
}

const CONFIRM_CSS = `
  @keyframes bkConfirmIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

const BookingConfirmation = ({ result, customerName, onReset }: Props) => {
  const formattedDate = parseLocalDate(result.date).toLocaleDateString(
    "en-AU",
    { weekday: "long", day: "numeric", month: "long" },
  );

  // What the calendar links need: the request, with the service names joined
  const calendar = {
    date: result.date,
    time: result.time,
    totalTime: result.totalTime,
    stylistName: result.stylistName,
    serviceName: result.services.map((s) => s.name).join(" + "),
    servicePrice: result.total,
  };
  const holdsFor = SALON_CONFIG.pendingHoldHours;

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
            background: "var(--ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12l5 5 11-11"
              stroke="var(--surface)"
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
          Request received, {customerName.split(" ")[0]}.
        </h2>
        <p
          style={{
            fontSize: "0.82rem",
            color: "var(--grey-muted)",
            marginBottom: "2rem",
            lineHeight: 1.6,
          }}
        >
          This is not confirmed yet. We are holding this time for you and the
          salon will confirm your booking within {holdsFor} hours — we will
          email you if you gave us an address.
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
            <span style={{ color: "var(--ink-soft)" }}>
              {result.assignedAutomatically ? "Your stylist" : "Stylist"}
            </span>
            <span
              style={{ fontWeight: 500, color: "var(--ink)" }}
              data-testid="confirmation-stylist"
            >
              {result.stylistName}
            </span>
          </div>

          {/* Services rows */}
          {result.services.map((s, i) => (
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
                  {s.name} · ${s.price}
                </span>
              </div>
            ))}

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
              {result.time}
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
            <span style={{ color: "var(--ink-soft)" }}>Total</span>
            <span
              style={{ fontWeight: 700, color: "var(--ink)" }}
              data-testid="confirmation-total"
            >
              ${result.total}
            </span>
          </div>

          {result.restTime > 0 && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--grey-muted)",
                marginTop: "0.75rem",
                marginBottom: 0,
              }}
            >
              {result.activeTime} min active + {result.restTime} min setting
              time
              {result.returnTime && (
                <>
                  {" — "}
                  <strong style={{ color: "var(--ink)" }}>
                    back with you by {result.returnTime}
                  </strong>
                </>
              )}
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
            href={getGoogleCalendarLink(calendar)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "0.65rem 1.25rem",
              background: "var(--surface)",
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
            onClick={() => downloadICSFile(calendar)}
            style={{
              padding: "0.65rem 1.25rem",
              background: "var(--surface)",
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
          className="bk-cta"
          onClick={onReset}
          style={{
            padding: "0.75rem 2.5rem",
            background: "var(--ink)",
            color: "var(--surface)",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "var(--text-base)",
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
