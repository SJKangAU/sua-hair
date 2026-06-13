// BookingsPage.tsx
// Bookings tab content for the admin dashboard
// Contains stats, filter bar, search, and booking list
// Consumes bookings from BookingContext

import { useState } from 'react';
import { useBookingContext } from '../../context/BookingContext';
import DashboardStats from '../../components/admin/DashboardStats';
import FilterBar from '../../components/admin/FilterBar';
import BookingTable from '../../components/admin/bookings/BookingTable';
import { StatsSkeleton, BookingCardSkeleton } from '../../components/ui/Skeleton';
import type { Filters } from '../../components/admin/FilterBar';

const DEFAULT_FILTERS: Filters = {
  stylistId: '',
  date: '',
  status: '',
};

interface Props {
  onUpdateStatus: (id: string, status: 'pending' | 'confirmed' | 'cancelled') => void;
}

const BookingsPage = ({ onUpdateStatus }: Props) => {
  const { bookings, loading, error } = useBookingContext();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const hasActiveFilters = !!(filters.stylistId || filters.date || filters.status);
  const filteredCount = hasActiveFilters
    ? bookings.filter((b) => {
        if (filters.stylistId && b.stylistId !== filters.stylistId) return false;
        if (filters.date && b.date !== filters.date) return false;
        if (filters.status && b.status !== filters.status) return false;
        return true;
      }).length
    : bookings.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Stats */}
      {loading ? <StatsSkeleton /> : <DashboardStats bookings={bookings} />}

      {/* Heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 500, margin: 0 }}>
          All Bookings
          <span style={{
            color: 'var(--admin-muted)',
            fontWeight: 400,
            fontSize: '0.85rem',
            marginLeft: '0.5rem',
          }}>
            {hasActiveFilters
              ? `(${filteredCount} shown of ${bookings.length})`
              : `(${bookings.length} total)`}
          </span>
        </h2>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onClear={() => setFilters(DEFAULT_FILTERS)}
      />

      {/* Bookings list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map(i => <BookingCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <p style={{ textAlign: 'center', color: '#e24b4a' }}>{error}</p>
      ) : (
        <BookingTable
          bookings={bookings}
          filters={filters}
          onUpdate={onUpdateStatus}
        />
      )}
    </div>
  );
};

export default BookingsPage;