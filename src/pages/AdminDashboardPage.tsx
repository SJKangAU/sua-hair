// AdminDashboardPage.tsx
// Admin dashboard shell with tab navigation
// Tabs: Today | Bookings | Clients | Training | Analytics | Manage
// Wrapped with BookingProvider and SalonDataProvider for shared state

import { useState } from "react";
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

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/admin/login", { replace: true });
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
        {activeTab === "today" && (
          <div
            style={{ textAlign: "center", padding: "3rem", color: "#6b6b6b" }}
          >
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📅</p>
            <h2
              style={{
                fontSize: "1.25rem",
                color: "#1a1a1a",
                marginBottom: "0.5rem",
              }}
            >
              Timeline coming in Phase 2
            </h2>
            <p style={{ fontSize: "0.9rem" }}>
              Visual timeline grid showing all stylists and bookings across the
              day.
            </p>
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
