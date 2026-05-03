import React from 'react';
import { Session } from '@supabase/supabase-js';
import AuthPanel from './AuthPanel';

interface AuthModalProps {
  initialMode: 'signin' | 'signup';
  session: Session | null;
  onClose: () => void;
}

/**
 * Pure UI modal for authentication.
 * Post-login redirect is handled by App.tsx's onAuthStateChange handler,
 * which is stable and always mounted — unlike this component which
 * unmounts when authModalMode is set to null.
 */
const AuthModal: React.FC<AuthModalProps> = ({ initialMode, session, onClose }) => {
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
