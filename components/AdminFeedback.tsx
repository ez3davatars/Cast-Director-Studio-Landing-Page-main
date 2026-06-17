import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'default';
}

interface AdminFeedbackContextValue {
  notify: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AdminFeedbackContext = createContext<AdminFeedbackContextValue | null>(null);

export function useAdminFeedback() {
  const ctx = useContext(AdminFeedbackContext);
  if (!ctx) throw new Error('useAdminFeedback must be used inside AdminFeedbackProvider');
  return ctx;
}

const toneClass: Record<ToastTone, string> = {
  success: 'border-green-500/30 bg-green-500/10 text-green-200',
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  info: 'border-nano-border bg-black text-nano-text',
};

const toneIcon: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-green-300" />,
  error: <AlertTriangle size={16} className="text-red-300" />,
  info: <Info size={16} className="text-nano-yellow" />,
};

export const AdminFeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 4500);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  const closeConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <AdminFeedbackContext.Provider value={value}>
      {children}

      <div className="fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`pointer-events-auto flex items-start gap-3 rounded border p-3 shadow-xl backdrop-blur ${toneClass[toast.tone]}`}>
            <div className="mt-0.5">{toneIcon[toast.tone]}</div>
            <div className="flex-1 text-sm">{toast.message}</div>
            <button
              onClick={() => setToasts(prev => prev.filter(item => item.id !== toast.id))}
              className="text-current opacity-70 hover:opacity-100"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-nano-border bg-nano-panel shadow-2xl">
            <div className="flex items-center gap-3 border-b border-nano-border px-5 py-4">
              <AlertTriangle size={18} className={confirmState.tone === 'danger' ? 'text-red-300' : 'text-nano-yellow'} />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-white">{confirmState.title}</h2>
            </div>
            <div className="px-5 py-4 text-sm leading-6 text-nano-text">{confirmState.message}</div>
            <div className="flex justify-end gap-2 border-t border-nano-border px-5 py-4">
              <button
                onClick={() => closeConfirm(false)}
                className="rounded border border-nano-border bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-nano-text hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={`rounded border px-4 py-2 text-xs font-bold uppercase tracking-wider ${
                  confirmState.tone === 'danger'
                    ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                    : 'border-nano-yellow/40 bg-nano-yellow/10 text-nano-yellow hover:bg-nano-yellow/20'
                }`}
              >
                {confirmState.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminFeedbackContext.Provider>
  );
};
