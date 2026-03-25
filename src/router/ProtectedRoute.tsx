// ProtectedRoute.tsx
// Wraps admin routes — redirects unauthenticated users to /admin/login
// Shows nothing while auth state is loading to prevent flash of content

import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: Props) => {
  const { user, loading } = useAuth();

  // Don't render anything until auth state is resolved
  if (loading) return null;

  // Redirect to login if not authenticated
  if (!user) return <Navigate to="/admin/login" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;