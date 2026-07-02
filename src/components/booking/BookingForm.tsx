// BookingForm.tsx
// ─────────────────────────────────────────────────────────────────────────────
// 3-step booking orchestrator — B&W luxury redesign
// ─────────────────────────────────────────────────────────────────────────────
// Step 1  ServiceStep      — multi-select services
// Step 2  StylistDateStep  — choose stylist, date and time (merged)
// Step 3  DetailsStep      — customer phone, name, notes
// Sheet   BookingSummarySheet — slide-up review before going to step 3
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { cleanPhone, validatePhone, validateName } from "../../lib/validation";
import { writeBookingNotifications } from "../../lib/notifications";
import { useSalonData } from "../../context/SalonDataContext";
import StepIndicator from "./StepIndicator";
import ServiceStep from "./ServiceStep";
import StylistDateStep from "./StylistDateStep";
import DetailsStep from "./DetailsStep";
import BookingSummarySheet from "./BookingSummarySheet";
import BookingConfirmation from "./BookingConfirmation";
import type { Booking, BookedService, CustomerProfile } from "../../types";
import type { FirestoreService } from "../../hooks/useServices";

const ANIM_CSS = `
  @keyframes bkSlideFromRight {
    from { transform: translateX(40px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  @keyframes bkSlideFromLeft {
    from { transform: translateX(-40px); opacity: 0; }
    to   { transform: translateX(0);     opacity: 1; }
  }
  @keyframes bkFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

const PRIMARY_BTN: React.CSSProperties = {
  padding: "0.75rem 1.75rem",
  background: "#0a0a0a",
  color: "#ffffff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "0.875rem",
  fontWeight: 600,
  fontFamily: "var(--font-body)",
  letterSpacing: "0.04em",
  transition: "opacity 0.15s ease",
};

const DISABLED_BTN: React.CSSProperties = {
  ...PRIMARY_BTN,
  background: "#e8e8e8",
  color: "#aaaaaa",
  cursor: "not-allowed",
};

const BACK_BTN: React.CSSProperties = {
  padding: "0.75rem 1.25rem",
  background: "transparent",
  border: "1.5px solid #e0e0e0",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "0.875rem",
  color: "#555555",
  fontFamily: "var(--font-body)",
  transition: "border-color 0.15s ease, color 0.15s ease",
};

const BookingForm = () => {
  const { stylists, services } = useSalonData();

  // ── Step navigation ────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [showSummarySheet, setShowSummarySheet] = useState(false);

  // ── Booking selections ─────────────────────────────────────────────────────
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [stylistId, setStylistId] = useState("any");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  // ── Customer details ───────────────────────────────────────────────────────
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [customerProfile, setCustomerProfile] =
    useState<CustomerProfile | null>(null);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  // ── Submit state ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Omit<
    Booking,
    "id"
  > | null>(null);

  // ── Derived values ─────────────────────────────────────────────────────────
  const selectedServices: FirestoreService[] = services.filter((s) =>
    selectedServiceIds.includes(s.id),
  );

  const totalTime = selectedServices.reduce((sum, s) => sum + s.totalTime, 0);
  const totalActiveTime = selectedServices.reduce(
    (sum, s) => sum + s.activeTime,
    0,
  );

  const getPrice = (service: FirestoreService): number => {
    if (stylistId === "any") {
      return Math.min(
        service.price.director,
        service.price.senior,
        service.price.junior,
      );
    }
    const stylist = stylists.find((s) => s.id === stylistId);
    return stylist ? service.price[stylist.level] : service.price.junior;
  };

  // Max tier price — used to show a min–max range when no stylist is chosen
  const getMaxPrice = (service: FirestoreService): number =>
    Math.max(
      service.price.director,
      service.price.senior,
      service.price.junior,
    );

  // Display string per service: exact price for a chosen stylist,
  // "$min – $max" range for "First Available" (any tier may take the booking)
  const getPriceDisplay = (service: FirestoreService): string => {
    const min = getPrice(service);
    if (stylistId !== "any") return `$${min}`;
    const max = getMaxPrice(service);
    return min === max ? `$${min}` : `$${min} – $${max}`;
  };

  const estimatedTotal = selectedServices.reduce(
    (sum, s) => sum + getPrice(s),
    0,
  );

  const estimatedTotalMax = selectedServices.reduce(
    (sum, s) => sum + (stylistId === "any" ? getMaxPrice(s) : getPrice(s)),
    0,
  );

  const estimatedTotalDisplay =
    stylistId === "any" && estimatedTotalMax !== estimatedTotal
      ? `$${estimatedTotal} – $${estimatedTotalMax}`
      : `$${estimatedTotal}`;

  const stylist = stylists.find((s) => s.id === stylistId);
  const stylistName =
    stylistId === "any" ? "Any Available Stylist" : stylist?.name ?? "";

  const serviceHash = [...selectedServiceIds].sort().join(",");

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goTo = (newStep: number) => {
    setDirection(newStep > step ? "forward" : "back");
    setStep(newStep);
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleServiceToggle = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    // Clear availability since total duration changes
    setDate("");
    setTime("");
  };

  const handleStylistSelect = (id: string) => {
    setStylistId(id);
    // useBookingAvailability clears date/time on stylistId change
  };

  const handlePhoneChange = async (value: string) => {
    setCustomerPhone(value);
    setErrors((prev) => ({ ...prev, phone: undefined }));
    const cleaned = cleanPhone(value);
    if (!validatePhone(value)) return;

    setLookingUp(true);
    try {
      const q = query(
        collection(db, "bookings"),
        where("customerPhone", "==", cleaned),
        orderBy("createdAt", "desc"),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const bookings = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Booking),
        );
        const recent = bookings[0];
        setCustomerProfile({
          name: recent.customerName,
          phone: cleaned,
          visitCount: bookings.length,
          lastVisit: recent.date,
        });
        setCustomerName(recent.customerName);
      } else {
        setCustomerProfile(null);
      }
    } catch (err) {
      console.error("Customer lookup error:", err);
    }
    setLookingUp(false);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const newErrors: { name?: string; phone?: string } = {};
    if (!validatePhone(customerPhone))
      newErrors.phone = "Please enter a valid Australian mobile number";
    if (!validateName(customerName))
      newErrors.name = "Please enter your full name";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const bookedServices: BookedService[] = selectedServices.map((s) => ({
      id: s.id,
      name: s.name,
      price: getPrice(s),
      activeTime: s.activeTime,
      restTime: s.restTime,
      totalTime: s.totalTime,
    }));

    const finalStylistName =
      stylistId === "any" ? "Any available stylist" : stylist?.name ?? "";
    const finalStylistLevel =
      stylistId === "any" ? "junior" : stylist?.level ?? "junior";
    const totalRestTime = totalTime - totalActiveTime;

    setSubmitting(true);
    try {
      // Human-readable reference stored as a field — the doc ID itself is
      // auto-generated by addDoc so two customers racing for the same slot
      // can never silently overwrite each other's booking.
      const safeDate = date.replace(/-/g, "");
      const [tp, period] = time.split(" ");
      const [h, m] = tp.split(":").map(Number);
      const hour24 =
        period === "PM" && h !== 12
          ? h + 12
          : period === "AM" && h === 12
          ? 0
          : h;
      const hhmm = `${String(hour24).padStart(2, "0")}${String(m).padStart(
        2,
        "0",
      )}`;
      const stylistSlug = stylistId === "any" ? "any" : stylistId;
      const bookingRef = `BK-${safeDate}-${stylistSlug}-${hhmm}`;

      const booking: Omit<Booking, "id"> = {
        bookingType: "customer",
        status: "pending",
        bookingRef,
        customerName: customerName.trim(),
        customerPhone: cleanPhone(customerPhone),
        stylistId,
        stylistName: finalStylistName,
        stylistLevel: finalStylistLevel,
        // Multi-service fields
        services: bookedServices,
        // Legacy single-service fields for admin backward compat
        serviceId: bookedServices[0]?.id ?? "",
        serviceName: bookedServices.map((s) => s.name).join(" + "),
        servicePrice: estimatedTotal,
        activeTime: totalActiveTime,
        restTime: totalRestTime,
        totalTime,
        date,
        time,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "bookings"), booking);

      // Fire-and-forget — don't block confirmation on notification write
      writeBookingNotifications({
        bookingId: docRef.id,
        customerName: customerName.trim(),
        stylistId,
        stylistName: finalStylistName,
        date,
        time,
        serviceName: booking.serviceName,
      }).catch(console.error);

      setConfirmedBooking(booking);
      setConfirmed(true);
    } catch (err) {
      console.error("Booking submission error:", err);
      alert("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setConfirmed(false);
    setConfirmedBooking(null);
    setStep(1);
    setDirection("forward");
    setShowSummarySheet(false);
    setSelectedServiceIds([]);
    setStylistId("any");
    setDate("");
    setTime("");
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setCustomerProfile(null);
    setErrors({});
  };

  // ── Confirmation screen ───────────────────────────────────────────────────
  if (confirmed && confirmedBooking) {
    return (
      <BookingConfirmation booking={confirmedBooking} onReset={resetForm} />
    );
  }

  // ── Step 3 submit button state ────────────────────────────────────────────
  const canSubmit =
    validatePhone(customerPhone) && validateName(customerName) && !submitting;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "var(--font-body)" }}>
      <style>{ANIM_CSS}</style>

      <StepIndicator currentStep={step} />

      {/* Step content with slide animation */}
      <div style={{ overflow: "hidden" }}>
        <div
          key={step}
          style={{
            animation: `${
              direction === "forward" ? "bkSlideFromRight" : "bkSlideFromLeft"
            } 0.32s cubic-bezier(0.22, 1, 0.36, 1) both`,
            padding: "1.75rem 1.5rem 0.5rem",
          }}
        >
          {step === 1 && (
            <ServiceStep
              selectedIds={selectedServiceIds}
              onToggle={handleServiceToggle}
              services={services}
            />
          )}

          {step === 2 && (
            <StylistDateStep
              stylistId={stylistId}
              date={date}
              time={time}
              totalTime={totalTime > 0 ? totalTime : 30}
              totalActiveTime={totalActiveTime > 0 ? totalActiveTime : 30}
              serviceHash={serviceHash}
              onStylistSelect={handleStylistSelect}
              onDateSelect={setDate}
              onTimeSelect={setTime}
            />
          )}

          {step === 3 && (
            <DetailsStep
              selectedServices={selectedServices.map((s) => ({
                id: s.id,
                name: s.name,
                priceDisplay: getPriceDisplay(s),
                totalTime: s.totalTime,
              }))}
              stylistName={stylistName}
              date={date}
              time={time}
              totalTime={totalTime}
              estimatedTotalDisplay={estimatedTotalDisplay}
              customerName={customerName}
              customerPhone={customerPhone}
              notes={notes}
              lookingUp={lookingUp}
              customerProfile={customerProfile}
              errors={errors}
              onPhoneChange={handlePhoneChange}
              onNameChange={(v) => {
                setCustomerName(v);
                setErrors((p) => ({ ...p, name: undefined }));
              }}
              onNotesChange={setNotes}
            />
          )}
        </div>
      </div>

      {/* Navigation bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.25rem 1.5rem",
          borderTop: "1px solid #e8e8e8",
          marginTop: "0.5rem",
        }}
      >
        {/* Back button */}
        {step > 1 ? (
          <button
            onClick={() => goTo(step - 1)}
            style={BACK_BTN}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#0a0a0a";
              e.currentTarget.style.color = "#0a0a0a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#e0e0e0";
              e.currentTarget.style.color = "#555555";
            }}
          >
            ← Back
          </button>
        ) : (
          <span />
        )}

        {/* Forward action */}
        {step === 1 && (
          <button
            onClick={() => selectedServiceIds.length > 0 && goTo(2)}
            disabled={selectedServiceIds.length === 0}
            style={selectedServiceIds.length > 0 ? PRIMARY_BTN : DISABLED_BTN}
          >
            Continue
          </button>
        )}

        {step === 2 && (
          <button
            onClick={() => date && time && setShowSummarySheet(true)}
            disabled={!date || !time}
            style={date && time ? PRIMARY_BTN : DISABLED_BTN}
          >
            Review Booking
          </button>
        )}

        {step === 3 && (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={canSubmit ? PRIMARY_BTN : DISABLED_BTN}
          >
            {submitting ? "Confirming..." : "Confirm Booking"}
          </button>
        )}
      </div>

      {/* Booking summary sheet */}
      {showSummarySheet && (
        <BookingSummarySheet
          services={selectedServices.map((s) => ({
            id: s.id,
            name: s.name,
            priceDisplay: getPriceDisplay(s),
            totalTime: s.totalTime,
          }))}
          stylistName={stylistName}
          date={date}
          time={time}
          estimatedTotalDisplay={estimatedTotalDisplay}
          totalTime={totalTime}
          onConfirm={() => {
            setShowSummarySheet(false);
            goTo(3);
          }}
          onClose={() => setShowSummarySheet(false)}
        />
      )}
    </div>
  );
};

export default BookingForm;
