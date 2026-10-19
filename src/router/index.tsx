// index.tsx
// Central route definitions for the application.
// Customer routes are public; admin and stylist routes are protected.

import { createBrowserRouter, Navigate } from "react-router-dom";
import BookingPage from "../pages/BookingPage";
import PrivacyPolicyPage from "../pages/PrivacyPolicyPage";
import TermsPage from "../pages/TermsPage";
import AdminLoginPage from "../pages/AdminLoginPage";
import AdminDashboardPage from "../pages/AdminDashboardPage";
import StylistLoginPage from "../pages/StylistLoginPage";
import StylistSchedulePage from "../pages/StylistSchedulePage";
import {
  AnalyticsRoute,
  ApprovalsRoute,
  BookingsRoute,
  ClientsRoute,
  ManageRoute,
  TodayRoute,
  TrainingRoute,
} from "../pages/admin/AdminRoutes";
import ProtectedRoute from "./ProtectedRoute";

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
    element: <AdminLoginPage />,
  },
  {
    // Admin dashboard — owner-only. A stylist account (or any account
    // missing a role document) is redirected, never granted access.
    // Every tab is its own URL; ?booking=<id> opens that booking's drawer.
    path: "/admin",
    element: (
      <ProtectedRoute requiredRole="owner">
        <AdminDashboardPage />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="today" replace /> },
      { path: "today", element: <TodayRoute /> },
      { path: "approvals", element: <ApprovalsRoute /> },
      { path: "bookings", element: <BookingsRoute /> },
      { path: "clients", element: <ClientsRoute /> },
      { path: "training", element: <TrainingRoute /> },
      { path: "analytics", element: <AnalyticsRoute /> },
      { path: "manage", element: <ManageRoute /> },
      { path: "*", element: <Navigate to="/admin/today" replace /> },
    ],
  },
  {
    // Stylist login — public
    path: "/stylist/login",
    element: <StylistLoginPage />,
  },
  {
    // Stylist schedule — requires stylist role
    path: "/stylist/schedule",
    element: (
      <ProtectedRoute requiredRole="stylist" loginPath="/stylist/login">
        <StylistSchedulePage />
      </ProtectedRoute>
    ),
  },
]);

export default router;
