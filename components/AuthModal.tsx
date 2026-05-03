import React, { useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthPanel from './AuthPanel';

interface AuthModalProps {
  initialMode: 'signin' | 'signup';
  session: Session | null;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ initialMode, session, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Handle redirect-after-login flow
  useEffect(() => {
    if (session) {
      // If the user was redirected here from a protected route, send them back
      const from = (location.state as any)?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
      } else {
        // Navigate directly to the account dashboard after sign-in
        onClose();
        navigate('/account', { replace: true });
      }
    }
  }, [session, navigate, location, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative z-10 w-full max-w-md">
        <AuthPanel
          session={session}
          initialMode={initialMode}
          onClose={onClose}
        />
      </div>
    </div>
  );
};

export default AuthModal;
