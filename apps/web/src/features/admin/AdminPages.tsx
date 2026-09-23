import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { AlertType, TripStatus, TripStudentStatus } from '@wusool/shared';
import { Icon, type IconName } from '@/components/Icon';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Checkbox, SelectField, TextField } from '@/components/ui/form';
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
  type Member,
  type OrgTrip,
  type RouteDetail,
  type Vehicle,
} from './admin-data';
import {
  AdminScreen,
  IconTile,
  Initial,
  Panel,
  Pill,
  RowLink,
  SectionTitle,
  TONES,
  type Tone,
} from './admin-org';

// Admin screens (Claude Design "Tammeni Admin Mobile"). What an admin needs first on the road —
// trips now, alerts, link requests — is one tap away in the tab bar; data and follow-up live
// under "More".

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
        text: trip.endedAt ? formatTime(trip.endedAt) : '—',
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

const figures = 'font-figures font-bold leading-none';

const KPI_ICON: Partial<Record<Tone, string>> = {
  primary: 'text-primary',
  alert: 'text-alert',
  warning: 'text-warning',
};

// ─── Live trips (tab 1) ─────────────────────────────────────────────────────

export function LiveTripsPage() {
  const { t } = useTranslation();
  const org = useAdminOrg();
  const trips = useOrgTrips();
  const alerts = useOpenAlerts();
  const unreachable = useUnreachable();
  const people = useMemberMap();
  const signal = useSignal();
  const list = trips.data ?? [];
  const openAlerts = alerts.data?.length ?? 0;
  const unreachableCount = unreachable.data?.length ?? 0;
  const kpis: { label: string; value: number; icon: IconName; tone: Tone; to?: string }[] = [
    {
      label: t('admin.kpi.running'),
      value: list.filter((x) => x.status === 'in_progress' || x.status === 'overdue').length,
      icon: 'sensors',
      tone: 'primary',
    },
    {
      label: t('admin.kpi.onboard'),
      value: list.reduce((n, x) => n + x.counts.onboard, 0),
      icon: 'directions_bus',
      tone: 'primary',
    },
    {
      label: t('admin.kpi.openAlerts'),
      value: openAlerts,
      icon: 'warning',
      tone: 'alert',
      to: '/admin/alerts',
    },
    {
      label: t('admin.kpi.unreachable'),
      value: unreachableCount,
      icon: 'notifications_off',
      tone: 'warning',
      to: '/admin/unreachable',
    },
  ];

  return (
    <AdminScreen
      title={t('admin.nav.live')}
      sub={`${orgName(org)} · ${formatDate(new Date().toISOString())}`}
    >
      {org.status === 'pending_review' && (
        <Notice tone="warning">{t('admin.pendingReview')}</Notice>
      )}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
                <Icon name={k.icon} fill size={18} className={KPI_ICON[k.tone]} />
                {k.label}
              </span>
              <span
                className={cn(
                  figures,
                  'text-[28px]',
                  k.value > 0 && k.tone === 'alert' && 'text-alert',
                  k.value > 0 && k.tone === 'warning' && 'text-warning',
                )}
              >
                {k.value}
              </span>
            </>
          );
          const box =
            'flex flex-col gap-1.5 rounded-2xl border border-border bg-surface px-3.5 py-3';
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

      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[17px] font-bold">{t('admin.todayTrips')}</h2>
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <span className="size-2 animate-blink rounded-full bg-status-alighted [animation-duration:2s]" />
          {t('admin.liveNow')}
        </span>
      </div>

      {trips.isLoading && <Spinner label={t('common.loading')} />}
      {trips.data?.length === 0 && <EmptyState>{t('admin.noTripsToday')}</EmptyState>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {list.map((trip) => {
          const sig = signal(trip);
          const driver = people.get(trip.driverId);
          return (
            <li key={trip.id}>
              <Link
                to={`/admin/trips/${trip.id}`}
                className="flex flex-col gap-2.5 rounded-[18px] border border-border bg-surface p-3.5 active:bg-surface-2"
              >
                <span className="flex items-start gap-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-bold">{tripTitle(t, trip)}</span>
                    <span className="mt-0.5 block text-[12.5px] text-muted">
                      {driver ? `${displayName(driver)} · ` : ''}
                      <span dir="ltr">{trip.vehicle.plateNumber}</span> ·{' '}
                      {formatTime(trip.plannedStartAt)} – {formatTime(trip.plannedEndAt)}
                    </span>
                  </span>
                  <Pill tone={TRIP_TONE[trip.status]}>{t(`tripStatus.${trip.status}`)}</Pill>
                </span>
                <ProgressBar counts={trip.counts} />
                <span className="flex items-center gap-2.5 text-[12.5px] text-muted">
                  <span className="flex-1">
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
              </Link>
            </li>
          );
        })}
      </ul>
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
  if (!m) {
    return (
      <AdminScreen title={t('admin.nav.live')} back="/admin">
        {trip.error ? (
          <Notice tone="danger">{errorMessage(trip.error)}</Notice>
        ) : (
          <Spinner label={t('common.loading')} />
        )}
      </AdminScreen>
    );
  }
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
    <AdminScreen
      title={tripTitle(t, m)}
      sub={
        <>
          {driver ? `${displayName(driver)} · ` : ''}
          <span dir="ltr">{m.vehicle.plateNumber}</span>
        </>
      }
      back="/admin"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={TRIP_TONE[m.status]}>{t(`tripStatus.${m.status}`)}</Pill>
        <span className="text-[13px] text-muted">
          {formatTime(m.plannedStartAt)} – {formatTime(m.plannedEndAt)}
        </span>
      </div>
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
        <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-3.5 py-3">
          <span className="flex size-10.5 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">
            {displayName(driver).trim()[0]}
          </span>
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
            className="flex min-h-11 items-center gap-1 rounded-xl bg-primary px-3.5 text-sm font-bold text-primary-foreground"
          >
            <Icon name="call" fill size={19} />
            {t('admin.call')}
          </a>
        </div>
      )}
      <Panel>
        <ul>
          {m.students.map((s) => {
            const [icon, tone] = STUDENT_STATUS[s.status];
            return (
              <li
                key={s.studentId}
                className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0"
              >
                <Initial name={displayName(s)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{displayName(s)}</span>
                  {s.stop && (
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
      </Panel>
    </AdminScreen>
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
  const { t } = useTranslation();
  const open = useOpenAlerts();
  const closed = useClosedAlerts();
  const names = useStudentNames();
  const recent = (closed.data ?? []).slice(0, 10);
  return (
    <AdminScreen
      title={t('admin.nav.alerts')}
      sub={t('admin.openCount', { count: open.data?.length ?? 0 })}
    >
      {open.isLoading && <Spinner label={t('common.loading')} />}
      {open.data?.length === 0 && <EmptyState>{t('admin.noAlerts')}</EmptyState>}
      <AlertList alerts={open.data ?? []} names={names} />
      {recent.length > 0 && (
        <>
          <SectionTitle>{t('admin.recentlyClosed')}</SectionTitle>
          <AlertList alerts={recent} names={names} />
        </>
      )}
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

function AlertList({ alerts, names }: { alerts: AlertRow[]; names: Map<string, string> }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-2.5">
      {alerts.map((a) => (
        <li key={a.id}>
          <Link
            to={`/admin/alerts/${a.id}`}
            className="flex items-start gap-3 rounded-[18px] border border-border bg-surface p-3.5 active:bg-surface-2"
          >
            <IconTile icon={ALERT_ICON[a.type]} tone={SEVERITY_TONE[a.severity]} />
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

export function AdminAlertPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const call = useOrgApi();
  const alert = useQuery({
    queryKey: ['alert', id],
    queryFn: () => call<AlertDetail>(`/alerts/${id}`),
    refetchInterval: 15_000,
  });
  if (!alert.data) {
    return (
      <AdminScreen title={t('admin.nav.alerts')} back="/admin/alerts" hideAlertBar>
        {alert.error ? (
          <Notice tone="danger">{errorMessage(alert.error)}</Notice>
        ) : (
          <Spinner label={t('common.loading')} />
        )}
      </AdminScreen>
    );
  }
  return <AdminAlert alert={alert.data} />;
}

function AdminAlert({ alert: a }: { alert: AlertDetail }) {
  const { t } = useTranslation();
  const names = useStudentNames();
  const people = useMemberMap();
  const h = useAlertHandling(a, [['alert', a.id], ['org-alerts'], ['org-alerts-resolved']]);
  const student = (a.studentId && names.get(a.studentId)) || t('admin.aStudent');
  return (
    <AdminScreen
      title={t(`alertType.${a.type}`)}
      sub={alertMeta(a, names)}
      back="/admin/alerts"
      hideAlertBar
      footer={h.open ? <ResolveButton h={h} /> : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={SEVERITY_TONE[a.severity]}>{t(`severity.${a.severity}`)}</Pill>
        <Pill tone={ALERT_STATUS_TONE[a.status]}>{t(`alertStatus.${a.status}`)}</Pill>
        <span className="text-[13px] text-muted">
          {t('admin.openedAt', { time: formatTime(a.openedAt) })}
        </span>
      </div>
      <p className="text-base leading-relaxed">
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
    </AdminScreen>
  );
}

// ─── Link requests (tab 3) ──────────────────────────────────────────────────

export function EnrollmentsPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const toast = useToast();
  const list = usePendingEnrollments();
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      call(`/org/enrollment-requests/${id}/${action}`, {
        method: 'POST',
        body: action === 'reject' ? {} : undefined,
      }),
    onSuccess: async (_, { action }) => {
      toast({
        message: t(action === 'approve' ? 'admin.approvedToast' : 'admin.rejectedToast'),
        tone: 'success',
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['enrollments'] }),
        qc.invalidateQueries({ queryKey: ['org-students'] }),
      ]);
    },
  });
  return (
    <AdminScreen
      title={t('admin.nav.enrollments')}
      sub={t('admin.pendingCount', { count: list.data?.length ?? 0 })}
    >
      <div className="flex gap-2.5 rounded-[14px] bg-primary-soft px-3.5 py-3 text-[13.5px] leading-relaxed">
        <Icon name="lock" size={21} className="text-primary" />
        {t('admin.enrollmentPrivacy')}
      </div>
      {decide.error && <Notice tone="danger">{errorMessage(decide.error)}</Notice>}
      {list.isLoading && <Spinner label={t('common.loading')} />}
      {list.data?.length === 0 && <EmptyState>{t('admin.noRequests')}</EmptyState>}
      <ul className="flex flex-col gap-3">
        {list.data?.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-3.5"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11.5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                <Icon name="lock" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">{displayName(r.student)}</span>
                <span className="block text-[12.5px] text-muted">{r.student.schoolName}</span>
                <span className="block text-[12.5px] text-muted">
                  {formatDate(r.createdAt)} · {formatTime(r.createdAt)}
                </span>
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                className="min-h-12 flex-1 rounded-xl text-[15px] font-bold"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, action: 'approve' })}
              >
                {t('admin.approve')}
              </Button>
              <Button
                variant="outline"
                className="min-h-12 flex-1 rounded-xl border-[1.5px] bg-transparent text-[15px] font-bold"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, action: 'reject' })}
              >
                {t('admin.reject')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </AdminScreen>
  );
}

// ─── Students ───────────────────────────────────────────────────────────────

export function StudentsPage() {
  const { t } = useTranslation();
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
  return (
    <AdminScreen
      title={t('admin.nav.students')}
      sub={t('admin.studentCount', { count: students.data?.length ?? 0 })}
      back="/admin/more"
    >
      <label className="flex min-h-12 items-center gap-2 rounded-[14px] border border-border bg-surface px-3 has-focus-visible:outline-2 has-focus-visible:outline-primary">
        <Icon name="search" className="text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.searchStudents')}
          aria-label={t('admin.searchStudents')}
          className="min-h-11.5 flex-1 bg-transparent text-[15px] text-foreground outline-0 placeholder:text-muted"
        />
      </label>
      {students.isLoading && <Spinner label={t('common.loading')} />}
      {students.data?.length === 0 && <EmptyState>{t('admin.noStudents')}</EmptyState>}
      {shown.length > 0 && (
        <Panel>
          <ul>
            {shown.map((s) => {
              const off = cutOff.has(s.id);
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0"
                >
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt="" className="size-9.5 rounded-[10px] object-cover" />
                  ) : (
                    <Initial name={displayName(s)} size={38} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{displayName(s)}</span>
                    <span className="block truncate text-[12.5px] text-muted">{s.schoolName}</span>
                  </span>
                  <Icon
                    name={off ? 'notifications_off' : 'notifications_active'}
                    fill
                    size={20}
                    label={off ? t('admin.notifOff') : t('admin.notifOk')}
                    className={off ? 'text-warning' : 'text-status-alighted'}
                  />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </AdminScreen>
  );
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const DAYS = [7, 1, 2, 3, 4, 5, 6];

/** Collapsed "add" form under a list, so the list stays the first thing on a phone. */
function AddPanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-[18px] border border-border bg-surface">
      <summary className="flex min-h-13 cursor-pointer list-none items-center gap-2.5 px-3.5 font-bold text-primary [&::-webkit-details-marker]:hidden">
        <Icon name="add" />
        <span className="flex-1">{label}</span>
        <Icon
          name="chevron_right"
          size={20}
          className="rotate-90 transition-transform group-open:-rotate-90"
        />
      </summary>
      <div className="border-t border-border p-3.5">{children}</div>
    </details>
  );
}

export function RoutesPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const routes = useRoutes();
  const vehicles = useVehicles();
  const members = useMembers();
  const people = useMemberMap();
  const plates = new Map((vehicles.data ?? []).map((v) => [v.id, v.plateNumber]));
  const drivers = (members.data ?? []).filter((m) => m.role === 'driver');
  const empty = {
    name: '',
    direction: 'to_school',
    defaultVehicleId: '',
    defaultDriverId: '',
    plannedStart: '06:15',
    plannedEnd: '07:15',
    stops: '',
  };
  const [form, setForm] = useState(empty);
  const [days, setDays] = useState<number[]>([7, 1, 2, 3, 4]);
  const create = useMutation({
    mutationFn: () =>
      call('/org/routes', {
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
    onSuccess: () => {
      setForm(empty);
      return qc.invalidateQueries({ queryKey: ['routes'] });
    },
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
  return (
    <AdminScreen
      title={t('admin.nav.routes')}
      sub={t('admin.routeCount', { count: routes.data?.length ?? 0 })}
      back="/admin/more"
    >
      {routes.isLoading && <Spinner label={t('common.loading')} />}
      {(routes.data?.length ?? 0) > 0 && (
        <Panel>
          {routes.data?.map((r) => {
            const driver = r.defaultDriverId ? people.get(r.defaultDriverId) : undefined;
            return (
              <RowLink key={r.id} to={`/admin/routes/${r.id}`} className="py-3">
                <IconTile icon={r.direction === 'to_school' ? 'school' : 'home'} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">
                    {r.name} · {t(`directionShort.${r.direction}`)}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">
                    {[
                      r.defaultVehicleId && plates.get(r.defaultVehicleId),
                      driver && displayName(driver),
                      `${r.plannedStart}–${r.plannedEnd}`,
                      t('admin.stopCount', { count: r.stops.length }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </RowLink>
            );
          })}
        </Panel>
      )}
      <AddPanel label={t('admin.newRoute')}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label={t('admin.routeName')}
            required
            value={form.name}
            onChange={set('name')}
          />
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
                  {v.plateNumber}
                </option>
              ))}
          </SelectField>
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
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d) => (
                <Checkbox
                  key={d}
                  label={t(`weekday.${d}`)}
                  checked={days.includes(d)}
                  onChange={(e) =>
                    setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))
                  }
                />
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
            <Notice tone="danger" className="sm:col-span-2">
              {errorMessage(create.error)}
            </Notice>
          )}
          <Button
            type="submit"
            className="sm:col-span-2"
            disabled={create.isPending || days.length === 0}
          >
            {t('admin.addRoute')}
          </Button>
        </form>
      </AddPanel>
    </AdminScreen>
  );
}

export function RouteDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const route = useQuery({
    queryKey: ['route', id],
    queryFn: () => call<RouteDetail>(`/org/routes/${id}`),
  });
  const students = useOrgStudents();
  const vehicles = useVehicles();
  const people = useMemberMap();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const assigned =
    draft ?? Object.fromEntries((route.data?.students ?? []).map((s) => [s.studentId, s.stopId]));
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
      await qc.invalidateQueries({ queryKey: ['route', id] });
    },
  });
  const r = route.data;
  if (!r) {
    return (
      <AdminScreen title={t('admin.nav.routes')} back="/admin/routes">
        <Spinner label={t('common.loading')} />
      </AdminScreen>
    );
  }
  const plate = vehicles.data?.find((v) => v.id === r.defaultVehicleId)?.plateNumber ?? '—';
  const driver = r.defaultDriverId ? people.get(r.defaultDriverId) : undefined;
  const byId = new Map((students.data ?? []).map((s) => [s.id, displayName(s)]));
  const atStop = (stopId: string) =>
    (route.data?.students ?? [])
      .filter((s) => s.stopId === stopId)
      .map((s) => byId.get(s.studentId))
      .filter(Boolean)
      .join('، ');
  return (
    <AdminScreen
      title={`${r.name} · ${t(`directionShort.${r.direction}`)}`}
      sub={t('admin.stopCount', { count: r.stops.length })}
      back="/admin/routes"
    >
      <p className="text-[13.5px] text-muted">
        {t('admin.routeMeta', {
          plate,
          driver: driver ? displayName(driver) : '—',
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
      <ol className="rounded-[18px] border border-border bg-surface px-4 pt-4 pb-0.5">
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
        open={draft !== null}
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
                  onChange={(e) => setDraft({ ...assigned, [s.id]: e.target.value })}
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
          {save.error && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
          <Button
            size="touch"
            className="w-full"
            disabled={!draft || save.isPending}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </div>
      </details>
    </AdminScreen>
  );
}

// ─── Vehicles, members, unreachable guardians, audit log ───────────────────

function ListRow({
  icon,
  title,
  sub,
  dim = false,
  children,
}: {
  icon: IconName;
  title: ReactNode;
  sub?: ReactNode;
  dim?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0">
      <span className={cn('flex min-w-0 flex-1 items-center gap-3', dim && 'opacity-55')}>
        <IconTile icon={icon} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          {sub && <span className="mt-px block truncate text-[12.5px] text-muted">{sub}</span>}
        </span>
      </span>
      {children}
    </li>
  );
}

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
  const [form, setForm] = useState({ plateNumber: '', type: 'bus', capacity: '30' });
  const create = useMutation({
    mutationFn: () =>
      call('/org/vehicles', { method: 'POST', body: { ...form, capacity: Number(form.capacity) } }),
    onSuccess: () => {
      setForm({ plateNumber: '', type: 'bus', capacity: '30' });
      return qc.invalidateQueries({ queryKey: ['vehicles'] });
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
  const active = vehicles.data?.filter((v) => v.status === 'active').length ?? 0;
  return (
    <AdminScreen
      title={t('admin.nav.vehicles')}
      sub={t('admin.activeCount', { count: active })}
      back="/admin/more"
    >
      {toggle.error && <Notice tone="danger">{errorMessage(toggle.error)}</Notice>}
      {(vehicles.data?.length ?? 0) > 0 && (
        <Panel>
          <ul>
            {vehicles.data?.map((v) => (
              <ListRow
                key={v.id}
                icon={VEHICLE_ICON[v.type]}
                title={<span dir="ltr">{v.plateNumber}</span>}
                sub={`${t(`vehicleType.${v.type}`)} · ${t('admin.seats', { count: v.capacity })}`}
                dim={v.status === 'inactive'}
              >
                <button
                  type="button"
                  className={smallButton}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(v)}
                >
                  {v.status === 'active' ? t('admin.deactivate') : t('admin.activate')}
                </button>
              </ListRow>
            ))}
          </ul>
        </Panel>
      )}
      <AddPanel label={t('admin.newVehicle')}>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_8rem_6rem_auto] sm:items-end"
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
          <Button type="submit" disabled={create.isPending}>
            {t('common.add')}
          </Button>
        </form>
        {create.error && (
          <Notice tone="danger" className="mt-3">
            {errorMessage(create.error)}
          </Notice>
        )}
      </AddPanel>
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
      sub={t('admin.memberCount', { count: members.data?.length ?? 0 })}
      back="/admin/more"
    >
      {remove.error && <Notice tone="danger">{errorMessage(remove.error)}</Notice>}
      {(members.data?.length ?? 0) > 0 && (
        <Panel>
          <ul>
            {members.data?.map((m) => (
              <ListRow
                key={`${m.user.id}-${m.role}`}
                icon="person"
                title={displayName(m.user)}
                sub={<span dir="ltr">{m.user.email}</span>}
              >
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
              </ListRow>
            ))}
          </ul>
        </Panel>
      )}
      <AddPanel label={t('admin.newMember')}>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <TextField
            label={t('auth.email')}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint={t('admin.memberHint')}
          />
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
          <Button type="submit" disabled={add.isPending}>
            {t('common.add')}
          </Button>
        </form>
        {add.error && (
          <Notice tone="danger" className="mt-3">
            {errorMessage(add.error)}
          </Notice>
        )}
      </AddPanel>
    </AdminScreen>
  );
}

export function UnreachablePage() {
  const { t } = useTranslation();
  const list = useUnreachable();
  return (
    <AdminScreen
      title={t('admin.nav.unreachable')}
      sub={t('admin.unreachableCount', { count: list.data?.length ?? 0 })}
      back="/admin/more"
    >
      <div className="flex gap-2.5 rounded-[14px] bg-warning-soft px-3.5 py-3 text-[13.5px] leading-relaxed font-semibold text-warning">
        <Icon name="info" size={21} />
        {t('admin.unreachableIntro')}
      </div>
      {list.data?.length === 0 && <EmptyState>{t('admin.allReachable')}</EmptyState>}
      {(list.data?.length ?? 0) > 0 && (
        <Panel>
          <ul>
            {list.data?.map((g) => (
              <ListRow
                key={g.userId}
                icon="notifications_off"
                title={displayName(g)}
                sub={`${t('admin.guardianOf', { names: g.children.map((c) => c.fullNameAr).join('، ') })} · ${t(`admin.unreachableReason.${g.reason}`)}`}
              >
                <a
                  href={`tel:${g.phone}`}
                  aria-label={`${t('admin.call')} ${g.phone}`}
                  title={t('alert.phoneUnverified')}
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-xl',
                    TONES.primary,
                  )}
                >
                  <Icon name="call" fill size={21} />
                </a>
              </ListRow>
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
  return (
    <AdminScreen title={t('admin.nav.audit')} sub={t('admin.auditSub')} back="/admin/more">
      <p className="px-1 text-[13px] text-muted">{t('admin.auditIntro')}</p>
      {log.data?.length === 0 && <EmptyState>{t('admin.noAudit')}</EmptyState>}
      {(log.data?.length ?? 0) > 0 && (
        <Panel>
          <ul>
            {log.data?.map((e) => {
              const actor = e.actorUserId ? people.get(e.actorUserId) : undefined;
              return (
                <ListRow
                  key={e.id}
                  icon="history"
                  title={t(`auditAction.${e.action}`, { defaultValue: e.action })}
                  sub={`${formatDate(e.createdAt)} ${formatTime(e.createdAt)} · ${
                    actor
                      ? displayName(actor)
                      : e.actorUserId
                        ? e.actorUserId.slice(0, 8)
                        : t('admin.system')
                  }`}
                />
              );
            })}
          </ul>
        </Panel>
      )}
    </AdminScreen>
  );
}
