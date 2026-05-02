import React, { useEffect, useState, useRef } from 'react';
import { supabase, invokeAuthenticatedFunction } from '../../lib/supabase';
import { MessageSquare, RefreshCw, ExternalLink, User, UserX, ChevronDown, Trash2, Minus, Plus, Send, Loader2, X, CheckCheck, StickyNote, Filter, AlertTriangle } from 'lucide-react';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';
import { useCrmTicketPresence } from '../../hooks/useCrmTicketPresence';

type Conversation = {
  id: string;
  ticket_id: string;
  inquiry_type: string | null;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  linked_user_id: string | null;
  last_customer_message_at: string | null;
  last_admin_reply_at: string | null;
  contact: {
    id: string;
    email: string;
    name: string | null;
    company: string | null;
    user_id: string | null;
  } | null;
  messages: {
    id: string;
    body: string | null;
    sender_name: string | null;
    sender_email: string | null;
    direction: string;
    source: string | null;
    created_at: string;
    raw_payload: Record<string, unknown>;
  }[];
};

type InternalNote = {
  id: string;
  conversation_id: string;
  author_email: string | null;
  body: string;
  created_at: string;
};

const STATUS_OPTIONS = ['new', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'];
const STATUS_LABELS: Record<string, string> = {
  new: 'New', in_progress: 'In Progress', waiting_on_customer: 'Waiting on Customer',
  resolved: 'Resolved', closed: 'Closed',
};
const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'];
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-gray-400 bg-white/5 border-white/10',
  normal: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  high: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  urgent: 'text-red-400 bg-red-400/10 border-red-400/30',
};
const CATEGORY_OPTIONS = [
  'billing','license_activation','hosted_credits','byok_setup','generation_failed',
  'app_bug','download_install','feature_question','account_access','refund_cancellation','general_support',
];
const CATEGORY_LABELS: Record<string, string> = {
  billing: 'Billing', license_activation: 'License / Activation', hosted_credits: 'Hosted Credits',
  byok_setup: 'BYOK Setup', generation_failed: 'Generation Failed', app_bug: 'App Bug',
  download_install: 'Download / Install', feature_question: 'Feature Question',
  account_access: 'Account Access', refund_cancellation: 'Refund / Cancellation', general_support: 'General Support',
};
const TEXT_SIZES = [
  { label: 'S', zoom: 0.85 },
  { label: 'M', zoom: 1.0 },
  { label: 'L', zoom: 1.2 },
  { label: 'XL', zoom: 1.45 },
];

const statusColor: Record<string, string> = {
  new: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  in_progress: 'text-nano-yellow bg-nano-yellow/10 border-nano-yellow/30',
  waiting_on_customer: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  resolved: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  closed: 'text-gray-400 bg-white/5 border-white/10',
};

const AUTO_MESSAGES: Record<string, (name: string, ticketId: string) => string> = {
  resolved: (name, ticketId) =>
    `Hi ${name},\n\nYour inquiry (${ticketId}) has been resolved. If you have any further questions, please log into your account dashboard to submit a follow-up:\n\nhttps://castdirectorstudio.com/account\n\nPlease reference your ticket ID: ${ticketId}\n\nBest regards,\nCast Director Studio Support`,
  closed: (name, ticketId) =>
    `Hi ${name},\n\nYour inquiry (${ticketId}) has been closed. Thank you for contacting Cast Director Studio.\n\nIf you need help in the future, please log into your account dashboard or visit:\n\nhttps://castdirectorstudio.com/account\n\nPlease reference your ticket ID: ${ticketId}\n\nBest regards,\nCast Director Studio Support`,
};

const LeadsAdmin: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [adminUserId, setAdminUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [textSizeIdx, setTextSizeIdx] = useState(1);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [statusModal, setStatusModal] = useState<{ convoId: string; newStatus: string; contactId: string; contactEmail: string; contactName: string; ticketId: string } | null>(null);
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [sendingStatus, setSendingStatus] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState('waiting_on_customer');
  const [isReplying, setIsReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccessMessage, setReplySuccessMessage] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [showNewMessageToast, setShowNewMessageToast] = useState(false);
  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterNeedsReply, setFilterNeedsReply] = useState(false);
  // Internal notes
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const navigate = useNavigate();

  // Fetch admin user ID for presence tracking
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setAdminUserId(user.id);
    });
  }, []);

  // Track admin presence in the selected conversation
  useCrmTicketPresence({
    conversationId: selected?.id,
    userId: adminUserId,
    role: 'admin',
    enabled: !!selected && !!adminUserId,
  });

  // Refs for Realtime callbacks to avoid stale closures
  const selectedIdRef = useRef<string | undefined>(undefined);
  const adminMessagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const prevConvoIdRef = useRef<string | undefined>(undefined);

  const scrollToLatestMessage = (behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      const container = adminMessagesContainerRef.current;
      if (!container) return;
      if (behavior === 'auto') {
        container.scrollTop = container.scrollHeight;
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    });
  };

  useEffect(() => {
    selectedIdRef.current = selected?.id;
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.id) return;
    
    if (prevConvoIdRef.current !== selected.id) {
      shouldAutoScrollRef.current = true;
      setShowNewMessageToast(false);
      prevConvoIdRef.current = selected.id;
      scrollToLatestMessage('auto');
    } else {
      if (shouldAutoScrollRef.current) {
        scrollToLatestMessage('smooth');
      }
    }
  }, [selected?.id, selected?.messages?.length]);

  const fetchLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('crm_conversations')
        .select(`
          id, ticket_id, inquiry_type, status, priority, category, created_at, linked_user_id,
          last_customer_message_at, last_admin_reply_at,
          contact:crm_contacts(id, email, name, company, user_id),
          messages:crm_messages(id, body, sender_name, sender_email, direction, source, created_at, raw_payload)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (fetchErr) throw fetchErr;
      setConversations((data as unknown as Conversation[]) || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, []);

  // ── Realtime Subscriptions ──
  useEffect(() => {
    // 1. Messages Subscription
    const messagesChannel = supabase.channel('admin-crm-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'crm_messages' },
        (payload) => {
          const newMsg = payload.new as any;
          
          setConversations(prev => prev.map(c => {
            if (c.id === newMsg.conversation_id) {
              if (c.messages.some(m => m.id === newMsg.id)) return c;
              const updatedMessages = [...c.messages, newMsg].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              return { ...c, messages: updatedMessages };
            }
            return c;
          }));

          setSelected(prev => {
            if (prev && prev.id === newMsg.conversation_id) {
              if (prev.messages.some(m => m.id === newMsg.id)) return prev;
              const updatedMessages = [...prev.messages, newMsg].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );

              // Auto-scroll logic based on position
              const container = adminMessagesContainerRef.current;
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
    const convosChannel = supabase.channel('admin-crm-convos')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'crm_conversations' },
        (payload) => {
          const updated = payload.new as any;
          setConversations(prev => prev.map(c => {
            if (c.id === updated.id) {
              return { ...c, ...updated };
            }
            return c;
          }));
          setSelected(prev => {
            if (prev && prev.id === updated.id) {
              return { ...prev, ...updated };
            }
            return prev;
          });
        }
      )
      .subscribe();

    // 3. Internal Notes Subscription
    const notesChannel = supabase.channel('admin-crm-notes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'crm_internal_notes' },
        (payload) => {
          const newNote = payload.new as InternalNote;
          if (selectedIdRef.current === newNote.conversation_id) {
            setNotes(prev => {
              if (prev.some(n => n.id === newNote.id)) return prev;
              return [...prev, newNote].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            });
          }
        }
      )
      .subscribe();

    // 4. Disconnect Fallback
    const systemChannel = supabase.channel('admin-system')
      .on('system', { event: '*' }, (payload) => {
        if (payload.extension === 'postgres_changes' && payload.status === 'ok') {
          fetchLeads(); // Refetch on reconnect to catch missed events
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(convosChannel);
      supabase.removeChannel(notesChannel);
      supabase.removeChannel(systemChannel);
    };
  }, []);

  useEffect(() => {
    if (selected && adminMessagesContainerRef.current) {
      const container = adminMessagesContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [selected?.id]);

  // Fetch notes when selected changes
  const fetchNotes = async (convoId: string) => {
    const { data } = await supabase.from('crm_internal_notes').select('*').eq('conversation_id', convoId).order('created_at', { ascending: true });
    setNotes((data as InternalNote[]) || []);
  };
  useEffect(() => { if (selected) { fetchNotes(selected.id); setReplyStatus('waiting_on_customer'); } else { setNotes([]); } }, [selected?.id]);

  const handleSaveNote = async () => {
    if (!noteText.trim() || !selected) return;
    setSavingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: e } = await supabase.from('crm_internal_notes').insert({ conversation_id: selected.id, author_id: user?.id, author_email: user?.email || 'admin', body: noteText.trim() });
    if (!e) { setNoteText(''); fetchNotes(selected.id); }
    setSavingNote(false);
  };

  const handleUpdateField = async (convoId: string, field: string, value: string) => {
    await supabase.from('crm_conversations').update({ [field]: value }).eq('id', convoId);
    setConversations(prev => prev.map(c => c.id === convoId ? { ...c, [field]: value } : c));
    if (selected?.id === convoId) setSelected(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const needsReply = (c: Conversation): boolean => {
    if (c.status === 'new' && (!c.last_admin_reply_at)) return true;
    if (!c.last_customer_message_at) return false;
    if (!c.last_admin_reply_at) return true;
    return new Date(c.last_customer_message_at) > new Date(c.last_admin_reply_at);
  };

  const filtered = conversations.filter((c) => {
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterPriority && c.priority !== filterPriority) return false;
    if (filterCategory && c.category !== filterCategory) return false;
    if (filterNeedsReply && !needsReply(c)) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      const ct = c.contact;
      const textMatch = (c.ticket_id || '').toLowerCase().includes(q) ||
        (c.inquiry_type || '').toLowerCase().includes(q) ||
        (ct?.email || '').toLowerCase().includes(q) ||
        (ct?.name || '').toLowerCase().includes(q) ||
        (ct?.company || '').toLowerCase().includes(q);
      if (!textMatch) return false;
    }
    return true;
  });

  // ── Status change with optional auto-email ──
  const initiateStatusChange = (convoId: string, newStatus: string) => {
    const convo = conversations.find(c => c.id === convoId);
    if (!convo) return;

    // Only prompt for resolved/closed
    if ((newStatus === 'resolved' || newStatus === 'closed') && convo.contact?.email) {
      setStatusModal({
        convoId,
        newStatus,
        contactId: convo.contact.id,
        contactEmail: convo.contact.email,
        contactName: convo.contact.name || 'there',
        ticketId: convo.ticket_id,
      });
    } else {
      commitStatusChange(convoId, newStatus, false);
    }
  };

  const commitStatusChange = async (convoId: string, newStatus: string, sendEmail: boolean) => {
    setSendingStatus(true);
    const { error: updateErr } = await supabase
      .from('crm_conversations')
      .update({ status: newStatus })
      .eq('id', convoId);

    if (updateErr) {
      console.error('Status update failed:', updateErr.message);
      setSendingStatus(false);
      return;
    }

    setConversations(prev => prev.map(c => c.id === convoId ? { ...c, status: newStatus } : c));
    if (selected?.id === convoId) setSelected(prev => prev ? { ...prev, status: newStatus } : prev);

    // Send notification email if enabled (dashboard-first: no message content in email)
    if (sendEmail && statusModal) {
      try {
        const notifBody = `Hello,\n\nYour Cast Director Studio support ticket has been updated.\n\nTicket: ${statusModal.ticketId}\nStatus: ${STATUS_LABELS[newStatus] || newStatus}\n\nPlease log into your account dashboard to view your ticket and any future replies:\nhttps://castdirectorstudio.com/account\n\nCast Director Studio Support\nsupport@castdirectorstudio.com`;
        await invokeAuthenticatedFunction('send-ops-email', {
          contact_id: statusModal.contactId,
          to: statusModal.contactEmail,
          subject: `Re: [${statusModal.ticketId}] Cast Director Studio Support`,
          body: notifBody,
        });
      } catch (e: any) {
        console.error('Auto-email failed:', e.message);
      }
    }

    setStatusModal(null);
    setSendingStatus(false);
  };

  // ── Delete logic ──
  const deleteConversation = async (convoId: string) => {
    // Delete messages first, then conversation (cascade should handle it but being explicit)
    const { error: delErr } = await supabase
      .from('crm_conversations')
      .delete()
      .eq('id', convoId);

    if (delErr) {
      console.error('Delete failed:', delErr.message);
      return false;
    }
    return true;
  };

  const handleDeleteSingle = async (convoId: string) => {
    if (!confirm('Delete this ticket permanently? This cannot be undone.')) return;
    setDeleting(true);
    const ok = await deleteConversation(convoId);
    if (ok) {
      setConversations(prev => prev.filter(c => c.id !== convoId));
      if (selected?.id === convoId) setSelected(null);
    }
    setDeleting(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} ticket(s) permanently? This cannot be undone.`)) return;
    setDeleting(true);

    const { error: delErr } = await supabase
      .from('crm_conversations')
      .delete()
      .in('id', Array.from(selectedIds));

    if (delErr) {
      console.error('Bulk delete failed:', delErr.message);
    } else {
      setConversations(prev => prev.filter(c => !selectedIds.has(c.id)));
      if (selected && selectedIds.has(selected.id)) setSelected(null);
      setSelectedIds(new Set());
    }
    setDeleting(false);
    setBulkSelectMode(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllClosedResolved = () => {
    const ids = filtered
      .filter(c => c.status === 'resolved' || c.status === 'closed')
      .map(c => c.id);
    setSelectedIds(new Set(ids));
  };

  const contact = selected?.contact;
  const isRegistered = !!(contact?.user_id || selected?.linked_user_id);
  const sortedMessages = selected?.messages?.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) || [];
  
  const handleSendReply = async () => {
    if (!replyText.trim() || !selected) return;
    setIsReplying(true);
    setReplyError(null);
    setReplySuccessMessage(null);

    try {
      console.log('[DEBUG] Calling admin-crm-reply with:', {
        conversation_id: selected.id,
        ticket_id: selected.ticket_id,
        recipient_email: selected.contact?.email,
        status: replyStatus
      });
      const { data, error: funcErr } = await invokeAuthenticatedFunction('admin-crm-reply', {
        conversation_id: selected.id,
        ticket_id: selected.ticket_id,
        recipient_email: selected.contact?.email,
        reply_text: replyText,
        status: replyStatus,
        send_email: sendEmail
      });

      console.log('[DEBUG] admin-crm-reply response:', { data, funcErr });
      if (funcErr) throw new Error(funcErr.message || 'Failed to invoke edge function');
      if (data?.error) throw new Error(data.error);
      
      const newMsg = data?.message;
      if (!newMsg) throw new Error('Reply succeeded but no message was returned');
      const updatedStatus = data?.newStatus || replyStatus;
      const nowIso = new Date().toISOString();

      setSelected(prev => {
        if (!prev) return prev;
        return { ...prev, status: updatedStatus, last_admin_reply_at: nowIso, messages: [...prev.messages, newMsg] };
      });

      setConversations(prev => prev.map(c => {
        if (c.id === selected.id) {
          return { ...c, status: updatedStatus, last_admin_reply_at: nowIso, messages: [...c.messages, newMsg] };
        }
        return c;
      }));

      if (data?.emailNotificationSkipped) {
        if (data?.emailNotificationSkippedReason === 'customer_active_in_conversation') {
          setReplySuccessMessage("Reply sent. Customer is currently viewing this ticket — email notification skipped.");
        } else {
          setReplySuccessMessage("Reply saved to dashboard. Email notification skipped — customer already notified for this response cycle.");
        }
      } else if (data?.emailNotificationFailed) {
        setReplySuccessMessage("Reply saved to dashboard, but email notification failed to send.");
      } else if (data?.emailNotificationSent) {
        setReplySuccessMessage("Reply saved and email notification sent.");
      } else {
        setReplySuccessMessage("Reply saved to dashboard.");
      }

      shouldAutoScrollRef.current = true;
      setReplyText('');
      // Scroll message thread to bottom without moving the page
      requestAnimationFrame(() => {
        const container = adminMessagesContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
    } catch (e: any) {
      console.error("Admin CRM reply failed:", e);
      setReplyError(e.message || 'Failed to post reply. Check logs.');
    } finally {
      setIsReplying(false);
    }
  };

  const canDeleteSelected = selected && (selected.status === 'resolved' || selected.status === 'closed');
  const textSize = TEXT_SIZES[textSizeIdx];

  if (loading && conversations.length === 0) {
    return (
      <div className="flex flex-col gap-4 text-white font-mono animate-pulse">
        <div className="h-40 bg-white/5 rounded-lg border border-nano-border w-full" />
        <div className="h-40 bg-white/5 rounded-lg border border-nano-border w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ zoom: TEXT_SIZES[textSizeIdx].zoom }}>
      {/* Header */}
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold font-mono tracking-wide flex items-center gap-2 text-white">
            <MessageSquare size={24} className="text-nano-yellow" /> Contact Leads
          </h2>
          <span className="text-xs bg-nano-border px-2 py-0.5 rounded text-gray-300 font-mono">{conversations.length}</span>
          <button onClick={fetchLeads} disabled={loading} className="bg-black border border-nano-border p-2 rounded text-gray-400 hover:text-white transition-colors" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {/* Text size controls */}
          <div className="flex items-center gap-1 bg-black border border-nano-border rounded px-1 py-0.5">
            <button
              onClick={() => setTextSizeIdx(i => Math.max(0, i - 1))}
              disabled={textSizeIdx === 0}
              className="p-1 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
              title="Decrease text size"
            >
              <Minus size={12} />
            </button>
            <span className="text-[10px] text-gray-400 font-mono w-5 text-center">{textSize.label}</span>
            <button
              onClick={() => setTextSizeIdx(i => Math.min(TEXT_SIZES.length - 1, i + 1))}
              disabled={textSizeIdx === TEXT_SIZES.length - 1}
              className="p-1 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
              title="Increase text size"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Bulk select toggle */}
          <button
            onClick={() => { setBulkSelectMode(!bulkSelectMode); setSelectedIds(new Set()); }}
            className={`text-[10px] uppercase font-bold tracking-wider px-3 py-2 rounded border transition-colors ${
              bulkSelectMode
                ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                : 'bg-black text-gray-400 border-nano-border hover:text-white'
            }`}
          >
            {bulkSelectMode ? 'Cancel Select' : 'Manage'}
          </button>

          {bulkSelectMode && (
            <>
              <button
                onClick={selectAllClosedResolved}
                className="text-[10px] uppercase font-bold tracking-wider px-3 py-2 rounded border border-nano-border bg-black text-gray-400 hover:text-white transition-colors"
              >
                <CheckCheck size={12} className="inline mr-1" />
                Select Closed/Resolved
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0 || deleting}
                className="text-[10px] uppercase font-bold tracking-wider px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-30 flex items-center gap-1"
              >
                <Trash2 size={12} />
                Delete ({selectedIds.size})
              </button>
            </>
          )}

          <div className="w-full sm:w-56">
            <AdminSearchFilter placeholder="Search leads..." value={filterText} onChange={setFilterText} />
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={14} className="text-gray-500" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-black border border-nano-border text-white text-[10px] font-bold uppercase px-2 py-1.5 rounded cursor-pointer focus:outline-none focus:border-nano-yellow">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-black border border-nano-border text-white text-[10px] font-bold uppercase px-2 py-1.5 rounded cursor-pointer focus:outline-none focus:border-nano-yellow">
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-black border border-nano-border text-white text-[10px] font-bold uppercase px-2 py-1.5 rounded cursor-pointer focus:outline-none focus:border-nano-yellow">
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <button
          onClick={() => setFilterNeedsReply(!filterNeedsReply)}
          className={`text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded border transition-colors flex items-center gap-1.5 ${
            filterNeedsReply ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-black text-gray-400 border-nano-border hover:text-white'
          }`}
        >
          <AlertTriangle size={10} /> Needs Reply
        </button>
        <span className="text-[10px] text-gray-500 font-mono ml-auto">{filtered.length} shown</span>
      </div>

      {error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 rounded font-mono text-sm">{error}</div>
      ) : (
        <div className="bg-black/40 border border-nano-border rounded-lg overflow-hidden flex flex-col lg:flex-row h-[70vh]">
          {/* List */}
          <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-nano-border overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-500 font-mono text-xs italic">
                {filterText ? 'No leads match your search.' : 'No contact form submissions yet.'}
              </div>
            ) : (
              <div className="flex flex-col">
                {filtered.map(c => {
                  const ct = c.contact;
                  const isChecked = selectedIds.has(c.id);
                  const isDeletable = c.status === 'resolved' || c.status === 'closed';
                  return (
                    <div
                      key={c.id}
                      className={`flex items-stretch border-b border-nano-border/50 hover:bg-white/5 transition-colors ${selected?.id === c.id ? 'bg-nano-yellow/5 border-l-2 border-l-nano-yellow' : ''}`}
                    >
                      {bulkSelectMode && isDeletable && (
                        <label className="flex items-center px-3 cursor-pointer hover:bg-white/5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(c.id)}
                            className="w-3.5 h-3.5 accent-red-500 cursor-pointer"
                          />
                        </label>
                      )}
                      {bulkSelectMode && !isDeletable && (
                        <div className="w-[38px]" />
                      )}
                      <button
                        onClick={() => { setSelected(c); setReplySuccessMessage(null); }}
                        className="flex-1 p-4 text-left"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-2">
                            {needsReply(c) && <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0 animate-pulse" title="Needs Reply" />}
                            <span className={`font-bold font-sans truncate pr-2 text-sm ${selected?.id === c.id ? 'text-white' : 'text-gray-300'}`}>
                              {ct?.name || ct?.email || 'Unknown'}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">
                            {new Date(c.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${statusColor[c.status] || statusColor.new}`}>
                            {STATUS_LABELS[c.status] || c.status}
                          </span>
                          {c.priority !== 'normal' && (
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[c.priority] || ''}`}>
                              {PRIORITY_LABELS[c.priority] || c.priority}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500 truncate">{CATEGORY_LABELS[c.category] || c.category}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono truncate">
                          {c.ticket_id}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="flex-1 flex flex-col bg-nano-bg">
            {selected ? (
              <>
                <div className="p-6 border-b border-nano-border flex flex-col gap-3 flex-shrink-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-white tracking-wide">{contact?.name || 'Unknown'}</h3>
                      <div className="text-sm text-nano-yellow font-mono mt-0.5">{contact?.email}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isRegistered ? (
                        <button
                          onClick={() => {
                            const targetEmail = contact?.email || selected.sender_email;
                            if (targetEmail) navigate(`/admin/customers/${targetEmail}`);
                          }}
                          className="text-[10px] uppercase font-bold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                        >
                          <User size={12} /> Registered Customer
                          <ExternalLink size={10} className="ml-1" />
                        </button>
                      ) : (
                        <div className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded flex items-center gap-1.5">
                          <UserX size={12} /> Unregistered Lead
                        </div>
                      )}
                      {/* Delete button for resolved/closed */}
                      {canDeleteSelected && (
                        <button
                          onClick={() => handleDeleteSingle(selected.id)}
                          disabled={deleting}
                          className="p-1.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          title="Delete this ticket"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      {/* Status dropdown */}
                      <div className="relative">
                        <select
                          value={selected.status}
                          onChange={(e) => initiateStatusChange(selected.id, e.target.value)}
                          className="appearance-none bg-black border border-nano-border text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 pr-7 rounded cursor-pointer focus:outline-none focus:border-nano-yellow transition-colors"
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s} className="bg-black">{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Ticket:</span>
                      <span className="text-white bg-white/5 px-2 py-0.5 rounded select-all">{selected.ticket_id}</span>
                    </div>
                    <span className="text-gray-500">|</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Received:</span>
                      <span className="text-white">{new Date(selected.created_at).toLocaleString()}</span>
                    </div>
                    <span className="text-gray-500">|</span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Priority:</span>
                      <select value={selected.priority} onChange={e => handleUpdateField(selected.id, 'priority', e.target.value)} className="bg-black border border-nano-border text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded cursor-pointer focus:outline-none focus:border-nano-yellow">
                        {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                      </select>
                    </div>
                    <span className="text-gray-500">|</span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Category:</span>
                      <select value={selected.category} onChange={e => handleUpdateField(selected.id, 'category', e.target.value)} className="bg-black border border-nano-border text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded cursor-pointer focus:outline-none focus:border-nano-yellow">
                        {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                      </select>
                    </div>
                  </div>

                  {contact?.company && (
                    <div className="text-xs font-mono text-gray-400">
                      Company: <span className="text-white">{contact.company}</span>
                    </div>
                  )}


                </div>

                {/* Message thread */}
                <div 
                  ref={adminMessagesContainerRef} 
                  onScroll={() => {
                    if (showNewMessageToast) {
                      const container = adminMessagesContainerRef.current;
                      if (container) {
                        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                        if (isNearBottom) {
                          setShowNewMessageToast(false);
                          shouldAutoScrollRef.current = true;
                        }
                      }
                    }
                  }}
                  className="flex-1 overflow-y-auto p-6 bg-black shadow-inner relative"
                >
                  {showNewMessageToast && (
                    <div className="sticky top-4 z-10 flex justify-center w-full animate-in fade-in slide-in-from-top-2">
                      <button 
                        onClick={() => {
                          setShowNewMessageToast(false);
                          shouldAutoScrollRef.current = true;
                          scrollToLatestMessage('smooth');
                        }}
                        className="bg-nano-yellow text-black text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg hover:bg-yellow-400 transition-colors flex items-center gap-1.5"
                      >
                        New message ↓
                      </button>
                    </div>
                  )}
                  {sortedMessages.length > 0 ? (
                    <div className="space-y-5">
                      {sortedMessages.map((msg, idx) => {
                        const isInbound = msg.direction === 'inbound';
                        const isReply = idx > 0 || msg.source === 'email_reply';
                        return (
                          <div key={msg.id} className={`rounded-lg border p-4 ${
                            isInbound
                              ? 'bg-white/[0.02] border-nano-border'
                              : 'bg-blue-500/[0.04] border-blue-500/20 ml-8'
                          }`}>
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                  isInbound
                                    ? 'text-emerald-400 bg-emerald-400/10'
                                    : 'text-blue-400 bg-blue-400/10'
                                }`}>
                                  {isInbound ? '← Inbound' : '→ Outbound'}
                                </span>
                                {isReply && (
                                  <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                                    {msg.source === 'email_reply' ? 'Email Reply' : msg.source === 'website_contact_form' ? 'Contact Form' : msg.source || 'Reply'}
                                  </span>
                                )}
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {msg.sender_name || msg.sender_email}
                                </span>
                              </div>
                              <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">
                                {new Date(msg.created_at).toLocaleString()}
                              </span>
                            </div>
                            <pre className="text-gray-300 font-sans whitespace-pre-wrap leading-relaxed">
                              {msg.body || 'No message body.'}
                            </pre>
                            {msg.raw_payload && Object.keys(msg.raw_payload).length > 0 && (
                              <details className="mt-3">
                                <summary className="text-[10px] uppercase tracking-widest text-gray-500 font-mono font-bold cursor-pointer hover:text-gray-300 transition-colors">
                                  Raw Payload
                                </summary>
                                <pre className="mt-2 text-[11px] text-gray-500 font-mono bg-white/[0.02] p-3 rounded border border-nano-border overflow-x-auto">
                                  {JSON.stringify(msg.raw_payload, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  ) : (
                    <div className="text-gray-500 font-mono text-xs italic">No messages in this conversation.</div>
                  )}
                </div>

                {/* Reply Box UI */}
                <div className="p-4 border-t border-nano-border bg-nano-bg flex flex-col gap-2">
                  {replyError && (
                    <div className="text-red-500 bg-red-500/10 border border-red-500/30 p-3 rounded font-mono text-xs">
                      Failed to send: {replyError}
                    </div>
                  )}
                  {replySuccessMessage && (
                    <div className="text-green-500 bg-green-500/10 border border-green-500/30 p-3 rounded font-mono text-xs">
                      {replySuccessMessage}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-gray-500">Set status on reply:</span>
                    <select value={replyStatus} onChange={e => setReplyStatus(e.target.value)} className="bg-black border border-nano-border text-white text-[10px] font-bold uppercase px-2 py-1 rounded cursor-pointer focus:outline-none focus:border-nano-yellow">
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 ml-4 cursor-pointer text-gray-400 hover:text-white transition-colors">
                      <input 
                        type="checkbox" 
                        checked={sendEmail} 
                        onChange={(e) => setSendEmail(e.target.checked)} 
                        className="w-3 h-3 accent-nano-yellow cursor-pointer"
                      />
                      Send Email Notification
                    </label>
                    <span className="ml-auto text-gray-600 italic">Email notification is sent once per customer-response cycle. Full messages stay in the dashboard.</span>
                  </div>
                  <div className="flex items-stretch gap-3">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (!replyText.trim() || isReplying || !selected.contact?.email) return;
                          handleSendReply();
                        }
                      }}
                      disabled={isReplying}
                      placeholder="Post a reply to this ticket… (Enter to send, Shift+Enter for new line)"
                      className="flex-1 bg-black border border-nano-border text-white text-sm font-sans p-4 rounded-lg focus:outline-none focus:border-nano-yellow transition-colors resize-none disabled:opacity-50 min-h-[60px]"
                      rows={2}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={isReplying || !replyText.trim() || !selected.contact?.email}
                      className="px-6 bg-nano-yellow text-black text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center gap-2 h-auto"
                    >
                      {isReplying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {isReplying ? 'Posting…' : 'Send'}
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-600 text-right">Enter to send · Shift+Enter for new line</div>
                  {!selected.contact?.email && (
                    <div className="text-right text-[10px] text-red-500 font-mono mt-1">
                      Cannot reply: User lacks email address.
                    </div>
                  )}
                </div>

                {/* Internal Notes */}
                <div className="p-4 border-t border-nano-border bg-amber-500/[0.02] flex flex-col gap-2">
                  <div className="text-[10px] uppercase tracking-widest text-amber-400 font-mono font-bold flex items-center gap-1.5">
                    <StickyNote size={12} /> Internal Notes ({notes.length})
                  </div>
                  {notes.length > 0 && (
                    <div className="space-y-2 max-h-[150px] overflow-y-auto">
                      {notes.map(n => (
                        <div key={n.id} className="bg-amber-500/[0.04] border border-amber-500/10 rounded p-2 text-xs">
                          <div className="flex justify-between mb-1">
                            <span className="text-amber-400 font-mono text-[10px]">{n.author_email || 'Admin'}</span>
                            <span className="text-gray-500 font-mono text-[10px]">{new Date(n.created_at).toLocaleString()}</span>
                          </div>
                          <pre className="text-gray-300 font-sans whitespace-pre-wrap leading-relaxed">{n.body}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-stretch gap-2">
                    <input
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      disabled={savingNote}
                      placeholder="Add internal note (not visible to customer)..."
                      className="flex-1 bg-black border border-amber-500/20 text-white text-xs font-sans p-2 rounded focus:outline-none focus:border-amber-400 transition-colors disabled:opacity-50"
                    />
                    <button onClick={handleSaveNote} disabled={savingNote || !noteText.trim()} className="px-3 bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50 flex items-center gap-1">
                      {savingNote ? <Loader2 size={12} className="animate-spin" /> : <StickyNote size={12} />} Save
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 font-mono text-xs flex-col gap-3">
                <MessageSquare size={32} className="opacity-20" />
                Select a lead to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status change + auto-email modal */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nano-bg border border-nano-border w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-nano-border bg-black/40">
              <h3 className="font-mono font-bold tracking-wide flex items-center gap-2 text-white">
                <Send size={16} className="text-nano-yellow" />
                Mark as {STATUS_LABELS[statusModal.newStatus] || statusModal.newStatus}
              </h3>
              <button
                onClick={() => { setStatusModal(null); setSendingStatus(false); }}
                className="text-gray-400 hover:text-white"
                disabled={sendingStatus}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-300">
                Changing ticket <strong className="text-white">{statusModal.ticketId}</strong> to{' '}
                <strong className="text-white uppercase">{STATUS_LABELS[statusModal.newStatus] || statusModal.newStatus}</strong>.
              </p>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSendEnabled}
                    onChange={(e) => setAutoSendEnabled(e.target.checked)}
                    className="w-4 h-4 accent-nano-yellow cursor-pointer"
                  />
                  <span className="text-sm text-gray-300">Send notification email to <strong className="text-nano-yellow">{statusModal.contactEmail}</strong></span>
                </label>
              </div>
              <p className="text-[10px] text-gray-500 font-mono italic">Email will only notify the customer that the ticket status changed. The full message content stays in the dashboard.</p>

              {autoSendEnabled && (
                <div className="bg-black border border-nano-border rounded-lg p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 font-mono font-bold mb-2">Notification Preview</div>
                  <div className="text-xs text-gray-400 font-mono mb-1">
                    Subject: Re: [{statusModal.ticketId}] Cast Director Studio Support
                  </div>
                  <pre className="text-xs text-gray-300 font-sans whitespace-pre-wrap leading-relaxed mt-2">
{`Hello,

Your Cast Director Studio support ticket has been updated.

Ticket: ${statusModal.ticketId}
Status: ${STATUS_LABELS[statusModal.newStatus] || statusModal.newStatus}

Please log into your account dashboard to view your ticket and any future replies:
https://castdirectorstudio.com/account

Cast Director Studio Support
support@castdirectorstudio.com`}
                  </pre>
                </div>
              )}
            </div>

            <div className="border-t border-nano-border bg-black/40 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => { setStatusModal(null); setSendingStatus(false); }}
                disabled={sendingStatus}
                className="px-4 py-2 border border-nano-border text-gray-300 hover:bg-white/5 rounded text-xs uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => commitStatusChange(statusModal.convoId, statusModal.newStatus, autoSendEnabled)}
                disabled={sendingStatus}
                className="px-6 py-2 bg-nano-yellow text-black rounded text-xs uppercase tracking-wider font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {sendingStatus ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
                {sendingStatus ? 'Processing...' : `Update Status${autoSendEnabled ? ' & Notify' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsAdmin;
