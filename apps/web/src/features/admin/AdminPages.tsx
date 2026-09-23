import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { AlertType, TripStatus, TripStudentStatus } from '@wusool/shared';
import { Icon, type IconName } from '@/components/Icon';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/form';
import { Chip, ErrorLine, PersonBadge, TONE_TEXT } from '@/components/ui/kit';
import { EmptyState, Notice, Spinner } from '@/components/ui/layout';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { displayName, formatDate, formatTime, orgName } from '@/lib/format';
import type { AlertRow, Counts, Manifest } from '@/lib/types';
import {
  AlertTimeline,
  ResolveButton,
  ResolveForm,
  useAlertHandling,
  type AlertDetail,
} from '@/features/alerts/AlertHandling';
import {
  useAdminOrg,
  useAudit,
  useClosedAlerts,
  useMemberMap,
  useMembers,
  useOpenAlerts,
  useOrgApi,
  useOrgStudents,
  useOrgTrips,
  usePendingEnrollments,
  useRoutes,
  useUnreachable,
  useVehicles,
  type EnrollmentRequest,
  type Member,
  type OrgTrip,
  type RouteDetail,
  type RouteRow,
  type Vehicle,
} from './admin-data';
import {
  AdminScreen,
  IconTile,
  Initial,
  Panel,
  Pill,
  SectionTitle,
  TONES,
  useWide,
  type Tone,
} from './admin-org';

// Admin screens (Claude Design "Tammeni Admin Mobile" and "Tammeni Admin"). On phones each item
// opens its own screen; from 1024px lists get a side panel, as in the web design.

const TRIP_TONE: Record<TripStatus, Tone> = {
  scheduled: 'neutral',
  in_progress: 'primary',
  overdue: 'warning',
  completed: 'ok',
  completed_with_alert: 'alert',
  cancelled: 'neutral',
};

const STUDENT_STATUS: Record<TripStudentStatus, [IconName, Tone]> = {
  boarded: ['directions_bus', 'primary'],
  alighted: ['check_circle', 'ok'],
  absent: ['do_not_disturb_on', 'neutral'],
  expected: ['hourglass_top', 'neutral'],
  missing: ['warning', 'alert'],
  resolved: ['check_circle', 'ok'],
};

const ALERT_ICON: Record<AlertType, IconName> = {
  student_left_onboard: 'warning',
  trip_overdue: 'schedule',
  driver_device_silent: 'signal_disconnected',
  unexpected_student: 'person_alert',
};

const SEVERITY_TONE: Record<AlertRow['severity'], Tone> = {
  critical: 'alertSolid',
  high: 'warning',
  low: 'neutral',
};

const ALERT_STATUS_TONE: Record<AlertRow['status'], Tone> = {
  open: 'alert',
  acknowledged: 'warning',
  resolved: 'ok',
};

// The watchdog raises driver_device_silent after 10 minutes (PLAN §7); warn the admin earlier.
const STALE_SIGNAL_MS = 2 * 60_000;

const figures = 'font-figures font-bold leading-none';
const card = 'rounded-[18px] border border-border bg-surface';

/** Icon squares of the desktop KPI cards (written out so Tailwind sees the classes). */
const KPI_TILE: Partial<Record<Tone, string>> = {
  primary: 'lg:bg-primary-soft',
  alert: 'lg:bg-alert-soft',
  warning: 'lg:bg-warning-soft',
};

/** Re-renders every few seconds so "last signal 40 s ago" stays true between refetches. */
function useNow(everyMs = 5_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function useSignal() {
  const { t } = useTranslation();
  const now = useNow();
  return (trip: Pick<OrgTrip, 'status' | 'lastHeartbeatAt' | 'endedAt'>) => {
    const live = trip.status === 'in_progress' || trip.status === 'overdue';
    if (!live || !trip.lastHeartbeatAt) {
      return {
        icon: 'schedule' as IconName,
        text: trip.endedAt ? t('admin.endedAt', { time: formatTime(trip.endedAt) }) : '—',
        stale: false,
      };
    }
    const age = Math.max(0, now - new Date(trip.lastHeartbeatAt).getTime());
    const text =
      age < 60_000
        ? t('admin.secondsAgo', { count: Math.round(age / 1000) })
        : t('admin.minutesAgo', { count: Math.round(age / 60_000) });
    const stale = age > STALE_SIGNAL_MS;
    return { icon: (stale ? 'signal_disconnected' : 'cell_tower') as IconName, text, stale };
  };
}

function tripTitle(
  t: (k: string) => string,
  trip: Pick<OrgTrip, 'route' | 'vehicle' | 'direction'>,
) {
  return `${trip.route?.name ?? trip.vehicle.plateNumber} · ${t(`directionShort.${trip.direction}`)}`;
}

/** Split view on desktop: the list, and the selected item beside it. */
function Split({ list, detail }: { list: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start">
      <div className="flex min-w-0 flex-col gap-2.5 lg:flex-[999_1_320px]">{list}</div>
      {detail && <div className="min-w-0 lg:sticky lg:top-5 lg:flex-[1_1_420px]">{detail}</div>}
    </div>
  );
}

function CloseButton({ to }: { to: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={to}
      aria-label={t('common.close')}
      className="flex size-8.5 shrink-0 items-center justify-center rounded-[10px] bg-surface-2"
    >
      <Icon name="close" size={20} />
    </Link>
  );
}

// ─── Live trips (tab 1) ─────────────────────────────────────────────────────

export function LiveTripsPage() {
  const { t } = useTranslation();
  const org = useAdminOrg();
  const wide = useWide();
  const [params] = useSearchParams();
  const trips = useOrgTrips();
  const alerts = useOpenAlerts();
  const unreachable = useUnreachable();
  const people = useMemberMap();
  const signal = useSignal();
  const list = trips.data ?? [];
  const openAlerts = alerts.data ?? [];
  const critical = openAlerts.filter((a) => a.severity === 'critical').length;
  const unreachableCount = unreachable.data?.length ?? 0;
  const selected = wide ? params.get('trip') : null;
  const kpis: {
    label: string;
    value: number;
    sub: string;
    icon: IconName;
    tone: Tone;
    to?: string;
  }[] = [
    {
      label: t('admin.kpi.running'),
      value: list.filter((x) => x.status === 'in_progress' || x.status === 'overdue').length,
      sub: t('admin.kpi.ofToday', { count: list.length }),
      icon: 'sensors',
      tone: 'primary',
    },
    {
      label: t('admin.kpi.onboard'),
      value: list.reduce((n, x) => n + x.counts.onboard, 0),
      sub: t('admin.kpi.now'),
      icon: 'directions_bus',
      tone: 'primary',
    },
    {
      label: t('admin.kpi.openAlerts'),
      value: openAlerts.length,
      sub: critical ? t('admin.kpi.critical', { count: critical }) : t('admin.kpi.noCritical'),
      icon: 'warning',
      tone: 'alert',
      to: '/admin/alerts',
    },
    {
      label: t('admin.kpi.unreachable'),
      value: unreachableCount,
      sub: t('admin.kpi.guardians'),
      icon: 'notifications_off',
      tone: 'warning',
      to: '/admin/unreachable',
    },
  ];

  return (
    <AdminScreen
      title={t('admin.nav.live')}
      sub={`${orgName(org)} · ${formatDate(new Date().toISOString())} · ${t('admin.tripsToday', { count: list.length })}`}
      wide
    >
      {org.status === 'pending_review' && (
        <Notice tone="warning">{t('admin.pendingReview')}</Notice>
      )}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:gap-3">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted lg:gap-2 lg:text-[13.5px]">
                <span
                  className={cn(
                    'flex items-center justify-center rounded-[9px] lg:size-7.5',
                    KPI_TILE[k.tone],
                  )}
                >
                  <Icon name={k.icon} fill size={18} className={TONE_TEXT[k.tone]} />
                </span>
                {k.label}
              </span>
              <span
                className={cn(
                  figures,
                  'text-[28px] lg:text-[30px]',
                  k.value > 0 && k.tone === 'alert' && 'text-alert',
                  k.value > 0 && k.tone === 'warning' && 'text-warning',
                )}
              >
                {k.value}
              </span>
              <span className="hidden text-[12.5px] text-muted lg:block">{k.sub}</span>
            </>
          );
          const box =
            'flex flex-col gap-1.5 rounded-2xl border border-border bg-surface px-3.5 py-3 lg:gap-2 lg:p-4';
          return k.to ? (
            <Link key={k.label} to={k.to} className={cn(box, 'active:bg-surface-2')}>
              {body}
            </Link>
          ) : (
            <div key={k.label} className={box}>
              {body}
            </div>
          );
        })}
      </div>

      <Split
        list={
          <div className="flex flex-col gap-3 lg:gap-0 lg:overflow-hidden lg:rounded-[18px] lg:border lg:border-border lg:bg-surface">
            <div className="flex items-center justify-between pt-1 lg:border-b lg:border-border lg:px-4.5 lg:py-3.5">
              <h2 className="text-[17px] font-bold lg:text-base">{t('admin.todayTrips')}</h2>
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <span className="size-2 animate-blink rounded-full bg-status-alighted [animation-duration:2s]" />
                {t('admin.liveNow')}
              </span>
            </div>
            {trips.isLoading && <Spinner label={t('common.loading')} />}
            {trips.data?.length === 0 && <EmptyState>{t('admin.noTripsToday')}</EmptyState>}
            <ul className="flex flex-col gap-3 lg:gap-0">
              {list.map((trip) => {
                const sig = signal(trip);
                const driver = people.get(trip.driverId);
                const on = selected === trip.id;
                return (
                  <li key={trip.id}>
                    <Link
                      to={
                        wide
                          ? on
                            ? '/admin'
                            : `/admin?trip=${trip.id}`
                          : `/admin/trips/${trip.id}`
                      }
                      aria-current={on ? 'true' : undefined}
                      className={cn(
                        'flex flex-col gap-2.5 rounded-[18px] border border-border bg-surface p-3.5 active:bg-surface-2',
                        'lg:flex-row lg:flex-wrap lg:items-center lg:gap-4 lg:rounded-none lg:border-0 lg:border-b lg:px-4.5',
                        on && 'lg:bg-surface-2',
                      )}
                    >
                      <span className="flex items-start gap-2.5 lg:min-w-0 lg:flex-[1_1_200px]">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15.5px] font-bold lg:text-[15px]">
                            {tripTitle(t, trip)}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] text-muted">
                            {driver ? `${displayName(driver)} · ` : ''}
                            <span dir="ltr">{trip.vehicle.plateNumber}</span> ·{' '}
                            {formatTime(trip.plannedStartAt)} – {formatTime(trip.plannedEndAt)}
                          </span>
                        </span>
                        <Pill tone={TRIP_TONE[trip.status]} className="lg:hidden">
                          {t(`tripStatus.${trip.status}`)}
                        </Pill>
                      </span>
                      <span className="flex flex-col gap-1.5 lg:flex-[1_1_180px]">
                        <ProgressBar counts={trip.counts} />
                        <span className="hidden text-xs text-muted lg:block">
                          <TripCounts counts={trip.counts} />
                        </span>
                      </span>
                      <span className="flex items-center gap-2.5 text-[12.5px] text-muted lg:w-27">
                        <span className="flex-1 lg:hidden">
                          <TripCounts counts={trip.counts} />
                        </span>
                        <span
                          className={cn(
                            'flex items-center gap-1',
                            sig.stale && 'font-semibold text-warning',
                          )}
                        >
                          <Icon name={sig.icon} size={16} />
                          {sig.text}
                        </span>
                      </span>
                      <span className="hidden w-30 justify-end lg:flex">
                        <Pill tone={TRIP_TONE[trip.status]}>{t(`tripStatus.${trip.status}`)}</Pill>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        }
        detail={
          selected ? (
            <div className={cn(card, 'flex flex-col gap-3.5 p-4.5')}>
              <TripDetail id={selected} compact close="/admin" />
            </div>
          ) : undefined
        }
      />
    </AdminScreen>
  );
}

function ProgressBar({ counts }: { counts: Counts }) {
  const total =
    counts.onboard + counts.alighted + counts.absent + counts.waiting + counts.missing || 1;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <span aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded bg-surface-2">
      <span className="bg-alert" style={{ width: pct(counts.missing) }} />
      <span className="bg-primary" style={{ width: pct(counts.onboard) }} />
      <span
        className="bg-status-alighted"
        style={{ width: pct(counts.alighted + counts.absent) }}
      />
    </span>
  );
}

function TripCounts({ counts }: { counts: Counts }) {
  const { t } = useTranslation();
  return (
    <>
      {counts.missing > 0 && (
        <b className="text-alert">{t('admin.missingCount', { count: counts.missing })} · </b>
      )}
      {t('admin.tripCounts', {
        onboard: counts.onboard,
        done: counts.alighted + counts.absent,
        waiting: counts.waiting,
      })}
    </>
  );
}

// ─── One trip ───────────────────────────────────────────────────────────────

export function AdminTripPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const summary = useOrgTrips().data?.find((x) => x.id === id);
  return (
    <AdminScreen
      title={summary ? tripTitle(t, summary) : t('admin.nav.live')}
      sub={summary && <span dir="ltr">{summary.vehicle.plateNumber}</span>}
      back="/admin"
    >
      <TripDetail id={id} />
    </AdminScreen>
  );
}

/** A trip's passengers and driver (its own screen on phones, the side panel on desktop). */
function TripDetail({
  id,
  compact = false,
  close,
}: {
  id: string;
  compact?: boolean;
  close?: string;
}) {
  const { t } = useTranslation();
  const call = useOrgApi();
  const trip = useQuery({
    queryKey: ['manifest', id],
    queryFn: () => call<Manifest>(`/trips/${id}/manifest`),
    refetchInterval: 10_000,
  });
  const summary = useOrgTrips().data?.find((x) => x.id === id);
  const people = useMemberMap();
  const driver = summary ? people.get(summary.driverId) : undefined;
  const signal = useSignal();
  const m = trip.data;
  if (!m)
    return trip.error ? (
      <ErrorLine>{errorMessage(trip.error)}</ErrorLine>
    ) : (
      <Spinner label={t('common.loading')} />
    );
  const sig = signal({
    status: m.status,
    endedAt: m.endedAt,
    lastHeartbeatAt: summary?.lastHeartbeatAt ?? null,
  });
  const tiles: [number, string, string][] = [
    [m.counts.onboard, t('admin.onboard'), 'text-primary'],
    [m.counts.alighted + m.counts.absent, t('admin.doneOrAbsent'), 'text-status-alighted'],
    [m.counts.waiting, t('admin.waiting'), ''],
  ];
  return (
    <>
      {compact ? (
        <div className="flex items-start gap-2.5">
          <div className="flex-1">
            <div className="text-lg font-bold">{tripTitle(t, m)}</div>
            <div className="mt-0.5 text-[13px] text-muted">
              {t('drv.bus', { plate: m.vehicle.plateNumber })} · {formatTime(m.plannedStartAt)} –{' '}
              {formatTime(m.plannedEndAt)}
            </div>
          </div>
          {close && <CloseButton to={close} />}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={TRIP_TONE[m.status]}>{t(`tripStatus.${m.status}`)}</Pill>
          <span className="text-[13px] text-muted">
            {formatTime(m.plannedStartAt)} – {formatTime(m.plannedEndAt)}
          </span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(([n, label, color]) => (
          <div key={label} className="rounded-[14px] border border-border bg-surface px-3 py-2.5">
            <div className={cn(figures, 'text-2xl', color)}>{n}</div>
            <div className="mt-1 text-xs font-semibold text-muted">{label}</div>
          </div>
        ))}
      </div>
      {m.counts.missing > 0 && (
        <Notice tone="danger">
          <b>{t('admin.missingCount', { count: m.counts.missing })}</b>
        </Notice>
      )}
      {driver && (
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-2xl px-3.5 py-3',
            compact ? 'bg-surface-2' : 'border border-border bg-surface',
          )}
        >
          <PersonBadge name={displayName(driver)} size={compact ? 36 : 42} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{displayName(driver)}</span>
            <span
              className={cn(
                'block text-[12.5px] text-muted',
                sig.stale && 'font-semibold text-warning',
              )}
            >
              {t('admin.lastSignal')} {sig.text}
            </span>
          </span>
          <a
            href={`tel:${driver.phoneE164}`}
            className={cn(
              'flex min-h-11 items-center gap-1 rounded-xl text-sm font-bold',
              compact ? 'text-primary' : 'bg-primary px-3.5 text-primary-foreground',
            )}
          >
            <Icon name="call" fill size={19} />
            {t('admin.call')}
          </a>
        </div>
      )}
      <div
        className={cn(!compact && 'overflow-hidden rounded-[18px] border border-border bg-surface')}
      >
        <ul>
          {m.students.map((s) => {
            const [icon, tone] = STUDENT_STATUS[s.status];
            return (
              <li
                key={s.studentId}
                className={cn(
                  'flex items-center gap-2.5 border-b border-border py-2.5 last:border-b-0',
                  !compact && 'px-3.5',
                )}
              >
                <Initial name={displayName(s)} size={compact ? 30 : 36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{displayName(s)}</span>
                  {s.stop && !compact && (
                    <span className="block truncate text-xs text-muted">{s.stop.name}</span>
                  )}
                </span>
                <Pill tone={tone} icon={icon}>
                  {t(`status.${s.status}`)}
                </Pill>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

// ─── Alerts (tab 2) ─────────────────────────────────────────────────────────

function useStudentNames() {
  const students = useOrgStudents();
  const map = new Map<string, string>();
  for (const s of students.data ?? []) map.set(s.id, displayName(s));
  return map;
}

export function AdminAlertsPage() {
  return <AlertsSplit />;
}

export function AdminAlertPage() {
  const { id = '' } = useParams();
  const wide = useWide();
  // Desktop keeps the list beside the alert; phones give the alert its own screen.
  return wide ? <AlertsSplit selected={id} /> : <AlertScreen id={id} />;
}

function AlertsSplit({ selected }: { selected?: string }) {
  const { t } = useTranslation();
  const wide = useWide();
  const open = useOpenAlerts();
  const closed = useClosedAlerts();
  const names = useStudentNames();
  const recent = (closed.data ?? []).slice(0, 10);
  const current = selected ?? (wide ? open.data?.[0]?.id : undefined);
  return (
    <AdminScreen
      title={t('admin.nav.alerts')}
      sub={
        <>
          <span className="lg:hidden">
            {t('admin.openCount', { count: open.data?.length ?? 0 })}
          </span>
          <span className="hidden lg:inline">{t('admin.alertsSub')}</span>
        </>
      }
      wide
    >
      <Split
        list={
          <>
            {open.isLoading && <Spinner label={t('common.loading')} />}
            {open.data?.length === 0 && <EmptyState>{t('admin.noAlerts')}</EmptyState>}
            <AlertList alerts={open.data ?? []} names={names} selected={current} />
            {recent.length > 0 && (
              <>
                <SectionTitle>{t('admin.recentlyClosed')}</SectionTitle>
                <AlertList alerts={recent} names={names} selected={current} />
              </>
            )}
          </>
        }
        detail={
          wide && current ? (
            <div className={cn(card, 'flex flex-col gap-4 p-5')}>
              <AlertDetailLoader id={current} />
            </div>
          ) : undefined
        }
      />
    </AdminScreen>
  );
}

function alertMeta(a: AlertRow, names: Map<string, string>) {
  return [
    a.studentId && names.get(a.studentId),
    a.trip.route?.name,
    a.trip.vehicle.plateNumber,
    formatTime(a.openedAt),
  ]
    .filter(Boolean)
    .join(' · ');
}

function AlertList({
  alerts,
  names,
  selected,
}: {
  alerts: AlertRow[];
  names: Map<string, string>;
  selected?: string;
}) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-2.5">
      {alerts.map((a) => (
        <li key={a.id}>
          <Link
            to={`/admin/alerts/${a.id}`}
            aria-current={selected === a.id ? 'true' : undefined}
            className={cn(
              'flex items-start gap-3 rounded-[18px] border border-border bg-surface p-3.5 active:bg-surface-2',
              selected === a.id && 'lg:border-2 lg:border-primary',
            )}
          >
            <IconTile icon={ALERT_ICON[a.type]} tone={SEVERITY_TONE[a.severity]} fill />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{t(`alertType.${a.type}`)}</span>
              <span className="mt-0.5 block text-[12.5px] leading-normal text-muted">
                {alertMeta(a, names)}
              </span>
            </span>
            <Pill tone={ALERT_STATUS_TONE[a.status]}>{t(`alertStatus.${a.status}`)}</Pill>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function useAlert(id: string) {
  const call = useOrgApi();
  return useQuery({
    queryKey: ['alert', id],
    queryFn: () => call<AlertDetail>(`/alerts/${id}`),
    refetchInterval: 15_000,
  });
}

/** Phones: the alert on its own screen with the close button pinned at the bottom. */
function AlertScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const alert = useAlert(id);
  if (!alert.data) {
    return (
      <AdminScreen title={t('admin.nav.alerts')} back="/admin/alerts" hideAlertBar>
        {alert.error ? (
          <ErrorLine>{errorMessage(alert.error)}</ErrorLine>
        ) : (
          <Spinner label={t('common.loading')} />
        )}
      </AdminScreen>
    );
  }
  return <AlertScreenBody alert={alert.data} />;
}

function AlertScreenBody({ alert: a }: { alert: AlertDetail }) {
  const { t } = useTranslation();
  const names = useStudentNames();
  const h = useAlertHandling(a, [['alert', a.id], ['org-alerts'], ['org-alerts-resolved']]);
  return (
    <AdminScreen
      title={t(`alertType.${a.type}`)}
      sub={alertMeta(a, names)}
      back="/admin/alerts"
      hideAlertBar
      footer={h.open ? <ResolveButton h={h} /> : undefined}
    >
      <AlertBody alert={a} h={h} />
    </AdminScreen>
  );
}

function AlertDetailLoader({ id }: { id: string }) {
  const { t } = useTranslation();
  const alert = useAlert(id);
  if (!alert.data)
    return alert.error ? (
      <ErrorLine>{errorMessage(alert.error)}</ErrorLine>
    ) : (
      <Spinner label={t('common.loading')} />
    );
  return <AlertPanel key={alert.data.id} alert={alert.data} />;
}

/** Desktop side panel: the same content with the close button inline. */
function AlertPanel({ alert: a }: { alert: AlertDetail }) {
  const h = useAlertHandling(a, [['alert', a.id], ['org-alerts'], ['org-alerts-resolved']]);
  return (
    <>
      <AlertBody alert={a} h={h} withTitle />
      {h.open && <ResolveButton h={h} />}
    </>
  );
}

function AlertBody({
  alert: a,
  h,
  withTitle = false,
}: {
  alert: AlertDetail;
  h: ReturnType<typeof useAlertHandling>;
  withTitle?: boolean;
}) {
  const { t } = useTranslation();
  const names = useStudentNames();
  const people = useMemberMap();
  const student = (a.studentId && names.get(a.studentId)) || t('admin.aStudent');
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={SEVERITY_TONE[a.severity]}>{t(`severity.${a.severity}`)}</Pill>
        <Pill tone={ALERT_STATUS_TONE[a.status]}>{t(`alertStatus.${a.status}`)}</Pill>
        <span className="flex-1" />
        <span className="text-[13px] text-muted">
          {t('admin.openedAt', { time: formatTime(a.openedAt) })}
        </span>
      </div>
      {withTitle && <h2 className="-mb-2 text-[21px] font-bold">{t(`alertType.${a.type}`)}</h2>}
      <p className={cn('leading-relaxed', withTitle ? 'text-[14.5px] text-muted' : 'text-base')}>
        {t(`admin.alertBody.${a.type}`, {
          student,
          vehicle: a.trip.vehicle.plateNumber,
          route: a.trip.route?.name ?? '—',
        })}
      </p>
      <AlertTimeline
        alert={a}
        nameOf={(userId) => {
          const p = people.get(userId);
          return p && displayName(p);
        }}
      />
      <ResolveForm h={h} />
    </>
  );
}

// ─── Link requests (tab 3) ──────────────────────────────────────────────────

type Decided = { request: EnrollmentRequest; status: 'approved' | 'rejected' };

export function EnrollmentsPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const toast = useToast();
  const list = usePendingEnrollments();
  // Decisions stay on screen with an undo until the admin leaves (the API allows 10 minutes).
  const [decided, setDecided] = useState<Record<string, Decided>>({});
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['enrollments'] }),
      qc.invalidateQueries({ queryKey: ['org-students'] }),
    ]);
  const decide = useMutation({
    mutationFn: ({ r, action }: { r: EnrollmentRequest; action: 'approve' | 'reject' }) =>
      call(`/org/enrollment-requests/${r.id}/${action}`, {
        method: 'POST',
        body: action === 'reject' ? {} : undefined,
      }),
    onSuccess: async (_, { r, action }) => {
      setDecided((d) => ({
        ...d,
        [r.id]: { request: r, status: action === 'approve' ? 'approved' : 'rejected' },
      }));
      await refresh();
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => call(`/org/enrollment-requests/${id}/undo`, { method: 'POST' }),
    onSuccess: async (_, id) => {
      setDecided((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)));
      await refresh();
    },
    onError: (e) => toast({ message: errorMessage(e), tone: 'error' }),
  });
  const pending = (list.data ?? []).filter((r) => !decided[r.id]);
  const rows: (EnrollmentRequest & { decision?: Decided['status'] })[] = [
    ...pending,
    ...Object.values(decided).map((d) => ({ ...d.request, decision: d.status })),
  ];
  return (
    <AdminScreen
      title={t('admin.nav.enrollments')}
      sub={t('admin.pendingCount', { count: pending.length })}
      wide
    >
      <div className="flex gap-2.5 rounded-[14px] bg-primary-soft px-3.5 py-3 text-[13.5px] leading-relaxed lg:items-center lg:px-4 lg:text-sm">
        <Icon name="lock" size={21} className="text-primary" />
        {t('admin.enrollmentPrivacy')}
      </div>
      {decide.error && <ErrorLine>{errorMessage(decide.error)}</ErrorLine>}
      {list.isLoading && <Spinner label={t('common.loading')} />}
      {rows.length === 0 && !list.isLoading && <EmptyState>{t('admin.noRequests')}</EmptyState>}
      <ul className="grid gap-3 lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {rows.map((r) => (
          <li key={r.id} className={cn(card, 'flex flex-col gap-3 p-3.5 lg:p-4')}>
            <div className="flex items-center gap-3">
              <span className="flex size-11.5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                <Icon name={r.decision === 'approved' ? 'person' : 'lock'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">{displayName(r.student)}</span>
                <span className="block text-[12.5px] text-muted">{r.student.schoolName}</span>
              </span>
            </div>
            <div className="text-[13px] leading-relaxed text-muted">
              {r.guardian &&
                `${displayName(r.guardian)} (${t(`guardian.relation.${r.guardian.relationship}`, { defaultValue: r.guardian.relationship })}) · `}
              {formatDate(r.createdAt)} {formatTime(r.createdAt)}
            </div>
            {r.decision ? (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold',
                  r.decision === 'approved' ? TONES.ok : TONES.neutral,
                )}
              >
                <Icon name={r.decision === 'approved' ? 'check_circle' : 'cancel'} fill size={20} />
                <span className="flex-1">
                  {r.decision === 'approved' ? t('admin.approvedDone') : t('enrollment.rejected')}
                </span>
                <button
                  type="button"
                  disabled={undo.isPending}
                  onClick={() => undo.mutate(r.id)}
                  className="min-h-9 text-[13px] font-semibold underline"
                >
                  {t('driver.undo')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  className="min-h-12 flex-1 rounded-xl text-[15px] font-bold lg:min-h-10.5"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ r, action: 'approve' })}
                >
                  {t('admin.approve')}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-12 flex-1 rounded-xl border-[1.5px] bg-transparent text-[15px] font-bold lg:min-h-10.5"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ r, action: 'reject' })}
                >
                  {t('admin.reject')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </AdminScreen>
  );
}

// ─── Students ───────────────────────────────────────────────────────────────

export function StudentsPage() {
  const { t } = useTranslation();
  const org = useAdminOrg();
  const students = useOrgStudents();
  const unreachable = useUnreachable();
  const [q, setQ] = useState('');
  const cutOff = new Set(unreachable.data?.flatMap((g) => g.children.map((c) => c.id)) ?? []);
  const query = q.trim().toLowerCase();
  const shown = (students.data ?? []).filter(
    (s) =>
      !query ||
      [s.fullNameAr, s.fullNameEn ?? '', s.schoolName].some((v) => v.toLowerCase().includes(query)),
  );
  const routeOf = (s: (typeof shown)[number]) =>
    s.routes.length
      ? s.routes
          .map((r) => `${r.routeName} · ${t('admin.stopN', { n: r.stopSequence })}`)
          .join('، ')
      : t('admin.noRoute');
  return (
    <AdminScreen
      title={t('admin.nav.students')}
      sub={
        <>
          <span className="lg:hidden">
            {t('admin.studentCount', { count: students.data?.length ?? 0 })}
          </span>
          <span className="hidden lg:inline">{t('admin.studentsSub', { org: orgName(org) })}</span>
        </>
      }
      back="/admin/more"
      wide
    >
      <label className="flex min-h-12 items-center gap-2 rounded-[14px] border border-border bg-surface px-3 has-focus-visible:outline-2 has-focus-visible:outline-primary lg:min-h-11 lg:max-w-105 lg:rounded-xl">
        <Icon name="search" className="text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.searchStudents')}
          aria-label={t('admin.searchStudents')}
          className="min-h-11 flex-1 bg-transparent text-[15px] text-foreground outline-0 placeholder:text-muted"
        />
      </label>
      {students.isLoading && <Spinner label={t('common.loading')} />}
      {students.data?.length === 0 && <EmptyState>{t('admin.noStudents')}</EmptyState>}
      {shown.length > 0 && (
        <Panel className="lg:overflow-x-auto">
          <div className="lg:min-w-180">
            <div className="hidden grid-cols-[2fr_2fr_2fr_1.4fr] gap-3 border-b border-border px-4.5 py-3 text-[12.5px] font-bold text-muted lg:grid">
              <span>{t('admin.col.student')}</span>
              <span>{t('admin.col.school')}</span>
              <span>{t('admin.col.route')}</span>
              <span>{t('admin.col.notifications')}</span>
            </div>
            <ul>
              {shown.map((s) => {
                const off = cutOff.has(s.id);
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0 lg:grid lg:grid-cols-[2fr_2fr_2fr_1.4fr] lg:gap-3 lg:px-4.5 lg:text-sm"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2.5 font-semibold">
                      {s.photoUrl ? (
                        <img
                          src={s.photoUrl}
                          alt=""
                          className="size-9.5 rounded-[10px] object-cover lg:size-8"
                        />
                      ) : (
                        <Initial name={displayName(s)} size={38} />
                      )}
                      <span className="min-w-0">
                        <span className="block text-[15px] lg:text-sm">{displayName(s)}</span>
                        <span className="block truncate text-[12.5px] font-normal text-muted lg:hidden">
                          {routeOf(s)} · {s.schoolName}
                        </span>
                      </span>
                    </span>
                    <span className="hidden text-muted lg:block">{s.schoolName}</span>
                    <span className="hidden lg:block">{routeOf(s)}</span>
                    <span
                      className={cn(
                        'flex items-center gap-1.25 text-[13px] font-semibold',
                        off ? 'text-warning' : 'text-status-alighted',
                      )}
                    >
                      <Icon
                        name={off ? 'notifications_off' : 'notifications_active'}
                        fill
                        size={20}
                        label={off ? t('admin.notifOff') : t('admin.notifOk')}
                      />
                      <span className="hidden lg:inline">
                        {off ? t('admin.notifOffShort') : t('admin.notifOkShort')}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Panel>
      )}
    </AdminScreen>
  );
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const DAYS = [7, 1, 2, 3, 4, 5, 6];

function useRouteLabels() {
  const vehicles = useVehicles();
  const people = useMemberMap();
  const plates = new Map((vehicles.data ?? []).map((v) => [v.id, v.plateNumber]));
  return {
    plate: (r: RouteRow) => (r.defaultVehicleId && plates.get(r.defaultVehicleId)) || '—',
    driver: (r: RouteRow) => {
      const d = r.defaultDriverId ? people.get(r.defaultDriverId) : undefined;
      return d ? displayName(d) : '—';
    },
  };
}

export function RoutesPage() {
  return <RoutesSplit />;
}

export function RouteDetailPage() {
  const { id = '' } = useParams();
  const wide = useWide();
  return wide ? <RoutesSplit selected={id} /> : <RouteScreen id={id} />;
}

function RoutesSplit({ selected }: { selected?: string }) {
  const { t } = useTranslation();
  const wide = useWide();
  const navigate = useNavigate();
  const routes = useRoutes();
  const labels = useRouteLabels();
  const [adding, setAdding] = useState(false);
  const current = selected ?? (wide ? routes.data?.[0]?.id : undefined);
  return (
    <AdminScreen
      title={t('admin.nav.routes')}
      sub={t('admin.routeCount', { count: routes.data?.length ?? 0 })}
      back="/admin/more"
      action={{ label: t('admin.addRouteAction'), onClick: () => setAdding(true) }}
      wide
    >
      <Split
        list={
          <>
            {routes.isLoading && <Spinner label={t('common.loading')} />}
            {routes.data?.length === 0 && <EmptyState>{t('admin.noRoutes')}</EmptyState>}
            <ul className="flex flex-col gap-2.5">
              {routes.data?.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/admin/routes/${r.id}`}
                    aria-current={current === r.id ? 'true' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5',
                      current === r.id && 'lg:border-2 lg:border-primary',
                    )}
                  >
                    <IconTile icon={r.direction === 'to_school' ? 'school' : 'home'} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold">
                        {r.name} · {t(`directionShort.${r.direction}`)}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-muted">
                        {labels.plate(r)} · {labels.driver(r)} · {r.plannedStart}–{r.plannedEnd} ·{' '}
                        {t('admin.stopCount', { count: r.stops.length })}
                      </span>
                    </span>
                    <Icon name="chevron_right" size={20} flip="rtl" className="text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        }
        detail={
          wide && current ? (
            <div className={cn(card, 'flex flex-col gap-3.5 p-5')}>
              <RouteDetail id={current} withTitle />
            </div>
          ) : undefined
        }
      />
      <AddRouteDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setAdding(false);
          navigate(`/admin/routes/${id}`);
        }}
      />
    </AdminScreen>
  );
}

function useRoute(id: string) {
  const call = useOrgApi();
  return useQuery({
    queryKey: ['route', id],
    queryFn: () => call<RouteDetail>(`/org/routes/${id}`),
  });
}

function RouteScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const route = useRoute(id);
  const r = route.data;
  return (
    <AdminScreen
      title={r ? `${r.name} · ${t(`directionShort.${r.direction}`)}` : t('admin.nav.routes')}
      sub={r && t('admin.stopCount', { count: r.stops.length })}
      back="/admin/routes"
    >
      <RouteDetail id={id} />
    </AdminScreen>
  );
}

function RouteDetail({ id, withTitle = false }: { id: string; withTitle?: boolean }) {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const route = useRoute(id);
  const students = useOrgStudents();
  const labels = useRouteLabels();
  const [draft, setDraft] = useState<{ id: string; map: Record<string, string> } | null>(null);
  const assigned =
    draft?.id === id
      ? draft.map
      : Object.fromEntries((route.data?.students ?? []).map((s) => [s.studentId, s.stopId]));
  const save = useMutation({
    mutationFn: () =>
      call(`/org/routes/${id}/students`, {
        method: 'PUT',
        body: {
          assignments: Object.entries(assigned)
            .filter(([, stop]) => stop)
            .map(([studentId, stopId]) => ({ studentId, stopId })),
        },
      }),
    onSuccess: async () => {
      setDraft(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['route', id] }),
        qc.invalidateQueries({ queryKey: ['org-students'] }),
      ]);
    },
  });
  const r = route.data;
  if (!r) return <Spinner label={t('common.loading')} />;
  const editing = draft?.id === id;
  const byId = new Map((students.data ?? []).map((s) => [s.id, displayName(s)]));
  const atStop = (stopId: string) =>
    r.students
      .filter((s) => s.stopId === stopId)
      .map((s) => byId.get(s.studentId))
      .filter(Boolean)
      .join('، ');
  return (
    <>
      {withTitle && (
        <h2 className="text-xl font-bold">
          {r.name} · {t(`direction.${r.direction}`)}
        </h2>
      )}
      <p className={cn('text-[13.5px] text-muted', withTitle && '-mt-2.5')}>
        {t('admin.routeMeta', {
          plate: labels.plate(r),
          driver: labels.driver(r),
          start: r.plannedStart,
          end: r.plannedEnd,
        })}
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label={t('admin.days')}>
        {DAYS.map((d) => {
          const on = r.daysOfWeek.includes(d);
          return (
            <li key={d}>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[12.5px] font-semibold',
                  TONES[on ? 'primary' : 'neutral'],
                  !on && 'line-through',
                )}
              >
                {t(`weekday.${d}`)}
              </span>
            </li>
          );
        })}
      </ul>
      <ol
        className={cn(
          !withTitle && 'rounded-[18px] border border-border bg-surface px-4 pt-4 pb-0.5',
        )}
      >
        {[...r.stops]
          .sort((a, b) => a.sequence - b.sequence)
          .map((stop, i, all) => (
            <li key={stop.id} className="flex gap-3">
              <div className="flex w-7 shrink-0 flex-col items-center">
                <span
                  className={cn(
                    figures,
                    'flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] text-primary-foreground',
                  )}
                >
                  {stop.sequence}
                </span>
                {i < all.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
              </div>
              <div className="flex-1 pt-0.5 pb-4">
                <div className="text-[15px] font-bold">{stop.name}</div>
                <div className="mt-0.5 text-[13px] text-muted">{atStop(stop.id) || '—'}</div>
              </div>
            </li>
          ))}
      </ol>
      <details
        className="group rounded-[18px] border border-border bg-surface"
        open={editing || undefined}
      >
        <summary className="flex min-h-13 cursor-pointer list-none items-center gap-2.5 px-3.5 font-bold text-primary [&::-webkit-details-marker]:hidden">
          <Icon name="groups" />
          <span className="flex-1">{t('admin.editAssignments')}</span>
          <Icon
            name="chevron_right"
            size={20}
            className="rotate-90 transition-transform group-open:-rotate-90"
          />
        </summary>
        <div className="flex flex-col gap-3 border-t border-border p-3.5">
          <p className="text-sm text-muted">{t('admin.assignIntro')}</p>
          <ul className="flex flex-col gap-2">
            {students.data?.map((s) => (
              <li key={s.id} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
                <span className="font-semibold">{displayName(s)}</span>
                <SelectField
                  label={t('admin.stop')}
                  value={assigned[s.id] ?? ''}
                  onChange={(e) => setDraft({ id, map: { ...assigned, [s.id]: e.target.value } })}
                >
                  <option value="">{t('admin.notOnRoute')}</option>
                  {r.stops.map((stop) => (
                    <option key={stop.id} value={stop.id}>
                      {stop.sequence}. {stop.name}
                    </option>
                  ))}
                </SelectField>
              </li>
            ))}
          </ul>
          {save.error && <ErrorLine>{errorMessage(save.error)}</ErrorLine>}
          <Button
            size="touch"
            className="w-full"
            disabled={!editing || save.isPending}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </div>
      </details>
    </>
  );
}

function AddRouteDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const vehicles = useVehicles();
  const members = useMembers();
  const drivers = (members.data ?? []).filter((m) => m.role === 'driver');
  const empty = {
    name: '',
    direction: 'to_school',
    defaultVehicleId: '',
    defaultDriverId: '',
    plannedStart: '06:30',
    plannedEnd: '07:15',
    stops: '',
  };
  const [form, setForm] = useState(empty);
  const [days, setDays] = useState<number[]>([7, 1, 2, 3, 4]);
  const create = useMutation({
    mutationFn: () =>
      call<{ id: string }>('/org/routes', {
        method: 'POST',
        body: {
          ...form,
          daysOfWeek: days,
          stops: form.stops
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((name) => ({ name })),
        },
      }),
    onSuccess: async (route) => {
      setForm(empty);
      await qc.invalidateQueries({ queryKey: ['routes'] });
      onCreated(route.id);
    },
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
  return (
    <Dialog open={open} onClose={onClose} title={t('admin.addRouteAction')}>
      <form
        className="grid max-h-[70dvh] gap-3 overflow-y-auto sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="sm:col-span-2">
          <TextField
            label={t('admin.routeName')}
            required
            value={form.name}
            onChange={set('name')}
            placeholder={t('admin.routeNamePh')}
          />
        </div>
        <SelectField
          label={t('admin.direction')}
          value={form.direction}
          onChange={set('direction')}
        >
          <option value="to_school">{t('direction.to_school')}</option>
          <option value="to_home">{t('direction.to_home')}</option>
        </SelectField>
        <SelectField
          label={t('admin.vehicle')}
          required
          value={form.defaultVehicleId}
          onChange={set('defaultVehicleId')}
        >
          <option value="">—</option>
          {vehicles.data
            ?.filter((v) => v.status === 'active')
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.plateNumber} · {t(`vehicleType.${v.type}`)}
              </option>
            ))}
        </SelectField>
        <div className="sm:col-span-2">
          <SelectField
            label={t('role.driver')}
            required
            value={form.defaultDriverId}
            onChange={set('defaultDriverId')}
          >
            <option value="">—</option>
            {drivers.map((d) => (
              <option key={d.user.id} value={d.user.id}>
                {displayName(d.user)}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField
          label={t('admin.start')}
          type="time"
          required
          value={form.plannedStart}
          onChange={set('plannedStart')}
        />
        <TextField
          label={t('admin.end')}
          type="time"
          required
          value={form.plannedEnd}
          onChange={set('plannedEnd')}
        />
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-semibold">{t('admin.days')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <Chip
                key={d}
                on={days.includes(d)}
                onClick={() =>
                  setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])
                }
              >
                {t(`weekday.${d}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold" htmlFor="stops">
            {t('admin.stopsOnePerLine')}
          </label>
          <textarea
            id="stops"
            required
            rows={4}
            value={form.stops}
            onChange={set('stops')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2"
          />
        </div>
        {create.error && (
          <div className="sm:col-span-2">
            <ErrorLine>{errorMessage(create.error)}</ErrorLine>
          </div>
        )}
        <Button
          type="submit"
          className="sm:col-span-2"
          disabled={create.isPending || days.length === 0}
        >
          {t('admin.addRoute')}
        </Button>
        <Button variant="ghost" className="sm:col-span-2" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </form>
    </Dialog>
  );
}

// ─── Vehicles, members, unreachable guardians, audit log ───────────────────

const smallButton =
  'min-h-10 rounded-[10px] border-[1.5px] border-border bg-transparent px-3 text-[13px] font-semibold';

const VEHICLE_ICON: Record<Vehicle['type'], IconName> = {
  bus: 'directions_bus',
  van: 'airport_shuttle',
  car: 'directions_car',
};

export function VehiclesPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const vehicles = useVehicles();
  const routes = useRoutes();
  const people = useMemberMap();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ plateNumber: '', type: 'bus', capacity: '30' });
  const create = useMutation({
    mutationFn: () =>
      call('/org/vehicles', { method: 'POST', body: { ...form, capacity: Number(form.capacity) } }),
    onSuccess: async () => {
      setForm({ plateNumber: '', type: 'bus', capacity: '30' });
      setAdding(false);
      await qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
  const toggle = useMutation({
    mutationFn: (v: Vehicle) =>
      call(`/org/vehicles/${v.id}`, {
        method: 'PATCH',
        body: { status: v.status === 'active' ? 'inactive' : 'active' },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
  // A vehicle's driver is the default driver of its routes.
  const driverOf = (v: Vehicle) => {
    const ids = [
      ...new Set(
        (routes.data ?? [])
          .filter((r) => r.defaultVehicleId === v.id && r.defaultDriverId)
          .map((r) => r.defaultDriverId!),
      ),
    ];
    const names = ids.flatMap((id) => {
      const p = people.get(id);
      return p ? [displayName(p)] : [];
    });
    return names.length ? names.join('، ') : '—';
  };
  const active = vehicles.data?.filter((v) => v.status === 'active').length ?? 0;
  return (
    <AdminScreen
      title={t('admin.nav.vehicles')}
      sub={t('admin.activeCount', { count: active })}
      back="/admin/more"
      action={{ label: t('admin.addVehicleAction'), onClick: () => setAdding(true) }}
      wide
    >
      {toggle.error && <ErrorLine>{errorMessage(toggle.error)}</ErrorLine>}
      {vehicles.data?.length === 0 && <EmptyState>{t('admin.noVehicles')}</EmptyState>}
      <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
        {vehicles.data?.map((v) => (
          <li
            key={v.id}
            className={cn(
              card,
              'flex flex-col gap-2.5 p-4',
              v.status === 'inactive' && 'opacity-55',
            )}
          >
            <div className="flex items-center gap-2.5">
              <Icon name={VEHICLE_ICON[v.type]} size={26} className="text-primary" />
              <span className="flex-1 font-figures text-xl font-bold" dir="ltr">
                {v.plateNumber}
              </span>
            </div>
            <div className="text-[13.5px] text-muted">
              {t(`vehicleType.${v.type}`)} · {t('admin.seats', { count: v.capacity })} ·{' '}
              {driverOf(v)}
            </div>
            <button
              type="button"
              className={cn(smallButton, 'min-h-9.5')}
              disabled={toggle.isPending}
              onClick={() => toggle.mutate(v)}
            >
              {v.status === 'active' ? t('admin.deactivate') : t('admin.activate')}
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={adding} onClose={() => setAdding(false)} title={t('admin.addVehicleAction')}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label={t('admin.plate')}
            required
            value={form.plateNumber}
            onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
            dir="ltr"
          />
          <SelectField
            label={t('admin.vehicleType')}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {(['bus', 'van', 'car'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`vehicleType.${v}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('admin.capacity')}
            type="number"
            min={1}
            max={100}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          {create.error && <ErrorLine>{errorMessage(create.error)}</ErrorLine>}
          <Button type="submit" disabled={create.isPending}>
            {t('common.add')}
          </Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>
            {t('common.cancel')}
          </Button>
        </form>
      </Dialog>
    </AdminScreen>
  );
}

export function MembersPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const members = useMembers();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'driver' | 'attendant' | 'org_admin'>('driver');
  const add = useMutation({
    mutationFn: () => call('/org/members', { method: 'POST', body: { email, role } }),
    onSuccess: () => {
      setEmail('');
      return qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
  const remove = useMutation({
    mutationFn: (m: Member) => call(`/org/members/${m.user.id}/${m.role}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });
  return (
    <AdminScreen
      title={t('admin.nav.members')}
      sub={
        <>
          <span className="lg:hidden">
            {t('admin.memberCount', { count: members.data?.length ?? 0 })}
          </span>
          <span className="hidden lg:inline">{t('admin.membersSub')}</span>
        </>
      }
      back="/admin/more"
      wide
    >
      <form
        className={cn(card, 'flex flex-wrap items-end gap-2.5 p-4')}
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="min-w-60 flex-[2_1_240px]">
          <TextField
            label={t('auth.email')}
            type="email"
            dir="ltr"
            required
            value={email}
            placeholder="driver@example.com"
            onChange={(e) => setEmail(e.target.value)}
            hint={t('admin.memberHint')}
          />
        </div>
        <div className="flex-[1_1_140px]">
          <SelectField
            label={t('admin.role')}
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            {(['driver', 'attendant', 'org_admin'] as const).map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <Button type="submit" className="min-h-11 px-5" disabled={add.isPending}>
          {t('common.add')}
        </Button>
        {add.error && (
          <div className="w-full">
            <ErrorLine>{errorMessage(add.error)}</ErrorLine>
          </div>
        )}
      </form>
      {remove.error && <ErrorLine>{errorMessage(remove.error)}</ErrorLine>}
      {(members.data?.length ?? 0) > 0 && (
        <Panel>
          <ul>
            {members.data?.map((m) => (
              <li
                key={`${m.user.id}-${m.role}`}
                className="flex flex-wrap items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0 lg:px-4.5"
              >
                <PersonBadge name={displayName(m.user)} size={36} />
                <span className="min-w-0 flex-[1_1_180px]">
                  <span className="block text-[15px] font-semibold">{displayName(m.user)}</span>
                  <span className="block truncate text-[12.5px] text-muted" dir="ltr">
                    {m.user.email}
                  </span>
                </span>
                <Pill tone="neutral" className="text-foreground">
                  {t(`role.${m.role}`)}
                </Pill>
                <button
                  type="button"
                  className={smallButton}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(m)}
                >
                  {t('common.remove')}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </AdminScreen>
  );
}

export function UnreachablePage() {
  const { t } = useTranslation();
  const list = useUnreachable();
  return (
    <AdminScreen
      title={t('admin.nav.unreachable')}
      sub={
        <>
          <span className="lg:hidden">
            {t('admin.unreachableCount', { count: list.data?.length ?? 0 })}
          </span>
          <span className="hidden lg:inline">{t('admin.unreachableSub')}</span>
        </>
      }
      back="/admin/more"
      wide
    >
      <div className="flex gap-2.5 rounded-[14px] bg-warning-soft px-3.5 py-3 text-[13.5px] leading-relaxed font-semibold text-warning lg:items-center lg:px-4 lg:text-sm">
        <Icon name="notifications_off" size={21} />
        {t('admin.unreachableIntro')}
      </div>
      {list.data?.length === 0 && <EmptyState>{t('admin.allReachable')}</EmptyState>}
      {(list.data?.length ?? 0) > 0 && (
        <Panel>
          <ul>
            {list.data?.map((g) => (
              <li
                key={g.userId}
                className="flex flex-wrap items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0 lg:px-4.5"
              >
                <span className="min-w-0 flex-[1_1_200px]">
                  <span className="block text-[15px] font-semibold">{displayName(g)}</span>
                  <span className="block text-[12.5px] text-muted">
                    {t('admin.guardianOf', {
                      names: g.children.map((c) => c.fullNameAr).join('، '),
                    })}
                  </span>
                </span>
                <Pill tone="warning">{t(`admin.unreachableReason.${g.reason}`)}</Pill>
                <a
                  href={`tel:${g.phone}`}
                  title={t('alert.phoneUnverified')}
                  className="flex min-h-10 items-center gap-1 text-sm font-bold text-primary"
                >
                  <Icon name="call" fill size={19} />
                  <span dir="ltr">{g.phone}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {(list.data?.length ?? 0) > 0 && (
        <p className="px-1 text-xs text-muted">{t('alert.phoneUnverified')}</p>
      )}
    </AdminScreen>
  );
}

export function AuditPage() {
  const { t } = useTranslation();
  const log = useAudit();
  const people = useMemberMap();
  const who = (id: string | null) => {
    const actor = id ? people.get(id) : undefined;
    return actor ? displayName(actor) : id ? id.slice(0, 8) : t('admin.system');
  };
  return (
    <AdminScreen
      title={t('admin.nav.audit')}
      sub={
        <>
          <span className="lg:hidden">{t('admin.auditSub')}</span>
          <span className="hidden lg:inline">{t('admin.auditIntro')}</span>
        </>
      }
      back="/admin/more"
      wide
    >
      <p className="px-1 text-[13px] text-muted lg:hidden">{t('admin.auditIntro')}</p>
      {log.data?.length === 0 && <EmptyState>{t('admin.noAudit')}</EmptyState>}
      {(log.data?.length ?? 0) > 0 && (
        <Panel className="lg:overflow-x-auto">
          <div className="lg:min-w-160">
            <div className="hidden grid-cols-[1fr_1.4fr_2.4fr] gap-3 border-b border-border px-4.5 py-3 text-[12.5px] font-bold text-muted lg:grid">
              <span>{t('admin.col.time')}</span>
              <span>{t('admin.col.user')}</span>
              <span>{t('admin.col.action')}</span>
            </div>
            <ul>
              {log.data?.map((e) => {
                const action = t(`auditAction.${e.action}`, { defaultValue: e.action });
                const when = `${formatDate(e.createdAt)} ${formatTime(e.createdAt)}`;
                return (
                  <li
                    key={e.id}
                    className="border-b border-border last:border-b-0 lg:grid lg:grid-cols-[1fr_1.4fr_2.4fr] lg:gap-3 lg:px-4.5 lg:py-2.75 lg:text-sm"
                  >
                    <div className="flex items-center gap-3 px-3.5 py-3 lg:hidden">
                      <IconTile icon="history" size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold">{action}</span>
                        <span className="mt-px block truncate text-[12.5px] text-muted">
                          {when} · {who(e.actorUserId)}
                        </span>
                      </span>
                    </div>
                    <span className="hidden text-muted lg:block">{when}</span>
                    <span className="hidden font-semibold lg:block">{who(e.actorUserId)}</span>
                    <span className="hidden lg:block">{action}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Panel>
      )}
    </AdminScreen>
  );
}
