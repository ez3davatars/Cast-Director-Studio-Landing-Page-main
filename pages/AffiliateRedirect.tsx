import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const DEFAULT_DESTINATION = '/';
const REF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const TRACKING_TTL_MS = 20 * 1000;

type TrackingResult = {
  destination: string;
};

const trackingRequests = new Map<string, Promise<TrackingResult>>();

const getSafeDestination = (destination: unknown): string => {
  if (typeof destination !== 'string' || !destination.trim()) {
    return DEFAULT_DESTINATION;
  }

  try {
    const url = new URL(destination, window.location.origin);
    if (url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }

    return url.href;
  } catch {
    return DEFAULT_DESTINATION;
  }
};

const storeAffiliateRef = (sessionToken: unknown) => {
  if (typeof sessionToken !== 'string' || !sessionToken.trim()) {
    return;
  }

  const token = sessionToken.trim();
  localStorage.setItem('cds_ref', token);
  document.cookie = `cds_ref=${encodeURIComponent(token)}; Max-Age=${REF_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
};

const getTrackingStorageKey = (code: string) => `cds_affiliate_tracked:${code}`;

const getRecentDestination = (code: string): string | null => {
  try {
    const raw = sessionStorage.getItem(getTrackingStorageKey(code));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { trackedAt?: number; destination?: unknown };
    if (!parsed.trackedAt || Date.now() - parsed.trackedAt > TRACKING_TTL_MS) {
      sessionStorage.removeItem(getTrackingStorageKey(code));
      return null;
    }

    return getSafeDestination(parsed.destination);
  } catch {
    sessionStorage.removeItem(getTrackingStorageKey(code));
    return null;
  }
};

const markRecentlyTracked = (code: string, destination: string) => {
  try {
    sessionStorage.setItem(
      getTrackingStorageKey(code),
      JSON.stringify({ trackedAt: Date.now(), destination })
    );
  } catch {
    // Storage can be unavailable in strict privacy modes; tracking still proceeds.
  }
};

const trackAffiliateClick = (code: string): Promise<TrackingResult> => {
  const normalizedCode = code.trim().toLowerCase();
  const recentDestination = getRecentDestination(normalizedCode);

  if (recentDestination) {
    return Promise.resolve({ destination: recentDestination });
  }

  const existingRequest = trackingRequests.get(normalizedCode);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    let destination = DEFAULT_DESTINATION;

    try {
      const { data, error } = await supabase.functions.invoke('record-affiliate-click', {
        body: { link_code: normalizedCode },
      });

      if (!error) {
        storeAffiliateRef(data?.session_token);
        destination = getSafeDestination(data?.destination_url);
        markRecentlyTracked(normalizedCode, destination);
      }
    } catch {
      destination = DEFAULT_DESTINATION;
    }

    return { destination };
  })();

  trackingRequests.set(normalizedCode, request);
  request.finally(() => {
    trackingRequests.delete(normalizedCode);
  });

  return request;
};

const AffiliateRedirect = () => {
  const { code } = useParams<{ code: string }>();

  useEffect(() => {
    let cancelled = false;

    const trackAndRedirect = async () => {
      const normalizedCode = code?.trim();
      const result = normalizedCode
        ? await trackAffiliateClick(normalizedCode)
        : { destination: DEFAULT_DESTINATION };

      if (!cancelled) {
        window.location.replace(result.destination);
      }
    };

    trackAndRedirect();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="min-h-screen bg-nano-dark text-white flex items-center justify-center">
      <div className="text-nano-text animate-pulse">Redirecting...</div>
    </div>
  );
};

export default AffiliateRedirect;
