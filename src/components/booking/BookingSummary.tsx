// BookingSummary.tsx
// Displays a summary of the booking before final confirmation
// Shown at the bottom of Step 3 once date and time are selected

interface Props {
  customerName: string;
  customerPhone: string;
  stylistName: string;
  serviceName: string;
  servicePrice: number;
  activeTime: number;
  restTime: number;
  date: string;
  time: string;
}

const BookingSummary = ({
  customerName,
  customerPhone,
  stylistName,
  serviceName,
  servicePrice,
  activeTime,
  restTime,
  date,
  time,
}: Props) => {
  return (
    <div style={{
      marginTop: '1.5rem',
      padding: '1rem',
      background: '#f5f0e8',
      borderRadius: '8px',
      fontSize: '0.9rem',
      lineHeight: '1.7',
    }}>
      <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Booking Summary</p>
      <p><strong>Name:</strong> {customerName}</p>
      <p><strong>Phone:</strong> {customerPhone}</p>
      <p><strong>Stylist:</strong> {stylistName}</p>
      <p><strong>Service:</strong> {serviceName} (from ${servicePrice})</p>
      {/* Only show timing breakdown for services with a rest period */}
      {restTime > 0 && (
        <p style={{ color: '#6b6b6b', fontSize: '0.82rem' }}>
          {activeTime} min active + {restTime} min setting time
        </p>
      )}
      <p><strong>Date:</strong> {date}</p>
      <p><strong>Time:</strong> {time}</p>
    </div>
  );
};

export default BookingSummary;