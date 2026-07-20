// AdminDashboardPage.tsx
// Admin dashboard shell — header, tab navigation, and active tab rendering
// All tab content lives in src/pages/admin/* for separation of concerns
// Wrapped with BookingProvider, SalonDataProvider, and ToastProvider

import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import useAuth from "../hooks/useAuth";
import useAppUser from "../hooks/useAppUser";
import { BookingProvider, useBookingContext } from "../context/BookingContext";
import { SalonDataProvider } from "../context/SalonDataContext";
import { ToastProvider, useToastContext } from "../context/ToastContext";
import { NotificationProvider } from "../context/NotificationContext";
import NotificationBell from "../components/ui/NotificationBell";
import Tabs from "../components/ui/Tabs";
import TodayPage from "./admin/TodayPage";
import BookingsPage from "./admin/BookingsPage";
import ClientsPage from "./admin/ClientsPage";
import TrainingPage from "./admin/TrainingPage";
import AnalyticsPage from "./admin/AnalyticsPage";
import ManagePage from "./admin/ManagePage";

const ALL_TABS = [
  { id: "today", label: "Today", icon: "📅" },
  { id: "bookings", label: "Bookings", icon: "📋" },
  { id: "clients", label: "Clients", icon: "👥" },
  { id: "training", label: "Training", icon: "🎓" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "manage", label: "Manage", icon: "⚙️" },
];

// Tabs that require the owner role — hidden entirely for stylists.
const OWNER_ONLY_TAB_IDS = new Set(["analytics"]);

// ── Inner component — consumes context ────────────────────────────────────────
const DashboardInner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { appUser } = useAppUser();
  const { updateStatus } = useBookingContext();
  const { addToast } = useToastContext();
  const [activeTab, setActiveTab] = useState("today");

  // Fail closed: until the role doc resolves, treat the user as non-owner so
  // finance data never flashes before the role is confirmed.
  const isOwner = appUser?.role === "owner";
  const tabs = isOwner
    ? ALL_TABS
    : ALL_TABS.filter((tab) => !OWNER_ONLY_TAB_IDS.has(tab.id));

  // Defense in depth: if the active tab becomes owner-only-restricted (e.g.
  // the role resolves to "stylist" after an owner-only tab was selected),
  // bounce back to a tab everyone can see.
  useEffect(() => {
    if (OWNER_ONLY_TAB_IDS.has(activeTab) && !isOwner) {
      setActiveTab("today");
    }
  }, [activeTab, isOwner]);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/admin/login", { replace: true });
  };

  // Centralised status update with toast feedback
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
        background: "var(--admin-page-bg)",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "var(--admin-bg)",
          padding: "0.875rem clamp(1rem, 4vw, 2rem)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          borderBottom: "1px solid var(--admin-border)",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.35rem",
              fontWeight: 400,
              color: "var(--surface)",
              margin: 0,
              letterSpacing: "0.01em",
              lineHeight: 1.2,
            }}
          >
            Sua Hair Studio
          </h1>
          <p
            style={{
              fontSize: "0.7rem",
              color: "var(--admin-dimmer)",
              margin: 0,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: "var(--font-body)",
            }}
          >
            Admin
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: "0.75rem",
            minWidth: 0,
          }}
        >
          <NotificationBell />
          <span
            style={{
              color: "var(--admin-dimmer)",
              fontSize: "0.78rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "clamp(90px, 35vw, 220px)",
            }}
            title={user?.email ?? undefined}
          >
            {user?.email}
          </span>
          <button
            onClick={handleSignOut}
            style={{
              background: "none",
              border: "1px solid var(--admin-dim)",
              color: "var(--admin-faint)",
              padding: "0.375rem 0.875rem",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.78rem",
              fontFamily: "var(--font-body)",
              whiteSpace: "nowrap",
            }}
          >
            Sign out
          </button>
          <a
            href="/"
            style={{
              border: "1px solid var(--admin-dim)",
              color: "var(--admin-faint)",
              padding: "0.375rem 0.875rem",
              borderRadius: "4px",
              fontSize: "0.78rem",
              textDecoration: "none",
              fontFamily: "var(--font-body)",
              whiteSpace: "nowrap",
            }}
          >
            View site
          </a>
        </div>
      </header>

      {/* Tab navigation */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Active tab content */}
      <main
        style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem" }}
      >
        {activeTab === "today" && (
          <TodayPage onUpdateStatus={handleUpdateStatus} />
        )}
        {activeTab === "bookings" && (
          <BookingsPage onUpdateStatus={handleUpdateStatus} />
        )}
        {activeTab === "clients" && <ClientsPage />}
        {activeTab === "training" && <TrainingPage />}
        {activeTab === "analytics" && isOwner && <AnalyticsPage />}
        {activeTab === "manage" && <ManagePage />}
      </main>
    </div>
  );
};

// ── Outer component — provides context ────────────────────────────────────────
const AdminDashboardPage = () => (
  <SalonDataProvider>
    <BookingProvider>
      <ToastProvider>
        <NotificationProvider recipientId="owner">
          <DashboardInner />
        </NotificationProvider>
      </ToastProvider>
    </BookingProvider>
  </SalonDataProvider>
);

export default AdminDashboardPage;
