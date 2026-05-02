import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (import.meta.env.PROD && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('CRITICAL MISCONFIGURATION: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in production build.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co', 
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export async function invokeAuthenticatedFunction<TResponse = any>(
  functionName: string,
  payload?: any,
  options?: { method?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE' }
): Promise<{ data: TResponse | null; error: Error | null }> {
  try {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) {
      throw new Error(`Unable to read auth session: ${sessionErr.message}`);
    }
    const token = sessionData.session?.access_token;
    if (!token) {
      // 401 equivalent error string for missing token
      throw new Error('Your admin session expired. Please sign out and sign back in.');
    }

    const method = options?.method || 'POST';
    const reqOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    };

    if (payload !== undefined && ['POST', 'PUT', 'PATCH'].includes(method)) {
      reqOptions.body = JSON.stringify(payload);
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, reqOptions);

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { error: rawText };
    }

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Your admin session expired. Please sign out and sign back in.');
      } else if (res.status === 403) {
        throw new Error('You are signed in, but this account does not have admin access.');
      }
      throw new Error(data.error || `HTTP ${res.status}: ${rawText}`);
    }

    if (data && typeof data === 'object' && 'error' in data && data.error) {
       throw new Error(data.error);
    }

    return { data: data as TResponse, error: null };
  } catch (err: any) {
    return { data: null, error: err instanceof Error ? err : new Error(err?.message || 'Unknown error') };
  }
}