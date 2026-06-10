// BookingConfirmation.tsx
// Confirmation screen after successful booking submission
// Neutral design with warm gold accent

import { getGoogleCalendarLink, downloadICSFile } from '../../lib/calendar';
import { parseLocalDate } from '../../lib/dates';
import type { Booking } from '../../types';

interface Props {
  booking: Omit<Booking, 'id'>;
  onReset: () => void;
}

const BookingConfirmation = ({ booking, onReset }: Props) => {
  const formattedDate = parseLocalDate(booking.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div style={{
      padding: '2.5rem 2rem',
      fontFamily: 'var(--font-body)',
      textAlign: 'center',
    }}>
      {/* Check circle */}
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'var(--surface)',
        border: '2px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 1.25rem',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12l5 5 11-11"
            stroke="var(--gold)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '2rem',
        fontWeight: 400,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        marginBottom: '0.4rem',
      }}>
        Booking Confirmed
      </h2>
      <p style={{
        fontSize: '0.875rem',
        color: 'var(--text-muted)',
        marginBottom: '2rem',
      }}>
        We look forward to seeing you, <strong style={{ color: 'var(--text-primary)' }}>{booking.customerName}</strong>.
      </p>

      {/* Booking details */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        marginBottom: '1.75rem',
        border: '1px solid var(--border)',
        textAlign: 'left',
      }}>
        {[
          { label: 'Stylist', value: booking.stylistName },
          { label: 'Service', value: booking.serviceName },
          { label: 'Date', value: formattedDate },
          { label: 'Time', value: booking.time },
          { label: 'From', value: `$${booking.servicePrice}` },
        ].map(row => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.875rem',
              padding: '0.4rem 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
            <span style={{ fontWeight: 500 }}>{row.value}</span>
          </div>
        ))}
        {booking.restTime > 0 && (
          <p style={{
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            marginTop: '0.75rem',
          }}>
            {booking.activeTime} min active + {booking.restTime} min setting time
          </p>
        )}
      </div>

      {/* Calendar buttons */}
      <p style={{
        fontSize: '0.78rem',
        fontWeight: 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '0.75rem',
      }}>
        Add to calendar
      </p>
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        justifyContent: 'center',
        marginBottom: '1.75rem',
      }}>
        <a
          href={getGoogleCalendarLink(booking)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '0.65rem 1.25rem',
            background: 'var(--white)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontSize: '0.82rem',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          Google Calendar
        </a>
        <button
          onClick={() => downloadICSFile(booking)}
          style={{
            padding: '0.65rem 1.25rem',
            background: 'var(--white)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '0.82rem',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          Apple / Outlook
        </button>
      </div>

      {/* Contact note */}
      <p style={{
        fontSize: '0.82rem',
        color: 'var(--text-muted)',
        marginBottom: '1.75rem',
      }}>
        Need to make changes? Call us on{' '}
        <a
          href="tel:0395690840"
          style={{ color: 'var(--text-primary)', fontWeight: 500, textDecoration: 'none' }}
        >
          (03) 9569 0840
        </a>
      </p>

      {/* Book again */}
      <button
        onClick={onReset}
        style={{
          padding: '0.65rem 2rem',
          background: 'var(--text-primary)',
          color: 'var(--white)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 500,
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.04em',
        }}
      >
        Make another booking
      </button>
    </div>
  );
};

export default BookingConfirmation;