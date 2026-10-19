// WaitlistRail.tsx
// The waitlist on the Today page: clients who asked to be told if a time opens
// up, soonest request first. "Offer slot" finds the next free stretch on the
// day they asked for (and with their stylist, if they named one), opens the
// owner's messaging app with the offer written out, and marks the entry
// contacted. Nothing is sent from here — the owner presses send in their own
// messages app. With no opening that day the button says so and stays off.

import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import RailCard, { EmptyNote } from "./RailCard";
import { useSalonData } from "../../../context/SalonDataContext";
import { useToastContext } from "../../../context/ToastContext";
import useWaitlist from "../../../hooks/useWaitlist";
import { formatDayShort, formatWhen } from "../../../lib/bookingHistory";
import { findNextOpening } from "../../../lib/dayGlance";
import { buildOfferSlotMessage, smsHref } from "../../../lib/suggestions";
import { minutesToTimeString } from "../../../lib/scheduling";
import { todayString } from "../../../lib/dates";
import type { Booking } from "../../../types";

interface Props {
  bookings: Booking[];
  nowMinutes: number;
}

const MAX_ROWS = 4;

const WaitlistRail = ({ bookings, nowMinutes }: Props) => {
  const { entries, updateStatus } = useWaitlist();
  const { stylists, salonSettings } = useSalonData();
  const { addToast } = useToastContext();
  const today = todayString();

  // Pending requests for today or later, soonest day first (oldest request
  // first within a day — the list arrives oldest first and the sort is stable)
  const pending = entries
    .filter((e) => e.status === "pending" && e.requestedDate >= today)
    .sort((a, b) => a.requestedDate.localeCompare(b.requestedDate));
  const shown = pending.slice(0, MAX_ROWS);

  const handleOffered = async (id: string, name: string) => {
    try {
      await updateStatus(id, "contacted");
      addToast(`${name} marked as contacted`, "success");
    } catch {
      addToast("Couldn't mark them as contacted. Please try again.", "error");
    }
  };

  return (
    <RailCard
      title="Waitlist"
      count={pending.length}
      action={
        <Link
          to="/admin/bookings"
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          Manage
        </Link>
      }
    >
      {shown.length === 0 ? (
        <EmptyNote>No one is waiting for a time.</EmptyNote>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {shown.map((entry, i) => {
            const opening = findNextOpening({
              date: entry.requestedDate,
              today,
              nowMinutes,
              stylists,
              settings: salonSettings,
              bookings,
              onlyStylistId: entry.requestedStylistId,
            });
            const wantedStylist =
              entry.requestedStylistId && entry.requestedStylistId !== "any"
                ? stylists.find((s) => s.id === entry.requestedStylistId)?.name
                : null;
            const phone = entry.customerPhone?.trim();
            const canOffer = Boolean(opening && phone);

            return (
              <div
                key={entry.id}
                style={{
                  padding: "0.75rem 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--text-base)",
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  {entry.customerName}
                </p>
                <p
                  style={{
                    margin: "1px 0 0",
                    fontSize: "var(--text-sm)",
                    color: "var(--ink-muted)",
                  }}
                >
                  {formatDayShort(entry.requestedDate)} ·{" "}
                  {wantedStylist ?? "Any stylist"}
                </p>
                {canOffer && opening ? (
                  <a
                    className="bk-ghost"
                    href={smsHref(
                      phone as string,
                      buildOfferSlotMessage(
                        entry.customerName,
                        entry.requestedDate,
                        opening.start,
                        opening.stylistName,
                      ),
                    )}
                    onClick={() =>
                      void handleOffered(entry.id, entry.customerName)
                    }
                    title={`Opens a text offering ${formatWhen(
                      entry.requestedDate,
                      minutesToTimeString(opening.start),
                    )} with ${opening.stylistName}`}
                    style={offerStyle(true)}
                  >
                    <CalendarClock size={13} strokeWidth={2} aria-hidden="true" />
                    Offer slot · {minutesToTimeString(opening.start)}
                  </a>
                ) : (
                  <button
                    disabled
                    title={
                      phone
                        ? "No opening on that day"
                        : "No phone number for this client"
                    }
                    style={offerStyle(false)}
                  >
                    <CalendarClock size={13} strokeWidth={2} aria-hidden="true" />
                    {phone ? "No opening" : "No phone number"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </RailCard>
  );
};

const offerStyle = (enabled: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  marginTop: "0.5rem",
  padding: "0.35rem 0.7rem",
  borderRadius: "6px",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  fontFamily: "var(--font-body)",
  textDecoration: "none",
  background: "transparent",
  color: enabled ? "var(--ink)" : "var(--grey-muted)",
  border: "1px solid var(--border-strong)",
  cursor: enabled ? "pointer" : "not-allowed",
});

export default WaitlistRail;
