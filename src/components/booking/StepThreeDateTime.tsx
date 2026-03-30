// StepThreeDateTime.tsx
// Step 3 of the booking form
// Handles date selection with closed-day validation
// Fetches real-time stylist availability and renders time slot grid
// Greyed-out slots are shown as unavailable rather than hidden

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { generateSlots, isSalonClosed, isPastSameDayCutoff, getMinBookableDate } from '../../lib/scheduling';
import BookingSummary from './BookingSummary';
import type { Booking } from '../../types';

interface Props {
  stylistId: string;
  serviceId: string;
  activeTime: number;
  totalTime: number;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  stylistName: string;
  serviceName: string;
  servicePrice: number;
  restTime: number;
  onDateChange: (date: string) => void;
  onTimeSelect: (time: string) => void;
  errors: { date?: string };
}

const inputStyle = {
  width: '100%',
  padding: '0.65rem',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '1rem',
  marginTop: '0.25rem',
  boxSizing: 'border-box' as const,
};

const inputErrorStyle = {
  ...inputStyle,
  border: '1px solid #e24b4a',
};

const errorTextStyle = {
  color: '#e24b4a',
  fontSize: '0.8rem',
  marginTop: '0.25rem',
  display: 'block' as const,
};

const labelStyle = {
  display: 'block' as const,
  marginBottom: '1rem',
  fontWeight: 500,
  fontSize: '0.95rem',
};

const StepThreeDateTime = ({
  stylistId,
  serviceId,
  activeTime,
  totalTime,
  date,
  time,
  customerName,
  customerPhone,
  stylistName,
  serviceName,
  servicePrice,
  restTime,
  onDateChange,
  onTimeSelect,
  errors,
}: Props) => {
  const [slots, setSlots] = useState<{ time: string; available: boolean; reason?: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Validate date selection — check for closed days and same-day cutoff
  const handleDateChange = (selected: string) => {
    if (isSalonClosed(selected)) {
      onDateChange('CLOSED');
      return;
    }
    if (isPastSameDayCutoff(selected)) {
      onDateChange('CUTOFF');
      return;
    }
    onDateChange(selected);
  };

  // Fetch stylist bookings and regenerate slots whenever key inputs change
  useEffect(() => {
    const fetchSlots = async () => {
  if (!stylistId || !serviceId || !date || date === 'CLOSED' || date === 'CUTOFF') return;

  setLoadingSlots(true);
  try {
    const q = query(
      collection(db, 'bookings'),
      where('stylistId', '==', stylistId),
      where('date', '==', date)
    );
    const snapshot = await getDocs(q);
    const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));

    const generated = generateSlots(date, stylistId, totalTime, activeTime, bookings);

    setSlots(generated);
  } catch (err) {
    console.error('Error fetching slots:', err);
  }
  setLoadingSlots(false);
};

    fetchSlots();
  }, [stylistId, serviceId, date, totalTime, activeTime]);

  const validDate = date && date !== 'CLOSED' && date !== 'CUTOFF';

  return (
    <div>
      <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem' }}>Pick a Date & Time</h3>

      {/* Date picker */}
      <label style={labelStyle}>
        Date
        <input
          style={errors.date ? inputErrorStyle : inputStyle}
          type="date"
          min={getMinBookableDate()}
          value={validDate ? date : ''}
          onChange={e => handleDateChange(e.target.value)}
        />
        {/* Closed day error */}
        {date === 'CLOSED' && (
          <span style={errorTextStyle}>
            Sua Hair is closed on Mondays. Please select another day.
          </span>
        )}
        {/* Same-day cutoff error */}
        {date === 'CUTOFF' && (
          <span style={errorTextStyle}>
            Same-day bookings are no longer available. Please select a future date.
          </span>
        )}
        {errors.date && <span style={errorTextStyle}>{errors.date}</span>}
      </label>

      {/* Time slot grid */}
      {validDate && (
        <div>
          <p style={{ fontWeight: 500, marginBottom: '0.5rem' }}>
            Available Times
            {loadingSlots && (
              <span style={{ color: '#6b6b6b', fontWeight: 400, fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                Checking availability...
              </span>
            )}
          </p>

          {/* No slots available message */}
          {!loadingSlots && slots.length === 0 && (
            <p style={{ color: '#6b6b6b', fontSize: '0.9rem' }}>
              No available slots for this date. Please try another day.
            </p>
          )}

          {/* Slot grid — greyed out slots are shown but not clickable */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
            {slots.map(slot => {
              const selected = time === slot.time;
              const unavailable = !slot.available;
              return (
                <div
                  key={slot.time}
                  onClick={() => slot.available && onTimeSelect(slot.time)}
                  title={unavailable ? slot.reason : undefined}
                  style={{
                    padding: '0.5rem',
                    textAlign: 'center',
                    border: `2px solid ${selected ? '#c9a96e' : unavailable ? '#f0f0f0' : '#ddd'}`,
                    borderRadius: '6px',
                    cursor: unavailable ? 'not-allowed' : 'pointer',
                    background: selected ? '#fdf6ec' : unavailable ? '#f9f9f9' : 'white',
                    fontSize: '0.85rem',
                    fontWeight: selected ? 600 : 400,
                    color: selected ? '#c9a96e' : unavailable ? '#ccc' : '#1a1a1a',
                    transition: 'all 0.1s',
                  }}
                >
                  {slot.time}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b6b6b' }}>
            <span>🟡 Selected</span>
            <span>⬜ Available</span>
            <span style={{ color: '#ccc' }}>⬜ Unavailable</span>
          </div>
        </div>
      )}

      {/* Booking summary — only shown once both date and time are selected */}
      {validDate && time && (
        <BookingSummary
          customerName={customerName}
          customerPhone={customerPhone}
          stylistName={stylistName}
          serviceName={serviceName}
          servicePrice={servicePrice}
          activeTime={activeTime}
          restTime={restTime}
          date={date}
          time={time}
        />
      )}
    </div>
  );
};

export default StepThreeDateTime;