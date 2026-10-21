// ApprovalRail.tsx
// "Awaiting approval" on the Today page: the oldest online bookings still
// pending, each with Approve, Decline and Suggest time.
//   Approve / Decline go through useBookingActions -> the approveBooking /
//   declineBooking commands (decline is a cancel, so it gets the Undo toast). A
//   legacy booking with no real stylist shows "Needs stylist" and an assign control
//   instead of Approve.
//   Suggest time opens the owner's messaging app with a text offering the
//   nearest free time for the same stylist — nothing is sent from here.

import { Link } from "react-router-dom";
import { Check, MessageSquare, X } from "lucide-react";
import RailCard, { EmptyNote } from "./RailCard";
import NeedsStylist from "../NeedsStylist";
import { useSalonData } from "../../../context/SalonDataContext";
import useBookingActions from "../../../hooks/useBookingActions";
import { formatWhen } from "../../../lib/bookingHistory";
import { getStylistHoursForDate } from "../../../lib/scheduling";
import {
  buildSuggestTimeMessage,
  smsHref,
  suggestAlternativeStart,
} from "../../../lib/suggestions";
import { todayString } from "../../../lib/dates";
import type { Booking } from "../../../types";

interface Props {
  // All pending bookings, oldest first
  pending: Booking[];
  // Every booking loaded — a suggestion has to avoid all of them
  allBookings: Booking[];
  nowMinutes: number;
  onOpenBooking: (id: string) => void;
}

const MAX_ROWS = 5;

const smallButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.35rem 0.7rem",
  borderRadius: "6px",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  fontFamily: "var(--font-body)",
  cursor: "pointer",
  textDecoration: "none",
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--border-strong)",
};

const ApprovalRail = ({
  pending,
  allBookings,
  nowMinutes,
  onOpenBooking,
}: Props) => {
  const { stylists, salonSettings } = useSalonData();
  const { changeStatus } = useBookingActions();
  const today = todayString();
  const shown = pending.slice(0, MAX_ROWS);

  return (
    <RailCard
      title="Awaiting approval"
      count={pending.length}
      action={
        pending.length > MAX_ROWS ? (
          <Link
            to="/admin/approvals"
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            View all
          </Link>
        ) : undefined
      }
    >
      {shown.length === 0 ? (
        <EmptyNote>Nothing waiting. New online bookings show up here.</EmptyNote>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {shown.map((b, i) => {
            const stylist = stylists.find((s) => s.id === b.stylistId);
            const alternative = suggestAlternativeStart(
              b,
              allBookings,
              getStylistHoursForDate(b.date, salonSettings, stylist?.workingHours),
              b.date === today ? nowMinutes : null,
            );
            const phone = b.customerPhone?.trim();
            return (
              <div
                key={b.id}
                style={{
                  padding: "0.75rem 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <button
                  className="bk-ghost"
                  onClick={() => onOpenBooking(b.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontSize: "var(--text-base)",
                      fontWeight: 600,
                      color: "var(--ink)",
                    }}
                  >
                    {b.customerName}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: "var(--text-sm)",
                      color: "var(--ink-muted)",
                      lineHeight: 1.4,
                    }}
                  >
                    {b.serviceName}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: "var(--text-sm)",
                      color: "var(--ink-soft)",
                      lineHeight: 1.4,
                    }}
                  >
                    {formatWhen(b.date, b.time)} · {b.stylistName}
                  </span>
                </button>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    marginTop: "0.6rem",
                  }}
                >
                  {b.stylistId === "any" ? (
                    <NeedsStylist booking={b} compact />
                  ) : (
                    <button
                      className="bk-cta"
                      onClick={() => void changeStatus(b.id, "confirmed")}
                      style={{
                        ...smallButton,
                        background: "var(--accent)",
                        color: "var(--surface)",
                        border: "1px solid var(--accent)",
                      }}
                    >
                      <Check size={13} strokeWidth={2.25} aria-hidden="true" />
                      Approve
                    </button>
                  )}
                  <button
                    className="bk-ghost"
                    onClick={() => void changeStatus(b.id, "cancelled")}
                    style={smallButton}
                  >
                    <X size={13} strokeWidth={2.25} aria-hidden="true" />
                    Decline
                  </button>
                  {phone ? (
                    <a
                      className="bk-ghost"
                      href={smsHref(phone, buildSuggestTimeMessage(b, alternative))}
                      title="Opens a text to the client suggesting another time"
                      style={smallButton}
                    >
                      <MessageSquare size={13} strokeWidth={2} aria-hidden="true" />
                      Suggest time
                    </a>
                  ) : (
                    <button
                      disabled
                      title="No phone number on this booking"
                      style={{
                        ...smallButton,
                        color: "var(--grey-muted)",
                        cursor: "not-allowed",
                      }}
                    >
                      <MessageSquare size={13} strokeWidth={2} aria-hidden="true" />
                      Suggest time
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </RailCard>
  );
};

export default ApprovalRail;
