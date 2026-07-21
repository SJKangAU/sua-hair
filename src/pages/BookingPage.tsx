// BookingPage.tsx
// Customer-facing booking page — pure black & white luxury aesthetic
//
// Wraps BookingForm in a SalonDataProvider so stylists and services are
// available to all child components via context (useSalonData).
//
// Layout: sticky black header → black hero → floating white card (BookingForm)
// → footer.  The card uses a negative top margin to overlap the hero, giving
// the illusion that the form "floats" out of the dark section.

import BookingForm from "../components/booking/BookingForm";
import { SalonDataProvider } from "../context/SalonDataProvider";

const BookingPage = () => {
  return (
    <SalonDataProvider>
      <div
        style={{
          minHeight: "100svh",
          background: "var(--paper)",
          fontFamily: "var(--font-body)",
        }}
      >
        {/* Header */}
        <header
          style={{
            background: "var(--ink)",
            padding: "0 clamp(1rem, 4vw, 1.75rem)",
            height: "60px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              fontWeight: 400,
              color: "var(--surface)",
              letterSpacing: "0.06em",
            }}
          >
            Sua Hair
          </span>
          <a
            href="/admin/login"
            style={{
              color: "var(--grey-muted)",
              fontSize: "var(--text-xs)",
              textDecoration: "none",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transition: "color var(--transition-fast)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--surface)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--grey-muted)")}
          >
            Staff login
          </a>
        </header>

        {/* Hero */}
        <div
          style={{
            background: "var(--ink)",
            padding: "3rem 1.5rem 4.5rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-2xs)",
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--grey-muted)",
              marginBottom: "0.875rem",
            }}
          >
            Melbourne's Korean Hair Studio
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
              fontWeight: 300,
              color: "var(--surface)",
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              margin: "0 0 0.75rem",
            }}
          >
            Book an Appointment
          </h1>
          <p
            style={{
              color: "var(--ink-muted)",
              fontSize: "var(--text-base)",
              letterSpacing: "0.04em",
            }}
          >
            Tuesday – Sunday · 10am – 6pm · Glen Waverley
          </p>
        </div>

        {/* Booking form card */}
        <main
          style={{
            maxWidth: "560px",
            margin: "-2.5rem auto 5rem",
            padding: "0 1.25rem",
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "16px",
              boxShadow:
                "0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}
          >
            <BookingForm />
          </div>
        </main>

        {/* Footer */}
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "2rem",
            textAlign: "center",
            color: "var(--grey-muted)",
            fontSize: "var(--text-xs)",
            letterSpacing: "0.02em",
          }}
        >
          <p>Sua Hair Studio © 2025 · (03) 9569 0840 · Glen Waverley, VIC</p>
          <p style={{ marginTop: "0.25rem" }}>
            <a
              href="https://suahair.com.au"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--ink-muted)", textDecoration: "none" }}
            >
              suahair.com.au
            </a>
          </p>
        </footer>
      </div>
    </SalonDataProvider>
  );
};

export default BookingPage;
