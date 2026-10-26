// AdminDashboardPage.tsx
// The admin shell: a dark left sidebar on desktop, a top bar plus bottom tab
// bar on phones, and the current page in <Outlet>. Every destination is a URL
// under /admin (see router/index.tsx), and the booking drawer is driven by
// ?booking=<id> so notifications can deep-link to it from anywhere.
//
// Providers (salon data, bookings, toasts, notifications) wrap the whole shell
// so every page shares one bookings subscription.

import { signOut } from "firebase/auth";
import { Outlet, useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import useAuth from "../hooks/useAuth";
import useAppUser from "../hooks/useAppUser";
import { useBookingContext } from "../context/BookingContext";
import useBookingActions from "../hooks/useBookingActions";
import useBookingDrawerParam from "../hooks/useBookingDrawerParam";
import useAdminTheme from "../hooks/useAdminTheme";
import { BookingProvider } from "../context/BookingProvider";
import { SalonDataProvider } from "../context/SalonDataProvider";
import { useToastContext } from "../context/ToastContext";
import { ToastProvider } from "../context/ToastProvider";
import { NotificationProvider } from "../context/NotificationProvider";
import NotificationBell from "../components/ui/NotificationBell";
import AdminSidebar from "../components/admin/shell/AdminSidebar";
import MobileTabBar from "../components/admin/shell/MobileTabBar";
import { visibleNavItems } from "../components/admin/shell/navItems";
import { SHELL_CSS } from "../components/admin/shell/shellStyles";
import BookingDrawer from "../components/admin/drawer/BookingDrawer";
import type { AdminOutletContext } from "./admin/adminContext";
import type { BookingStatus, Notification } from "../types";

// ── Inner component — consumes context ────────────────────────────────────────
const DashboardInner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { appUser, loading: roleLoading } = useAppUser();
  const { bookings, loading, setFlag } = useBookingContext();
  const { changeStatus } = useBookingActions();
  const { addToast } = useToastContext();
  const drawer = useBookingDrawerParam();
  const { theme, toggleTheme } = useAdminTheme();

  // Fail closed: until the role doc resolves, treat the user as non-owner so
  // finance data never flashes before the role is confirmed.
  const isOwner = appUser?.role === "owner";
  const approvalsCount = bookings.filter((b) => b.status === "pending").length;
  const navItems = visibleNavItems(isOwner);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/admin/login", { replace: true });
  };

  // Centralised status update — toasts, undo for cancel / no-show, and the
  // restore-time slot check all live in useBookingActions.
  const handleUpdateStatus = (id: string, status: BookingStatus) =>
    changeStatus(id, status);

  // Centralised flag/unflag with toast feedback — mirrors handleUpdateStatus
  const handleSetFlag = async (
    id: string,
    flagged: boolean,
    reason?: string,
  ) => {
    try {
      await setFlag(id, flagged, reason);
      addToast(
        flagged ? "Booking flagged for follow-up" : "Flag cleared",
        flagged ? "warning" : "success",
      );
    } catch {
      addToast("Failed to update flag. Please try again.", "error");
    }
  };

  // A notification opens the booking it is about: Today on that booking's
  // date, with its drawer open. (A booking outside the loaded window has no
  // date to jump to — Today still opens, and the drawer simply doesn't.)
  const handleSelectNotification = (n: Notification) => {
    const booking = bookings.find((b) => b.id === n.bookingId);
    const params = new URLSearchParams();
    if (booking) params.set("date", booking.date);
    params.set("booking", n.bookingId);
    navigate(`/admin/today?${params.toString()}`);
  };

  const outletContext: AdminOutletContext = {
    isOwner,
    roleLoading,
    onUpdateStatus: handleUpdateStatus,
    onSetFlag: handleSetFlag,
  };

  return (
    <div
      className="adm-shell"
      style={{
        background: "var(--admin-page-bg)",
        fontFamily: "var(--font-body)",
      }}
    >
      <style>{SHELL_CSS}</style>

      <AdminSidebar
        items={navItems}
        approvalsCount={approvalsCount}
        email={user?.email}
        onSignOut={handleSignOut}
        onSelectNotification={handleSelectNotification}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div style={{ minWidth: 0 }}>
        {/* Phones: slim top bar (the sidebar's brand + bell) */}
        <header className="adm-topbar">
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.15rem",
                fontWeight: 400,
                color: "var(--surface)",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Sua Hair Studio
            </h1>
          </div>
          <NotificationBell onSelect={handleSelectNotification} />
        </header>

        <main className="adm-main">
          <Outlet context={outletContext} />
        </main>
      </div>

      <MobileTabBar
        items={navItems}
        approvalsCount={approvalsCount}
        email={user?.email}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Wait for bookings to load so a deep link isn't closed as "not found" */}
      {drawer.bookingId && !loading && (
        <BookingDrawer bookingId={drawer.bookingId} onClose={drawer.close} />
      )}
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
