import React from 'react';
import { Session } from '@supabase/supabase-js';
import { Navigate, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
  session: Session | null;
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ session, children }) => {
  const location = useLocation();

  if (!session) {
    // Redirect them to the landing page, but save the current location they were trying to go to
    return <Navigate to="/?auth=signin" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
