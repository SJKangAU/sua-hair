// AdminLoginPage.tsx
// Admin login screen using Firebase Email/Password authentication
// Redirects to /admin dashboard on successful login
// Redirects to / if already authenticated

import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import useAuth from '../hooks/useAuth';

const AdminLoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/admin', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      // Generic error message — don't reveal whether email or password is wrong
      setError('Invalid email or password. Please try again.');
    }

    setLoading(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '1rem',
    boxSizing: 'border-box' as const,
    marginTop: '0.25rem',
  };

  const labelStyle = {
    display: 'block' as const,
    marginBottom: '1rem',
    fontWeight: 500,
    fontSize: '0.95rem',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1a1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', color: '#c9a96e', margin: 0 }}>Sua Hair</h1>
          <p style={{ color: '#6b6b6b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Admin Portal
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin}>
          <label style={labelStyle}>
            Email
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@suahair.com.au"
              required
              autoComplete="email"
            />
          </label>

          <label style={labelStyle}>
            Password
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </label>

          {/* Error message */}
          {error && (
            <p style={{
              color: '#e24b4a',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              textAlign: 'center',
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.85rem',
              background: loading ? '#ddd' : '#c9a96e',
              color: loading ? '#999' : 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Back to booking */}
        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem' }}>
          <a href="/" style={{ color: '#c9a96e', textDecoration: 'none' }}>
            ← Back to booking
          </a>
        </p>
      </div>
    </div>
  );
};

export default AdminLoginPage;