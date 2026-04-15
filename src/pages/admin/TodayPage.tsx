// TodayPage.tsx
// Today tab — day navigation, stats, timeline, and booking modals
// Uses ToastContext directly — no addToast prop needed

import { useState } from "react";
import { useBookingContext } from "../../context/BookingContext";
import { useToastContext } from "../../context/ToastContext";
import Timeline from "../../components/admin/timeline/Timeline";
import BookingDetailModal from "../../components/admin/modals/BookingDetailModal";
import CreateBookingModal from "../../components/admin/modals/CreateBookingModal";
import DashboardStats from "../../components/admin/DashboardStats";
import { StatsSkeleton } from "../../components/ui/Skeleton";
import { todayString, addDays, formatDisplayDate } from "../../lib/dates";
import type { Booking } from "../../types";

interface Props {
  onUpdateStatus: (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => void;
}

const TodayPage = ({ onUpdateStatus }: Props) => {
  const { bookings, loading } = useBookingContext();
  const { addToast } = useToastContext();

  const [selectedDate, setSelectedDate] = useState(todayString);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [createModal, setCreateModal] = useState<{
    stylistId: string;
    time: string;
  } | null>(null);

  const isToday = selectedDate === todayString();
  const dayBookings = bookings.filter(b => b.date === selectedDate);

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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button
            onClick={() => setSelectedDate(d => addDays(d, -1))}
            style={{
              padding: "0.4rem 0.75rem",
              background: "#1a1a1a",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            ← Prev
          </button>
          <h2
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 500,
              color: "#1a1a1a",
              whiteSpace: "nowrap",
            }}
          >
            {formatDisplayDate(selectedDate)}
          </h2>
          <button
            onClick={() => setSelectedDate(d => addDays(d, 1))}
            style={{
              padding: "0.4rem 0.75rem",
              background: "#1a1a1a",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Next →
          </button>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayString())}
              style={{
                padding: "0.4rem 0.75rem",
                background: "#c9a96e",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Today
            </button>
          )}
        </div>

        <button
          onClick={() => setCreateModal({ stylistId: "", time: "" })}
          style={{
            padding: "0.5rem 1.25rem",
            background: "#c9a96e",
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

      {/* Stats for selected date */}
      {loading ? (
        <StatsSkeleton />
      ) : (
        <DashboardStats bookings={dayBookings} selectedDate={selectedDate} />
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
        />
      )}

      {/* Create booking modal */}
      {createModal !== null && (
        <CreateBookingModal
          prefillStylistId={createModal.stylistId}
          prefillTime={createModal.time}
          prefillDate={selectedDate}
          onClose={() => setCreateModal(null)}
          onSuccess={msg => addToast(msg, "success")}
          onError={msg => addToast(msg, "error")}
        />
      )}
    </div>
  );
};

export default TodayPage;