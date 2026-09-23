import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

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

const ToastContext = createContext<{ show: Show; clearActions: () => void } | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback<Show>((t) => {
    const toast: Toast = { id: ++seq, duration: 5000, tone: 'info', ...t };
    // One undo at a time: the newest replaces the previous action toast.
    setToasts((all) => [...all.filter((x) => !(x.action && toast.action)), toast].slice(-3));
  }, []);
  const clearActions = useCallback(() => setToasts((all) => all.filter((t) => !t.action)), []);
  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );

  return (
    <ToastContext.Provider value={{ show, clearActions }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem + var(--toast-offset, 0px))',
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Dark card with a status icon and an optional undo (Claude Design "Tammeni Driver"). */
function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onDone]);
  return (
    <div
      role="status"
      className="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-2xl bg-[#0A0F24] py-2.5 ps-4 pe-2.5 text-white shadow-[0_12px_30px_rgba(0,0,0,.3)]"
    >
      <Icon
        name={toast.tone === 'error' ? 'error' : 'check_circle'}
        fill
        size={24}
        className={toast.tone === 'error' ? 'text-[#FF8A8F]' : 'text-[#7EE2A0]'}
      />
      <span className="min-h-11 flex-1 content-center py-1 text-[15px] font-semibold">
        {toast.message}
      </span>
      {toast.action && (
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-xl bg-white/14 px-4 text-[15px] font-bold"
          onClick={() => {
            toast.action!.run();
            onDone();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export function useToast(): Show {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx.show;
}

/** Removes undo toasts, e.g. when a full-screen step would sit under them. */
export function useClearActionToasts(): () => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useClearActionToasts outside ToastProvider');
  return ctx.clearActions;
}
