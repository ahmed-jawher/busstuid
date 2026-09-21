import { useTranslation } from 'react-i18next';
import type { TripStudentStatus } from '@wusool/shared';
import { cn } from '@/lib/cn';

// Colour is never the only signal: every status has an icon and a word too (PLAN §15).
const STYLE: Record<TripStudentStatus, { icon: string; className: string }> = {
  expected: {
    icon: '⏳',
    className: 'bg-status-expected/15 text-foreground border-status-expected',
  },
  boarded: { icon: '🚌', className: 'bg-status-boarded/15 text-foreground border-status-boarded' },
  alighted: {
    icon: '✅',
    className: 'bg-status-alighted/15 text-foreground border-status-alighted',
  },
  absent: { icon: '➖', className: 'bg-status-absent/15 text-muted border-status-absent' },
  missing: { icon: '❗', className: 'bg-alert/15 text-foreground border-alert' },
  resolved: {
    icon: '✔️',
    className: 'bg-status-alighted/15 text-foreground border-status-alighted',
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: TripStudentStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  const s = STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold',
        s.className,
        className,
      )}
    >
      <span aria-hidden="true">{s.icon}</span>
      {t(`status.${status}`)}
    </span>
  );
}
