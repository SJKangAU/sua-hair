// AnalyticsPage.tsx
// Analytics tab — placeholder until Phase 6
// Will contain revenue, occupancy, and retention charts

const AnalyticsPage = () => {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#6b6b6b' }}>
      <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📊</p>
      <h2 style={{ fontSize: '1.25rem', color: '#1a1a1a', marginBottom: '0.5rem' }}>
        Analytics
      </h2>
      <p style={{ fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
        Revenue over time, per-stylist occupancy rates, most popular services,
        busiest times of day, and client retention metrics.
        Coming in Phase 6.
      </p>
    </div>
  );
};

export default AnalyticsPage;