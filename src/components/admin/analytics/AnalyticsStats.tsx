// AnalyticsStats.tsx
// Summary stat cards for the analytics tab
// Computes revenue, busiest day, top service, and top stylist
// All derived from the live bookings array — no extra Firestore calls needed

import { useMemo } from 'react';
import { useBookingContext } from '../../../context/BookingContext';

const AnalyticsStats = () => {
  const { bookings } = useBookingContext();

  const stats = useMemo(() => {
    // Only count confirmed bookings for revenue
    const confirmed = bookings.filter(b =>
      b.status === 'confirmed' && b.bookingType !== 'break' && b.bookingType !== 'training'
    );

    // Total revenue
    const totalRevenue = confirmed.reduce((sum, b) => sum + (b.servicePrice ?? 0), 0);

    // Revenue this month
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthRevenue = confirmed
      .filter(b => b.date.startsWith(thisMonth))
      .reduce((sum, b) => sum + (b.servicePrice ?? 0), 0);

    // Busiest day of week
    const dayCounts: Record<string, number> = {};
    confirmed.forEach(b => {
      const day = new Date(b.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long' });
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const busiestDay = Object.entries(dayCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

    // Top service by booking count
    const serviceCounts: Record<string, number> = {};
    confirmed.forEach(b => {
      serviceCounts[b.serviceName] = (serviceCounts[b.serviceName] || 0) + 1;
    });
    const topService = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

    // Top stylist by revenue
    const stylistRevenue: Record<string, number> = {};
    confirmed.forEach(b => {
      stylistRevenue[b.stylistName] = (stylistRevenue[b.stylistName] || 0) + (b.servicePrice ?? 0);
    });
    const topStylist = Object.entries(stylistRevenue)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

    // Average spend per visit
    const avgSpend = confirmed.length > 0
      ? Math.round(totalRevenue / confirmed.length)
      : 0;

    return {
      totalRevenue,
      monthRevenue,
      busiestDay,
      topService,
      topStylist: topStylist.split(' ')[0],
      avgSpend,
      totalBookings: confirmed.length,
    };
  }, [bookings]);

  const cards = [
    { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}`, color: '#c9a96e', icon: '💰' },
    { label: 'This Month', value: `$${stats.monthRevenue.toLocaleString()}`, color: '#1d9e75', icon: '📅' },
    { label: 'Avg Spend', value: `$${stats.avgSpend}`, color: '#3b82f6', icon: '🎯' },
    { label: 'Total Bookings', value: stats.totalBookings.toString(), color: '#8b5cf6', icon: '📋' },
    { label: 'Top Service', value: stats.topService, color: '#ef9f27', icon: '✂️', small: true },
    { label: 'Top Stylist', value: stats.topStylist, color: '#e24b4a', icon: '⭐', small: true },
    { label: 'Busiest Day', value: stats.busiestDay, color: '#6b7280', icon: '📆', small: true },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
      gap: '1rem',
    }}>
      {cards.map(card => (
        <div
          key={card.label}
          style={{
            background: 'white',
            borderRadius: '10px',
            padding: '1.25rem',
            borderTop: `4px solid ${card.color}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <p style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>{card.icon}</p>
          <p style={{
            fontSize: card.small ? '0.95rem' : '1.6rem',
            fontWeight: 700,
            color: card.color,
            margin: 0,
            lineHeight: 1.2,
          }}>
            {card.value}
          </p>
          <p style={{ fontSize: '0.75rem', color: '#6b6b6b', margin: '0.25rem 0 0' }}>
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
};

export default AnalyticsStats;