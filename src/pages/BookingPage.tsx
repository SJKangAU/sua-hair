// BookingPage.tsx
// Customer facing booking page
// Wrapped with SalonDataProvider so BookingForm can access
// stylists and services from Firestore via context

import BookingForm from '../components/booking/BookingForm';
import { SalonDataProvider } from '../context/SalonDataContext';

const BookingPage = () => {
  return (
    <SalonDataProvider>
      <div style={{ minHeight: '100vh', background: '#f5f0e8', fontFamily: 'Georgia, serif' }}>

        {/* Header */}
        <header style={{
          background: '#1a1a1a',
          color: 'white',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', color: '#c9a96e', margin: 0 }}>Sua Hair</h1>
            <p style={{ fontSize: '0.75rem', color: '#aaa', margin: 0 }}>
              Melbourne's best experienced hairdressers
            </p>
          </div>
          <a
            href="/admin/login"
            style={{
              background: 'none',
              border: '1px solid #c9a96e',
              color: '#c9a96e',
              padding: '0.4rem 0.9rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              textDecoration: 'none',
            }}
          >
            Admin
          </a>
        </header>

        {/* Main content */}
        <main style={{ padding: '2rem 1rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.75rem', color: '#1a1a1a' }}>Book an Appointment</h2>
            <p style={{ color: '#6b6b6b' }}>Fill in your details below and we'll see you soon</p>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '520px',
            margin: '0 auto',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}>
            <BookingForm />
          </div>
        </main>

        {/* Footer */}
        <footer style={{
          textAlign: 'center',
          padding: '1.5rem',
          color: '#6b6b6b',
          fontSize: '0.8rem',
          borderTop: '1px solid #ddd',
          marginTop: '3rem',
        }}>
          <p>Sua Hair Studio © 2024 · (03) 9569 0840 · Melbourne, VIC</p>
        </footer>

      </div>
    </SalonDataProvider>
  );
};

export default BookingPage;