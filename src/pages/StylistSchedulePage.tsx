// StylistSchedulePage.tsx
// Read-only daily schedule view for authenticated stylists.
// Shows only the logged-in stylist's bookings for the selected date.
// Includes the NotificationBell scoped to this stylist's recipientId.

import { useState } from "react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import useAppUser from "../hooks/useAppUser";
import { useSalonData } from "../context/SalonDataContext";
import { SalonDataProvider } from "../context/SalonDataContext";
import { NotificationProvider } from "../context/NotificationContext";
import NotificationBell from "../components/ui/NotificationBell";
import { todayString, addDays, formatDisplayDate } from "../lib/dates";
import type { Booking } from "../types";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useEffect } from "react";

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#2d8a4e",
  pending: "#c9a96e",
  cancelled: "#e53e3e",
};

const ScheduleInner = () => {
  const { appUser } = useAppUser();
  const { stylists } = useSalonData();
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState(todayString);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const stylistId = appUser?.stylistId ?? null;
  const stylist = stylists.find((s) => s.id === stylistId);

  useEffect(() => {
    if (!stylistId) return;

    const q = query(
      collection(db, "bookings"),
      where("stylistId", "==", stylistId),
      where("date", "==", selectedDate),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setBookings(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking)),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsub;
  }, [stylistId, selectedDate]);

  const activeBookings = bookings
    .filter((b) => b.status !== "cancelled" && b.bookingType !== "break")
    .sort((a, b) => a.time.localeCompare(b.time));

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/stylist/login", { replace: true });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111",
        fontFamily: "Georgia, serif",
        color: "#fff",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "#1a1a1a",
          padding: "1rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.3rem", color: "#c9a96e", margin: 0 }}>
            Sua Hair
          </h1>
          <p style={{ fontSize: "0.75rem", color: "#777", margin: 0 }}>
            {stylist ? stylist.name : "Stylist Portal"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {appUser?.stylistId && <NotificationBell />}
          <button
            onClick={handleSignOut}
            style={{
              background: "none",
              border: "1px solid #444",
              color: "#999",
              padding: "0.4rem 0.9rem",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "700px", margin: "0 auto", padding: "1.5rem" }}>
        {/* Date navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1.5rem",
          }}
        >
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            style={{
              padding: "0.4rem 0.75rem",
              background: "#2a2a2a",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            ‹
          </button>
          <span
            style={{
              fontWeight: 500,
              fontSize: "1rem",
              color: "#fff",
              minWidth: 180,
              textAlign: "center",
            }}
          >
            {formatDisplayDate(selectedDate)}
          </span>
          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            style={{
              padding: "0.4rem 0.75rem",
              background: "#2a2a2a",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            ›
          </button>
          {selectedDate !== todayString() && (
            <button
              onClick={() => setSelectedDate(todayString())}
              style={{
                padding: "0.4rem 0.75rem",
                background: "#c9a96e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              Today
            </button>
          )}
        </div>

        {/* Booking list */}
        {loading ? (
          <div style={{ color: "#555", textAlign: "center", padding: "3rem" }}>
            Loading schedule…
          </div>
        ) : activeBookings.length === 0 ? (
          <div
            style={{
              background: "#1a1a1a",
              borderRadius: "10px",
              padding: "3rem",
              textAlign: "center",
              color: "#555",
              fontSize: "0.9rem",
            }}
          >
            No bookings for this day.
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {activeBookings.map((b) => (
              <div
                key={b.id}
                style={{
                  background: "#1a1a1a",
                  border: "1px solid #2a2a2a",
                  borderRadius: "10px",
                  padding: "1rem 1.25rem",
                  display: "grid",
                  gridTemplateColumns: "80px 1fr auto",
                  gap: "1rem",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "#c9a96e",
                    }}
                  >
                    {b.time}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#555",
                      marginTop: "0.15rem",
                    }}
                  >
                    {b.totalTime} min
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: "0.95rem" }}>
                    {b.customerName}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#888",
                      marginTop: "0.2rem",
                    }}
                  >
                    {b.serviceName}
                  </div>
                  {b.notes && (
                    <div
                      style={{
                        fontSize: "0.78rem",
                        color: "#555",
                        marginTop: "0.2rem",
                        fontStyle: "italic",
                      }}
                    >
                      {b.notes}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    color: STATUS_COLORS[b.status] ?? "#888",
                    textTransform: "capitalize",
                  }}
                >
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {activeBookings.length > 0 && (
          <div
            style={{
              marginTop: "1.25rem",
              padding: "0.75rem 1rem",
              background: "#1a1a1a",
              borderRadius: "8px",
              fontSize: "0.82rem",
              color: "#666",
              display: "flex",
              gap: "1.5rem",
            }}
          >
            <span>{activeBookings.length} bookings</span>
            <span>
              {activeBookings.reduce((sum, b) => sum + b.totalTime, 0)} min
              total
            </span>
          </div>
        )}
      </main>
    </div>
  );
};

// Outer wrapper provides contexts
const StylistSchedulePage = () => {
  const { appUser } = useAppUser();

  return (
    <SalonDataProvider>
      <NotificationProvider
        recipientId={appUser?.stylistId ?? appUser?.uid ?? ""}
      >
        <ScheduleInner />
      </NotificationProvider>
    </SalonDataProvider>
  );
};

export default StylistSchedulePage;
