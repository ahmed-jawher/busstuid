import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button } from './ui/button';

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'success';
  action?: { label: string; run: () => void };
  /** Milliseconds; the driver's undo toast lives 60 s (PLAN §13). */
  duration: number;
}

type Show = (
  t: Omit<Toast, 'id' | 'duration' | 'tone'> & Partial<Pick<Toast, 'duration' | 'tone'>>,
) => void;

const ToastContext = createContext<Show | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback<Show>((t) => {
    const toast: Toast = { id: ++seq, duration: 5000, tone: 'info', ...t };
    // One undo at a time: the newest replaces the previous action toast.
    setToasts((all) => [...all.filter((x) => !(x.action && toast.action)), toast].slice(-3));
  }, []);
  const dismiss = (id: number) => setToasts((all) => all.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onDone]);
  const tone = {
    info: 'bg-foreground text-background',
    error: 'bg-alert text-alert-foreground',
    success: 'bg-status-alighted text-white',
  }[toast.tone];
  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-lg px-4 py-3 shadow-lg ${tone}`}
    >
      <span className="font-semibold">{toast.message}</span>
      {toast.action && (
        <Button
          variant="outline"
          className="shrink-0 border-current bg-transparent text-current"
          onClick={() => {
            toast.action!.run();
            onDone();
          }}
        >
          {toast.action.label}
        </Button>
      )}
    </div>
  );
}

export function useToast(): Show {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
