// index.tsx
// Central route definitions for the application
// Customer routes are public, admin routes are protected

import { createBrowserRouter } from "react-router-dom";
import BookingPage from "../pages/BookingPage";
import AdminLoginPage from "../pages/AdminLoginPage";
import AdminDashboardPage from "../pages/AdminDashboardPage";
import ProtectedRoute from "./ProtectedRoute";

const router = createBrowserRouter([
  {
    // Customer facing booking page
    path: "/",
    element: <BookingPage />,
  },
  {
    // Admin login — public route
    path: "/admin/login",
    element: <AdminLoginPage />,
  },
  {
    // Admin dashboard — protected route
    path: "/admin",
    element: (
      <ProtectedRoute>
        <AdminDashboardPage />
      </ProtectedRoute>
    ),
  },
]);

export default router;
