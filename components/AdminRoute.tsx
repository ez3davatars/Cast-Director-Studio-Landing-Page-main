import React from 'react';
import { Session } from '@supabase/supabase-js';
import { Navigate, useLocation } from 'react-router-dom';

interface AdminRouteProps {
  session: Session | null;
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ session, children }) => {
  const location = useLocation();

  if (!session) {
    return <Navigate to="/?auth=signin" state={{ from: location }} replace />;
  }

  const isAdmin = session.user.app_metadata?.is_admin === true;

  if (!isAdmin) {
    // Non-admin users are instantly redirected away
    return <Navigate to="/account" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
