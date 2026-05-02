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

/**
 * Reliably retrieves a fresh Supabase access token.
 *
 * getSession() can return null when the in-memory cache is empty
 * (e.g. after HMR, or a race with onAuthStateChange). In that case
 * we fall back to getUser(), which makes a network call and
 * re-hydrates the session in the client, then retry getSession().
 */
export async function getAuthenticatedAccessToken(): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`Unable to read auth session: ${sessionError.message}`);
  }

  let token = sessionData.session?.access_token;

  if (!token) {
    // getSession() returned nothing — force a network round-trip
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      throw new Error('Your session has expired. Please sign out and sign back in.');
    }

    // getUser() re-hydrated the session; read it again
    const retry = await supabase.auth.getSession();
    token = retry.data.session?.access_token;
  }

  if (!token) {
    throw new Error('Your session has expired. Please sign out and sign back in.');
  }

  return token;
}

export async function invokeAuthenticatedFunction<TResponse = any>(
  functionName: string,
  payload?: any,
  options?: { method?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE' }
): Promise<{ data: TResponse | null; error: Error | null }> {
  try {
    const token = await getAuthenticatedAccessToken();

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
        throw new Error('Your session has expired. Please sign out and sign back in.');
      } else if (res.status === 403) {
        throw new Error('You do not have permission to perform this action.');
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