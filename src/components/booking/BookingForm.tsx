// BookingForm.tsx
// ─────────────────────────────────────────────────────────────────────────────
// 2-step booking flow orchestrator
// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — BookingCalendar: service, stylist filter, calendar, time slots
// Step 2 — StepTwoDetails: customer phone, name, booking summary, confirmation
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  collection,
  doc,
  setDoc,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { cleanPhone, validatePhone, validateName } from "../../lib/validation";
import { useSalonData } from "../../context/SalonDataContext";
import StepIndicator from "./StepIndicator";
import BookingCalendar from "./BookingCalendar";
import StepTwoDetails from "./StepTwoDetails";
import BookingConfirmation from "./BookingConfirmation";
import type { Booking, CustomerProfile } from "../../types";

const BookingForm = () => {
  const { stylists, services } = useSalonData();

  const [step, setStep] = useState(1);
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Omit<
    Booking,
    "id"
  > | null>(null);
  const [customerProfile, setCustomerProfile] =
    useState<CustomerProfile | null>(null);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    stylistId: "any",
    stylistName: "",
    stylistLevel: "junior" as "director" | "senior" | "junior",
    serviceId: "",
    serviceName: "",
    servicePrice: 0,
    activeTime: 0,
    restTime: 0,
    totalTime: 0,
    date: "",
    time: "",
    notes: "",
  });

  // ── Customer lookup ───────────────────────────────────────────────────────

  const lookupCustomer = async (phone: string) => {
    const cleaned = cleanPhone(phone);
    if (!validatePhone(phone)) return;

    setLookingUp(true);
    try {
      const q = query(
        collection(db, "bookings"),
        where("customerPhone", "==", cleaned),
        orderBy("createdAt", "desc"),
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const bookings = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Booking),
        );
        const mostRecent = bookings[0];
        setCustomerProfile({
          name: mostRecent.customerName,
          phone: cleaned,
          visitCount: bookings.length,
          lastVisit: mostRecent.date,
        });
        setForm((prev) => ({ ...prev, customerName: mostRecent.customerName }));
      } else {
        setCustomerProfile(null);
      }
    } catch (err) {
      console.error("Customer lookup error:", err);
    }
    setLookingUp(false);
  };

  // ── Field handlers ────────────────────────────────────────────────────────

  const handleStylistSelect = (id: string) => {
    if (id === "any" || id === "") {
      setForm((prev) => ({
        ...prev,
        stylistId: "any",
        stylistName: "",
        stylistLevel: "junior",
        time: "",
      }));
      return;
    }
    const stylist = stylists.find((s) => s.id === id);
    if (!stylist) return;
    const service = services.find((s) => s.id === form.serviceId);
    setForm((prev) => ({
      ...prev,
      stylistId: stylist.id,
      stylistName: stylist.name,
      stylistLevel: stylist.level,
      servicePrice: service ? service.price[stylist.level] : prev.servicePrice,
      time: "",
    }));
  };

  const handleServiceSelect = (serviceId: string) => {
    if (!serviceId) {
      setForm((prev) => ({
        ...prev,
        serviceId: "",
        serviceName: "",
        servicePrice: 0,
        activeTime: 0,
        restTime: 0,
        totalTime: 0,
        date: "",
        time: "",
      }));
      return;
    }
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    const isAny = form.stylistId === "any" || form.stylistId === "";
    const stylist = stylists.find((s) => s.id === form.stylistId);
    const resolvedPrice = isAny
      ? Math.min(
          service.price.director,
          service.price.senior,
          service.price.junior,
        )
      : stylist
      ? service.price[stylist.level]
      : service.price.junior;

    setForm((prev) => ({
      ...prev,
      serviceId: service.id,
      serviceName: service.name,
      servicePrice: resolvedPrice,
      activeTime: service.activeTime,
      restTime: service.restTime,
      totalTime: service.totalTime,
      date: "",
      time: "",
    }));
  };

  const handlePhoneChange = (value: string) => {
    setForm((prev) => ({ ...prev, customerPhone: value }));
    setErrors((prev) => ({ ...prev, phone: undefined }));
    lookupCustomer(value);
  };

  const handleNameChange = (value: string) => {
    setForm((prev) => ({ ...prev, customerName: value }));
    setErrors((prev) => ({ ...prev, name: undefined }));
  };

  // ── Step validation ───────────────────────────────────────────────────────

  const canProceed = (): boolean => {
    // Step 1 — must have a date and time selected
    if (step === 1) return form.serviceId !== "" && form.date !== "" && form.time !== "";
    // Step 2 — must have valid phone, confirmed, and valid name
    if (step === 2)
      return (
        validatePhone(form.customerPhone) &&
        validateName(form.customerName)
      );
    return false;
  };

  const handleNext = () => {
    if (step === 1 && canProceed()) {
      setStep(2);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setConfirmed(false);
    setConfirmedBooking(null);
    setStep(1);
    setCustomerProfile(null);
    setErrors({});
    setForm({
      customerName: "",
      customerPhone: "",
      stylistId: "any",
      stylistName: "",
      stylistLevel: "junior",
      serviceId: "",
      serviceName: "",
      servicePrice: 0,
      activeTime: 0,
      restTime: 0,
      totalTime: 0,
      date: "",
      time: "",
      notes: "",
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Validate step 2 before submitting
    const newErrors: { name?: string; phone?: string } = {};
    if (!validatePhone(form.customerPhone))
      newErrors.phone = "Invalid phone number";
    if (!validateName(form.customerName)) newErrors.name = "Invalid name";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Resolve final stylist if "any" was selected
    // For now we leave stylistId as 'any' — in a real implementation
    // you'd assign the first available stylist at submission time
    const finalStylistName =
      form.stylistId === "any" ? "Any available stylist" : form.stylistName;

    setSubmitting(true);
    try {
      const booking: Omit<Booking, "id"> = {
        bookingType: "customer",
        status: "pending",
        customerName: form.customerName,
        customerPhone: cleanPhone(form.customerPhone),
        stylistId: form.stylistId,
        stylistName: finalStylistName,
        stylistLevel: form.stylistLevel,
        serviceId: form.serviceId,
        serviceName: form.serviceName,
        servicePrice: form.servicePrice,
        activeTime: form.activeTime,
        restTime: form.restTime,
        totalTime: form.totalTime,
        date: form.date,
        time: form.time,
        notes: form.notes,
        createdAt: new Date().toISOString(),
      };

      const timestamp = Date.now();
      const safeDate = form.date;
      const safeStylist = finalStylistName.replace(/\s+/g, "-").toLowerCase();
      const docId = `${safeDate}_${safeStylist}_${timestamp}`;

      await setDoc(doc(collection(db, "bookings"), docId), booking);
      setConfirmedBooking(booking);
      setConfirmed(true);
    } catch (err) {
      console.error("Booking submission error:", err);
      alert("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (confirmed && confirmedBooking) {
    return (
      <BookingConfirmation booking={confirmedBooking} onReset={resetForm} />
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-body)" }}>
      <StepIndicator currentStep={step} />

      <div style={{ padding: "1.75rem 2rem" }}>
        {/* Step 1 — Calendar, stylist, service */}
        {step === 1 && (
          <BookingCalendar
            stylistId={form.stylistId}
            serviceId={form.serviceId}
            date={form.date}
            time={form.time}
            activeTime={form.activeTime}
            restTime={form.restTime}
            totalTime={form.totalTime}
            notes={form.notes}
            onStylistSelect={handleStylistSelect}
            onServiceSelect={handleServiceSelect}
            onDateSelect={(date) =>
              setForm((prev) => ({ ...prev, date, time: "" }))
            }
            onTimeSelect={(time: string) =>
              setForm((prev) => ({ ...prev, time }))
            }
            onNotesChange={(val: string) =>
              setForm((prev) => ({ ...prev, notes: val }))
            }
          />
        )}

        {/* Step 2 — Customer details */}
        {step === 2 && (
          <StepTwoDetails
            customerName={form.customerName}
            customerPhone={form.customerPhone}
            lookingUp={lookingUp}
            customerProfile={customerProfile}
            errors={errors}
            onPhoneChange={handlePhoneChange}
            onNameChange={handleNameChange}
            stylistId={form.stylistId}
            stylistName={form.stylistName}
            serviceName={form.serviceName}
            servicePrice={form.servicePrice}
            activeTime={form.activeTime}
            restTime={form.restTime}
            date={form.date}
            time={form.time}
          />
        )}

        {/* Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "1.75rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          {step > 1 ? (
            <button
              onClick={() => setStep((prev) => prev - 1)}
              style={{
                padding: "0.65rem 1.5rem",
                background: "transparent",
                border: "1.5px solid var(--border)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--text-primary)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              ← Back
            </button>
          ) : (
            <span />
          )}

          {step === 1 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              style={{
                padding: "0.65rem 2rem",
                background: canProceed()
                  ? "var(--text-primary)"
                  : "var(--surface-raised)",
                color: canProceed() ? "var(--white)" : "var(--text-muted)",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: canProceed() ? "pointer" : "not-allowed",
                fontSize: "0.875rem",
                fontWeight: 500,
                fontFamily: "var(--font-body)",
                letterSpacing: "0.04em",
                transition: "all 0.15s",
              }}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              style={{
                padding: "0.65rem 2rem",
                background:
                  canProceed() && !submitting
                    ? "var(--text-primary)"
                    : "var(--surface-raised)",
                color:
                  canProceed() && !submitting
                    ? "var(--white)"
                    : "var(--text-muted)",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: canProceed() && !submitting ? "pointer" : "not-allowed",
                fontSize: "0.875rem",
                fontWeight: 500,
                fontFamily: "var(--font-body)",
                letterSpacing: "0.04em",
                transition: "all 0.15s",
              }}
            >
              {submitting ? "Confirming..." : "Confirm Booking"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingForm;
