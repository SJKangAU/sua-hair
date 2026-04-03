// TrainingList.tsx
// Displays all training sessions from Firestore bookings
// Filtered to bookingType === 'training'
// Split into upcoming and past sessions
// Shows trainer, trainee, topic, date, time, duration

import { useMemo } from 'react';
import { useBookingContext } from '../../../context/BookingContext';
import Badge from '../../ui/Badge';

const TrainingList = () => {
  const { bookings, loading } = useBookingContext();
  const today = new Date().toISOString().split('T')[0];

  // Filter to training sessions only
  const trainingSessions = useMemo(() =>
    bookings.filter(b => b.bookingType === 'training'),
    [bookings]
  );

  const upcoming = trainingSessions
    .filter(b => b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = trainingSessions
    .filter(b => b.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (loading) {
    return (
      <p style={{ textAlign: 'center', color: '#6b6b6b', padding: '1.5rem' }}>
        Loading sessions...
      </p>
    );
  }

  if (trainingSessions.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '2.5rem',
        background: 'white',
        borderRadius: '12px',
        color: '#6b6b6b',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎓</p>
        <p style={{ fontSize: '0.9rem' }}>No training sessions yet. Create one above.</p>
      </div>
    );
  }

  const SessionRow = ({ session }: { session: typeof bookings[0] }) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '100px 1fr 1fr 1fr 60px auto',
      alignItems: 'center',
      gap: '1rem',
      padding: '0.875rem 1.25rem',
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      border: '1px solid #f0f0f0',
      fontSize: '0.85rem',
    }}>
      {/* Date */}
      <div>
        <p style={{ fontWeight: 600, margin: 0 }}>{session.date}</p>
        <p style={{ color: '#6b6b6b', margin: 0, fontSize: '0.78rem' }}>{session.time}</p>
      </div>

      {/* Topic */}
      <div>
        <p style={{ fontWeight: 600, margin: 0 }}>{session.trainingTopic || session.serviceName}</p>
        <p style={{ color: '#6b6b6b', margin: 0, fontSize: '0.78rem' }}>{session.totalTime} min</p>
      </div>

      {/* Trainer */}
      <div>
        <p style={{ margin: 0, color: '#6b6b6b', fontSize: '0.72rem' }}>Trainer</p>
        <p style={{ margin: 0, fontWeight: 500 }}>{session.stylistName}</p>
      </div>

      {/* Trainee */}
      <div>
        <p style={{ margin: 0, color: '#6b6b6b', fontSize: '0.72rem' }}>Trainee</p>
        <p style={{ margin: 0, fontWeight: 500 }}>{session.traineeName || session.customerName}</p>
      </div>

      {/* Duration badge */}
      <div style={{
        background: '#eaf3de',
        color: '#27500a',
        fontSize: '0.72rem',
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: '20px',
        whiteSpace: 'nowrap',
        textAlign: 'center',
      }}>
        {session.totalTime}m
      </div>

      {/* Status */}
      <Badge variant="training" />
    </div>
  );

  const SectionLabel = ({ text, count }: { text: string; count: number }) => (
    <p style={{
      fontSize: '0.78rem',
      fontWeight: 600,
      color: '#6b6b6b',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      margin: '0 0 0.75rem',
    }}>
      {text}
      <span style={{ marginLeft: '0.5rem', fontWeight: 400 }}>({count})</span>
    </p>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Upcoming sessions */}
      {upcoming.length > 0 && (
        <div>
          <SectionLabel text="Upcoming" count={upcoming.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {upcoming.map(session => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {/* Past sessions */}
      {past.length > 0 && (
        <div>
          <SectionLabel text="Past Sessions" count={past.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {past.map(session => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingList;