import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4', className)} {...props} />
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 space-y-2">
      {back && (
        <Link
          to={back.to}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          <span aria-hidden="true" className="me-1 rtl:rotate-180">
            ←
          </span>
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <div className="text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-border bg-surface',
    warning: 'border-warning bg-warning/10',
    danger: 'border-alert bg-alert/10',
    success: 'border-status-alighted bg-status-alighted/10',
  };
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'note'}
      className={cn('rounded-md border p-3 text-sm', tones[tone], className)}
    >
      {children}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted">
      {children}
    </p>
  );
}
