// BookingCard.tsx
// Individual booking row in the admin dashboard
// Actions:
//   Pending   → Confirm or Cancel
//   Confirmed → Cancel
//   Cancelled → Restore (sets back to pending)

import type { Booking } from '../../types';

interface Props {
  booking: Booking;
  onUpdate: (id: string, status: 'pending' | 'confirmed' | 'cancelled') => void;
}

// Status badge colours
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#faeeda', color: '#854f0b' },
  confirmed: { bg: '#e1f5ee', color: '#085041' },
  cancelled: { bg: '#fcebeb', color: '#a32d2d' },
};

const BookingCard = ({ booking, onUpdate }: Props) => {
  // Delegates status update to parent via onUpdate
  // Actual Firestore write handled by useBookings hook
  const updateStatus = (status: 'confirmed' | 'cancelled' | 'pending') => {
    onUpdate(booking.id, status);
  };

  const statusStyle = STATUS_COLORS[booking.status] || STATUS_COLORS.pending;

  return (
    <div style={{
      background: 'white',
      borderRadius: '10px',
      padding: '1.25rem 1.5rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr auto',
      alignItems: 'center',
      gap: '1rem',
    }}>

      {/* Customer info */}
      <div>
        <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{booking.customerName}</p>
        <p style={{ color: '#6b6b6b', fontSize: '0.82rem' }}>{booking.customerPhone}</p>
      </div>

      {/* Service info */}
      <div>
        <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{booking.serviceName}</p>
        <p style={{ color: '#6b6b6b', fontSize: '0.82rem' }}>with {booking.stylistName}</p>
        {booking.restTime > 0 && (
          <p style={{ color: '#aaa', fontSize: '0.78rem' }}>
            {booking.activeTime}min active + {booking.restTime}min setting
          </p>
        )}
      </div>

      {/* Date and time */}
      <div>
        <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{booking.date}</p>
        <p style={{ color: '#6b6b6b', fontSize: '0.82rem' }}>{booking.time}</p>
        <p style={{ color: '#6b6b6b', fontSize: '0.78rem' }}>from ${booking.servicePrice}</p>
      </div>

      {/* Status and actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>

        {/* Status badge */}
        <span style={{
          padding: '0.25rem 0.75rem',
          borderRadius: '20px',
          fontSize: '0.78rem',
          fontWeight: 600,
          background: statusStyle.bg,
          color: statusStyle.color,
          textTransform: 'capitalize',
        }}>
          {booking.status}
        </span>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>

          {/* Confirm — only for pending */}
          {booking.status === 'pending' && (
            <button
              onClick={() => updateStatus('confirmed')}
              style={{
                padding: '0.3rem 0.7rem',
                background: '#e1f5ee',
                color: '#085041',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Confirm
            </button>
          )}

          {/* Cancel — for pending and confirmed */}
          {booking.status !== 'cancelled' && (
            <button
              onClick={() => updateStatus('cancelled')}
              style={{
                padding: '0.3rem 0.7rem',
                background: '#fcebeb',
                color: '#a32d2d',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
          )}

          {/* Restore — only for cancelled bookings */}
          {booking.status === 'cancelled' && (
            <button
              onClick={() => updateStatus('pending')}
              style={{
                padding: '0.3rem 0.7rem',
                background: '#faeeda',
                color: '#854f0b',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Restore
            </button>
          )}
        </div>

        {/* Notes */}
        {booking.notes && (
          <p style={{ fontSize: '0.75rem', color: '#6b6b6b', maxWidth: '140px', textAlign: 'right' }}>
            📝 {booking.notes}
          </p>
        )}
      </div>
    </div>
  );
};

export default BookingCard;