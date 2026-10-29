// BookingForm.tsx
// ─────────────────────────────────────────────────────────────────────────────
// 3-step booking orchestrator — B&W luxury redesign
// ─────────────────────────────────────────────────────────────────────────────
// Step 1  ServiceStep      — multi-select services
// Step 2  StylistDateStep  — choose stylist, date and time (merged)
// Step 3  DetailsStep      — customer phone, name, optional email, notes
// Sheet   BookingSummarySheet — slide-up review before going to step 3
//
// Submitting does NOT write to Firestore. It sends the customer's CHOICES (service
// ids, stylist or "any", date, time, contact details) to the createBookingRequest
// function, which validates them, recomputes price and phases from the records,
// picks a real stylist for "any", holds the slot and returns what it decided
// (DEC-035). The screen after is "request received": a request is only confirmed
// when the salon approves it (DEC-038).
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import {
  cleanPhone,
  validatePhone,
  validateName,
  validateEmail,
} from "../../lib/validation";
import { combinePhases, phaseTotals } from "../../lib/bookingPhases";
import {
  BookingCommandError,
  createBookingRequest,
  newRequestId,
  type BookingRequestResult,
} from "../../lib/bookingApi";
import { useSalonData } from "../../context/SalonDataContext";
import StepIndicator from "./StepIndicator";
import ServiceStep from "./ServiceStep";
import StylistDateStep from "./StylistDateStep";
import DetailsStep from "./DetailsStep";
import BookingSummarySheet from "./BookingSummarySheet";
import BookingConfirmation from "./BookingConfirmation";
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
  /* bkFadeIn is defined globally in index.css (shared with the slot grid). */

  /* Layout paddings live in classes (not inline) so they can shrink on
     narrow phones — inline styles can't express breakpoints. */
  .bk-step-pad { padding: 1.75rem 1.5rem 0.5rem; }
  .bk-nav-bar  { padding: 1.25rem 1.5rem; }
  @media (max-width: 420px) {
    .bk-step-pad { padding: 1.5rem 1.125rem 0.5rem; }
    .bk-nav-bar  { padding: 1rem 1.125rem; }
  }
`;

const PRIMARY_BTN: React.CSSProperties = {
  padding: "0.75rem 1.75rem",
  background: "var(--accent)",
  color: "var(--surface)",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "var(--text-base)",
  fontWeight: 600,
  fontFamily: "var(--font-body)",
  letterSpacing: "0.04em",
};

const DISABLED_BTN: React.CSSProperties = {
  ...PRIMARY_BTN,
  background: "var(--border)",
  color: "var(--grey-muted)",
  cursor: "not-allowed",
};

const BACK_BTN: React.CSSProperties = {
  padding: "0.75rem 1.25rem",
  background: "transparent",
  border: "1.5px solid var(--border)",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "var(--text-base)",
  color: "var(--ink-muted)",
  fontFamily: "var(--font-body)",
  transition: "border-color var(--transition-fast), color var(--transition-fast)",
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
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  // Privacy consent — must be checked before the booking can be submitted.
  const [consent, setConsent] = useState(false);
  // Optional, separate, never pre-ticked: offers and reminders to come back (FR-030)
  const [marketing, setMarketing] = useState(false);

  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
  }>({});

  // ── Submit state ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // What the server decided (stylist, exact price...) once the request is accepted
  const [received, setReceived] = useState<{
    result: BookingRequestResult;
    customerName: string;
  } | null>(null);
  // One id per attempt, so a retried tap returns the same booking instead of a second
  const requestIdRef = useRef(newRequestId());

  // ── Derived values ─────────────────────────────────────────────────────────
  const selectedServices: FirestoreService[] = services.filter((s) =>
    selectedServiceIds.includes(s.id),
  );

  // The booking's phases: services with only hands-on + processing combine
  // exactly as they always did; a service with a return phase runs end to end
  const phases = combinePhases(selectedServices);
  const { totalTime, activeTime: totalActiveTime } = phaseTotals(phases);

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

  // Display string per service: the exact price for a chosen stylist; "from $X"
  // (the lowest tier) for "Any Available Stylist", because the server picks the
  // stylist when the request is received and the exact price is shown THEN.
  const getPriceDisplay = (service: FirestoreService): string =>
    stylistId === "any" ? `from $${getPrice(service)}` : `$${getPrice(service)}`;

  const estimatedTotal = selectedServices.reduce(
    (sum, s) => sum + getPrice(s),
    0,
  );

  const estimatedTotalDisplay =
    stylistId === "any" ? `from $${estimatedTotal}` : `$${estimatedTotal}`;

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

  const handlePhoneChange = (value: string) => {
    setCustomerPhone(value);
    setErrors((prev) => ({ ...prev, phone: undefined }));
    // No lookup here: `customerLookups` reads are staff-only (see
    // firestore.rules). Even a get-by-phone-number lookup would let an
    // anonymous visitor learn another customer's name and visit count
    // just by knowing/guessing their phone number, without proving they
    // own it — so the public form never reads customer identity back.
    // Returning customers simply re-enter their name.
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const newErrors: { name?: string; phone?: string; email?: string } = {};
    if (!validatePhone(customerPhone))
      newErrors.phone = "Please enter a valid Australian mobile number";
    if (!validateName(customerName))
      newErrors.name = "Please enter your full name";
    if (!validateEmail(customerEmail))
      newErrors.email = "Please enter a valid email address, or leave it blank";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    // Belt-and-braces: the Confirm button is already disabled until consent
    // is given, but guard here too so consentGivenAt is never omitted.
    if (!consent) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Choices only. The server reads the services and stylists from its own
      // records and works out price, duration and phases itself.
      const result = await createBookingRequest({
        serviceIds: selectedServiceIds,
        stylistId,
        date,
        time,
        customerName: customerName.trim(),
        customerPhone: cleanPhone(customerPhone),
        ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        consent: true,
        ...(marketing ? { marketingConsent: true as const } : {}),
        requestId: requestIdRef.current,
      });
      setReceived({ result, customerName: customerName.trim() });
    } catch (err) {
      console.error("Booking request error:", err);
      const message =
        err instanceof BookingCommandError
          ? err.message
          : "Something went wrong while sending your request. Please try again, or call us on (03) 9569 0840.";
      setSubmitError(message);
      if (err instanceof BookingCommandError && err.reason === "slot-taken") {
        // someone took the time first: back to choosing a time
        requestIdRef.current = newRequestId();
        setTime("");
        goTo(2);
      } else if (
        err instanceof BookingCommandError &&
        (err.reason === "closed" || err.reason === "invalid")
      ) {
        requestIdRef.current = newRequestId();
      }
    }
    setSubmitting(false);
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setSubmitError(null);
    setReceived(null);
    requestIdRef.current = newRequestId();
    setStep(1);
    setDirection("forward");
    setShowSummarySheet(false);
    setSelectedServiceIds([]);
    setStylistId("any");
    setDate("");
    setTime("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setNotes("");
    setConsent(false);
    setMarketing(false);
    setErrors({});
  };

  // ── Confirmation screen ───────────────────────────────────────────────────
  if (received) {
    return (
      <BookingConfirmation
        result={received.result}
        customerName={received.customerName}
        onReset={resetForm}
      />
    );
  }

  // ── Step 3 submit button state ────────────────────────────────────────────
  const canSubmit =
    validatePhone(customerPhone) &&
    validateName(customerName) &&
    validateEmail(customerEmail) &&
    consent &&
    !submitting;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "var(--font-body)" }}>
      <style>{ANIM_CSS}</style>

      <StepIndicator currentStep={step} />

      {/* Step content with slide animation */}
      <div style={{ overflow: "hidden" }}>
        <div
          key={step}
          className="bk-step-pad"
          style={{
            animation: `${
              direction === "forward" ? "bkSlideFromRight" : "bkSlideFromLeft"
            } 0.32s cubic-bezier(0.22, 1, 0.36, 1) both`,
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
              phases={phases.length > 0 ? phases : undefined}
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
              customerEmail={customerEmail}
              notes={notes}
              consent={consent}
              marketing={marketing}
              errors={errors}
              onPhoneChange={handlePhoneChange}
              onNameChange={(v) => {
                setCustomerName(v);
                setErrors((p) => ({ ...p, name: undefined }));
              }}
              onEmailChange={(v) => {
                setCustomerEmail(v);
                setErrors((p) => ({ ...p, email: undefined }));
              }}
              onNotesChange={setNotes}
              onConsentChange={setConsent}
              onMarketingChange={setMarketing}
            />
          )}
        </div>
      </div>

      {/* Navigation bar */}
      <div
        className="bk-nav-bar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid var(--border)",
          marginTop: "0.5rem",
        }}
      >
        {/* Back button */}
        {step > 1 ? (
          <button
            onClick={() => goTo(step - 1)}
            style={BACK_BTN}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--ink)";
              e.currentTarget.style.color = "var(--ink)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--ink-muted)";
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
            className="bk-cta"
            onClick={() => selectedServiceIds.length > 0 && goTo(2)}
            disabled={selectedServiceIds.length === 0}
            style={selectedServiceIds.length > 0 ? PRIMARY_BTN : DISABLED_BTN}
          >
            Continue
          </button>
        )}

        {step === 2 && (
          <button
            className="bk-cta"
            onClick={() => date && time && setShowSummarySheet(true)}
            disabled={!date || !time}
            style={date && time ? PRIMARY_BTN : DISABLED_BTN}
          >
            Review Booking
          </button>
        )}

        {step === 3 && (
          <button
            className="bk-cta"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={canSubmit ? PRIMARY_BTN : DISABLED_BTN}
          >
            {submitting ? "Sending..." : "Request Booking"}
          </button>
        )}
      </div>

      {/* Submit failure — inline error (the client flow has no toast provider) */}
      {submitError && (step === 3 || step === 2) && (
        <div
          style={{
            margin: "0 1.5rem 1.25rem",
            padding: "0.75rem 1rem",
            border: `1.5px solid var(--error)`,
            borderRadius: "8px",
            background: "var(--error-bg)",
            color: "var(--error)",
            fontSize: "0.82rem",
            lineHeight: 1.5,
          }}
        >
          {submitError}
        </div>
      )}

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
          phases={phases}
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
