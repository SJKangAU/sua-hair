// BookingConfirmation.tsx
// Shown after a successful booking submission
// Displays booking details and provides Add to Calendar options
// Supports Google Calendar (link) and Apple/Outlook (ICS download)

import { getGoogleCalendarLink, downloadICSFile } from '../../lib/calendar';
import type { Booking } from '../../types';

interface Props {
  booking: Omit<Booking, 'id'>;
  onReset: () => void;
}

const BookingConfirmation = ({ booking, onReset }: Props) => {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>

      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#c9a96e' }}>
        Booking Confirmed!
      </h2>

      <p>Thank you, <strong>{booking.customerName}</strong>!</p>

      {/* Booking details */}
      <div style={{
        background: '#f5f0e8',
        borderRadius: '8px',
        padding: '1rem',
        margin: '1.5rem 0',
        textAlign: 'left',
        fontSize: '0.9rem',
        lineHeight: '1.8',
      }}>
        <p><strong>Stylist:</strong> {booking.stylistName}</p>
        <p><strong>Service:</strong> {booking.serviceName}</p>
        <p>
          <strong>Duration:</strong> {booking.totalTime} min
          {booking.restTime > 0 && (
            <span style={{ color: '#6b6b6b' }}>
              {' '}({booking.activeTime} min active + {booking.restTime} min setting time)
            </span>
          )}
        </p>
        <p><strong>Date:</strong> {booking.date}</p>
        <p><strong>Time:</strong> {booking.time}</p>
        <p><strong>Price:</strong> from ${booking.servicePrice}</p>
      </div>

      <p style={{ color: '#6b6b6b', fontSize: '0.85rem' }}>
        Call us on (03) 9569 0840 if you need to make changes.
      </p>

      {/* Add to Calendar */}
      <div style={{ marginTop: '1.5rem' }}>
        <p style={{ fontWeight: 500, marginBottom: '0.75rem', fontSize: '0.9rem' }}>
          Add to your calendar:
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={getGoogleCalendarLink(booking)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.6rem 1.2rem',
              background: '#4285F4',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            📅 Google Calendar
          </a>
          <button
            onClick={() => downloadICSFile(booking)}
            style={{
              padding: '0.6rem 1.2rem',
              background: '#1a1a1a',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            🗓 Apple / Outlook
          </button>
        </div>
      </div>

      <button
        onClick={onReset}
        style={{
          marginTop: '1.5rem',
          padding: '0.75rem 1.5rem',
          background: '#c9a96e',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '1rem',
        }}
      >
        Make Another Booking
      </button>
    </div>
  );
};

export default BookingConfirmation;