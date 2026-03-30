// StepTwoService.tsx
// Step 2 of the booking form
// Consumes stylists and services from SalonDataContext (Firestore)
// Shows stylist headshots and resolves tiered pricing based on selected stylist level

import { useSalonData } from '../../context/SalonDataContext';

interface Props {
  stylistId: string;
  serviceId: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  notes: string;
  onStylistSelect: (id: string) => void;
  onServiceSelect: (id: string) => void;
  onNotesChange: (value: string) => void;
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

const labelStyle = {
  display: 'block' as const,
  marginBottom: '1rem',
  fontWeight: 500,
  fontSize: '0.95rem',
};

const StepTwoService = ({
  stylistId,
  serviceId,
  activeTime,
  restTime,
  totalTime,
  notes,
  onStylistSelect,
  onServiceSelect,
  onNotesChange,
}: Props) => {
  const {
    stylists,
    stylistsLoading,
    stylistsError,
    services,
    servicesLoading,
    servicesError,
  } = useSalonData();

  // Get the currently selected stylist to resolve tiered pricing
  const selectedStylist = stylists.find(s => s.id === stylistId);
  const priceLevel = selectedStylist?.level ?? 'junior';

  if (stylistsLoading || servicesLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b6b6b' }}>
        Loading stylists and services...
      </div>
    );
  }

  if (stylistsError || servicesError) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#e24b4a' }}>
        {stylistsError || servicesError}
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem' }}>
        Choose Your Stylist & Service
      </h3>

      {/* Stylist selection cards with headshots */}
      <p style={{ fontWeight: 500, marginBottom: '0.75rem' }}>Stylist</p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        {stylists.map(stylist => {
          const selected = stylistId === stylist.id;
          return (
            <div
              key={stylist.id}
              onClick={() => onStylistSelect(stylist.id)}
              style={{
                padding: '0.75rem',
                border: `2px solid ${selected ? '#c9a96e' : '#ddd'}`,
                borderRadius: '10px',
                cursor: 'pointer',
                background: selected ? '#fdf6ec' : 'white',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              {/* Headshot */}
              {stylist.photoUrl ? (
                <img
                  src={stylist.photoUrl}
                  alt={stylist.name}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                    border: selected ? '2px solid #c9a96e' : '2px solid #eee',
                  }}
                  // Fallback to initials if image fails to load
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                // Initials fallback if no photo
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#c9a96e',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '1rem',
                  flexShrink: 0,
                }}>
                  {stylist.name.charAt(0)}
                </div>
              )}

              {/* Name and role */}
              <div style={{ minWidth: 0 }}>
                <p style={{
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {stylist.name}
                </p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b6b' }}>{stylist.role}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Service dropdown — shows tiered price based on selected stylist */}
      <label style={labelStyle}>
        Service
        {!stylistId && (
          <span style={{ fontSize: '0.78rem', color: '#c9a96e', marginLeft: '0.5rem', fontWeight: 400 }}>
            — select a stylist first to see pricing
          </span>
        )}
        <select
          style={inputStyle}
          value={serviceId}
          onChange={e => onServiceSelect(e.target.value)}
          disabled={!stylistId}
        >
          <option value="">Select a service...</option>
          {services.map(service => {
            // Resolve price based on selected stylist's level
            const price = service.price[priceLevel];
            return (
              <option key={service.id} value={service.id}>
                {service.name} — from ${price} ({service.totalTime} min total)
              </option>
            );
          })}
        </select>
      </label>

      {/* Rest time breakdown */}
      {serviceId && restTime > 0 && (
        <div style={{
          background: '#f0f7ff',
          border: '1px solid #b5d4f4',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          fontSize: '0.85rem',
          color: '#6b6b6b',
          marginBottom: '1rem',
        }}>
          This service includes <strong>{activeTime} min</strong> of active styling
          and <strong>{restTime} min</strong> of setting time.
          Your total appointment is <strong>{totalTime} min</strong>.
        </div>
      )}

      {/* Optional notes */}
      <label style={labelStyle}>
        Notes (optional)
        <textarea
          style={{ ...inputStyle, height: '80px', resize: 'vertical' }}
          placeholder="Any special requests or hair concerns..."
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
        />
      </label>
    </div>
  );
};

export default StepTwoService;