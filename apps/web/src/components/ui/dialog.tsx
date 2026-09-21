import { useEffect, useRef, type ReactNode } from 'react';

/** Accessible modal built on <dialog> (focus trap and Escape handling come from the browser). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  tone = 'default',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      // Only the user dismissing it (Escape) reports back. The native `close` event also fires
      // when `open` flips to false, and reacting to that would undo step changes between dialogs.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      className={`m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border p-0 text-foreground backdrop:bg-black/60 ${
        tone === 'danger' ? 'border-alert bg-surface' : 'border-border bg-surface'
      }`}
    >
      <div className="space-y-4 p-5">
        <h2
          id="dialog-title"
          className={`text-xl font-bold ${tone === 'danger' ? 'text-alert' : ''}`}
        >
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
