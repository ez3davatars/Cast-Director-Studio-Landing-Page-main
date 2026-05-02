import React, { useEffect, useState, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  LifeBuoy, Plus, Send, Loader2, X, ChevronRight,
  CheckCircle, AlertCircle, Clock, MessageSquare, ArrowLeft
} from 'lucide-react';
import { useCrmTicketPresence } from '../hooks/useCrmTicketPresence';

// ── Types ──
interface CrmMessage {
  id: string;
  body: string | null;
  direction: 'inbound' | 'outbound';
  source: string | null;
  sender_name: string | null;
  sender_email: string | null;
  created_at: string;
}

interface CrmConversation {
  id: string;
  ticket_id: string;
  subject: string | null;
  inquiry_type: string | null;
  status: string;
  created_at: string;
  messages: CrmMessage[];
}

// ── Constants ──
const INQUIRY_TYPES = [
  { label: 'Billing', value: 'billing' },
  { label: 'License / Activation', value: 'license_activation' },
  { label: 'Hosted Credits', value: 'hosted_credits' },
  { label: 'BYOK Setup', value: 'byok_setup' },
  { label: 'Generation Failed', value: 'generation_failed' },
  { label: 'App Bug', value: 'app_bug' },
  { label: 'Download / Install', value: 'download_install' },
  { label: 'Feature Question', value: 'feature_question' },
  { label: 'Account Access', value: 'account_access' },
  { label: 'Refund / Cancellation', value: 'refund_cancellation' },
  { label: 'General Support', value: 'general_support' },
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  new: {
    label: 'New',
    color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    icon: <Clock size={10} />,
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-nano-yellow bg-nano-yellow/10 border-nano-yellow/30',
    icon: <MessageSquare size={10} />,
  },
  waiting_on_customer: {
    label: 'Waiting on You',
    color: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
    icon: <Clock size={10} />,
  },
  resolved: {
    label: 'Resolved',
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    icon: <CheckCircle size={10} />,
  },
  closed: {
    label: 'Closed',
    color: 'text-gray-400 bg-white/5 border-white/10',
    icon: <CheckCircle size={10} />,
  },
};

interface SupportTicketsProps {
  session: Session;
  onUnreadCount?: (count: number, unreadTickets: { id: string; subject: string }[]) => void;
  autoOpenTicketId?: string | null;
}

const SupportTickets: React.FC<SupportTicketsProps> = ({ session, onUnreadCount, autoOpenTicketId }) => {
  const [tickets, setTickets] = useState<CrmConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supportPanelRef = useRef<HTMLDivElement>(null);

  // Selected ticket
  const [selectedTicket, setSelectedTicket] = useState<CrmConversation | null>(null);

  // Track customer presence in the selected ticket
  useCrmTicketPresence({
    conversationId: selectedTicket?.id,
    userId: session.user.id,
    role: 'customer',
    enabled: !!selectedTicket,
  });

  // New ticket modal
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newInquiryType, setNewInquiryType] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Reply State
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [showNewMessageToast, setShowNewMessageToast] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedTicketIdRef = useRef<string | undefined>(undefined);
  const ticketsRef = useRef<CrmConversation[]>([]);
  const shouldAutoScrollRef = useRef(true);
  const prevTicketIdRef = useRef<string | undefined>(undefined);

  const scrollToLatestMessage = (behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
      }, 50);
    });
  };

  useEffect(() => {
    selectedTicketIdRef.current = selectedTicket?.id;
  }, [selectedTicket?.id]);

  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  useEffect(() => {
    if (!selectedTicket?.id) return;

    if (prevTicketIdRef.current !== selectedTicket.id) {
      shouldAutoScrollRef.current = true;
      setShowNewMessageToast(false);
      prevTicketIdRef.current = selectedTicket.id;
      scrollToLatestMessage('auto');
    } else {
      if (shouldAutoScrollRef.current) {
        scrollToLatestMessage('smooth');
      }
    }
  }, [selectedTicket?.id, selectedTicket?.messages?.length]);

  // ── Fetch user's tickets ──
  const fetchTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('crm_conversations')
        .select(`
          id, ticket_id, subject, inquiry_type, status, created_at,
          messages:crm_messages(id, body, direction, source, sender_name, sender_email, created_at)
        `)
        .eq('linked_user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setTickets((data as unknown as CrmConversation[]) || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [session.user.id]);

  // ── Realtime Subscriptions ──
  useEffect(() => {
    if (!session?.user?.id) return;

    // 1. Messages Subscription
    const messagesChannel = supabase.channel('customer-crm-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'crm_messages' },
        (payload) => {
          const newMsg = payload.new as any;
          
          // Client-side filter: Ensure it belongs to one of our tickets
          // (RLS enforces this, but this is a secondary safety net)
          const belongsToUs = ticketsRef.current.some(t => t.id === newMsg.conversation_id);
          if (!belongsToUs) return;

          setTickets(prev => prev.map(t => {
            if (t.id === newMsg.conversation_id) {
              if (t.messages.some(m => m.id === newMsg.id)) return t;
              const updatedMessages = [...t.messages, newMsg].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              return { ...t, messages: updatedMessages };
            }
            return t;
          }));

          setSelectedTicket(prev => {
            if (prev && prev.id === newMsg.conversation_id) {
              if (prev.messages.some(m => m.id === newMsg.id)) return prev;
              const updatedMessages = [...prev.messages, newMsg].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );

              // Auto-scroll logic based on position
              const container = messagesContainerRef.current;
              const isNearBottom = container ? (container.scrollHeight - container.scrollTop - container.clientHeight < 100) : true;
              
              if (isNearBottom) {
                shouldAutoScrollRef.current = true;
              } else {
                shouldAutoScrollRef.current = false;
                setTimeout(() => setShowNewMessageToast(true), 0);
              }

              return { ...prev, messages: updatedMessages };
            }
            return prev;
          });
        }
      )
      .subscribe();

    // 2. Conversations Subscription
    const convosChannel = supabase.channel('customer-crm-convos')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'crm_conversations' },
        (payload) => {
          const updated = payload.new as any;
          // Security check: Verify it's actually ours
          if (updated.linked_user_id !== session.user.id) return;

          setTickets(prev => prev.map(t => {
            if (t.id === updated.id) {
              return { ...t, status: updated.status, priority: updated.priority, category: updated.category };
            }
            return t;
          }));
          setSelectedTicket(prev => {
            if (prev && prev.id === updated.id) {
              return { ...prev, status: updated.status, priority: updated.priority, category: updated.category };
            }
            return prev;
          });
        }
      )
      .subscribe();

    // 3. Disconnect Fallback
    const systemChannel = supabase.channel('customer-system')
      .on('system', { event: '*' }, (payload) => {
        if (payload.extension === 'postgres_changes' && payload.status === 'ok') {
          fetchTickets(); // Refetch on reconnect to catch missed events
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(convosChannel);
      supabase.removeChannel(systemChannel);
    };
  }, [session.user.id]);

  // Auto-scroll messages container without scrolling the page when switching tickets
  useEffect(() => {
    if (selectedTicket && messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [selectedTicket?.id]);

  // ── Submit new ticket ──
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedSubject = newSubject.trim();
    const trimmedMessage = newMessage.trim();

    if (!trimmedSubject || !newInquiryType || !trimmedMessage) {
      setSubmitError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-ticket-submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            subject: trimmedSubject,
            inquiryType: newInquiryType,
            message: trimmedMessage,
          }),
        }
      );

      const data = await res.json();

      if (data.ok && data.ticketId) {
        setSubmitSuccess(data.ticketId);
        setNewSubject('');
        setNewInquiryType('');
        setNewMessage('');
        // Refresh tickets after a short delay
        setTimeout(() => {
          fetchTickets();
          setShowNewTicket(false);
          setSubmitSuccess(null);
        }, 2000);
      } else {
        setSubmitError(data.error || 'Failed to create ticket. Please try again.');
      }
    } catch {
      setSubmitError('Could not reach the server. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeNewTicketModal = () => {
    if (submitting) return;
    setShowNewTicket(false);
    setNewSubject('');
    setNewInquiryType('');
    setNewMessage('');
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  // ── Submit Reply ──
  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    
    setIsReplying(true);
    setReplyError(null);

    try {
      const { data, error: funcErr } = await supabase.functions.invoke('customer-crm-reply', {
        body: {
          conversation_id: selectedTicket.id,
          reply_text: replyText
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (funcErr) throw new Error(funcErr.message || 'Network error occurred');
      if (data?.error) {
        throw new Error(`${data.error} | Debug: ${JSON.stringify(data.debug || {})}`);
      }

      const newMsg = data?.message;
      if (!newMsg) throw new Error('Reply succeeded but no data was returned');

      // Update the selected ticket
      setSelectedTicket(prev => {
        if (!prev) return prev;
        const updatedStatus = data?.newStatus || prev.status;
        return { ...prev, status: updatedStatus, messages: [...prev.messages, newMsg] };
      });

      // Update the tickets list
      setTickets(prev => prev.map(t => {
        if (t.id === selectedTicket.id) {
          const updatedStatus = data?.newStatus || t.status;
          return { ...t, status: updatedStatus, messages: [...t.messages, newMsg] };
        }
        return t;
      }));

      shouldAutoScrollRef.current = true;
      setReplyText('');
    } catch (err: any) {
      console.error('Customer CRM reply error:', err);
      setReplyError(err.message || 'Failed to send reply. Please try again later.');
    } finally {
      setIsReplying(false);
    }
  };

  // ── Sorted messages for selected ticket ──
  const sortedMessages = selectedTicket?.messages
    ?.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    || [];

  const latestMessagePreview = (ticket: CrmConversation): string => {
    if (!ticket.messages || ticket.messages.length === 0) return 'No messages';
    const sorted = [...ticket.messages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latest = sorted[0];
    const prefix = latest.direction === 'outbound' ? 'Support: ' : 'You: ';
    const body = latest.body || '';
    return prefix + (body.length > 80 ? body.substring(0, 80) + '…' : body);
  };

  const hasUnreadReply = (ticket: CrmConversation): boolean => {
    if (!ticket.messages || ticket.messages.length === 0) return false;
    const sorted = [...ticket.messages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return sorted[0].direction === 'outbound';
  };

  // Report unread count to parent
  useEffect(() => {
    if (!onUnreadCount) return;
    const unread = tickets.filter(hasUnreadReply);
    onUnreadCount(
      unread.length,
      unread.map(t => ({ id: t.id, subject: t.subject || 'Support Ticket' }))
    );
  }, [tickets, onUnreadCount]);

  // Auto-open ticket when triggered from parent banner
  useEffect(() => {
    if (!autoOpenTicketId || !tickets.length) return;
    const target = tickets.find(t => t.id === autoOpenTicketId);
    if (target) {
      setSelectedTicket(target);
      // Wait for React to re-render the ticket detail view before scrolling
      setTimeout(() => {
        requestAnimationFrame(() => {
          const el = supportPanelRef.current;
          if (el) {
            const rect = el.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const navbarHeight = 80;
            window.scrollTo({ top: rect.top + scrollTop - navbarHeight, behavior: 'smooth' });
          }
        });
      }, 100);
    }
  }, [autoOpenTicketId, tickets]);

  // ── Render ──
  return (
    <div ref={supportPanelRef} className="rounded-sm border border-nano-border bg-nano-panel/20 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LifeBuoy size={22} className="text-nano-yellow" />
          <h3 className="text-xl font-bold">Support Tickets</h3>
          {tickets.length > 0 && (
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-sm font-mono text-nano-text">
              {tickets.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowNewTicket(true)}
          className="flex items-center gap-2 px-4 py-2 bg-nano-yellow text-black text-xs font-bold uppercase tracking-wide hover:bg-nano-gold transition-colors"
        >
          <Plus size={14} />
          New Ticket
        </button>
      </div>

      {/* Loading / Error */}
      {loading ? (
        <div className="text-nano-text text-sm animate-pulse py-8 text-center">
          Loading support tickets…
        </div>
      ) : error ? (
        <div className="text-red-400 text-sm py-4 text-center border border-red-500/20 bg-red-500/5 rounded-sm">
          {error}
        </div>
      ) : tickets.length === 0 ? (
        /* Empty state */
        <div className="text-center py-12">
          <LifeBuoy size={40} className="mx-auto text-nano-text/30 mb-4" />
          <p className="text-nano-text text-sm mb-2">No support tickets yet.</p>
          <p className="text-nano-text/60 text-xs">
            Need help? Click <strong className="text-white">New Ticket</strong> above to contact our team.
          </p>
        </div>
      ) : selectedTicket ? (
        /* ── Ticket Detail View ── */
        <div className="flex flex-col" style={{ maxHeight: 'clamp(500px, 70vh, 800px)' }}>
          {/* Back button */}
          <button
            onClick={() => setSelectedTicket(null)}
            className="flex items-center gap-2 text-xs text-nano-text hover:text-white transition-colors mb-3 group flex-shrink-0"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to all tickets
          </button>

          {/* Ticket header */}
          <div className="border border-nano-border/50 bg-black/30 p-4 mb-0 flex-shrink-0">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="text-white font-bold text-base">
                  {selectedTicket.subject || 'Support Ticket'}
                </h4>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-[11px] text-nano-yellow">
                    {selectedTicket.ticket_id}
                  </span>
                  <span className="text-[10px] text-nano-text">
                    {selectedTicket.inquiry_type}
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${
                  statusConfig[selectedTicket.status]?.color || statusConfig.new.color
                }`}
              >
                {statusConfig[selectedTicket.status]?.icon}
                {statusConfig[selectedTicket.status]?.label || selectedTicket.status}
              </span>
            </div>
            <div className="text-[10px] text-nano-text/60">
              Opened: {new Date(selectedTicket.created_at).toLocaleString()}
            </div>
          </div>

          {/* Messages thread — scrollable region */}
          <div 
            ref={messagesContainerRef} 
            onScroll={() => {
              if (showNewMessageToast) {
                const container = messagesContainerRef.current;
                if (container) {
                  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                  if (isNearBottom) {
                    setShowNewMessageToast(false);
                    shouldAutoScrollRef.current = true;
                  }
                }
              }
            }}
            className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar relative border-x border-nano-border/50 bg-black/20"
            style={{ scrollBehavior: 'smooth' }}
          >
            <div className="space-y-3 p-4">
              {showNewMessageToast && (
                <div className="sticky top-2 z-10 flex justify-center w-full">
                  <button 
                    onClick={() => {
                      setShowNewMessageToast(false);
                      shouldAutoScrollRef.current = true;
                      scrollToLatestMessage('smooth');
                    }}
                    className="bg-nano-yellow text-black text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-lg hover:bg-nano-gold transition-colors flex items-center gap-1.5 border border-black/10"
                  >
                    New message ↓
                  </button>
                </div>
              )}
              {sortedMessages.length > 0 ? (
                sortedMessages.map((msg) => {
                  const isYou = msg.direction === 'inbound';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isYou ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`p-4 rounded-lg text-sm max-w-[85%] ${
                          isYou
                            ? 'bg-nano-yellow/10 border border-nano-yellow/20 text-white rounded-tr-none'
                            : 'bg-white/[0.05] border border-white/10 text-gray-200 rounded-tl-none'
                        }`}
                      >
                        <div className={`flex items-center gap-2 mb-2 ${isYou ? 'flex-row-reverse' : 'flex-row'}`}>
                          <span
                            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              isYou
                                ? 'text-nano-yellow bg-nano-yellow/10'
                                : 'text-gray-300 bg-white/10'
                            }`}
                          >
                            {isYou ? 'You' : 'Support'}
                          </span>
                          <span className="text-[10px] text-nano-text/50 font-mono">
                            {new Date(msg.created_at).toLocaleString()}
                          </span>
                        </div>
                        <pre className="font-sans whitespace-pre-wrap leading-relaxed text-[13px]">
                          {msg.body || 'No message content.'}
                        </pre>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-nano-text/50 text-xs text-center py-4 italic">
                  No messages in this ticket.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Reply composer — sticky at bottom */}
          <div className="flex-shrink-0 p-4 border border-nano-border/50 border-t-0 bg-nano-panel/30 flex flex-col gap-2">
            {replyError && (
              <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-sm">
                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{replyError}</p>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!replyText.trim() || isReplying) return;
                    handleSendReply();
                  }
                }}
                disabled={isReplying}
                placeholder="Type your reply… (Enter to send, Shift+Enter for new line)"
                maxLength={5000}
                className="flex-1 bg-black/50 border border-nano-border/80 text-white text-sm font-sans p-3 rounded focus:outline-none focus:border-nano-yellow transition-colors resize-none disabled:opacity-50"
                rows={2}
              />
              <button
                onClick={handleSendReply}
                disabled={isReplying || !replyText.trim()}
                className="px-4 py-2.5 bg-nano-yellow text-black text-xs font-bold uppercase tracking-widest rounded hover:bg-nano-gold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
              >
                {isReplying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {isReplying ? 'Sending…' : 'Send'}
              </button>
            </div>
            <div className="text-[10px] text-nano-text/40 text-right">Enter to send · Shift+Enter for new line</div>
          </div>
        </div>
      ) : (
        /* ── Ticket List ── */
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const cfg = statusConfig[ticket.status] || statusConfig.new;
            const unread = hasUnreadReply(ticket);
            return (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className={`w-full text-left p-4 border rounded-sm transition-all duration-200 group hover:bg-white/[0.03] hover:border-nano-border ${
                  unread
                    ? 'bg-nano-yellow/[0.03] border-nano-yellow/20'
                    : 'bg-black/30 border-nano-border/50'
                }`}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {unread && (
                        <span className="w-2 h-2 rounded-full bg-nano-yellow flex-shrink-0 animate-pulse" />
                      )}
                      <h4 className="text-white font-bold text-sm truncate group-hover:text-nano-yellow transition-colors">
                        {ticket.subject || 'Support Ticket'}
                      </h4>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-nano-text/70">
                        {ticket.ticket_id}
                      </span>
                      {ticket.inquiry_type && (
                        <span className="text-[10px] text-nano-text/50">
                          {ticket.inquiry_type}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border flex items-center gap-1 ${cfg.color}`}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                    <ChevronRight
                      size={14}
                      className="text-nano-text/30 group-hover:text-nano-yellow transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-nano-text/50 truncate max-w-[70%]">
                    {latestMessagePreview(ticket)}
                  </p>
                  <span className="text-[10px] text-nano-text/40 font-mono flex-shrink-0">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── New Ticket Modal ── */}
      {showNewTicket && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nano-dark border border-nano-border w-full max-w-xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-nano-border bg-black/40">
              <h3 className="font-bold tracking-wide flex items-center gap-2 text-white">
                <LifeBuoy size={18} className="text-nano-yellow" />
                Submit a Support Ticket
              </h3>
              <button
                onClick={closeNewTicketModal}
                className="text-gray-400 hover:text-white transition-colors"
                disabled={submitting}
              >
                <X size={20} />
              </button>
            </div>

            {submitSuccess ? (
              /* Success state */
              <div className="p-8 text-center">
                <CheckCircle size={48} className="text-emerald-400 mx-auto mb-4" />
                <h4 className="text-lg font-bold text-white mb-2">Ticket Created</h4>
                <p className="text-nano-text text-sm mb-2">Your ticket ID is:</p>
                <p className="text-nano-yellow font-mono text-lg font-bold mb-4">
                  {submitSuccess}
                </p>
                <p className="text-nano-text/60 text-xs">
                  Our team will respond soon. You'll see replies here.
                </p>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleSubmitTicket} className="p-6 space-y-4 overflow-y-auto">
                {/* Subject */}
                <div>
                  <label
                    htmlFor="ticket-subject"
                    className="block text-xs font-bold text-nano-text uppercase tracking-wide mb-2"
                  >
                    Subject <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="ticket-subject"
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    maxLength={200}
                    placeholder="Brief description of your issue"
                    disabled={submitting}
                    className="w-full px-4 py-3 bg-black border border-nano-border text-white text-sm rounded-sm placeholder-gray-600 focus:outline-none focus:border-nano-yellow transition-colors disabled:opacity-50"
                  />
                </div>

                {/* Inquiry Type */}
                <div>
                  <label
                    htmlFor="ticket-type"
                    className="block text-xs font-bold text-nano-text uppercase tracking-wide mb-2"
                  >
                    Category <span className="text-red-400">*</span>
                  </label>
                  <select
                    id="ticket-type"
                    value={newInquiryType}
                    onChange={(e) => setNewInquiryType(e.target.value)}
                    disabled={submitting}
                    className="w-full px-4 py-3 bg-black border border-nano-border text-white text-sm rounded-sm focus:outline-none focus:border-nano-yellow transition-colors appearance-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="" className="bg-black text-gray-500">
                      Select a category
                    </option>
                    {INQUIRY_TYPES.map((type) => (
                      <option key={type.value} value={type.value} className="bg-black text-white">
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label
                    htmlFor="ticket-message"
                    className="block text-xs font-bold text-nano-text uppercase tracking-wide mb-2"
                  >
                    Message <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    id="ticket-message"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    maxLength={5000}
                    rows={6}
                    placeholder="Describe your issue or question in detail…"
                    disabled={submitting}
                    className="w-full px-4 py-3 bg-black border border-nano-border text-white text-sm rounded-sm placeholder-gray-600 focus:outline-none focus:border-nano-yellow transition-colors resize-none disabled:opacity-50"
                  />
                  <p className="text-[10px] text-nano-text/40 mt-1 text-right">
                    {newMessage.length}/5000
                  </p>
                </div>

                {/* Submitting from */}
                <div className="text-[10px] text-nano-text/50 bg-white/[0.02] border border-nano-border/30 px-3 py-2 rounded-sm">
                  Submitting as <strong className="text-white">{session.user.email}</strong>
                </div>

                {/* Error */}
                {submitError && (
                  <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-sm">
                    <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">{submitError}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeNewTicketModal}
                    disabled={submitting}
                    className="px-4 py-2 border border-nano-border text-gray-300 hover:bg-white/5 rounded-sm text-xs uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      !newSubject.trim() ||
                      !newInquiryType ||
                      !newMessage.trim()
                    }
                    className="px-6 py-2 bg-nano-yellow text-black rounded-sm text-xs uppercase tracking-wider font-bold hover:bg-nano-gold transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        Submit Ticket
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportTickets;
