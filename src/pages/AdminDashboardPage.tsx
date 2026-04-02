// AdminDashboardPage.tsx
// Admin dashboard shell — header, tab navigation, and active tab rendering
// All tab content lives in src/pages/admin/* for separation of concerns
// Wrapped with BookingProvider and SalonDataProvider for shared state

import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import useAuth from '../hooks/useAuth';
import useToast from '../hooks/useToast';
import { BookingProvider, useBookingContext } from '../context/BookingContext';
import { SalonDataProvider } from '../context/SalonDataContext';
import { ToastContainer } from '../components/ui/Toast';
import Tabs from '../components/ui/Tabs';
import TodayPage from './admin/TodayPage';
import BookingsPage from './admin/BookingsPage';
import ClientsPage from './admin/ClientsPage';
import TrainingPage from './admin/TrainingPages';
import AnalyticsPage from './admin/AnalyticsPage';
import ManagePage from './admin/ManagePage';

const TABS = [
  { id: 'today',     label: 'Today',     icon: '📅' },
  { id: 'bookings',  label: 'Bookings',  icon: '📋' },
  { id: 'clients',   label: 'Clients',   icon: '👥' },
  { id: 'training',  label: 'Training',  icon: '🎓' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'manage',    label: 'Manage',    icon: '⚙️'  },
];

// ── Inner component — consumes context ────────────────────────────────────────
const DashboardInner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { updateStatus } = useBookingContext();
  const { toasts, addToast, dismissToast } = useToast();
  const [activeTab, setActiveTab] = useState('today');

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/admin/login', { replace: true });
  };

  // Centralised status update with toast feedback
  const handleUpdateStatus = async (
    id: string,
    status: 'pending' | 'confirmed' | 'cancelled'
  ) => {
    try {
      await updateStatus(id, status);
      const messages = {
        confirmed: 'Booking confirmed ✓',
        cancelled: 'Booking cancelled',
        pending: 'Booking restored to pending',
      };
      addToast(messages[status], status === 'cancelled' ? 'warning' : 'success');
    } catch {
      addToast('Failed to update booking. Please try again.', 'error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f0e8', fontFamily: 'Georgia, serif' }}>

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
          <a
            href="/"
            style={{
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

      {/* Tab navigation */}
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Active tab content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {activeTab === 'today'     && <TodayPage onUpdateStatus={handleUpdateStatus} addToast={addToast} />}
        {activeTab === 'bookings'  && <BookingsPage onUpdateStatus={handleUpdateStatus} />}
        {activeTab === 'clients'   && <ClientsPage />}
        {activeTab === 'training'  && <TrainingPage />}
        {activeTab === 'analytics' && <AnalyticsPage />}
        {activeTab === 'manage'    && <ManagePage />}
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

// ── Outer component — provides context ────────────────────────────────────────
const AdminDashboardPage = () => (
  <SalonDataProvider>
    <BookingProvider>
      <DashboardInner />
    </BookingProvider>
  </SalonDataProvider>
);

export default AdminDashboardPage;