const AFFILIATE_REF_KEY = 'cds_ref';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;

  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!cookie) return null;

  const value = cookie.slice(name.length + 1).trim();
  if (!value) return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getAffiliateSessionToken(): string | null {
  if (typeof window !== 'undefined') {
    try {
      const storedToken = window.localStorage.getItem(AFFILIATE_REF_KEY)?.trim();
      if (storedToken) return storedToken;
    } catch {
      // localStorage can be unavailable in restricted browser modes.
    }
  }

  return readCookie(AFFILIATE_REF_KEY)?.trim() || null;
}

export function withAffiliateAttributionBody<TBody extends Record<string, unknown>>(
  body: TBody
): TBody & { affiliate_session_token?: string } {
  const affiliateSessionToken = getAffiliateSessionToken();
  if (!affiliateSessionToken) return body;

  return {
    ...body,
    affiliate_session_token: affiliateSessionToken,
  };
}

export function getAffiliateAttributionHeaders(): Record<string, string> {
  const affiliateSessionToken = getAffiliateSessionToken();
  return affiliateSessionToken ? { 'x-cds-ref': affiliateSessionToken } : {};
}
