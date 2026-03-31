// AdminDashboardPage.tsx
// Wrapped with BookingProvider so all admin tabs share
// one Firestore subscription rather than fetching independently

import { useState } from "react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import useAuth from "../hooks/useAuth";
import { BookingProvider, useBookingContext } from "../context/BookingContext";
import DashboardStats from "../components/admin/DashboardStats";
import FilterBar from "../components/admin/FilterBar";
import BookingTable from "../components/admin/BookingTable";
import { SalonDataProvider } from "../context/SalonDataContext";
import useToast from "../hooks/useToast";
import { ToastContainer } from "../components/ui/Toast";
import type { Filters } from "../components/admin/FilterBar";

const DEFAULT_FILTERS: Filters = {
  stylistId: "",
  date: "",
  status: "",
};

// Inner component — consumes BookingContext
// Separated from the outer component so context is available
const DashboardInner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { bookings, loading, error, updateStatus } = useBookingContext();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const { toasts, addToast, dismissToast } = useToast();

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/admin/login", { replace: true });
  };

  // Wrap updateStatus to handle errors gracefully
  // In Phase 1 this will show a toast — for now uses console.error
  const handleUpdateStatus = async (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => {
    try {
      await updateStatus(id, status);
      const messages = {
        confirmed: "Booking confirmed",
        cancelled: "Booking cancelled",
        pending: "Booking restored to pending",
      };
      addToast(messages[status], "success");
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

      {/* Main content */}
      <main
        style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem" }}
      >
        {loading ? (
          <p
            style={{ textAlign: "center", color: "#6b6b6b", marginTop: "3rem" }}
          >
            Loading bookings...
          </p>
        ) : error ? (
          <p
            style={{ textAlign: "center", color: "#e24b4a", marginTop: "3rem" }}
          >
            {error}
          </p>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            <DashboardStats bookings={bookings} />

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

            <BookingTable
              bookings={bookings}
              filters={filters}
              onUpdate={handleUpdateStatus}
            />
          </div>
        )}
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

// Outer component — provides BookingContext to DashboardInner
// Wrap with both providers
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
