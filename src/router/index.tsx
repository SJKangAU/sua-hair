// index.tsx
// Central route definitions for the application.
// Customer routes are public; admin and stylist routes are protected.

import { createBrowserRouter } from "react-router-dom";
import BookingPage from "../pages/BookingPage";
import AdminLoginPage from "../pages/AdminLoginPage";
import AdminDashboardPage from "../pages/AdminDashboardPage";
import StylistLoginPage from "../pages/StylistLoginPage";
import StylistSchedulePage from "../pages/StylistSchedulePage";
import ProtectedRoute from "./ProtectedRoute";

const router = createBrowserRouter([
  {
    // Customer-facing booking page — public
    path: "/",
    element: <BookingPage />,
  },
  {
    // Admin login — public
    path: "/admin/login",
    element: <AdminLoginPage />,
  },
  {
    // Admin dashboard — requires any authenticated user
    path: "/admin",
    element: (
      <ProtectedRoute>
        <AdminDashboardPage />
      </ProtectedRoute>
    ),
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
