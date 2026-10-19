// MobileAgenda.tsx
// Today on a phone (under 900px): the timeline grid is too wide to be useful,
// so the day becomes a list. Stylist filter chips on top; below, the day's
// bookings in time order as cards with the next step one tap away — Approve /
// Decline for a pending request, Start service for a booking that is here,
// Complete once it is under way — and between them the free stretches as
// "free for 45 min, + Book" rows. Tapping a card opens the booking drawer.
// Every status change goes through useBookingActions, so toasts, Undo and the
// restore checks match the rest of the admin.

import { useMemo, useState } from "react";
import { Check, Plus, Scissors, X, CircleCheck } from "lucide-react";
import Badge from "../../ui/Badge";
import { useBookingContext } from "../../../context/BookingContext";
import { useSalonData } from "../../../context/SalonDataContext";
import useBookingActions from "../../../hooks/useBookingActions";
import useNowMinutes from "../../../hooks/useNowMinutes";
import {
  buildAgenda,
  formatFreeDuration,
  type AgendaStylist,
} from "../../../lib/agenda";
import {
  getStylistHoursForDate,
  minutesToTimeString,
  timeStringToMinutes,
} from "../../../lib/scheduling";
import { todayString } from "../../../lib/dates";
import type { Booking, BookingStatus } from "../../../types";

interface Props {
  selectedDate: string;
  onOpenBooking: (id: string) => void;
  onBook: (stylistId: string, time: string) => void;
}

const UNASSIGNED_ID = "any";

// The one-tap next step for each status (44px touch targets below)
const NEXT_STEP: Partial<
  Record<BookingStatus, { status: BookingStatus; label: string }>
> = {
  confirmed: { status: "in_service", label: "Start service" },
  arrived: { status: "in_service", label: "Start service" },
  in_service: { status: "completed", label: "Complete" },
};

const actionButton: React.CSSProperties = {
  flex: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.4rem",
  minHeight: "44px",
  padding: "0.5rem 0.75rem",
  borderRadius: "8px",
  fontSize: "var(--text-base)",
  fontWeight: 600,
  fontFamily: "var(--font-body)",
  cursor: "pointer",
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--border-strong)",
};

const filledAction: React.CSSProperties = {
  ...actionButton,
  background: "var(--accent)",
  color: "var(--surface)",
  border: "1px solid var(--accent)",
};

const MobileAgenda = ({ selectedDate, onOpenBooking, onBook }: Props) => {
  const { bookings } = useBookingContext();
  const { stylists, salonSettings } = useSalonData();
  const { changeStatus } = useBookingActions();
  const nowMinutes = useNowMinutes();
  const [filter, setFilter] = useState("all");

  const today = todayString();
  const dayBookings = useMemo(
    () => bookings.filter((b) => b.date === selectedDate),
    [bookings, selectedDate],
  );

  // Who is working today (plus an "Unassigned" chip if any booking has no
  // stylist yet)
  const agendaStylists: AgendaStylist[] = useMemo(
    () =>
      stylists.map((s) => ({
        id: s.id,
        name: s.name,
        hours: getStylistHoursForDate(selectedDate, salonSettings, s.workingHours),
      })),
    [stylists, selectedDate, salonSettings],
  );
  const hasUnassigned = dayBookings.some(
    (b) => !stylists.some((s) => s.id === b.stylistId),
  );
  const chips = [
    { id: "all", label: "All" },
    ...agendaStylists
      .filter((s) => s.hours !== null || dayBookings.some((b) => b.stylistId === s.id))
      .map((s) => ({ id: s.id, label: s.name.split(" ")[0] })),
    ...(hasUnassigned ? [{ id: UNASSIGNED_ID, label: "Unassigned" }] : []),
  ];
  const activeFilter = chips.some((c) => c.id === filter) ? filter : "all";

  const items = useMemo(
    () =>
      buildAgenda({
        dayBookings,
        stylists: agendaStylists,
        filter: activeFilter,
        isToday: selectedDate === today,
        isPast: selectedDate < today,
        nowMinutes,
      }),
    [dayBookings, agendaStylists, activeFilter, selectedDate, today, nowMinutes],
  );

  const renderBooking = (b: Booking) => {
    const start = timeStringToMinutes(b.time);
    const next = NEXT_STEP[b.status];
    const isBreak = b.bookingType === "break" || b.bookingType === "training";
    return (
      <article
        key={b.id}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <button
          className="bk-row"
          onClick={() => onOpenBooking(b.id)}
          style={{
            display: "block",
            width: "100%",
            padding: "0.875rem 1rem",
            background: "transparent",
            border: "none",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
        >
          <span
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.2rem",
            }}
          >
            <span
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--ink-muted)",
              }}
            >
              {b.time} – {minutesToTimeString(start + b.totalTime)}
            </span>
            {!isBreak && <Badge variant={b.status} />}
          </span>
          <span
            style={{
              display: "block",
              fontSize: "var(--text-md)",
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            {isBreak ? b.blockReason || b.serviceName || "Blocked time" : b.customerName}
          </span>
          <span
            style={{
              display: "block",
              fontSize: "var(--text-sm)",
              color: "var(--ink-muted)",
              marginTop: "1px",
            }}
          >
            {isBreak ? b.stylistName : `${b.serviceName} · ${b.stylistName}`}
          </span>
        </button>

        {b.status === "pending" && (
          <div style={{ display: "flex", gap: "0.5rem", padding: "0 1rem 0.875rem" }}>
            <button
              className="bk-cta"
              style={filledAction}
              onClick={() => void changeStatus(b.id, "confirmed")}
            >
              <Check size={16} strokeWidth={2.25} aria-hidden="true" />
              Approve
            </button>
            <button
              className="bk-ghost"
              style={actionButton}
              onClick={() => void changeStatus(b.id, "cancelled")}
            >
              <X size={16} strokeWidth={2.25} aria-hidden="true" />
              Decline
            </button>
          </div>
        )}
        {next && (
          <div style={{ display: "flex", padding: "0 1rem 0.875rem" }}>
            <button
              className="bk-cta"
              style={filledAction}
              onClick={() => void changeStatus(b.id, next.status)}
            >
              {next.status === "completed" ? (
                <CircleCheck size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Scissors size={16} strokeWidth={2} aria-hidden="true" />
              )}
              {next.label}
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      {/* Stylist filter chips */}
      <div
        role="group"
        aria-label="Filter by stylist"
        style={{
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
          paddingBottom: "0.25rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {chips.map((chip) => {
          const active = chip.id === activeFilter;
          return (
            <button
              key={chip.id}
              className={active ? undefined : "bk-ghost"}
              aria-pressed={active}
              onClick={() => setFilter(chip.id)}
              style={{
                flexShrink: 0,
                minHeight: "38px",
                padding: "0.4rem 1rem",
                borderRadius: "999px",
                fontSize: "var(--text-base)",
                fontWeight: active ? 700 : 500,
                fontFamily: "var(--font-body)",
                cursor: "pointer",
                background: active ? "var(--accent)" : "var(--surface)",
                color: active ? "var(--surface)" : "var(--ink)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {items.length === 0 && (
        <p
          style={{
            margin: 0,
            padding: "2rem 1rem",
            textAlign: "center",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            fontSize: "var(--text-base)",
            color: "var(--ink-muted)",
          }}
        >
          Nothing booked, and no free time left.
        </p>
      )}

      {items.map((item) =>
        item.kind === "booking" ? (
          renderBooking(item.booking)
        ) : (
          <button
            key={item.key}
            className="bk-row"
            onClick={() => onBook(item.stylistId, minutesToTimeString(item.start))}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              minHeight: "52px",
              padding: "0.75rem 1rem",
              background: "transparent",
              border: "1px dashed var(--border-strong)",
              borderRadius: "12px",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              color: "var(--ink-soft)",
            }}
          >
            <span style={{ fontSize: "var(--text-base)" }}>
              {activeFilter === "all" && (
                <strong style={{ color: "var(--ink)" }}>
                  {item.stylistName.split(" ")[0]} ·{" "}
                </strong>
              )}
              free for {formatFreeDuration(item.end - item.start)}
              <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>
                {minutesToTimeString(item.start)} – {minutesToTimeString(item.end)}
              </span>
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                fontWeight: 700,
                color: "var(--ink)",
                whiteSpace: "nowrap",
              }}
            >
              <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
              Book
            </span>
          </button>
        ),
      )}
    </div>
  );
};

export default MobileAgenda;
