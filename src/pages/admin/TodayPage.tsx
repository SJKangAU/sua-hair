// TodayPage.tsx
// The Today page: a big date header with day navigation, search (Ctrl K) over
// clients and bookings, "Day at a glance", the timeline, and a right rail with
// what needs attention — bookings awaiting approval, clients about to be back
// from processing, and the waitlist.
//
// The day lives in the URL (?date=YYYY-MM-DD, absent = today) so a day can be
// bookmarked or linked to; the open booking drawer is ?booking=<id>, owned by
// the admin layout. Revenue in the glance strip is owner-only.

import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useBookingContext } from "../../context/BookingContext";
import { useSalonData } from "../../context/SalonDataContext";
import { useToastContext } from "../../context/ToastContext";
import Timeline from "../../components/admin/timeline/Timeline";
import MobileAgenda from "../../components/admin/today/MobileAgenda";
import CreateBookingModal from "../../components/admin/modals/CreateBookingModal";
import DayGlance from "../../components/admin/today/DayGlance";
import TodaySearch from "../../components/admin/today/TodaySearch";
import ApprovalRail from "../../components/admin/today/ApprovalRail";
import BackSoonCard from "../../components/admin/today/BackSoonCard";
import WaitlistRail from "../../components/admin/today/WaitlistRail";
import { StatsSkeleton } from "../../components/ui/Skeleton";
import { todayString, addDays, formatDisplayDate } from "../../lib/dates";
import { minutesToTimeString } from "../../lib/scheduling";
import { findNextOpening, summariseDay } from "../../lib/dayGlance";
import { sumRevenue } from "../../lib/revenue";
import type { ClientHit } from "../../lib/clientHits";
import useMultiPhaseCountdown from "../../hooks/useMultiPhaseCountdown";
import useBookingDrawerParam from "../../hooks/useBookingDrawerParam";
import useNowMinutes from "../../hooks/useNowMinutes";
import useMediaQuery from "../../hooks/useMediaQuery";
import useTodayShortcuts from "../../hooks/useTodayShortcuts";
import { ADMIN_NAV_BREAKPOINT } from "../../lib/breakpoints";
import type { Booking } from "../../types";

interface Props {
  // Gates the revenue card in the glance strip — owner only.
  isOwner?: boolean;
}

const TODAY_CSS = `
  .today-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 1.25rem;
    align-items: start;
  }
  @media (max-width: 1099px) {
    .today-grid { grid-template-columns: minmax(0, 1fr); }
  }
`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const navButton: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1px solid var(--border-strong)",
  borderRadius: "50%",
  cursor: "pointer",
};

const TodayPage = ({ isOwner }: Props) => {
  const { bookings, loading } = useBookingContext();
  const { stylists, salonSettings } = useSalonData();
  const { addToast } = useToastContext();
  const navigate = useNavigate();
  const drawer = useBookingDrawerParam();
  const [params, setParams] = useSearchParams();
  const dateInput = useRef<HTMLInputElement>(null);
  const nowMinutes = useNowMinutes();
  // Under 900px the timeline grid becomes a day list (MobileAgenda)
  const isNarrow = useMediaQuery(`(max-width: ${ADMIN_NAV_BREAKPOINT - 1}px)`);

  const [createModal, setCreateModal] = useState<{
    stylistId: string;
    time: string;
    // Set when opened from a booking's processing window
    gap?: { start: number; end: number };
    // Set when the block was chosen on the timeline: its length in minutes
    duration?: number;
  } | null>(null);

  const today = todayString();
  const dateParam = params.get("date");
  const selectedDate =
    dateParam && DATE_PATTERN.test(dateParam) ? dateParam : today;
  const isToday = selectedDate === today;

  const setDate = (date: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (date === today) next.delete("date");
        else next.set("date", date);
        return next;
      },
      { replace: true },
    );

  // N new booking · ← → change day · T today (Ctrl K is the search box's own)
  useTodayShortcuts({
    onNew: () => setCreateModal({ stylistId: "", time: "" }),
    onPrev: () => setDate(addDays(selectedDate, -1)),
    onNext: () => setDate(addDays(selectedDate, 1)),
    onToday: () => setDate(today),
  });

  // ── What the glance strip and rail show ────────────────────────────────────
  const dayBookings = useMemo(
    () => bookings.filter((b) => b.date === selectedDate),
    [bookings, selectedDate],
  );
  const summary = useMemo(() => summariseDay(dayBookings), [dayBookings]);
  const pending = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "pending")
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.createdAt.localeCompare(b.createdAt),
        ),
    [bookings],
  );
  const nextOpening = useMemo(
    () =>
      findNextOpening({
        date: selectedDate,
        today,
        nowMinutes,
        stylists,
        settings: salonSettings,
        bookings,
      }),
    [selectedDate, today, nowMinutes, stylists, salonSettings, bookings],
  );
  const revenue = isOwner ? sumRevenue(dayBookings) : undefined;

  // Clients currently in a processing window (today only; also sends the
  // five-minute heads-up notification)
  const { activeRests } = useMultiPhaseCountdown(bookings, selectedDate);

  // ── Search results ─────────────────────────────────────────────────────────
  const openBookingFromSearch = (booking: Booking) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (booking.date === today) next.delete("date");
        else next.set("date", booking.date);
        next.set("booking", booking.id);
        return next;
      },
      { replace: true },
    );

  const openClientFromSearch = (client: ClientHit) =>
    navigate(`/admin/clients?q=${encodeURIComponent(client.phone || client.name)}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <style>{TODAY_CSS}</style>

      {/* Header: the date, day navigation, search, New booking */}
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <p
            style={{
              margin: "0 0 0.25rem",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-muted)",
            }}
          >
            {isToday ? "Today" : selectedDate.slice(0, 4)}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem 1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                className="bk-ghost"
                onClick={() => setDate(addDays(selectedDate, -1))}
                aria-label="Previous day"
                title="Previous day (←)"
                style={navButton}
              >
                <ChevronLeft size={18} strokeWidth={2} />
              </button>
              <button
                className="bk-ghost"
                onClick={() => setDate(addDays(selectedDate, 1))}
                aria-label="Next day"
                title="Next day (→)"
                style={navButton}
              >
                <ChevronRight size={18} strokeWidth={2} />
              </button>
              {(
                <button
                  className="bk-ghost"
                  onClick={() => setDate(today)}
                  tabIndex={isToday ? -1 : 0}
                  aria-hidden={isToday}
                  title="Back to today (T)"
                  style={{
                    padding: "0.45rem 0.9rem",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "999px",
                    cursor: "pointer",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    fontFamily: "var(--font-body)",
                    visibility: isToday ? "hidden" : "visible",
                  }}
                >
                  Today
                </button>
              )}
              <label
                onClick={(e) => {
                  if (e.target === dateInput.current) return;
                  try {
                    dateInput.current?.showPicker();
                  } catch {
                    dateInput.current?.focus();
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.35rem 0.6rem",
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "999px",
                  cursor: "pointer",
                }}
              >
                <CalendarDays
                  size={15}
                  strokeWidth={2}
                  color="var(--ink-muted)"
                  aria-hidden="true"
                />
                <input
                  ref={dateInput}
                  type="date"
                  aria-label="Jump to date"
                  value={selectedDate}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  style={{
                    background: "none",
                    color: "var(--ink)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-body)",
                    colorScheme: "light",
                  }}
                />
              </label>
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.9rem, 4vw, 2.5rem)",
                fontWeight: 400,
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
                color: "var(--ink)",
              }}
            >
              {formatDisplayDate(selectedDate, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h1>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <TodaySearch
            onOpenBooking={openBookingFromSearch}
            onOpenClient={openClientFromSearch}
          />
          <button
            className="bk-cta"
            onClick={() => setCreateModal({ stylistId: "", time: "" })}
            title="New booking (N)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.6rem 1.1rem",
              background: "var(--accent)",
              color: "var(--surface)",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "var(--text-base)",
              fontFamily: "var(--font-body)",
            }}
          >
            <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
            New booking
          </button>
        </div>
      </header>

      {/* Day at a glance */}
      {loading ? (
        <StatsSkeleton />
      ) : (
        <DayGlance
          summary={summary}
          awaitingApproval={pending.length}
          nextOpening={nextOpening}
          isToday={isToday}
          revenue={revenue}
        />
      )}

      {/* Timeline + right rail */}
      <div className="today-grid">
        {isNarrow ? (
          <MobileAgenda
            selectedDate={selectedDate}
            onOpenBooking={(id) => drawer.open(id)}
            onBook={(stylistId, time) => setCreateModal({ stylistId, time })}
          />
        ) : (
          <Timeline
            selectedDate={selectedDate}
            onBlockClick={(booking) => drawer.open(booking.id)}
            onCreateRange={(stylistId, block, gap) =>
              setCreateModal({
                stylistId,
                time: minutesToTimeString(block.start),
                duration: block.length,
                gap,
              })
            }
          />
        )}

        <aside
          aria-label="Needs attention"
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <ApprovalRail
            pending={pending}
            allBookings={bookings}
            nowMinutes={nowMinutes}
            onOpenBooking={(id) => drawer.open(id)}
          />
          {isToday && (
            <BackSoonCard
              rests={activeRests}
              onOpenBooking={(id) => drawer.open(id)}
            />
          )}
          <WaitlistRail bookings={bookings} nowMinutes={nowMinutes} />
        </aside>
      </div>

      {/* Create booking modal */}
      {createModal !== null && (
        <CreateBookingModal
          prefillStylistId={createModal.stylistId}
          prefillTime={createModal.time}
          prefillDate={selectedDate}
          gap={createModal.gap}
          prefillDuration={createModal.duration}
          onClose={() => setCreateModal(null)}
          onSuccess={(msg) => addToast(msg, "success")}
          onError={(msg) => addToast(msg, "error")}
        />
      )}
    </div>
  );
};

export default TodayPage;
