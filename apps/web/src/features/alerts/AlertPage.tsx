import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { RESOLUTION_REASONS } from '@wusool/shared';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/form';
import { Card, Notice, PageHeader, Spinner } from '@/components/ui/layout';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { displayName, formatTime, orgName } from '@/lib/format';
import type { AlertRow } from '@/lib/types';

interface GuardianAlert {
  id: string;
  type: string;
  severity: string;
  status: string;
  openedAt: string;
  resolvedAt: string | null;
  escalationLevel: number;
  student: { fullNameAr: string; fullNameEn: string | null };
  vehicle: { plateNumber: string };
  organization: { nameAr: string; nameEn: string | null };
  driver: { fullNameAr: string; fullNameEn: string | null; phoneE164: string } | null;
  emergencyNumber: string;
}

/**
 * /alert/:id deep link (PLAN §9.1). Crew and admins get the handling view; guardians get the
 * full-screen alert with a free `tel:` call and the emergency number, and are never asked to act.
 */
export function AlertPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const crew = useQuery({
    queryKey: ['alert', id],
    queryFn: () => api<AlertRow>(`/alerts/${id}`),
    retry: false,
    refetchInterval: 15_000,
  });
  const notCrew = crew.error instanceof ApiError && crew.error.status === 404;
  const guardian = useQuery({
    queryKey: ['guardian-alert', id],
    queryFn: () => api<GuardianAlert>(`/me/alerts/${id}`),
    enabled: notCrew,
    refetchInterval: 15_000,
  });

  if (crew.isLoading || (notCrew && guardian.isLoading))
    return <Spinner label={t('common.loading')} />;
  if (crew.data) return <CrewAlert alert={crew.data} />;
  if (guardian.data) return <GuardianAlertView alert={guardian.data} />;
  return <Notice tone="danger">{errorMessage(guardian.error ?? crew.error)}</Notice>;
}

function GuardianAlertView({ alert: a }: { alert: GuardianAlert }) {
  const { t } = useTranslation();
  const resolved = a.status === 'resolved';
  return (
    <div
      className={`-mx-4 -my-6 min-h-[80dvh] space-y-5 p-6 ${resolved ? 'bg-status-alighted/15' : 'bg-alert text-alert-foreground'}`}
    >
      <h1 className="text-3xl font-bold">
        {resolved ? `✔️ ${t('alert.resolvedTitle')}` : `🚨 ${t('alert.urgent')}`}
      </h1>
      <p className="text-xl font-semibold">
        {resolved
          ? t('alert.resolvedBody', { student: displayName(a.student) })
          : t(`alert.guardianBody.${a.type}`, {
              student: displayName(a.student),
              vehicle: a.vehicle.plateNumber,
            })}
      </p>
      <p>
        {orgName(a.organization)} · {formatTime(a.openedAt)}
      </p>
      {!resolved && (
        <div className="space-y-3">
          {a.driver && (
            <a
              href={`tel:${a.driver.phoneE164}`}
              className="flex min-h-touch items-center justify-center rounded-md bg-white px-4 text-xl font-bold text-black"
            >
              📞 {t('alert.callDriver', { name: displayName(a.driver) })}
            </a>
          )}
          <p className="text-sm opacity-90">{t('alert.phoneUnverified')}</p>
          <a
            href={`tel:${a.emergencyNumber}`}
            className={`flex min-h-touch items-center justify-center rounded-md border-2 border-white px-4 text-xl font-bold ${a.escalationLevel >= 2 ? 'animate-pulse' : ''}`}
          >
            🚑 {t('alert.callEmergency', { number: a.emergencyNumber })}
          </a>
          <p>{t('alert.noActionNeeded')}</p>
        </div>
      )}
    </div>
  );
}

function CrewAlert({ alert: a }: { alert: AlertRow }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reason, setReason] = useState<(typeof RESOLUTION_REASONS)[number]>(
    'found_on_vehicle_and_alighted',
  );
  const [note, setNote] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['alert', a.id] });
  const ack = useMutation({
    mutationFn: () => api(`/alerts/${a.id}/acknowledge`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const resolve = useMutation({
    mutationFn: () =>
      api(`/alerts/${a.id}/resolve`, {
        method: 'POST',
        body: { reason, ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: refresh,
  });
  const open = a.status !== 'resolved';
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title={t(`alertType.${a.type}`)}
        subtitle={`${a.trip.route?.name ?? ''} · ${a.trip.vehicle.plateNumber} · ${formatTime(a.openedAt)}`}
      />
      <Notice tone={open ? 'danger' : 'success'}>
        {t(`severity.${a.severity}`)} · {t(`alertStatus.${a.status}`)}
        {a.resolutionReason && ` · ${t(`reason.${a.resolutionReason}`)}`}
      </Notice>
      {open && (
        <Card className="space-y-4">
          {a.status === 'open' && (
            <Button
              variant="outline"
              className="w-full"
              disabled={ack.isPending}
              onClick={() => ack.mutate()}
            >
              {t('alert.acknowledge')}
            </Button>
          )}
          <SelectField
            label={t('alert.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
          >
            {RESOLUTION_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`reason.${r}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('alert.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required={reason === 'other'}
          />
          {(resolve.error ?? ack.error) && (
            <Notice tone="danger">{errorMessage(resolve.error ?? ack.error)}</Notice>
          )}
          <Button
            size="touch"
            className="w-full"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate()}
          >
            {t('alert.resolve')}
          </Button>
        </Card>
      )}
    </div>
  );
}
