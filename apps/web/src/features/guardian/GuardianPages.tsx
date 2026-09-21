import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui/layout';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { displayName, formatDate, formatTime, orgName } from '@/lib/format';
import type { Child, ChildTripRow } from '@/lib/types';
import { usePushReady } from '../push/NotificationSetupPage';

interface MyAlerts {
  asGuardian: { id: string; studentId: string | null; severity: string; status: string }[];
}

/** "On the bus since 6:42", "Arrived at school 7:05", … (PLAN §13). */
export function childSummary(rows: ChildTripRow[], t: TFunction): string {
  const current = [...rows].reverse().find((r) => r.studentStatus !== 'expected') ?? null;
  if (!current) return rows.length > 0 ? t('guardian.waitingForTrip') : t('guardian.noTripToday');
  switch (current.studentStatus) {
    case 'boarded':
      return t('guardian.onBusSince', { time: formatTime(current.boardedAt) });
    case 'alighted':
    case 'resolved':
      return current.direction === 'to_school'
        ? t('guardian.arrivedSchool', { time: formatTime(current.alightedAt) })
        : t('guardian.droppedHome', { time: formatTime(current.alightedAt) });
    case 'absent':
      return t('guardian.markedAbsent');
    default:
      return t('guardian.checking');
  }
}

function ChildPhoto({ child, size = 'size-16' }: { child: Child; size?: string }) {
  return child.photoUrl ? (
    <img src={child.photoUrl} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${size} shrink-0 rounded-full bg-border`} aria-hidden="true" />
  );
}

function ChildCard({ child }: { child: Child }) {
  const { t } = useTranslation();
  const today = useQuery({
    queryKey: ['child-today', child.id],
    queryFn: () => api<ChildTripRow[]>(`/children/${child.id}/today`),
    refetchInterval: 30_000,
  });
  const pending = child.enrollmentRequests.find((r) => r.status === 'pending');
  const latest = today.data
    ? [...today.data].reverse().find((r) => r.studentStatus !== 'expected')
    : undefined;
  return (
    <Link to={`/child/${child.id}`} className="block">
      <Card className="flex items-center gap-4">
        <ChildPhoto child={child} />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-lg font-bold">{displayName(child)}</h2>
          <p className="font-semibold">{today.data ? childSummary(today.data, t) : '…'}</p>
          {latest && <StatusBadge status={latest.studentStatus} />}
          {pending && (
            <p className="text-sm text-muted">
              {t('guardian.pendingApproval', { org: orgName(pending.organization) })}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}

export function GuardianHomePage() {
  const { t } = useTranslation();
  const pushReady = usePushReady();
  const children = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[]>('/me/children'),
  });
  const alerts = useQuery({
    queryKey: ['my-alerts'],
    queryFn: () => api<MyAlerts>('/me/alerts'),
    refetchInterval: 20_000,
  });
  const open = alerts.data?.asGuardian ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('guardian.myChildren')}
        actions={
          <Link to="/children/new">
            <Button>{t('guardian.addChild')}</Button>
          </Link>
        }
      />
      {open.map((a) => (
        <Link key={a.id} to={`/alert/${a.id}`} className="block">
          <Notice tone="danger" className="text-base font-bold">
            🚨 {t('guardian.openAlert')}
          </Notice>
        </Link>
      ))}
      {pushReady === false && (
        <Notice tone="warning">
          {t('guardian.enablePush')}{' '}
          <Link to="/notifications/setup?next=/guardian" className="font-bold underline">
            {t('push.enable')}
          </Link>
        </Notice>
      )}
      {children.isLoading && <Spinner label={t('common.loading')} />}
      {children.error && <Notice tone="danger">{errorMessage(children.error)}</Notice>}
      {children.data?.length === 0 && <EmptyState>{t('guardian.noChildren')}</EmptyState>}
      <ul className="space-y-3">
        {children.data?.map((c) => (
          <li key={c.id}>
            <ChildCard child={c} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TripList({ rows }: { rows: ChildTripRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return <EmptyState>{t('guardian.noTrips')}</EmptyState>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Card className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">
                {t(`direction.${r.direction}`)} · {formatDate(r.plannedStartAt)}
              </span>
              <StatusBadge status={r.studentStatus} />
            </div>
            <p className="text-sm text-muted">
              {r.vehicle.plateNumber}
              {r.stopName && ` · ${r.stopName}`} · {orgName(r.organization)}
            </p>
            <p className="text-sm">
              {t('guardian.boardedAt')}: {formatTime(r.boardedAt)} · {t('guardian.alightedAt')}:{' '}
              {formatTime(r.alightedAt)}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function ChildPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const child = useQuery({ queryKey: ['child', id], queryFn: () => api<Child>(`/children/${id}`) });
  const today = useQuery({
    queryKey: ['child-today', id],
    queryFn: () => api<ChildTripRow[]>(`/children/${id}/today`),
    refetchInterval: 30_000,
  });
  const history = useQuery({
    queryKey: ['child-history', id],
    queryFn: () => api<ChildTripRow[]>(`/children/${id}/history?days=30`),
  });

  if (child.isLoading) return <Spinner label={t('common.loading')} />;
  if (child.error || !child.data) return <Notice tone="danger">{errorMessage(child.error)}</Notice>;
  const c = child.data;
  return (
    <div className="space-y-5">
      <PageHeader
        back={{ to: '/guardian', label: t('guardian.myChildren') }}
        title={displayName(c)}
        subtitle={c.schoolName}
      />
      <Card className="flex items-center gap-4">
        <ChildPhoto child={c} size="size-24" />
        <div className="space-y-1">
          <p className="text-lg font-bold">{today.data ? childSummary(today.data, t) : '…'}</p>
          {c.enrollmentRequests.map((r) => (
            <p key={r.id} className="text-sm text-muted">
              {orgName(r.organization)}: {t(`enrollment.${r.status}`)}
            </p>
          ))}
        </div>
      </Card>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t('guardian.today')}</h2>
        {today.data && <TripList rows={today.data} />}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t('guardian.history')}</h2>
        {history.data && <TripList rows={history.data} />}
      </section>
    </div>
  );
}
