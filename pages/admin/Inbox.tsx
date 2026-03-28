import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Inbox as InboxIcon, RefreshCw, Send, X, ExternalLink, Loader2 } from 'lucide-react';
import AdminSearchFilter from '../../components/AdminSearchFilter';
import { useNavigate } from 'react-router-dom';

const InboxAdmin: React.FC = () => {
  if (import.meta.env.VITE_INBOUND_EMAIL_ENABLED !== 'true') {
      return (
         <div className="flex h-full items-center justify-center p-8">
            <div className="text-center bg-black/40 border border-nano-border p-12 rounded-lg flex flex-col items-center">
                <InboxIcon size={48} className="text-gray-600 mb-6" />
                <h3 className="text-xl font-bold font-mono text-white mb-2 tracking-wide">Support Inbox Disabled</h3>
                <p className="text-gray-400 text-sm max-w-md font-sans">
                   The inbound customer email module is currently disabled. All core operations remain fully structurally independent. Enable <code className="bg-white/10 px-1 py-0.5 rounded text-nano-yellow font-mono text-xs">VITE_INBOUND_EMAIL_ENABLED=true</code> to mount this route.
                </p>
            </div>
         </div>
      );
  }

  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const navigate = useNavigate();

  const fetchEmails = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('inbound_emails')
        .select(`
          id, 
          from_email, 
          to_email, 
          subject, 
          text_content, 
          html_content, 
          provider_message_id, 
          received_at, 
          contact_id,
          contact:contacts(id, email)
        `)
        .order('received_at', { ascending: false })
        .limit(100);

      if (fetchErr) throw fetchErr;
      setEmails(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to establish threaded inbox telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const filteredEmails = emails.filter((e) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      (e.from_email || '').toLowerCase().includes(q) ||
      (e.subject || '').toLowerCase().includes(q) ||
      (e.text_content || '').toLowerCase().includes(q)
    );
  });

  const handleReplyDispatch = async () => {
    if (!replyBody.trim()) {
      setSendError("Message body is mandatory.");
      return;
    }
    setIsSending(true);
    setSendError(null);

    const replySubject = selectedMessage.subject?.toLowerCase().startsWith('re:') 
        ? selectedMessage.subject 
        : `Re: ${selectedMessage.subject || 'Support Inquiry'}`;

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('send-ops-email', {
        body: {
          contact_id: selectedMessage.contact_id || null, // Will gracefully default to null in DB if orphaned
          to: selectedMessage.from_email,
          subject: replySubject,
          body: replyBody + `\n\n--- Original Message ---\nFrom: ${selectedMessage.from_email}\nReceived: ${new Date(selectedMessage.received_at).toLocaleString()}\n\n${selectedMessage.text_content}`
        }
      });

      if (invokeErr) throw new Error(invokeErr.message);
      if (data?.error) throw new Error(data.error);

      setIsReplyOpen(false);
      setReplyBody('');
    } catch (e: any) {
      setSendError(e.message || "Failed to dispatch authenticated reply.");
    } finally {
      setIsSending(false);
    }
  };

  if (loading && emails.length === 0) {
    return (
      <div className="flex flex-col gap-4 text-white font-mono animate-pulse">
        <div className="h-40 bg-white/5 rounded-lg border border-nano-border w-full"></div>
        <div className="h-40 bg-white/5 rounded-lg border border-nano-border w-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
        <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold font-mono tracking-wide flex items-center gap-2 text-white">
                <InboxIcon size={24} className="text-nano-yellow" /> Unified Support Inbox
            </h2>
            <button 
                onClick={fetchEmails} 
                disabled={loading}
                className="bg-black border border-nano-border p-2 rounded text-gray-400 hover:text-white transition-colors"
                title="Refresh Inbox"
            >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
        </div>
        <div className="w-full sm:w-64">
          <AdminSearchFilter
            placeholder="Search senders, subjects, or contents..."
            value={filterText}
            onChange={setFilterText}
          />
        </div>
      </div>

      {error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 rounded font-mono text-sm">
          {error}
        </div>
      ) : (
        <div className="bg-black/40 border border-nano-border rounded-lg overflow-hidden flex flex-col lg:flex-row h-[70vh]">
          {/* Thread List */}
          <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-nano-border overflow-y-auto">
             {filteredEmails.length === 0 ? (
                <div className="p-8 text-center text-gray-500 font-mono text-xs italic">
                    {filterText ? 'No threads match your search.' : 'Inbox is empty. Awaiting physical webhook triggers.'}
                </div>
             ) : (
                <div className="flex flex-col">
                    {filteredEmails.map(email => (
                        <button 
                            key={email.id}
                            onClick={() => setSelectedMessage(email)}
                            className={`p-4 text-left border-b border-nano-border/50 hover:bg-white/5 transition-colors ${selectedMessage?.id === email.id ? 'bg-nano-yellow/5 border-l-2 border-l-nano-yellow' : ''}`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className={`font-bold font-sans truncate pr-2 ${selectedMessage?.id === email.id ? 'text-white' : 'text-gray-300'}`}>
                                    {email.from_email}
                                </span>
                                <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">
                                    {new Date(email.received_at).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="text-xs text-white pb-1 font-bold truncate">
                                {email.subject || '(No Subject)'}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate font-mono">
                                {email.text_content?.substring(0, 80) || '[No structural text content]'}...
                            </div>
                        </button>
                    ))}
                </div>
             )}
          </div>

          {/* Thread Detail Viewer */}
          <div className="flex-1 flex flex-col bg-nano-bg">
             {selectedMessage ? (
                 <>
                    <div className="p-6 border-b border-nano-border flex flex-col gap-3 flex-shrink-0">
                        <div className="flex justify-between items-start">
                            <h3 className="text-xl font-bold text-white tracking-wide">
                                {selectedMessage.subject || '(No Subject)'}
                            </h3>
                            <button 
                                onClick={() => setIsReplyOpen(true)}
                                className="px-4 py-2 bg-white text-black font-bold text-xs uppercase tracking-wider flex items-center gap-2 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
                            >
                                <Send size={14} /> Reply Route
                            </button>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-mono">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">From:</span>
                                <span className="text-nano-yellow select-all bg-nano-yellow/10 px-2 py-0.5 rounded border border-nano-yellow/20">
                                    {selectedMessage.from_email}
                                </span>
                            </div>
                            <div className="text-gray-500">|</div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500">Received:</span>
                                <span className="text-white">{new Date(selectedMessage.received_at).toLocaleString()}</span>
                            </div>
                        </div>
                        
                        {/* Intelligent CRM Link */}
                        <div className="flex items-center mt-2">
                            {selectedMessage.contact_id ? (
                                <button 
                                    onClick={() => navigate(`/admin/customers/${selectedMessage.contact_id}`)}
                                    className="text-[10px] uppercase font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-nano-border px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                                >
                                    <ExternalLink size={12} /> View Customer Ops Hub
                                </button>
                            ) : (
                                <div className="text-[10px] uppercase font-bold text-gray-500 bg-black border border-nano-border px-3 py-1.5 rounded flex items-center gap-1.5 opacity-50 cursor-not-allowed" title="Sender email does not explicitly match any tracked Identity token in public.contacts">
                                    <ExternalLink size={12} /> Unknown Anchor (Orphaned Route)
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 bg-black shadow-inner">
                        {selectedMessage.html_content ? (
                            <div 
                                className="bg-white text-black p-6 rounded-lg min-h-full font-sans prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: selectedMessage.html_content }}
                            />
                        ) : (
                            <pre className="text-gray-300 font-mono text-xs whitespace-pre-wrap leading-relaxed rounded-lg">
                                {selectedMessage.text_content || 'No readable body provided in webhook payload.'}
                            </pre>
                        )}
                    </div>
                 </>
             ) : (
                 <div className="flex-1 flex items-center justify-center text-gray-500 font-mono text-xs flex-col gap-3">
                     <InboxIcon size={32} className="opacity-20" />
                     Select an inbound thread to inspect origin architecture
                 </div>
             )}
          </div>
        </div>
      )}

      {/* Embedded Reply Modal */}
      {isReplyOpen && selectedMessage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nano-bg border border-nano-border w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-nano-border bg-black/40">
              <h3 className="font-mono font-bold tracking-wide flex items-center gap-2">
                <Send size={16} className="text-nano-yellow" /> Outbound Dispatch Sequence
              </h3>
              <button 
                onClick={() => !isSending && setIsReplyOpen(false)}
                className="text-gray-400 hover:text-white"
                disabled={isSending}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4 font-mono text-sm max-h-[60vh]">
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-gray-500 text-xs uppercase">Reply To:</span>
                <span className="text-nano-yellow bg-nano-yellow/10 border border-nano-yellow/20 py-1.5 px-3 rounded font-bold">{selectedMessage.from_email}</span>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-gray-500 text-xs uppercase">Subject:</span>
                <span className="text-gray-300 px-3 py-1.5">{selectedMessage.subject?.toLowerCase().startsWith('re:') ? selectedMessage.subject : `Re: ${selectedMessage.subject || 'Support Inquiry'}`}</span>
              </div>

              <div className="pt-2">
                <textarea 
                  placeholder="Type your response narrative..."
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  disabled={isSending}
                  rows={10}
                  className="w-full bg-black border border-nano-border px-4 py-3 rounded text-white focus:outline-none focus:border-nano-yellow transition-colors placeholder:text-gray-600 resize-y font-sans leading-relaxed"
                />
              </div>
              
              <div className="rounded border border-nano-border bg-black/30 p-4 text-xs mt-2 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-1 h-full bg-gray-500"></div>
                 <div className="text-gray-500 uppercase tracking-widest mb-2 font-bold ml-1">Original Payload Snippet</div>
                 <div className="text-gray-400 font-sans ml-1">
                    {selectedMessage.text_content?.substring(0, 300)}...
                 </div>
              </div>

              {sendError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded text-xs">
                  {sendError}
                </div>
              )}
            </div>

            <div className="border-t border-nano-border bg-black/40 px-6 py-4 flex justify-end gap-3 flex-shrink-0">
              <button 
                onClick={() => setIsReplyOpen(false)}
                disabled={isSending}
                className="px-4 py-2 border border-nano-border text-gray-300 hover:bg-white/5 rounded text-xs uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleReplyDispatch}
                disabled={isSending}
                className="px-6 py-2 bg-nano-yellow text-black rounded text-xs uppercase tracking-wider font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} 
                {isSending ? 'Dispatching Signature...' : 'Dispatch Reply'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default InboxAdmin;
