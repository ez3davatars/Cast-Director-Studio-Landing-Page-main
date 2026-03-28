import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (import.meta.env.PROD && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('CRITICAL MISCONFIGURATION: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in production build.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co', 
  supabaseAnonKey || 'placeholder-key'
);