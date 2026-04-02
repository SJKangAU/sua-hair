// ClientsPage.tsx
// Clients tab — placeholder until Phase 4
// Will contain client search, profile cards, and visit history

const ClientsPage = () => {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#6b6b6b' }}>
      <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>👥</p>
      <h2 style={{ fontSize: '1.25rem', color: '#1a1a1a', marginBottom: '0.5rem' }}>
        Client History
      </h2>
      <p style={{ fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
        Search clients by name or mobile number, view full visit history,
        total spend, favourite stylist, and loyalty metrics.
        Coming in Phase 4.
      </p>
    </div>
  );
};

export default ClientsPage;