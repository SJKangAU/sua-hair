// TodayPage.tsx
// Today tab — day navigation, stats, timeline, and booking modals
// Phase 11: adds active multi-phase treatment summary panel and live countdown trigger

import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useBookingContext } from "../../context/BookingContext";
import { useToastContext } from "../../context/ToastContext";
import Timeline from "../../components/admin/timeline/Timeline";
import BookingDetailModal from "../../components/admin/modals/BookingDetailModal";
import CreateBookingModal from "../../components/admin/modals/CreateBookingModal";
import DashboardStatStrip from "../../components/admin/DashboardStatStrip";
import { StatsSkeleton } from "../../components/ui/Skeleton";
import { todayString, addDays, formatDisplayDate } from "../../lib/dates";
import useMultiPhaseCountdown from "../../hooks/useMultiPhaseCountdown";
import type { Booking } from "../../types";

interface Props {
  onUpdateStatus: (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => void;
  // Gates the revenue subtotal in the stat strip — owner only.
  isOwner?: boolean;
}

const formatMinutes = (totalSeconds: number): string => {
  if (totalSeconds <= 0) return "Now";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const TodayPage = ({ onUpdateStatus, isOwner }: Props) => {
  const { bookings, loading, updateTimes } = useBookingContext();
  const { addToast } = useToastContext();

  const [selectedDate, setSelectedDate] = useState(todayString);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [createModal, setCreateModal] = useState<{
    stylistId: string;
    time: string;
  } | null>(null);

  const isToday = selectedDate === todayString();

  // Multi-phase countdown — only meaningful for today's date.
  // useMultiPhaseCountdown handles the 5-minute notification trigger internally.
  const { activeRests } = useMultiPhaseCountdown(bookings, selectedDate);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Day navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "0.4rem 0.5rem",
          }}
        >
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            aria-label="Previous day"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              background: "none",
              color: "var(--ink)",
              border: "none",
              borderRadius: "7px",
              cursor: "pointer",
            }}
          >
            <ChevronLeft size={17} strokeWidth={2} />
          </button>

          <h2
            style={{
              margin: 0,
              padding: "0 0.35rem",
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--ink)",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-body)",
            }}
          >
            {formatDisplayDate(selectedDate)}
          </h2>

          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            aria-label="Next day"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              background: "none",
              color: "var(--ink)",
              border: "none",
              borderRadius: "7px",
              cursor: "pointer",
            }}
          >
            <ChevronRight size={17} strokeWidth={2} />
          </button>

          <div
            style={{
              width: "1px",
              height: "20px",
              background: "var(--border)",
              margin: "0 0.15rem",
            }}
          />

          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayString())}
              style={{
                padding: "0.35rem 0.65rem",
                background: "none",
                color: "var(--ink)",
                border: "1px solid var(--border-strong)",
                borderRadius: "7px",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: 500,
              }}
            >
              Today
            </button>
          )}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.35rem 0.55rem",
              background: "var(--paper)",
              border: "1px solid var(--border)",
              borderRadius: "7px",
              cursor: "pointer",
            }}
          >
            <CalendarDays size={15} strokeWidth={2} color="var(--grey-muted)" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) =>
                e.target.value && setSelectedDate(e.target.value)
              }
              style={{
                background: "none",
                color: "var(--ink)",
                border: "none",
                cursor: "pointer",
                fontSize: "0.82rem",
                colorScheme: "light",
              }}
            />
          </label>
        </div>

        <button
          onClick={() => setCreateModal({ stylistId: "", time: "" })}
          style={{
            padding: "0.5rem 1.25rem",
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "0.875rem",
          }}
        >
          + New Booking
        </button>
      </div>

      {/* Active multi-phase treatments panel — only shown when any are in rest period */}
      {isToday && activeRests.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: `1px solid var(--border-strong)`,
            borderRadius: "10px",
            padding: "0.9rem 1.1rem",
          }}
        >
          <p
            style={{
              margin: "0 0 0.6rem",
              fontSize: "0.68rem",
              fontWeight: 700,
              color: "var(--grey-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "var(--font-body)",
            }}
          >
            Phase 3 Countdown
          </p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {activeRests.map((r) => {
              const urgent = r.remainingSeconds <= 300;
              return (
                <div
                  key={r.bookingId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.5rem 0.75rem",
                    background: urgent ? "var(--paper)" : "var(--paper)",
                    border: `1px solid ${
                      urgent ? "var(--border-strong)" : "var(--border)"
                    }`,
                    borderRadius: "7px",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "0.88rem",
                        color: "var(--ink)",
                      }}
                    >
                      {r.customerName}
                    </span>
                    <span
                      style={{
                        color: "var(--grey-muted)",
                        fontSize: "0.8rem",
                        marginLeft: "0.5rem",
                      }}
                    >
                      — {r.serviceName} · {r.stylistName}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: urgent ? "var(--error)" : "var(--ink)",
                      minWidth: 60,
                      textAlign: "right",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {formatMinutes(r.remainingSeconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stat strip — four key metrics for selected date.
          Full unfiltered array: the strip filters by day itself, and the
          weekly stat needs the whole week's bookings, not just one day's. */}
      {loading ? (
        <StatsSkeleton />
      ) : (
        <DashboardStatStrip
          bookings={bookings}
          selectedDate={selectedDate}
          isOwner={isOwner}
        />
      )}

      {/* Timeline */}
      <Timeline
        selectedDate={selectedDate}
        onBlockClick={setSelectedBooking}
        onEmptySlotClick={(stylistId, time) =>
          setCreateModal({ stylistId, time })
        }
      />

      {/* Booking detail modal */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onUpdateStatus={async (id, status) => {
            await onUpdateStatus(id, status);
            setSelectedBooking(null);
          }}
          allBookings={bookings}
          onUpdateTimes={updateTimes}
        />
      )}

      {/* Create booking modal */}
      {createModal !== null && (
        <CreateBookingModal
          prefillStylistId={createModal.stylistId}
          prefillTime={createModal.time}
          prefillDate={selectedDate}
          onClose={() => setCreateModal(null)}
          onSuccess={(msg) => addToast(msg, "success")}
          onError={(msg) => addToast(msg, "error")}
        />
      )}
    </div>
  );
};

export default TodayPage;
