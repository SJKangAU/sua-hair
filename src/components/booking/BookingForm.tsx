// BookingForm.tsx
// Orchestrator component for the multi-step booking flow
// Consumes stylists and services from SalonDataContext (Firestore)
// Holds all shared state and passes it down to step components

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
import StepOneDetails from "./StepOneDetails";
import StepTwoService from "./StepTwoService";
import StepThreeDateTime from "./StepThreeDateTime";
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
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    date?: string;
  }>({});

  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    stylistId: "",
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

  // ── Customer Lookup ───────────────────────────────────────────────────────

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
          (doc) => ({ id: doc.id, ...doc.data() } as Booking),
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

  // ── Field Handlers ────────────────────────────────────────────────────────

  const handlePhoneChange = (value: string) => {
    setForm((prev) => ({ ...prev, customerPhone: value }));
    setPhoneConfirmed(false);
    setErrors((prev) => ({ ...prev, phone: undefined }));
    lookupCustomer(value);
  };

  const handleNameChange = (value: string) => {
    setForm((prev) => ({ ...prev, customerName: value }));
    setErrors((prev) => ({ ...prev, name: undefined }));
  };

  // Use Firestore stylists from context instead of hardcoded data
  const handleStylistSelect = (stylistId: string) => {
    const stylist = stylists.find((s) => s.id === stylistId);
    if (stylist) {
      // Recalculate service price based on new stylist level
      const service = services.find((s) => s.id === form.serviceId);
      const resolvedPrice = service ? service.price[stylist.level] : 0;

      setForm((prev) => ({
        ...prev,
        stylistId: stylist.id,
        stylistName: stylist.name,
        stylistLevel: stylist.level,
        servicePrice: resolvedPrice,
        time: "",
      }));
    }
  };

  // Use Firestore services from context instead of hardcoded data
  const handleServiceSelect = (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    if (service) {
      // Resolve price based on currently selected stylist's level
      const stylist = stylists.find((s) => s.id === form.stylistId);
      const level = stylist?.level ?? "junior";
      const resolvedPrice = service.price[level];

      setForm((prev) => ({
        ...prev,
        serviceId: service.id,
        serviceName: service.name,
        servicePrice: resolvedPrice,
        activeTime: service.activeTime,
        restTime: service.restTime,
        totalTime: service.totalTime,
        time: "",
      }));
    }
  };

  const handleDateChange = (date: string) => {
    setForm((prev) => ({ ...prev, date, time: "" }));
    if (date === "CLOSED" || date === "CUTOFF") {
      setErrors((prev) => ({ ...prev, date }));
    } else {
      setErrors((prev) => ({ ...prev, date: undefined }));
    }
  };

  // ── Step Validation ───────────────────────────────────────────────────────

  const canProceed = (): boolean => {
    if (step === 1)
      return (
        validatePhone(form.customerPhone) &&
        validateName(form.customerName) &&
        phoneConfirmed
      );
    if (step === 2) return form.stylistId !== "" && form.serviceId !== "";
    if (step === 3)
      return (
        form.date !== "" &&
        form.date !== "CLOSED" &&
        form.date !== "CUTOFF" &&
        form.time !== ""
      );
    return false;
  };

  const handleNext = () => {
    if (step === 1) {
      const newErrors: { name?: string; phone?: string } = {};
      if (!validatePhone(form.customerPhone))
        newErrors.phone = "Invalid phone number";
      if (!validateName(form.customerName)) newErrors.name = "Invalid name";
      if (!phoneConfirmed)
        newErrors.phone = "Please confirm your mobile number";
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    }
    setStep((prev) => prev + 1);
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setConfirmed(false);
    setConfirmedBooking(null);
    setStep(1);
    setCustomerProfile(null);
    setPhoneConfirmed(false);
    setErrors({});
    setForm({
      customerName: "",
      customerPhone: "",
      stylistId: "",
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
    setSubmitting(true);
    try {
      const booking: Omit<Booking, "id"> = {
        ...form,
        customerPhone: cleanPhone(form.customerPhone),
        bookingType: "customer", // all customer portal bookings are type 'customer'
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      // Generate a readable document ID: date_stylistName_timestamp
      const timestamp = Date.now();
      const safeStylistName = form.stylistName
        .replace(/\s+/g, "-")
        .toLowerCase();
      const docId = `${form.date}_${safeStylistName}_${timestamp}`;

      // Use setDoc with custom ID instead of addDoc
      await setDoc(doc(collection(db, "bookings"), docId), booking);
      setConfirmedBooking(booking);
      setConfirmed(true);
    } catch (err) {
      console.error("Booking submission error:", err);
      alert("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  // ── Shared button styles ──────────────────────────────────────────────────

  const primaryBtn = (enabled: boolean) => ({
    padding: "0.75rem 1.5rem",
    background: enabled ? "#c9a96e" : "#ddd",
    color: enabled ? "white" : "#999",
    border: "none",
    borderRadius: "6px",
    cursor: enabled ? "pointer" : "not-allowed",
    fontSize: "1rem",
    marginLeft: "auto" as const,
  });

  const secondaryBtn = {
    padding: "0.75rem 1.5rem",
    background: "white",
    border: "1px solid #ddd",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "1rem",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (confirmed && confirmedBooking) {
    return (
      <BookingConfirmation booking={confirmedBooking} onReset={resetForm} />
    );
  }

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", padding: "1.5rem" }}>
      <StepIndicator currentStep={step} />

      {step === 1 && (
        <StepOneDetails
          customerName={form.customerName}
          customerPhone={form.customerPhone}
          phoneConfirmed={phoneConfirmed}
          lookingUp={lookingUp}
          customerProfile={customerProfile}
          errors={errors}
          onPhoneChange={handlePhoneChange}
          onNameChange={handleNameChange}
          onPhoneConfirm={setPhoneConfirmed}
        />
      )}

      {step === 2 && (
        <StepTwoService
          stylistId={form.stylistId}
          serviceId={form.serviceId}
          activeTime={form.activeTime}
          restTime={form.restTime}
          totalTime={form.totalTime}
          notes={form.notes}
          onStylistSelect={handleStylistSelect}
          onServiceSelect={handleServiceSelect}
          onNotesChange={(val) => setForm((prev) => ({ ...prev, notes: val }))}
        />
      )}

      {step === 3 && (
        <StepThreeDateTime
          stylistId={form.stylistId}
          serviceId={form.serviceId}
          activeTime={form.activeTime}
          totalTime={form.totalTime}
          date={form.date}
          time={form.time}
          customerName={form.customerName}
          customerPhone={form.customerPhone}
          stylistName={form.stylistName}
          serviceName={form.serviceName}
          servicePrice={form.servicePrice}
          restTime={form.restTime}
          onDateChange={handleDateChange}
          onTimeSelect={(val) => setForm((prev) => ({ ...prev, time: val }))}
          errors={errors}
        />
      )}

      {/* Navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "2rem",
        }}
      >
        {step > 1 && (
          <button
            onClick={() => setStep((prev) => prev - 1)}
            style={secondaryBtn}
          >
            Back
          </button>
        )}
        {step < 3 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            style={primaryBtn(canProceed())}
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canProceed() || submitting}
            style={primaryBtn(canProceed() && !submitting)}
          >
            {submitting ? "Booking..." : "Confirm Booking"}
          </button>
        )}
      </div>
    </div>
  );
};

export default BookingForm;
