import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface UseCrmTicketPresenceOptions {
  conversationId: string | undefined;
  userId: string;
  role: 'admin' | 'customer';
  enabled: boolean;
}

/**
 * Tracks user presence in a CRM ticket conversation.
 * - Immediately upserts on mount / conversationId change.
 * - Heartbeats every 25 seconds.
 * - Best-effort deletes on unmount / ticket switch.
 *
 * Backend checks `last_seen_at > now() - interval '90 seconds'`
 * to determine if the user is actively viewing the conversation.
 */
export function useCrmTicketPresence({
  conversationId,
  userId,
  role,
  enabled,
}: UseCrmTicketPresenceOptions) {
  const prevConversationIdRef = useRef<string | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !conversationId || !userId) {
      // Cleanup any previous presence if we're disabling
      if (prevConversationIdRef.current) {
        cleanupPresence(prevConversationIdRef.current, userId, role);
        prevConversationIdRef.current = undefined;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // If switching conversations, clean up old one
    if (prevConversationIdRef.current && prevConversationIdRef.current !== conversationId) {
      cleanupPresence(prevConversationIdRef.current, userId, role);
    }

    prevConversationIdRef.current = conversationId;

    // Immediate upsert
    upsertPresence(conversationId, userId, role);

    // Clear old interval if any
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Heartbeat every 25 seconds
    intervalRef.current = setInterval(() => {
      upsertPresence(conversationId, userId, role);
    }, 25_000);

    // Cleanup on unmount or dependency change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      cleanupPresence(conversationId, userId, role);
    };
  }, [conversationId, userId, role, enabled]);
}

async function upsertPresence(
  conversationId: string,
  userId: string,
  role: 'admin' | 'customer'
) {
  try {
    await supabase
      .from('crm_ticket_presence')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userId,
          role,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'conversation_id,user_id,role' }
      );
  } catch {
    // Fail silently — presence is best-effort
  }
}

async function cleanupPresence(
  conversationId: string,
  userId: string,
  role: 'admin' | 'customer'
) {
  try {
    await supabase
      .from('crm_ticket_presence')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .eq('role', role);
  } catch {
    // Fail silently — cleanup is best-effort
  }
}
