import { createContext, useContext } from 'react';
import { Session } from '@supabase/supabase-js';

interface AuthContextValue {
  session: Session | null;
  openCreateAccount: () => void;
  openSignIn: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  openCreateAccount: () => {},
  openSignIn: () => {},
});

export const useAuth = () => useContext(AuthContext);
