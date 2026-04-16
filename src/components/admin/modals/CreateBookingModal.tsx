// CreateBookingModal.tsx
// Admin-created booking modal with two tabs: Walk-in and Break
// Walk-in: name (required), phone (optional), service, stylist, date, time, notes
// Break: stylist, start time, duration, reason
// Pre-fills stylistId and time if clicked from an empty timeline slot
// Saves to Firestore with appropriate bookingType

import { useState } from "react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useSalonData } from "../../../context/SalonDataContext";
import { SALON_CONFIG } from "../../../lib/config";
import { minutesToTimeString } from "../../../lib/scheduling";
import Modal from "../../ui/Modal";
import type { Booking } from "../../../types";

interface Props {
  prefillStylistId?: string;
  prefillTime?: string;
  prefillDate?: string;
  prefillCustomerName?: string; // add this
  prefillCustomerPhone?: string; // add this
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

type ModalTab = "walkin" | "break";

// Generate time slots for the break duration selector
const BREAK_DURATIONS = [
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "1.5 hours", value: 90 },
  { label: "2 hours", value: 120 },
];

// Generate all time slots within trading hours
const generateTimeSlots = (): string[] => {
  const { open, close } = SALON_CONFIG.tradingHours;
  const slots: string[] = [];
  for (let minutes = open * 60; minutes < close * 60; minutes += 30) {
    slots.push(minutesToTimeString(minutes));
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem",
  border: "1px solid #ddd",
  borderRadius: "6px",
  fontSize: "0.9rem",
  boxSizing: "border-box",
  marginTop: "0.25rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "1rem",
  fontWeight: 500,
  fontSize: "0.875rem",
  color: "#1a1a1a",
};

const CreateBookingModal = ({
  prefillStylistId = "",
  prefillTime = "",
  prefillDate = "",
  prefillCustomerName = "", // add this
  prefillCustomerPhone = "", // add this
  onClose,
  onSuccess,
  onError,
}: Props) => {
  const { stylists, services } = useSalonData();
  const [activeTab, setActiveTab] = useState<ModalTab>("walkin");
  const [submitting, setSubmitting] = useState(false);

  // ── Walk-in form state ────────────────────────────────────────────────────
  const [walkin, setWalkin] = useState({
    customerName: prefillCustomerName, // was ''
    customerPhone: prefillCustomerPhone, // was ''
    stylistId: prefillStylistId,
    serviceId: "",
    date: prefillDate || new Date().toISOString().split("T")[0],
    time: prefillTime,
    notes: "",
  });
  // ── Break form state ──────────────────────────────────────────────────────
  const [breakForm, setBreakForm] = useState({
    stylistId: prefillStylistId,
    date: prefillDate || new Date().toISOString().split("T")[0],
    time: prefillTime,
    duration: 30,
    reason: "",
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getSelectedService = () =>
    services.find((s) => s.id === walkin.serviceId);

  const getSelectedStylist = (id: string) => stylists.find((s) => s.id === id);

  // ── Walk-in submit ────────────────────────────────────────────────────────
  const handleWalkinSubmit = async () => {
    if (!walkin.customerName.trim()) {
      onError("Customer name is required.");
      return;
    }
    if (
      !walkin.stylistId ||
      !walkin.serviceId ||
      !walkin.date ||
      !walkin.time
    ) {
      onError("Please fill in all required fields.");
      return;
    }

    const service = getSelectedService();
    const stylist = getSelectedStylist(walkin.stylistId);
    if (!service || !stylist) return;

    const resolvedPrice = service.price[stylist.level];

    setSubmitting(true);
    try {
      const booking: Omit<Booking, "id"> = {
        bookingType: "walkin",
        status: "confirmed", // walk-ins are auto-confirmed
        customerName: walkin.customerName.trim(),
        customerPhone: walkin.customerPhone.trim(),
        stylistId: stylist.id,
        stylistName: stylist.name,
        stylistLevel: stylist.level,
        serviceId: service.id,
        serviceName: service.name,
        servicePrice: resolvedPrice,
        activeTime: service.activeTime,
        restTime: service.restTime,
        totalTime: service.totalTime,
        date: walkin.date,
        time: walkin.time,
        notes: walkin.notes,
        createdAt: new Date().toISOString(),
      };

      const timestamp = Date.now();
      const safeName = stylist.name.replace(/\s+/g, "-").toLowerCase();
      const docId = `${walkin.date}_${safeName}_${timestamp}`;
      await setDoc(doc(collection(db, "bookings"), docId), booking);

      onSuccess(`Walk-in booking created for ${walkin.customerName}`);
      onClose();
    } catch (err) {
      console.error("Error creating walk-in:", err);
      onError("Failed to create booking. Please try again.");
    }
    setSubmitting(false);
  };

  // ── Break submit ──────────────────────────────────────────────────────────
  const handleBreakSubmit = async () => {
    if (!breakForm.stylistId || !breakForm.date || !breakForm.time) {
      onError("Please fill in all required fields.");
      return;
    }

    const stylist = getSelectedStylist(breakForm.stylistId);
    if (!stylist) return;

    setSubmitting(true);
    try {
      const booking: Omit<Booking, "id"> = {
        bookingType: "break",
        status: "confirmed",
        customerName: "Break",
        customerPhone: "",
        stylistId: stylist.id,
        stylistName: stylist.name,
        stylistLevel: stylist.level,
        serviceId: "break",
        serviceName: breakForm.reason || "Break",
        servicePrice: 0,
        activeTime: breakForm.duration,
        restTime: 0,
        totalTime: breakForm.duration,
        date: breakForm.date,
        time: breakForm.time,
        notes: breakForm.reason,
        blockReason: breakForm.reason,
        createdAt: new Date().toISOString(),
      };

      const timestamp = Date.now();
      const safeName = stylist.name.replace(/\s+/g, "-").toLowerCase();
      const docId = `${breakForm.date}_${safeName}_break_${timestamp}`;
      await setDoc(doc(collection(db, "bookings"), docId), booking);

      onSuccess(
        `Break blocked for ${stylist.name} at ${breakForm.time} (${breakForm.duration} min)`,
      );
      onClose();
    } catch (err) {
      console.error("Error creating break:", err);
      onError("Failed to create break. Please try again.");
    }
    setSubmitting(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal title="New Booking" onClose={onClose} width="520px">
      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #f0f0f0",
          marginBottom: "1.5rem",
          gap: "0.25rem",
        }}
      >
        {(["walkin", "break"] as ModalTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "0.6rem 1.25rem",
              background: "none",
              border: "none",
              borderBottom:
                activeTab === tab
                  ? "2px solid #c9a96e"
                  : "2px solid transparent",
              marginBottom: "-2px",
              color: activeTab === tab ? "#c9a96e" : "#6b6b6b",
              cursor: "pointer",
              fontWeight: activeTab === tab ? 600 : 400,
              fontSize: "0.875rem",
              textTransform: "capitalize",
            }}
          >
            {tab === "walkin" ? "🚶 Walk-in" : "🔴 Block Time"}
          </button>
        ))}
      </div>

      {/* ── Walk-in form ── */}
      {activeTab === "walkin" && (
        <div>
          <label style={labelStyle}>
            Customer Name *
            <input
              style={inputStyle}
              type="text"
              placeholder="e.g. Jane Smith"
              value={walkin.customerName}
              onChange={(e) =>
                setWalkin((prev) => ({ ...prev, customerName: e.target.value }))
              }
            />
          </label>

          <label style={labelStyle}>
            Mobile Number (optional)
            <input
              style={inputStyle}
              type="tel"
              placeholder="e.g. 0412 345 678"
              value={walkin.customerPhone}
              onChange={(e) =>
                setWalkin((prev) => ({
                  ...prev,
                  customerPhone: e.target.value,
                }))
              }
            />
          </label>

          <label style={labelStyle}>
            Stylist *
            <select
              style={inputStyle}
              value={walkin.stylistId}
              onChange={(e) =>
                setWalkin((prev) => ({ ...prev, stylistId: e.target.value }))
              }
            >
              <option value="">Select stylist...</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.role}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Service *
            <select
              style={inputStyle}
              value={walkin.serviceId}
              onChange={(e) =>
                setWalkin((prev) => ({ ...prev, serviceId: e.target.value }))
              }
              disabled={!walkin.stylistId}
            >
              <option value="">Select service...</option>
              {services.map((s) => {
                const stylist = getSelectedStylist(walkin.stylistId);
                const price = stylist ? s.price[stylist.level] : s.price.junior;
                return (
                  <option key={s.id} value={s.id}>
                    {s.name} — ${price} ({s.totalTime} min)
                  </option>
                );
              })}
            </select>
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
            }}
          >
            <label style={labelStyle}>
              Date *
              <input
                style={inputStyle}
                type="date"
                value={walkin.date}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) =>
                  setWalkin((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </label>
            <label style={labelStyle}>
              Time *
              <select
                style={inputStyle}
                value={walkin.time}
                onChange={(e) =>
                  setWalkin((prev) => ({ ...prev, time: e.target.value }))
                }
              >
                <option value="">Select time...</option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            Notes (optional)
            <textarea
              style={{ ...inputStyle, height: "70px", resize: "vertical" }}
              placeholder="Any special requests..."
              value={walkin.notes}
              onChange={(e) =>
                setWalkin((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
          </label>

          <button
            onClick={handleWalkinSubmit}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: submitting ? "#ddd" : "#c9a96e",
              color: submitting ? "#999" : "white",
              border: "none",
              borderRadius: "6px",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 500,
              fontSize: "0.95rem",
              marginTop: "0.5rem",
            }}
          >
            {submitting ? "Creating..." : "Create Walk-in Booking"}
          </button>
        </div>
      )}

      {/* ── Break form ── */}
      {activeTab === "break" && (
        <div>
          <label style={labelStyle}>
            Stylist *
            <select
              style={inputStyle}
              value={breakForm.stylistId}
              onChange={(e) =>
                setBreakForm((prev) => ({ ...prev, stylistId: e.target.value }))
              }
            >
              <option value="">Select stylist...</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
            }}
          >
            <label style={labelStyle}>
              Date *
              <input
                style={inputStyle}
                type="date"
                value={breakForm.date}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) =>
                  setBreakForm((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </label>
            <label style={labelStyle}>
              Start Time *
              <select
                style={inputStyle}
                value={breakForm.time}
                onChange={(e) =>
                  setBreakForm((prev) => ({ ...prev, time: e.target.value }))
                }
              >
                <option value="">Select time...</option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            Duration *
            <select
              style={inputStyle}
              value={breakForm.duration}
              onChange={(e) =>
                setBreakForm((prev) => ({
                  ...prev,
                  duration: Number(e.target.value),
                }))
              }
            >
              {BREAK_DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Reason (optional)
            <input
              style={inputStyle}
              type="text"
              placeholder="e.g. Lunch, Personal"
              value={breakForm.reason}
              onChange={(e) =>
                setBreakForm((prev) => ({ ...prev, reason: e.target.value }))
              }
            />
          </label>

          <button
            onClick={handleBreakSubmit}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: submitting ? "#ddd" : "#1a1a1a",
              color: submitting ? "#999" : "white",
              border: "none",
              borderRadius: "6px",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 500,
              fontSize: "0.95rem",
              marginTop: "0.5rem",
            }}
          >
            {submitting ? "Blocking..." : "Block Time"}
          </button>
        </div>
      )}
    </Modal>
  );
};

export default CreateBookingModal;
