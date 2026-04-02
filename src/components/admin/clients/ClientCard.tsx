// ClientCard.tsx
// Displays a single client profile with visit history
// Shows name, phone, visit count, total spend, favourite stylist
// Expandable to show full booking history
// "Book again" button pre-fills the create booking modal

import { useState } from 'react';
import Badge from '../../ui/Badge';
import type { ClientProfile } from './ClientSearch';

interface Props {
  client: ClientProfile;
  onBookAgain: (phone: string, name: string) => void;
}

const ClientCard = ({ client, onBookAgain }: Props) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      overflow: 'hidden',
      border: '1px solid #f0f0f0',
    }}>

      {/* Client header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        padding: '1.25rem 1.5rem',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

          {/* Avatar — initials */}
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: '#c9a96e',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '1.1rem',
            flexShrink: 0,
          }}>
            {client.name.charAt(0).toUpperCase()}
          </div>

          {/* Name, phone, loyalty badge */}
          <div>
            <p style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>
              {client.name}
            </p>
            <a
              href={`tel:${client.phone}`}
              style={{ color: '#c9a96e', fontSize: '0.85rem', textDecoration: 'none' }}
            >
              {client.phone}
            </a>
            <div style={{ marginTop: '4px' }}>
              {client.visitCount >= 10 ? (
                <span style={{
                  background: '#faeeda',
                  color: '#854f0b',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '20px',
                }}>
                  ⭐ Loyal client
                </span>
              ) : client.visitCount >= 5 ? (
                <span style={{
                  background: '#e6f1fb',
                  color: '#0c447c',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '20px',
                }}>
                  Regular
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#c9a96e', margin: 0 }}>
              {client.visitCount}
            </p>
            <p style={{ fontSize: '0.72rem', color: '#6b6b6b', margin: 0 }}>visits</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
              ${client.totalSpend}
            </p>
            <p style={{ fontSize: '0.72rem', color: '#6b6b6b', margin: 0 }}>total spend</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#1a1a1a',
              margin: 0,
              whiteSpace: 'nowrap',
            }}>
              {client.favouriteStylist.split(' ')[0]}
            </p>
            <p style={{ fontSize: '0.72rem', color: '#6b6b6b', margin: 0 }}>fav stylist</p>
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.6rem 1.5rem',
        background: '#fafafa',
        borderTop: '1px solid #f0f0f0',
        borderBottom: expanded ? '1px solid #f0f0f0' : 'none',
      }}>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: '#6b6b6b' }}>
          <span>First visit: <strong>{client.firstVisit}</strong></span>
          <span>Last visit: <strong>{client.lastVisit}</strong></span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => onBookAgain(client.phone, client.name)}
            style={{
              padding: '0.35rem 0.85rem',
              background: '#c9a96e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Book again
          </button>
          <button
            onClick={() => setExpanded(prev => !prev)}
            style={{
              padding: '0.35rem 0.85rem',
              background: 'none',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '0.78rem',
              cursor: 'pointer',
              color: '#6b6b6b',
            }}
          >
            {expanded ? 'Hide history' : 'View history'}
          </button>
        </div>
      </div>

      {/* Booking history — expandable */}
      {expanded && (
        <div style={{ padding: '1rem 1.5rem' }}>
          <p style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            color: '#6b6b6b',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.75rem',
          }}>
            Booking History
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {client.bookings.map(booking => (
              <div
                key={booking.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr 80px 80px auto',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.6rem 0.75rem',
                  background: '#fafafa',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                }}
              >
                <span style={{ color: '#6b6b6b' }}>{booking.date}</span>
                <span style={{ fontWeight: 500 }}>{booking.serviceName}</span>
                <span style={{ color: '#6b6b6b' }}>{booking.stylistName.split(' ')[0]}</span>
                <span style={{ fontWeight: 600 }}>${booking.servicePrice}</span>
                <Badge variant={booking.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientCard;