// AdminDashboardPage.tsx
// Admin dashboard shell with tab navigation
// Tabs: Today | Bookings | Clients | Training | Analytics | Manage
// Wrapped with BookingProvider and SalonDataProvider for shared state

import { useState } from "react";
import Timeline from "../components/admin/timeline/Timeline";
import BookingDetailModal from "../components/admin/modals/BookingDetailModal";
import CreateBookingModal from "../components/admin/modals/CreateBookingModal";
import type { Booking } from "../types";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import { BookingProvider, useBookingContext } from "../context/BookingContext";
import { SalonDataProvider } from "../context/SalonDataContext";
import { ToastContainer } from "../components/ui/Toast";
import Tabs from "../components/ui/Tabs";
import DashboardStats from "../components/admin/DashboardStats";
import FilterBar from "../components/admin/FilterBar";
import BookingTable from "../components/admin/BookingTable";
import { BookingCardSkeleton, StatsSkeleton } from "../components/ui/Skeleton";
import type { Filters } from "../components/admin/FilterBar";

const DEFAULT_FILTERS: Filters = {
  stylistId: "",
  date: "",
  status: "",
};

// Tab definitions
const TABS = [
  { id: "today", label: "Today", icon: "📅" },
  { id: "bookings", label: "Bookings", icon: "📋" },
  { id: "clients", label: "Clients", icon: "👥" },
  { id: "training", label: "Training", icon: "🎓" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "manage", label: "Manage", icon: "⚙️" },
];

// ── Inner component — consumes context ────────────────────────────────────────

const DashboardInner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { bookings, loading, error, updateStatus } = useBookingContext();
  const { toasts, addToast, dismissToast } = useToast();
  const [activeTab, setActiveTab] = useState("bookings");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [createModal, setCreateModal] = useState<{
    stylistId: string;
    time: string;
  } | null>(null);
  const handleBlockClick = (booking: Booking) => {
    setSelectedBooking(booking);
  };

  const handleEmptySlotClick = (stylistId: string, time: string) => {
    setCreateModal({ stylistId, time });
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/admin/login", { replace: true });
  };
  // Helper to format date for display
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };
  // Navigate to previous day
  const prevDay = () => {
    const date = new Date(selectedDate + "T00:00:00");
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split("T")[0]);
  };

  // Navigate to next day
  const nextDay = () => {
    const date = new Date(selectedDate + "T00:00:00");
    date.setDate(date.getDate() + 1);
    setSelectedDate(date.toISOString().split("T")[0]);
  };
  // Optimistic status update with toast feedback
  const handleUpdateStatus = async (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => {
    try {
      await updateStatus(id, status);
      const messages = {
        confirmed: "Booking confirmed ✓",
        cancelled: "Booking cancelled",
        pending: "Booking restored to pending",
      };
      addToast(
        messages[status],
        status === "cancelled" ? "warning" : "success",
      );
    } catch {
      addToast("Failed to update booking. Please try again.", "error");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f0e8",
        fontFamily: "Georgia, serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "#1a1a1a",
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", color: "#c9a96e", margin: 0 }}>
            Sua Hair
          </h1>
          <p style={{ fontSize: "0.75rem", color: "#aaa", margin: 0 }}>
            Admin Dashboard
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ color: "#aaa", fontSize: "0.82rem" }}>
            {user?.email}
          </span>
          <button
            onClick={handleSignOut}
            style={{
              background: "none",
              border: "1px solid #555",
              color: "#aaa",
              padding: "0.4rem 0.9rem",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            Sign out
          </button>
          <a
            href="/"
            style={{
              background: "none",
              border: "1px solid #c9a96e",
              color: "#c9a96e",
              padding: "0.4rem 0.9rem",
              borderRadius: "4px",
              fontSize: "0.8rem",
              textDecoration: "none",
            }}
          >
            View booking page
          </a>
        </div>
      </header>

      {/* Tab navigation */}
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <main
        style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem" }}
      >
        {/* ── Today Tab ── */}
        {/* ── Today Tab ── */}
        {activeTab === "today" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
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
                  gap: "0.75rem",
                }}
              >
                <button
                  onClick={prevDay}
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
                  }}
                >
                  {formatDate(selectedDate)}
                </h2>
                <button
                  onClick={nextDay}
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
                <button
                  onClick={() =>
                    setSelectedDate(new Date().toISOString().split("T")[0])
                  }
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
              </div>

              {/* New booking button */}
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

            {/* Stats for selected day */}
            {loading ? (
              <StatsSkeleton />
            ) : (
              <DashboardStats bookings={bookings} selectedDate={selectedDate} />
            )}

            {/* Timeline grid */}
            <Timeline
              selectedDate={selectedDate}
              onBlockClick={handleBlockClick}
              onEmptySlotClick={handleEmptySlotClick}
            />
          </div>
        )}

        {/* ── Bookings Tab ── */}
        {activeTab === "bookings" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            {loading ? (
              <StatsSkeleton />
            ) : (
              <DashboardStats bookings={bookings} />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: 0 }}>
                All Bookings
                <span
                  style={{
                    color: "#6b6b6b",
                    fontWeight: 400,
                    fontSize: "0.85rem",
                    marginLeft: "0.5rem",
                  }}
                >
                  ({bookings.length} total)
                </span>
              </h2>
            </div>

            <FilterBar
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters(DEFAULT_FILTERS)}
            />

            {loading ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {[1, 2, 3].map((i) => (
                  <BookingCardSkeleton key={i} />
                ))}
              </div>
            ) : error ? (
              <p style={{ textAlign: "center", color: "#e24b4a" }}>{error}</p>
            ) : (
              <BookingTable
                bookings={bookings}
                filters={filters}
                onUpdate={handleUpdateStatus}
              />
            )}
          </div>
        )}

        {/* ── Clients Tab ── */}
        {activeTab === "clients" && (
          <div
            style={{ textAlign: "center", padding: "3rem", color: "#6b6b6b" }}
          >
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>👥</p>
            <h2
              style={{
                fontSize: "1.25rem",
                color: "#1a1a1a",
                marginBottom: "0.5rem",
              }}
            >
              Client history coming in Phase 4
            </h2>
            <p style={{ fontSize: "0.9rem" }}>
              Search clients by name or mobile, view visit history, total spend,
              and loyalty metrics.
            </p>
          </div>
        )}

        {/* ── Training Tab ── */}
        {activeTab === "training" && (
          <div
            style={{ textAlign: "center", padding: "3rem", color: "#6b6b6b" }}
          >
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎓</p>
            <h2
              style={{
                fontSize: "1.25rem",
                color: "#1a1a1a",
                marginBottom: "0.5rem",
              }}
            >
              Training sessions coming in Phase 5
            </h2>
            <p style={{ fontSize: "0.9rem" }}>
              Manage after-hours training sessions between Steve and the team.
            </p>
          </div>
        )}

        {/* ── Analytics Tab ── */}
        {activeTab === "analytics" && (
          <div
            style={{ textAlign: "center", padding: "3rem", color: "#6b6b6b" }}
          >
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📊</p>
            <h2
              style={{
                fontSize: "1.25rem",
                color: "#1a1a1a",
                marginBottom: "0.5rem",
              }}
            >
              Analytics coming in Phase 6
            </h2>
            <p style={{ fontSize: "0.9rem" }}>
              Revenue over time, occupancy rates, popular services, and client
              retention charts.
            </p>
          </div>
        )}

        {/* ── Manage Tab ── */}
        {activeTab === "manage" && (
          <div
            style={{ textAlign: "center", padding: "3rem", color: "#6b6b6b" }}
          >
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚙️</p>
            <h2
              style={{
                fontSize: "1.25rem",
                color: "#1a1a1a",
                marginBottom: "0.5rem",
              }}
            >
              Stylist & service management coming in Phase 7
            </h2>
            <p style={{ fontSize: "0.9rem" }}>
              Add, edit, and deactivate stylists and services without touching
              code.
            </p>
          </div>
        )}
      </main>
      {/* Booking detail modal */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onUpdateStatus={async (id, status) => {
            await handleUpdateStatus(id, status);
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
          onSuccess={(msg) => addToast(msg, "success")}
          onError={(msg) => addToast(msg, "error")}
        />
      )}
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

// ── Outer component — provides context ────────────────────────────────────────
const AdminDashboardPage = () => {
  return (
    <SalonDataProvider>
      <BookingProvider>
        <DashboardInner />
      </BookingProvider>
    </SalonDataProvider>
  );
};

export default AdminDashboardPage;
