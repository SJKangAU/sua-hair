// BookingPage.tsx
// Customer-facing booking page
// Redesigned with warm neutral palette and editorial typography

import BookingForm from "../components/booking/BookingForm";
import { SalonDataProvider } from "../context/SalonDataContext";

const BookingPage = () => {
  return (
    <SalonDataProvider>
      <div
        style={{
          minHeight: "100vh",
          background: "var(--off-white)",
          fontFamily: "var(--font-body)",
        }}
      >
        {/* Header */}
        <header
          style={{
            background: "var(--text-primary)",
            padding: "0 2rem",
            height: "64px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <div>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 400,
                color: "var(--gold)",
                letterSpacing: "0.04em",
              }}
            >
              Sua Hair
            </span>
          </div>
          <a
            href="/admin/login"
            style={{
              color: "var(--text-muted)",
              fontSize: "0.78rem",
              textDecoration: "none",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-muted)")
            }
          >
            Staff login
          </a>
        </header>

        {/* Hero section */}
        <div
          style={{
            background: "var(--text-primary)",
            padding: "3rem 2rem 4rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.72rem",
              fontWeight: 500,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--gold)",
              marginBottom: "0.75rem",
            }}
          >
            Melbourne's Korean Hair Studio
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
              fontWeight: 300,
              color: "var(--white)",
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
            }}
          >
            Book an Appointment
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              color: "var(--text-muted)",
              fontSize: "0.9rem",
              letterSpacing: "0.02em",
            }}
          >
            Tuesday – Sunday · 10am – 6pm · Glen Waverley
          </p>
        </div>

        {/* Booking form card */}
        <main
          style={{
            maxWidth: "560px",
            margin: "-2rem auto 4rem",
            padding: "0 1.25rem",
          }}
        >
          <div
            style={{
              background: "var(--white)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
            }}
          >
            {/* Booking form card */}
            <main
              style={{
                maxWidth: "560px",
                margin: "-2rem auto 4rem",
                padding: "0 1.25rem",
              }}
            >
              <div
                style={{
                  background: "var(--white)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-lg)",
                  overflow: "hidden",
                }}
              >
                <BookingForm />
              </div>
            </main>
          </div>
        </main>

        {/* Footer */}
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "2rem",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            letterSpacing: "0.02em",
          }}
        >
          <p>Sua Hair Studio © 2024 · (03) 9569 0840 · Glen Waverley, VIC</p>
          <p style={{ marginTop: "0.25rem" }}>
            <a
              href="https://suahair.com.au"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--gold)", textDecoration: "none" }}
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
