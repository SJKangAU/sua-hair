// index.tsx
// Central route definitions for the application.
// Customer routes are public; admin and stylist routes are protected.
//
// The admin and stylist screens are LAZY-LOADED (React Router's `lazy`): a customer
// opening the booking page downloads none of the admin code (timeline, drag and
// drop, analytics, the client import and its parsers...). Each of those chunks loads
// the first time someone goes to /admin or /stylist, and the router holds the
// navigation (showing PageLoading on a first visit) until it has arrived.

import { createBrowserRouter, Navigate } from "react-router-dom";
import BookingPage from "../pages/BookingPage";
import PrivacyPolicyPage from "../pages/PrivacyPolicyPage";
import TermsPage from "../pages/TermsPage";
import ProtectedRoute from "./ProtectedRoute";
import PageLoading from "./PageLoading";

// One chunk holds every admin tab (they share the dashboard shell and most of their code)
const adminTab = (name: keyof typeof import("../pages/admin/AdminRoutes")) => async () => ({
  Component: (await import("../pages/admin/AdminRoutes"))[name] as React.ComponentType,
});

const router = createBrowserRouter([
  {
    // Customer-facing booking page — public
    path: "/",
    element: <BookingPage />,
  },
  {
    // Privacy policy — public
    path: "/privacy",
    element: <PrivacyPolicyPage />,
  },
  {
    // Terms of service — public
    path: "/terms",
    element: <TermsPage />,
  },
  {
    // Admin login — public
    path: "/admin/login",
    lazy: async () => ({
      Component: (await import("../pages/AdminLoginPage")).default,
    }),
    HydrateFallback: PageLoading,
  },
  {
    // Admin dashboard — owner-only. A stylist account (or any account
    // missing a role) is redirected, never granted access.
    // Every tab is its own URL; ?booking=<id> opens that booking's drawer.
    path: "/admin",
    lazy: async () => {
      const AdminDashboardPage = (await import("../pages/AdminDashboardPage")).default;
      return {
        Component: () => (
          <ProtectedRoute requiredRole="owner">
            <AdminDashboardPage />
          </ProtectedRoute>
        ),
      };
    },
    HydrateFallback: PageLoading,
    children: [
      { index: true, element: <Navigate to="today" replace /> },
      { path: "today", lazy: adminTab("TodayRoute") },
      { path: "approvals", lazy: adminTab("ApprovalsRoute") },
      { path: "bookings", lazy: adminTab("BookingsRoute") },
      { path: "clients", lazy: adminTab("ClientsRoute") },
      { path: "clients/:clientId", lazy: adminTab("ClientRoute") },
      { path: "training", lazy: adminTab("TrainingRoute") },
      { path: "analytics", lazy: adminTab("AnalyticsRoute") },
      { path: "manage", lazy: adminTab("ManageRoute") },
      { path: "*", element: <Navigate to="/admin/today" replace /> },
    ],
  },
  {
    // Stylist login — public
    path: "/stylist/login",
    lazy: async () => ({
      Component: (await import("../pages/StylistLoginPage")).default,
    }),
    HydrateFallback: PageLoading,
  },
  {
    // Stylist schedule — requires stylist role
    path: "/stylist/schedule",
    lazy: async () => {
      const StylistSchedulePage = (await import("../pages/StylistSchedulePage")).default;
      return {
        Component: () => (
          <ProtectedRoute requiredRole="stylist" loginPath="/stylist/login">
            <StylistSchedulePage />
          </ProtectedRoute>
        ),
      };
    },
    HydrateFallback: PageLoading,
  },
  ...["/stylist/clients", "/stylist/clients/:clientId"].map((path) => ({
    // A stylist's own clients (and one client's page) - requires stylist role
    path,
    lazy: async () => {
      const StylistClientsPage = (await import("../pages/StylistClientsPage")).default;
      return {
        Component: () => (
          <ProtectedRoute requiredRole="stylist" loginPath="/stylist/login">
            <StylistClientsPage />
          </ProtectedRoute>
        ),
      };
    },
    HydrateFallback: PageLoading,
  })),
]);

export default router;
