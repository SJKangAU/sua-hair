// AdminDashboardPage.tsx
// Main admin dashboard — protected route, requires authentication
// Fetches all bookings from Firestore in real time using onSnapshot
// Provides filtering, status updates, and a daily overview

import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import useAuth from '../hooks/useAuth';
import DashboardStats from '../components/admin/DashboardStats';
import FilterBar from '../components/admin/FilterBar';
import BookingTable from '../components/admin/BookingTable';
import type { Booking } from '../types';
import type { Filters } from '../components/admin/FilterBar';

const DEFAULT_FILTERS: Filters = {
  stylistId: '',
  date: '',
  status: '',
};

const AdminDashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // All bookings from Firestore
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Active filter state
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Subscribe to real-time booking updates via Firestore onSnapshot
  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('date', 'asc'));

    const unsubscribe = onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Booking[];

      setBookings(data);
      setLoading(false);
    }, err => {
      console.error('Error fetching bookings:', err);
      setLoading(false);
    });

    // Cleanup Firestore listener on unmount
    return () => unsubscribe();
  }, []);

  // Sign out and redirect to login
  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/admin/login', { replace: true });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f0e8',
      fontFamily: 'Georgia, serif',
    }}>

      {/* Header */}
      <header style={{
        background: '#1a1a1a',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', color: '#c9a96e', margin: 0 }}>Sua Hair</h1>
          <p style={{ fontSize: '0.75rem', color: '#aaa', margin: 0 }}>Admin Dashboard</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#aaa', fontSize: '0.82rem' }}>{user?.email}</span>
          <button
            onClick={handleSignOut}
            style={{
              background: 'none',
              border: '1px solid #555',
              color: '#aaa',
              padding: '0.4rem 0.9rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Sign out
          </button>
          
            <a href="/"
            style={{
              background: 'none',
              border: '1px solid #c9a96e',
              color: '#c9a96e',
              padding: '0.4rem 0.9rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              textDecoration: 'none',
            }}
          >
            View booking page
          </a>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#6b6b6b', marginTop: '3rem' }}>
            Loading bookings...
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Today's stats */}
            <DashboardStats bookings={bookings} />

            {/* Section heading */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 500, margin: 0 }}>
                All Bookings
                <span style={{ color: '#6b6b6b', fontWeight: 400, fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                  ({bookings.length} total)
                </span>
              </h2>
            </div>

            {/* Filter bar */}
            <FilterBar
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters(DEFAULT_FILTERS)}
            />

            {/* Bookings list */}
            <BookingTable
              bookings={bookings}
              filters={filters}
              onUpdate={() => {}}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboardPage;