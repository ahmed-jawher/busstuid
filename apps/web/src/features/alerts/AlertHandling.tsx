import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RESOLUTION_REASONS } from '@wusool/shared';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { formatTime } from '@/lib/format';
import type { AlertRow } from '@/lib/types';

export interface AlertEvent {
  action: 'opened' | 'notified' | 'escalated' | 'acknowledged' | 'resolved' | string;
  actorUserId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export type AlertDetail = AlertRow & { events?: AlertEvent[] };

type Reason = (typeof RESOLUTION_REASONS)[number];

/**
 * Handling an alert: "I'm on it", then closing it with a documented reason (PLAN §3.3). The
 * reasons are a tap list, not a dropdown, and the close button can sit in a sticky footer.
 */
export function useAlertHandling(alert: AlertDetail, invalidate: unknown[][]) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState<Reason>('found_on_vehicle_and_alighted');
  const [note, setNote] = useState('');
  const [missingNote, setMissingNote] = useState(false);
  const refresh = () =>
    Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
  const ack = useMutation({
    mutationFn: () => api(`/alerts/${alert.id}/acknowledge`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const resolve = useMutation({
    mutationFn: () =>
      api(`/alerts/${alert.id}/resolve`, {
        method: 'POST',
        body: { reason, ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: async () => {
      setNote('');
      toast({ message: t('alert.resolvedToast'), tone: 'success' });
      await refresh();
    },
  });
  return {
    alert,
    open: alert.status !== 'resolved',
    reason,
    pick: (r: Reason) => {
      setReason(r);
      setMissingNote(false);
    },
    note,
    setNote: (v: string) => {
      setNote(v);
      setMissingNote(false);
    },
    ack,
    resolve,
    submit: () => {
      if (reason === 'other' && !note.trim()) return setMissingNote(true);
      resolve.mutate();
    },
    error: missingNote
      ? t('alert.noteMissing')
      : resolve.error || ack.error
        ? errorMessage(resolve.error ?? ack.error)
        : null,
  };
}

export type AlertHandling = ReturnType<typeof useAlertHandling>;

/** What happened so far, oldest first; repeated reminders are folded into the escalations. */
export function AlertTimeline({
  alert,
  nameOf,
}: {
  alert: AlertDetail;
  nameOf?: (userId: string) => string | undefined;
}) {
  const { t } = useTranslation();
  let notified = false;
  const rows = (alert.events ?? []).flatMap((e) => {
    const p = e.payload ?? {};
    const who = e.actorUserId ? nameOf?.(e.actorUserId) : undefined;
    switch (e.action) {
      case 'opened':
        return [{ at: e.createdAt, text: t('alertEvent.opened') }];
      case 'notified':
        if (notified) return [];
        notified = true;
        return [{ at: e.createdAt, text: t('alertEvent.notified') }];
      case 'escalated':
        return [{ at: e.createdAt, text: t('alertEvent.escalated', { level: p.to }) }];
      case 'acknowledged':
        return [
          {
            at: e.createdAt,
            text: who
              ? t('alertEvent.acknowledgedBy', { name: who })
              : t('alertEvent.acknowledged'),
          },
        ];
      case 'resolved':
        return [
          {
            at: e.createdAt,
            text:
              t('alertEvent.resolved', { reason: t(`reason.${String(p.reason)}`) }) +
              (p.note ? ` — ${String(p.note)}` : ''),
          },
        ];
      default:
        return [];
    }
  });
  if (rows.length === 0) return null;
  const last = rows.length - 1;
  return (
    <ol className="rounded-2xl border border-border bg-surface px-4 pt-3.5 pb-1">
      {rows.map((r, i) => (
        <li key={i} className="flex gap-2.5">
          <div className="flex w-3 shrink-0 flex-col items-center pt-1.5">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                i !== last
                  ? 'bg-border'
                  : alert.status === 'resolved'
                    ? 'bg-status-alighted'
                    : 'bg-primary',
              )}
            />
            {i !== last && <span className="mt-0.5 w-0.5 flex-1 bg-border" />}
          </div>
          <div className="flex-1 pb-3 text-sm">
            <span className="text-muted">{formatTime(r.at)}</span> ·{' '}
            <span className="font-semibold">{r.text}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ResolveForm({ h }: { h: AlertHandling }) {
  const { t } = useTranslation();
  if (!h.open) return null;
  return (
    <>
      {h.alert.status === 'open' && (
        <Button
          variant="outline"
          className="min-h-12.5 w-full rounded-[14px] border-[1.5px] text-[15px] font-bold"
          disabled={h.ack.isPending}
          onClick={() => h.ack.mutate()}
        >
          <Icon name="front_hand" size={21} />
          {t('alert.acknowledge')}
        </Button>
      )}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pt-1 pb-1.5 text-sm font-bold">{t('alert.reason')}</legend>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {RESOLUTION_REASONS.map((r) => (
            <label
              key={r}
              className="flex min-h-12 cursor-pointer items-center gap-2.5 border-b border-border px-3.5 last:border-b-0 has-focus-visible:outline-2 has-focus-visible:outline-primary"
            >
              <input
                type="radio"
                name={`reason-${h.alert.id}`}
                value={r}
                checked={h.reason === r}
                onChange={() => h.pick(r)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'size-5.5 shrink-0 rounded-full border-2 border-border',
                  h.reason === r && 'border-[7px] border-primary',
                )}
              />
              <span className="flex-1 text-[14.5px]">{t(`reason.${r}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        <span>
          {t('alert.note')}{' '}
          <span className="text-[12.5px] font-normal text-muted">
            ({h.reason === 'other' ? t('alert.noteRequired') : t('alert.noteOptional')})
          </span>
        </span>
        <textarea
          rows={2}
          value={h.note}
          onChange={(e) => h.setNote(e.target.value)}
          required={h.reason === 'other'}
          className="resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] font-normal text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        />
      </label>
      {h.error && (
        <div role="alert" className="text-sm font-semibold text-alert">
          {h.error}
        </div>
      )}
    </>
  );
}

export function ResolveButton({ h }: { h: AlertHandling }) {
  const { t } = useTranslation();
  if (!h.open) return null;
  return (
    <Button
      size="touch"
      className="w-full rounded-[14px] text-base font-bold"
      disabled={h.resolve.isPending}
      onClick={h.submit}
    >
      {t('alert.resolve')}
    </Button>
  );
}
