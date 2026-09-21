import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base text-foreground ' +
  'placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-semibold text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string | null;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(control, className)}
          {...props}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  className,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string | null;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <select
          id={id}
          aria-describedby={describedBy}
          className={cn(control, className)}
          {...props}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input id={id} type="checkbox" className="mt-1 size-5 accent-primary" {...props} />
      <label htmlFor={id} className="text-sm leading-6">
        {label}
      </label>
    </div>
  );
}
