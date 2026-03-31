// Skeleton.tsx
// Loading skeleton components for data-heavy views
// Prevents layout shift while Firestore data loads
// Used in timeline, bookings list, and client search

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
}

// Base skeleton block with shimmer animation
const Skeleton = ({
  width = '100%',
  height = '1rem',
  borderRadius = '4px',
}: SkeletonProps) => {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .skeleton-shimmer {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
      `}</style>
      <div
        className="skeleton-shimmer"
        style={{ width, height, borderRadius }}
      />
    </>
  );
};

// Skeleton for a booking card row
export const BookingCardSkeleton = () => (
  <div style={{
    background: 'white',
    borderRadius: '10px',
    padding: '1.25rem 1.5rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr auto',
    gap: '1rem',
    alignItems: 'center',
  }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <Skeleton width="120px" height="0.9rem" />
      <Skeleton width="90px" height="0.75rem" />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <Skeleton width="100px" height="0.9rem" />
      <Skeleton width="80px" height="0.75rem" />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <Skeleton width="80px" height="0.9rem" />
      <Skeleton width="60px" height="0.75rem" />
    </div>
    <Skeleton width="80px" height="28px" borderRadius="20px" />
  </div>
);

// Skeleton for the stats bar
export const StatsSkeleton = () => (
  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
    {[1, 2, 3, 4].map(i => (
      <div key={i} style={{
        background: 'white',
        borderRadius: '10px',
        padding: '1.25rem 1.5rem',
        flex: 1,
        minWidth: '120px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        <Skeleton width="40px" height="2rem" />
        <Skeleton width="80px" height="0.75rem" />
      </div>
    ))}
  </div>
);

// Skeleton for stylist cards in booking form
export const StylistCardSkeleton = () => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  }}>
    {[1, 2, 3, 4].map(i => (
      <div key={i} style={{
        padding: '0.75rem',
        border: '2px solid #eee',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}>
        <Skeleton width="48px" height="48px" borderRadius="50%" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <Skeleton width="80px" height="0.85rem" />
          <Skeleton width="60px" height="0.72rem" />
        </div>
      </div>
    ))}
  </div>
);

export default Skeleton;