import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MessageSquare, RefreshCw, ExternalLink, User, UserX, ChevronDown, Trash2, Minus, Plus, Send, Loader2, X, CheckCheck } from 'lucide-react';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';

type Conversation = {
  id: string;
  ticket_id: string;
  inquiry_type: string | null;
  status: string;
  created_at: string;
  linked_user_id: string | null;
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

const STATUS_OPTIONS = ['new', 'open', 'resolved', 'closed'];
const TEXT_SIZES = [
  { label: 'S', zoom: 0.85 },
  { label: 'M', zoom: 1.0 },
  { label: 'L', zoom: 1.2 },
  { label: 'XL', zoom: 1.45 },
];

const statusColor: Record<string, string> = {
  new: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  open: 'text-nano-yellow bg-nano-yellow/10 border-nano-yellow/30',
  resolved: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  closed: 'text-gray-400 bg-white/5 border-white/10',
};

const AUTO_MESSAGES: Record<string, (name: string, ticketId: string) => string> = {
  resolved: (name, ticketId) =>
    `Hi ${name},\n\nYour inquiry (${ticketId}) has been resolved. If you have any further questions or need additional assistance, you can reply directly to this email or submit a new message at:\n\nhttps://castdirectorstudio.com/contact\n\nPlease reference your ticket ID: ${ticketId}\n\nBest regards,\nCast Director Studio Support`,
  closed: (name, ticketId) =>
    `Hi ${name},\n\nYour inquiry (${ticketId}) has been closed. Thank you for contacting Cast Director Studio.\n\nIf you need help in the future, you can reply directly to this email or reach us at:\n\nhttps://castdirectorstudio.com/contact\n\nPlease reference your ticket ID: ${ticketId}\n\nBest regards,\nCast Director Studio Support`,
};

const LeadsAdmin: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [textSizeIdx, setTextSizeIdx] = useState(1); // default M
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [statusModal, setStatusModal] = useState<{ convoId: string; newStatus: string; contactId: string; contactEmail: string; contactName: string; ticketId: string } | null>(null);
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [sendingStatus, setSendingStatus] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('crm_conversations')
        .select(`
          id, ticket_id, inquiry_type, status, created_at, linked_user_id,
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

  const filtered = conversations.filter((c) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    const ct = c.contact;
    return (
      (c.ticket_id || '').toLowerCase().includes(q) ||
      (c.inquiry_type || '').toLowerCase().includes(q) ||
      (ct?.email || '').toLowerCase().includes(q) ||
      (ct?.name || '').toLowerCase().includes(q) ||
      (ct?.company || '').toLowerCase().includes(q) ||
      c.messages.some(m => (m.body || '').toLowerCase().includes(q))
    );
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

    // Send auto-email if enabled
    if (sendEmail && statusModal) {
      try {
        const messageBody = AUTO_MESSAGES[newStatus]?.(statusModal.contactName, statusModal.ticketId) || '';
        await supabase.functions.invoke('send-ops-email', {
          body: {
            contact_id: statusModal.contactId,
            to: statusModal.contactEmail,
            subject: `Your inquiry ${statusModal.ticketId} has been ${newStatus}`,
            body: messageBody,
          },
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

    try {
      const { data, error: funcErr } = await supabase.functions.invoke('admin-crm-reply', {
        body: {
          conversation_id: selected.id,
          ticket_id: selected.ticket_id,
          recipient_email: selected.contact?.email,
          reply_text: replyText
        }
      });

      if (funcErr) throw new Error(funcErr.message || 'Failed to invoke edge function');
      if (data?.error) throw new Error(data.error);
      
      const newMsg = data?.message;
      if (!newMsg) throw new Error('Reply succeeded but no message was returned');

      // Optimistically add message to current selection
      setSelected(prev => {
        if (!prev) return prev;
        const updatedStatus = prev.status === 'new' ? 'open' : prev.status;
        return {
          ...prev,
          status: updatedStatus,
          messages: [...prev.messages, newMsg]
        };
      });

      // Update global conversations list as well
      setConversations(prev => prev.map(c => {
        if (c.id === selected.id) {
          const updatedStatus = c.status === 'new' ? 'open' : c.status;
          return {
            ...c,
            status: updatedStatus,
            messages: [...c.messages, newMsg]
          };
        }
        return c;
      }));

      setReplyText('');
    } catch (e: any) {
      console.error("Admin CRM reply failed:", e);
      setReplyError(e.message || 'Failed to dispatch reply. Check logs.');
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
                        onClick={() => setSelected(c)}
                        className="flex-1 p-4 text-left"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className={`font-bold font-sans truncate pr-2 text-sm ${selected?.id === c.id ? 'text-white' : 'text-gray-300'}`}>
                            {ct?.name || ct?.email || 'Unknown'}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">
                            {new Date(c.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${statusColor[c.status] || statusColor.new}`}>
                            {c.status}
                          </span>
                          {c.inquiry_type && (
                            <span className="text-[10px] text-gray-400 truncate">{c.inquiry_type}</span>
                          )}
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
                            <option key={s} value={s} className="bg-black">{s}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Ticket:</span>
                      <span className="text-white bg-white/5 px-2 py-0.5 rounded select-all">{selected.ticket_id}</span>
                    </div>
                    <span className="text-gray-500">|</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Type:</span>
                      <span className="text-white">{selected.inquiry_type || 'General'}</span>
                    </div>
                    <span className="text-gray-500">|</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Received:</span>
                      <span className="text-white">{new Date(selected.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {contact?.company && (
                    <div className="text-xs font-mono text-gray-400">
                      Company: <span className="text-white">{contact.company}</span>
                    </div>
                  )}


                </div>

                {/* Message thread */}
                <div className="flex-1 overflow-y-auto p-6 bg-black shadow-inner">
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
                    </div>
                  ) : (
                    <div className="text-gray-500 font-mono text-xs italic">No messages in this conversation.</div>
                  )}
                </div>

                {/* Reply Box UI */}
                <div className="p-6 border-t border-nano-border bg-nano-bg flex flex-col gap-3">
                  {replyError && (
                    <div className="text-red-500 bg-red-500/10 border border-red-500/30 p-3 rounded font-mono text-xs">
                      Failed to send: {replyError}
                    </div>
                  )}
                  <div className="flex items-stretch gap-3">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={isReplying}
                      placeholder="Type a response to this user..."
                      className="flex-1 bg-black border border-nano-border text-white text-sm font-sans p-4 rounded-lg focus:outline-none focus:border-nano-yellow transition-colors resize-none disabled:opacity-50 min-h-[60px]"
                      rows={2}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={isReplying || !replyText.trim() || !selected.contact?.email}
                      className="px-6 bg-nano-yellow text-black text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center gap-2 h-auto"
                    >
                      {isReplying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {isReplying ? 'Dispatching...' : 'Send Reply'}
                    </button>
                  </div>
                  {!selected.contact?.email && (
                    <div className="text-right text-[10px] text-red-500 font-mono mt-1">
                      Cannot reply: User lacks email address.
                    </div>
                  )}
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
                Mark as {statusModal.newStatus}
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
                <strong className="text-white uppercase">{statusModal.newStatus}</strong>.
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

              {autoSendEnabled && (
                <div className="bg-black border border-nano-border rounded-lg p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 font-mono font-bold mb-2">Preview</div>
                  <div className="text-xs text-gray-400 font-mono mb-1">
                    Subject: Your inquiry {statusModal.ticketId} has been {statusModal.newStatus}
                  </div>
                  <pre className="text-xs text-gray-300 font-sans whitespace-pre-wrap leading-relaxed mt-2">
                    {AUTO_MESSAGES[statusModal.newStatus]?.(statusModal.contactName, statusModal.ticketId) || ''}
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
                {sendingStatus ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sendingStatus ? 'Processing...' : `Mark ${statusModal.newStatus}${autoSendEnabled ? ' & Notify' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsAdmin;
