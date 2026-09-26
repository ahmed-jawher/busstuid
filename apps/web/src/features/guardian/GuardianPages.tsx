import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { COUNTRY_DEFAULTS } from '@wusool/shared';
import { Icon, type IconName } from '@/components/Icon';
import { useToast } from '@/components/toast';
import {
  BackBar,
  bigButton,
  ChildAvatar,
  Chip,
  ErrorLine,
  FieldLabel,
  inputClass,
  Panel,
  PersonBadge,
  Pill,
  RowButton,
  RowLink,
  Screen,
  SectionTitle,
  Sheet,
  TONE_TEXT,
  TONES,
  type Tone,
} from '@/components/ui/kit';
import { EmptyState, Spinner } from '@/components/ui/layout';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { displayName, formatDate, formatTime, orgName } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Child, ChildTripRow, OrgSummary } from '@/lib/types';
import { usePushReady } from '../push/NotificationSetupPage';
import { SchoolField } from './SchoolField';
import {
  childView,
  firstName,
  greeting,
  STATE_STYLE,
  stateHeadline,
  useChildren,
  useChildToday,
  useMyAlerts,
  type ChildView,
} from './guardian-data';

// Guardian app (Claude Design "Tammeni Guardian"): four tabs — Home, Notifications, Services,
// Account. Home answers one question: where is my child now?

const EMERGENCY = COUNTRY_DEFAULTS.BH.emergencyNumber;

// ─── Shell ──────────────────────────────────────────────────────────────────

const TABS: { to: string; icon: IconName; label: string; match: string[] }[] = [
  { to: '/guardian', icon: 'home', label: 'gd.tabs.home', match: ['/guardian', '/child'] },
  { to: '/inbox', icon: 'notifications', label: 'gd.tabs.inbox', match: ['/inbox'] },
  {
    to: '/services',
    icon: 'apps',
    label: 'gd.tabs.services',
    match: ['/services', '/history', '/help', '/link'],
  },
  { to: '/account', icon: 'person', label: 'gd.tabs.account', match: ['/account'] },
];

/** Guardian screens with the bottom tab bar. Other roles reach /inbox and /account without it. */
export function GuardianShell() {
  const { me } = useSession();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      {me?.isGuardian && <TabBar />}
    </div>
  );
}

function TabBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const alerts = useMyAlerts();
  const alertOpen = (alerts.data?.asGuardian.length ?? 0) > 0;
  return (
    <nav
      data-tabbar="guardian"
      aria-label={t('nav.main')}
      className="sticky bottom-0 z-20 border-t border-border bg-surface"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-lg px-1.5 pt-1.5">
        {TABS.map((tab) => {
          const on = tab.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'relative flex min-h-13 flex-1 flex-col items-center justify-center gap-0.75',
                on ? 'text-primary' : 'text-muted',
              )}
            >
              <span
                className={cn(
                  'flex h-7.5 w-14 items-center justify-center rounded-full',
                  on && 'bg-primary-soft',
                )}
              >
                <Icon name={tab.icon} fill={on} size={24} />
              </span>
              <span className="text-[11.5px] font-semibold">{t(tab.label)}</span>
              {tab.to === '/inbox' && alertOpen && (
                <span
                  aria-label={t('guardian.openAlert')}
                  className="absolute top-1 start-[calc(50%+0.5rem)] size-2.5 rounded-full border-2 border-surface bg-alert"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Page heading of the tab roots (26px, no back arrow). */
function TabTitle({ children }: { children: ReactNode }) {
  return <h1 className="pt-10 text-[26px] font-bold">{children}</h1>;
}

// ─── Home ───────────────────────────────────────────────────────────────────

export function GuardianHomePage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const pushReady = usePushReady();
  const children = useChildren();
  const alerts = useMyAlerts();
  const open = alerts.data?.asGuardian ?? [];
  const today = new Date().toISOString();

  return (
    <Screen tabs className="gap-4">
      <div className="flex items-center gap-3 pt-10">
        {me && <PersonBadge name={me.fullNameAr} />}
        <div className="flex-1">
          <div className="text-[13px] text-muted">{greeting(t)}</div>
          <div className="text-[19px] font-bold">{me ? firstName(displayName(me)) : ''}</div>
        </div>
        <div className="text-end text-[13px] text-muted">{formatDate(today)}</div>
      </div>

      {open.map((a) => {
        const child = children.data?.find((c) => c.id === a.studentId);
        return (
          <Link
            key={a.id}
            to={`/alert/${a.id}`}
            className="flex items-center gap-3 rounded-[18px] bg-alert p-4 text-alert-foreground"
          >
            <span className="mx-1 size-3.5 shrink-0 animate-pulse-ring rounded-full bg-white" />
            <span className="flex-1">
              <span className="block text-base font-bold">
                {t('gd.alertBanner', { name: child ? firstName(displayName(child)) : '' })}
              </span>
              <span className="mt-0.5 block text-sm opacity-90">
                {t(`gd.alertLine.${a.type}`, { defaultValue: t('guardian.openAlert') })}
              </span>
            </span>
            <Icon name="chevron_right" flip="rtl" size={24} />
          </Link>
        );
      })}

      {pushReady === false && (
        <Link
          to="/notifications/setup?next=/guardian"
          className="flex items-center gap-2.5 rounded-[14px] bg-warning-soft px-3.5 py-3 text-sm font-semibold text-warning"
        >
          <Icon name="notifications_off" />
          <span className="flex-1">{t('guardian.enablePush')}</span>
          <Icon name="chevron_right" flip="rtl" size={20} />
        </Link>
      )}

      <div className="mt-1 flex items-baseline justify-between">
        <h2 className="text-[17px] font-bold">{t('guardian.myChildren')}</h2>
        <Link
          to="/children/new"
          className="flex items-center gap-1 py-1.5 text-sm font-semibold text-primary"
        >
          <Icon name="add" size={20} />
          {t('guardian.addChild')}
        </Link>
      </div>

      {children.isLoading && <Spinner label={t('common.loading')} />}
      {children.error && <ErrorLine>{errorMessage(children.error)}</ErrorLine>}
      {children.data?.length === 0 && <EmptyState>{t('guardian.noChildren')}</EmptyState>}
      <ul className="flex flex-col gap-4">
        {children.data?.map((c) => (
          <li key={c.id}>
            <ChildCard child={c} alerts={open} />
          </li>
        ))}
      </ul>
    </Screen>
  );
}

function useChildView(
  child: Child,
  alerts: {
    studentId: string | null;
    id: string;
    type: string;
    severity: string;
    status: string;
    openedAt: string;
  }[],
) {
  const today = useChildToday(child.id);
  return { view: childView(child, today.data, alerts), rows: today.data };
}

function ChildCard({
  child,
  alerts,
}: {
  child: Child;
  alerts: Parameters<typeof useChildView>[1];
}) {
  const { t } = useTranslation();
  const { view } = useChildView(child, alerts);
  const style = STATE_STYLE[view.state];
  const r = view.row;
  return (
    <Link
      to={`/child/${child.id}`}
      className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(17,24,51,.04)]"
    >
      <div className="flex items-center gap-3">
        <ChildAvatar name={displayName(child)} photoUrl={child.photoUrl} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold">{displayName(child)}</h2>
          <div className="truncate text-[13px] text-muted">{child.schoolName}</div>
        </div>
        <Pill tone={style.tone} icon={style.icon} className="text-[13px] font-semibold">
          {t(`gd.state.${view.state}`)}
        </Pill>
      </div>
      <div
        className={cn('text-[21px] leading-snug font-bold', view.state === 'alert' && 'text-alert')}
      >
        {stateHeadline(view, t)}
      </div>
      {r && view.state !== 'pending' && <JourneyRail view={view} />}
      <div className="flex items-center gap-1.5 border-t border-border pt-3 text-[13px] text-muted">
        <Icon name={view.state === 'pending' ? 'schedule' : 'directions_bus'} size={18} />
        <span className="flex-1">
          {view.state === 'pending'
            ? t('gd.trackingAfterApproval')
            : r
              ? t('gd.busLine', { plate: r.vehicle.plateNumber, org: orgName(r.organization) })
              : approvedOrgs(child)}
        </span>
        <Icon name="chevron_right" flip="rtl" size={20} />
      </div>
    </Link>
  );
}

const approvedOrgs = (c: Child) =>
  c.enrollmentRequests
    .filter((r) => r.status === 'approved')
    .map((r) => orgName(r.organization))
    .join('، ');

/** Home → bus → school (or school → bus → home on the way back). */
function JourneyRail({ view }: { view: ChildView }) {
  const { t } = useTranslation();
  const r = view.row!;
  const toSchool = r.direction === 'to_school';
  const labels = toSchool
    ? [t('gd.rail.home'), t('gd.rail.bus'), t('gd.rail.school')]
    : [t('gd.rail.school'), t('gd.rail.bus'), t('gd.rail.home')];
  const P = 'bg-primary';
  const B = 'bg-border';
  let nodes = [B, B, B];
  let rings = ['', '', ''];
  let times = [
    formatTime(r.plannedStartAt),
    '',
    t('gd.rail.expected', { time: formatTime(r.plannedEndAt) }),
  ];
  let lines = [B, B];
  switch (view.state) {
    case 'boarded':
      nodes = [P, P, B];
      rings = ['', 'ring-4 ring-primary-soft', ''];
      times = [formatTime(r.boardedAt), t('gd.rail.now'), times[2]!];
      lines = [P, B];
      break;
    case 'atSchool':
    case 'atHome':
    case 'safe':
      nodes = [P, P, 'bg-status-alighted'];
      rings = ['', '', 'ring-4 ring-ok-soft'];
      times = [formatTime(r.boardedAt), '', formatTime(r.alightedAt)];
      lines = [P, 'bg-status-alighted'];
      break;
    case 'alert':
      nodes = [P, 'bg-alert', B];
      rings = ['', 'ring-4 ring-alert-soft', ''];
      times = [formatTime(r.boardedAt), t('gd.rail.notOff'), '—'];
      lines = [P, B];
      break;
    case 'absent':
      times = ['—', '', '—'];
      break;
  }
  return (
    <div className="flex items-start" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="contents">
          <div className="flex w-15 shrink-0 flex-col items-center gap-1.5">
            <span className={cn('size-3.5 rounded-full', nodes[i], rings[i])} />
            <span className="text-xs font-semibold">{labels[i]}</span>
            <span className="text-[11.5px] text-muted">{times[i]}</span>
          </div>
          {i < 2 && <div className={cn('mt-1.5 h-0.75 flex-1 rounded-sm', lines[i])} />}
        </div>
      ))}
    </div>
  );
}

// ─── One child ──────────────────────────────────────────────────────────────

export function ChildPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const child = useQuery({ queryKey: ['child', id], queryFn: () => api<Child>(`/children/${id}`) });
  const alerts = useMyAlerts();
  const today = useChildToday(id);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  if (child.isLoading)
    return (
      <Screen tabs>
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  if (child.error || !child.data)
    return (
      <Screen tabs>
        <BackBar to="/guardian" />
        <ErrorLine>{errorMessage(child.error)}</ErrorLine>
      </Screen>
    );
  const c = child.data;
  const view = childView(c, today.data, alerts.data?.asGuardian ?? []);
  const style = STATE_STYLE[view.state];
  return (
    <Screen tabs className="gap-4">
      <BackBar
        to="/guardian"
        title={<span className="text-base font-semibold">{t('guardian.myChildren')}</span>}
      />
      <div className="flex items-center gap-3.5">
        <ChildAvatar name={displayName(c)} photoUrl={c.photoUrl} size={76} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{displayName(c)}</h1>
          <div className="mt-0.5 text-sm text-muted">{c.schoolName}</div>
          <div className="mt-0.5 text-xs text-muted">
            {t('guardian.childCode')}: <span dir="ltr">{c.publicCode}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary"
          aria-label={t('gd.edit.title')}
        >
          <Icon name="edit" size={22} />
        </button>
      </div>
      <div
        className={cn(
          'flex items-start gap-3 rounded-[20px] p-4.5',
          TONES[style.tone].split(' ')[0],
        )}
      >
        <Icon name={style.icon} fill size={28} className={TONE_TEXT[style.tone]} />
        <div className="flex-1">
          <div className={cn('text-[13px] font-semibold', TONE_TEXT[style.tone])}>
            {t(`gd.state.${view.state}`)}
          </div>
          <div className="mt-0.5 text-xl leading-snug font-bold">{stateHeadline(view, t)}</div>
          {view.row && (
            <div className="mt-1.5 text-[13px] text-muted">
              {t('gd.busLine', {
                plate: view.row.vehicle.plateNumber,
                org: orgName(view.row.organization),
              })}
            </div>
          )}
        </div>
      </div>
      {view.alertId && (
        <Link
          to={`/alert/${view.alertId}`}
          className="flex min-h-13 items-center justify-center rounded-[14px] bg-alert text-base font-bold text-alert-foreground"
        >
          {t('gd.viewAlert')}
        </Link>
      )}
      {(today.data?.length ?? 0) > 0 && <TodayTimeline rows={today.data!} school={c.schoolName} />}

      <Panel>
        {c.enrollmentRequests.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <Icon name="apartment" className="text-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{orgName(r.organization)}</div>
              <div className="text-[13px] text-muted">{t('gd.transportBody')}</div>
            </div>
            <span
              className={cn(
                'text-[13px] font-semibold',
                r.status === 'approved' && 'text-status-alighted',
                r.status === 'pending' && 'text-warning',
                (r.status === 'rejected' || r.status === 'cancelled') && 'text-muted',
              )}
            >
              {t(`enrollment.${r.status}`)}
            </span>
            {r.status === 'pending' && <WithdrawButton childId={c.id} requestId={r.id} />}
          </div>
        ))}
        {c.driverInvitations.map((d) => (
          <div key={d.id} className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <Icon name="hourglass_top" className="text-warning" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{d.driverName}</div>
              <div className="text-[13px] text-muted">
                {t('gd.invite.waiting')} · <span dir="ltr">{d.driverPhoneE164}</span>
              </div>
            </div>
            <CancelInviteButton childId={c.id} invitationId={d.id} />
          </div>
        ))}
        <RowLink to={`/link?child=${c.id}`}>
          <Icon name="link" className="text-muted" />
          <span className="flex-1 text-[15px]">{t('gd.changeTransport')}</span>
        </RowLink>
        <RowLink to={`/history?child=${c.id}`}>
          <Icon name="history" className="text-muted" />
          <span className="flex-1 text-[15px]">{t('gd.history30')}</span>
        </RowLink>
        <ExportRow childId={c.id} />
        <RowButton onClick={() => setDeleting(true)} className="text-alert">
          <Icon name="delete" />
          <span className="flex-1 text-[15px] font-semibold">{t('guardian.deleteData')}</span>
        </RowButton>
      </Panel>
      <EditChildSheet open={editing} onClose={() => setEditing(false)} child={c} />
      <DeleteChildSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        childId={c.id}
        name={firstName(displayName(c))}
      />
    </Screen>
  );
}

/**
 * Correcting what was typed: the name, and the school. Changing the school here changes the
 * child's school — asking a transport company to carry them is a separate step, so nothing is
 * sent to anybody by fixing a spelling (PLAN §5).
 */
function EditChildSheet({
  open,
  onClose,
  child,
}: {
  open: boolean;
  onClose: () => void;
  child: Child;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    fullNameAr: child.fullNameAr,
    schoolName: child.schoolName,
  });
  // Reopened after a change elsewhere: start from what is stored now.
  useEffect(() => {
    if (open) setForm({ fullNameAr: child.fullNameAr, schoolName: child.schoolName });
  }, [open, child.fullNameAr, child.schoolName]);
  const save = useMutation({
    mutationFn: () =>
      api(`/students/${child.id}`, {
        method: 'PATCH',
        body: { fullNameAr: form.fullNameAr.trim(), schoolName: form.schoolName.trim() },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['child', child.id] }),
        qc.invalidateQueries({ queryKey: ['children'] }),
      ]);
      toast({ message: t('gd.edit.saved'), tone: 'success' });
      onClose();
    },
  });
  const ready = form.fullNameAr.trim().length >= 2 && form.schoolName.trim().length >= 2;
  return (
    <Sheet open={open} onClose={onClose} title={t('gd.edit.title')}>
      <FieldLabel label={t('gd.add.nameAr')}>
        <input
          value={form.fullNameAr}
          onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })}
          className={inputClass}
        />
      </FieldLabel>
      <SchoolField
        value={form.schoolName}
        onChange={(schoolName) => setForm({ ...form, schoolName })}
      />
      {save.error && <ErrorLine>{errorMessage(save.error)}</ErrorLine>}
      <button
        type="button"
        disabled={!ready || save.isPending}
        onClick={() => save.mutate()}
        className={cn(bigButton, 'min-h-13 rounded-[14px] bg-primary text-primary-foreground')}
      >
        {t('common.save')}
      </button>
      <button type="button" onClick={onClose} className="min-h-12 text-[15px] font-semibold">
        {t('common.cancel')}
      </button>
    </Sheet>
  );
}

/** Takes a pending link request back — the family picked the wrong school. */
function WithdrawButton({ childId, requestId }: { childId: string; requestId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const withdraw = useMutation({
    mutationFn: () => api(`/students/${childId}/enrollments/${requestId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['child', childId] }),
        qc.invalidateQueries({ queryKey: ['children'] }),
      ]);
      toast({ message: t('gd.withdrawn'), tone: 'success' });
    },
    onError: (e) => toast({ message: errorMessage(e), tone: 'error' }),
  });
  return (
    <button
      type="button"
      disabled={withdraw.isPending}
      onClick={() => withdraw.mutate()}
      className="min-h-10 rounded-[10px] bg-surface-2 px-3 text-[13px] font-semibold"
    >
      {t('gd.withdraw')}
    </button>
  );
}

/** Stops following up a driver the family no longer uses. */
function CancelInviteButton({ childId, invitationId }: { childId: string; invitationId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: () =>
      api(`/students/${childId}/driver-invitations/${invitationId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['child', childId] }),
        qc.invalidateQueries({ queryKey: ['children'] }),
      ]);
      toast({ message: t('gd.invite.cancelled'), tone: 'success' });
    },
    onError: (e) => toast({ message: errorMessage(e), tone: 'error' }),
  });
  return (
    <button
      type="button"
      disabled={cancel.isPending}
      onClick={() => cancel.mutate()}
      className="min-h-10 rounded-[10px] bg-surface-2 px-3 text-[13px] font-semibold"
    >
      {t('common.cancel')}
    </button>
  );
}

function TodayTimeline({ rows, school }: { rows: ChildTripRow[]; school: string }) {
  const { t } = useTranslation();
  return (
    <Panel className="px-4 pt-1.5 pb-1">
      {rows.map((r) => {
        const events: { title: string; time: string; sub: string; dot: string }[] = [];
        const home = r.direction === 'to_home';
        if (r.studentStatus === 'absent') {
          events.push({
            title: t('gd.ev.absent'),
            time: '—',
            sub: r.stopName ?? '',
            dot: 'bg-border',
          });
        } else if (r.boardedAt) {
          events.push({
            title: t('gd.ev.boarded'),
            time: formatTime(r.boardedAt),
            sub: r.stopName ?? '',
            dot: 'bg-primary',
          });
          if (r.studentStatus === 'missing') {
            events.push({
              title: t('gd.ev.notOff'),
              time: '—',
              sub: t('gd.ev.alertRaised'),
              dot: 'bg-alert',
            });
          } else if (r.alightedAt) {
            events.push({
              title: home ? t('gd.ev.home') : t('gd.ev.school'),
              time: formatTime(r.alightedAt),
              sub: home ? (r.stopName ?? '') : school,
              dot: 'bg-status-alighted',
            });
          } else {
            events.push({
              title: home ? t('gd.ev.arriveHome') : t('gd.ev.arriveSchool'),
              time: t('gd.rail.expected', { time: formatTime(r.plannedEndAt) }),
              sub: home ? (r.stopName ?? '') : school,
              dot: 'bg-border',
            });
          }
        } else {
          events.push({
            title: t('gd.ev.waiting'),
            time: formatTime(r.plannedStartAt),
            sub: t('gd.ev.youWillKnow'),
            dot: 'bg-border',
          });
        }
        return (
          <div key={r.id}>
            <div className="flex justify-between pt-3 pb-2.5 text-[13px] font-semibold text-muted">
              <span>{t(home ? 'gd.returnTrip' : 'gd.morningTrip')}</span>
              <span>
                {formatTime(r.plannedStartAt)} – {formatTime(r.plannedEndAt)}
              </span>
            </div>
            {events.map((e, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex w-4 shrink-0 flex-col items-center pt-1.25">
                  <span className={cn('size-3 shrink-0 rounded-full', e.dot)} />
                  {i < events.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-border" />}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex justify-between gap-2">
                    <span className="text-[15px] font-semibold">{e.title}</span>
                    <span className="shrink-0 text-[13px] text-muted">{e.time}</span>
                  </div>
                  {e.sub && <div className="mt-0.5 text-[13px] text-muted">{e.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </Panel>
  );
}

/** Right of access (PLAN §14): everything stored about the child, as a JSON file. */
function ExportRow({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const exportData = useMutation({
    mutationFn: () => api<object>(`/children/${childId}/export`),
    onSuccess: (data) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `tammeni-child-${childId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast({ message: errorMessage(e), tone: 'error' }),
  });
  return (
    <RowButton onClick={() => exportData.mutate()} disabled={exportData.isPending}>
      <Icon name="download" className="text-muted" />
      <span className="flex-1 text-[15px]">{t('guardian.exportData')}</span>
    </RowButton>
  );
}

/** Right of erasure (PLAN §14), confirmed with the account password. */
function DeleteChildSheet({
  open,
  onClose,
  childId,
  name,
}: {
  open: boolean;
  onClose: () => void;
  childId: string;
  name: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const remove = useMutation({
    mutationFn: () => api(`/children/${childId}`, { method: 'DELETE', body: { password } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['children'] });
      navigate('/guardian');
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('gd.deleteTitle', { name })} tone="danger">
      <p className="text-sm leading-relaxed text-muted">{t('guardian.deleteDataWarning')}</p>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {t('gd.passwordToConfirm')}
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={cn(inputClass, 'bg-background')}
        />
      </label>
      {remove.error && <ErrorLine>{errorMessage(remove.error)}</ErrorLine>}
      <button
        type="button"
        disabled={!password || remove.isPending}
        onClick={() => remove.mutate()}
        className={cn(
          bigButton,
          'min-h-13 rounded-[14px] bg-alert text-base text-alert-foreground',
        )}
      >
        {t('guardian.deleteDataConfirm')}
      </button>
      <button type="button" onClick={onClose} className="min-h-11 text-[15px] font-semibold">
        {t('common.cancel')}
      </button>
    </Sheet>
  );
}

// ─── Services ───────────────────────────────────────────────────────────────

export function ServicesPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const tiles: { to: string; icon: IconName; title: string; desc: string }[] = [
    {
      to: '/children/new',
      icon: 'person_add',
      title: t('guardian.addChild'),
      desc: t('gd.svc.addDesc'),
    },
    { to: '/link', icon: 'link', title: t('gd.svc.link'), desc: t('gd.svc.linkDesc') },
    { to: '/history', icon: 'history', title: t('gd.svc.history'), desc: t('gd.svc.historyDesc') },
    { to: '/help', icon: 'support', title: t('gd.svc.help'), desc: t('gd.svc.helpDesc') },
  ];
  const shown = tiles.filter((x) => !q.trim() || `${x.title} ${x.desc}`.includes(q.trim()));
  return (
    <Screen tabs className="gap-4">
      <TabTitle>{t('gd.tabs.services')}</TabTitle>
      <label className="flex min-h-12 items-center gap-2 rounded-[14px] border border-border bg-surface px-3.5 has-focus-visible:outline-2 has-focus-visible:outline-primary">
        <Icon name="search" className="text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('gd.svc.search')}
          aria-label={t('gd.svc.search')}
          className="min-h-11.5 flex-1 bg-transparent text-[15px] outline-0 placeholder:text-muted"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {shown.map((x) => (
          <Link
            key={x.to}
            to={x.to}
            className="flex min-h-37.5 flex-col gap-2.5 rounded-[20px] border border-border bg-surface p-4"
          >
            <span className="flex size-11.5 items-center justify-center rounded-[14px] bg-primary-soft text-primary">
              <Icon name={x.icon} size={24} />
            </span>
            <span className="text-[15.5px] leading-snug font-bold">{x.title}</span>
            <span className="text-[12.5px] leading-normal text-muted">{x.desc}</span>
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-3.5 rounded-[20px] bg-brand-navy p-4 text-white">
        <Icon name="emergency" size={28} />
        <div className="flex-1">
          <div className="text-[13px] opacity-80">{t('gd.emergencyBh')}</div>
          <div className="font-figures text-2xl font-bold">{EMERGENCY}</div>
        </div>
        <a
          href={`tel:${EMERGENCY}`}
          className="rounded-full bg-white px-4.5 py-2.5 text-[15px] font-bold text-brand-navy"
        >
          {t('admin.call')}
        </a>
      </div>
    </Screen>
  );
}

// ─── Trip history ───────────────────────────────────────────────────────────

export function HistoryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const children = useChildren();
  const list = children.data ?? [];
  const selected = params.get('child') ?? list[0]?.id ?? '';
  const history = useQuery({
    queryKey: ['child-history', selected],
    queryFn: () => api<ChildTripRow[]>(`/children/${selected}/history?days=30`),
    enabled: !!selected,
  });
  const rows = history.data ?? [];
  const tone = (s: ChildTripRow['studentStatus']): Tone =>
    s === 'alighted' || s === 'resolved' ? 'ok' : s === 'missing' ? 'alert' : 'neutral';
  return (
    <Screen tabs className="gap-3.5">
      <BackBar title={t('gd.svc.history')} />
      <div className="flex flex-wrap gap-2">
        {list.map((c) => (
          <Chip key={c.id} on={c.id === selected} onClick={() => setParams({ child: c.id })}>
            {firstName(displayName(c))}
          </Chip>
        ))}
      </div>
      <div className="text-[13px] text-muted">{t('gd.historyCount', { count: rows.length })}</div>
      {history.isLoading && <Spinner label={t('common.loading')} />}
      {rows.length === 0 && !history.isLoading && <EmptyState>{t('guardian.noTrips')}</EmptyState>}
      {rows.length > 0 && (
        <Panel>
          <ul>
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 border-b border-border px-3.5 py-3.25 last:border-b-0"
              >
                <Icon
                  name={r.direction === 'to_school' ? 'school' : 'home'}
                  className="text-muted"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">
                    {formatDate(r.plannedStartAt)} · {t(`directionShort.${r.direction}`)}
                  </div>
                  <div className="mt-px text-[12.5px] text-muted">
                    {r.boardedAt
                      ? `${t('guardian.boardedAt')} ${formatTime(r.boardedAt)} · ${t('guardian.alightedAt')} ${formatTime(r.alightedAt)}`
                      : '—'}
                  </div>
                </div>
                <Pill tone={tone(r.studentStatus)}>
                  {r.studentStatus === 'alighted'
                    ? t('gd.completed')
                    : t(`status.${r.studentStatus}`)}
                </Pill>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </Screen>
  );
}

// ─── Help & emergency ───────────────────────────────────────────────────────

export function HelpPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(-1);
  const faqs = [1, 2, 3].map((i) => ({ q: t(`gd.faq.q${i}`), a: t(`gd.faq.a${i}`) }));
  return (
    <Screen tabs className="gap-3.5">
      <BackBar title={t('gd.svc.help')} />
      <a
        href={`tel:${EMERGENCY}`}
        className="flex items-center gap-3.5 rounded-[20px] bg-alert p-4.5 text-alert-foreground"
      >
        <Icon name="emergency" size={30} />
        <span className="flex-1">
          <span className="block text-sm opacity-90">{t('gd.emergencyServices')}</span>
          <span className="block font-figures text-[26px] font-bold">{EMERGENCY}</span>
        </span>
        <Icon name="call" fill size={26} />
      </a>
      <SectionTitle>{t('gd.faqTitle')}</SectionTitle>
      <Panel>
        {faqs.map((f, i) => (
          <div key={i} className="border-b border-border last:border-b-0">
            <button
              type="button"
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? -1 : i)}
              className="flex w-full items-center gap-2.5 px-4 py-3.75 text-start"
            >
              <span className="flex-1 text-[15px] font-semibold">{f.q}</span>
              <Icon
                name="chevron_right"
                className={cn(
                  'text-muted transition-transform',
                  open === i ? '-rotate-90' : 'rotate-90',
                )}
              />
            </button>
            {open === i && <p className="px-4 pb-4 text-sm leading-relaxed text-muted">{f.a}</p>}
          </div>
        ))}
      </Panel>
      <p className="text-center text-[13px] text-muted">
        {t('gd.support')}{' '}
        <a href="mailto:support.tammeni@gmail.com" className="text-primary" dir="ltr">
          support.tammeni@gmail.com
        </a>
      </p>
    </Screen>
  );
}

// ─── Link a child to another school, company or driver ─────────────────────

export function LinkChildPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const children = useChildren();
  const [params] = useSearchParams();
  // Opened from a child's page: that child is the one being moved.
  const [childId, setChildId] = useState(params.get('child') ?? '');
  const [orgId, setOrgId] = useState('');
  const kid = childId || children.data?.[0]?.id || '';
  const directory = useDirectory();
  const submit = useMutation({
    mutationFn: () =>
      api(`/students/${kid}/enrollments`, { method: 'POST', body: { organizationId: orgId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['children'] });
      toast({ message: t('gd.linkSent'), tone: 'success' });
      navigate('/services');
    },
  });
  return (
    <Screen tabs className="gap-3.5">
      <BackBar title={t('gd.svc.linkTitle')} />
      <div className="text-sm font-semibold">{t('gd.chooseChild')}</div>
      <div className="flex flex-wrap gap-2">
        {children.data?.map((c) => (
          <Chip key={c.id} on={c.id === kid} onClick={() => setChildId(c.id)}>
            {firstName(displayName(c))}
          </Chip>
        ))}
      </div>
      <div className="pt-1 text-sm font-semibold">{t('gd.chooseOrg')}</div>
      <OrgList orgs={directory.data ?? []} selected={orgId} onPick={setOrgId} />
      {submit.error && <ErrorLine>{errorMessage(submit.error)}</ErrorLine>}
      <button
        type="button"
        disabled={!orgId || !kid || submit.isPending}
        onClick={() => submit.mutate()}
        className={cn(
          bigButton,
          'mt-1.5 min-h-13.5 rounded-[14px] text-base',
          orgId ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted',
        )}
      >
        {t('gd.sendLink')}
      </button>
    </Screen>
  );
}

export function useDirectory() {
  return useQuery({
    queryKey: ['directory', 'BH'],
    queryFn: () => api<OrgSummary[]>('/organizations/directory?country=BH'),
  });
}

export function OrgList({
  orgs,
  selected,
  onPick,
  query = '',
}: {
  orgs: OrgSummary[];
  selected: string;
  onPick: (id: string) => void;
  query?: string;
}) {
  const { t } = useTranslation();
  const q = query.trim().toLowerCase();
  const shown = orgs.filter((o) => !q || `${o.nameAr} ${o.nameEn ?? ''}`.toLowerCase().includes(q));
  return (
    <div role="radiogroup" aria-label={t('guardian.chooseOrg')} className="flex flex-col gap-2">
      {shown.map((o) => {
        const on = o.id === selected;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.id)}
            className={cn(
              'flex min-h-15 items-center gap-3 rounded-[14px] bg-surface px-3.5 py-3 text-start',
              on ? 'border-2 border-primary' : 'border border-border',
            )}
          >
            <Icon name={o.type === 'school' ? 'school' : 'directions_bus'} className="text-muted" />
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">{orgName(o)}</span>
              <span className="block text-[12.5px] text-muted">{t(`orgType.${o.type}`)}</span>
            </span>
            {on && <Icon name="check_circle" fill size={24} className="text-primary" />}
          </button>
        );
      })}
      {shown.length === 0 && <EmptyState>{t('gd.noOrgs')}</EmptyState>}
    </div>
  );
}
