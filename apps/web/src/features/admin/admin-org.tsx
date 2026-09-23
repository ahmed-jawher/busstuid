import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { EmptyState } from '@/components/ui/layout';
import { cn } from '@/lib/cn';
import { displayName, orgName } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { AlertRow, OrgSummary } from '@/lib/types';
import { platform } from '@/platform';
import { setAppearance, useAppearance } from '@/app/preferences';
import {
  OrgContext,
  useAdminOrg,
  useOpenAlerts,
  usePendingEnrollments,
  useUnreachable,
} from './admin-data';

// Admin app shell (Claude Design "Tammeni Admin Mobile"): navy title bar, the critical alert
// pinned under it on every screen, and four tabs at the bottom on phones. From 1024px wide the
// tabs become a grouped sidebar.

export { useAdminOrg, useOrgApi } from './admin-data';

interface Shell {
  critical: AlertRow[];
  sounding: boolean;
  toggleSound(): void;
  setHideTabs(hide: boolean): void;
  orgs: OrgSummary[];
  switchOrg(id: string): void;
}

const ShellContext = createContext<Shell | null>(null);

function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('admin screen outside AdminLayout');
  return shell;
}

export function useOrgSwitcher() {
  const { orgs, switchOrg } = useShell();
  return { orgs, switchOrg };
}

export function AdminLayout() {
  const { t } = useTranslation();
  const { orgsWith } = useSession();
  const orgs = orgsWith('org_admin');
  const [orgId, setOrgId] = useState(() => platform.preferences.get('adminOrg') ?? '');
  const org = orgs.find((o) => o.id === orgId) ?? orgs[0];

  if (!org) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <EmptyState>
          {t('admin.noOrg')}{' '}
          <Link to="/organizations/new" className="font-bold text-primary underline">
            {t('admin.createOrg')}
          </Link>
        </EmptyState>
      </div>
    );
  }
  const switchOrg = (id: string) => {
    setOrgId(id);
    platform.preferences.set('adminOrg', id);
  };
  return (
    <OrgContext.Provider value={org}>
      <ShellFrame orgs={orgs} switchOrg={switchOrg} />
    </OrgContext.Provider>
  );
}

function ShellFrame({ orgs, switchOrg }: { orgs: OrgSummary[]; switchOrg(id: string): void }) {
  const alerts = useOpenAlerts();
  const critical = (alerts.data ?? []).filter((a) => a.severity === 'critical');
  const [hideTabs, setHideTabs] = useState(false);

  // The alarm keeps sounding for critical alerts until the admin silences it, and starts again
  // when a new critical alert appears (PLAN §7 minute 5, §13).
  const [silenced, setSilenced] = useState<ReadonlySet<string>>(new Set());
  const sounding = critical.some((a) => !silenced.has(a.id));
  useEffect(() => {
    if (sounding) platform.alarm.start();
    else platform.alarm.stop();
    return () => platform.alarm.stop();
  }, [sounding]);

  const shell: Shell = {
    critical,
    sounding,
    toggleSound: () => setSilenced(sounding ? new Set(critical.map((a) => a.id)) : new Set()),
    setHideTabs,
    orgs,
    switchOrg,
  };
  return (
    <ShellContext.Provider value={shell}>
      <div className="min-h-dvh bg-background lg:flex">
        <Sidebar />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <Outlet />
          {!hideTabs && <BottomTabs />}
        </div>
      </div>
    </ShellContext.Provider>
  );
}

// ─── Navigation ─────────────────────────────────────────────────────────────

type Section = 'live' | 'alerts' | 'requests' | 'more';

function sectionOf(pathname: string): Section {
  const sub = pathname.replace(/^\/admin\/?/, '').split('/')[0];
  if (sub === '' || sub === 'trips') return 'live';
  if (sub === 'alerts') return 'alerts';
  if (sub === 'enrollments') return 'requests';
  return 'more';
}

function useBadges() {
  const alerts = useOpenAlerts();
  const requests = usePendingEnrollments();
  const unreachable = useUnreachable();
  return {
    alerts: alerts.data?.length ?? 0,
    requests: requests.data?.length ?? 0,
    unreachable: unreachable.data?.length ?? 0,
  };
}

const TABS: { id: Section; to: string; icon: IconName; label: string }[] = [
  { id: 'live', to: '/admin', icon: 'sensors', label: 'admin.tabs.live' },
  { id: 'alerts', to: '/admin/alerts', icon: 'notification_important', label: 'admin.tabs.alerts' },
  { id: 'requests', to: '/admin/enrollments', icon: 'how_to_reg', label: 'admin.tabs.requests' },
  { id: 'more', to: '/admin/more', icon: 'menu', label: 'admin.tabs.more' },
];

function BottomTabs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current = sectionOf(pathname);
  const badges = useBadges();
  const badge: Partial<Record<Section, { n: number; className: string }>> = {
    alerts: { n: badges.alerts, className: 'bg-alert' },
    requests: { n: badges.requests, className: 'bg-primary' },
  };
  return (
    <nav
      data-tabbar="admin"
      aria-label={t('admin.menu')}
      className="sticky bottom-0 z-20 flex border-t border-border bg-surface px-1.5 pt-1.5 lg:hidden"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
    >
      {TABS.map((tab) => {
        const on = tab.id === current;
        const b = badge[tab.id];
        return (
          <Link
            key={tab.id}
            to={tab.to}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'relative flex min-h-13 flex-1 flex-col items-center justify-center gap-0.5',
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
            <span className="text-xs font-semibold">{t(tab.label)}</span>
            {b && b.n > 0 && (
              <span
                className={cn(
                  'absolute top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border-2 border-surface px-1 text-[11px] font-bold text-white',
                  'start-[calc(50%+0.5rem)]',
                  b.className,
                )}
              >
                {b.n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

const SIDEBAR: {
  title?: string;
  items: [string, IconName, string, 'alerts' | 'requests' | 'unreachable' | null][];
}[] = [
  {
    items: [
      ['/admin', 'sensors', 'admin.nav.live', null],
      ['/admin/alerts', 'notification_important', 'admin.nav.alerts', 'alerts'],
      ['/admin/enrollments', 'how_to_reg', 'admin.nav.enrollments', 'requests'],
    ],
  },
  {
    title: 'admin.more.data',
    items: [
      ['/admin/students', 'groups', 'admin.nav.students', null],
      ['/admin/routes', 'route', 'admin.nav.routes', null],
      ['/admin/vehicles', 'directions_bus', 'admin.nav.vehicles', null],
      ['/admin/members', 'badge', 'admin.nav.members', null],
    ],
  },
  {
    title: 'admin.more.followUp',
    items: [
      ['/admin/unreachable', 'notifications_off', 'admin.nav.unreachable', 'unreachable'],
      ['/admin/audit', 'fact_check', 'admin.nav.audit', null],
    ],
  },
];

function Sidebar() {
  const { t } = useTranslation();
  const org = useAdminOrg();
  const { me } = useSession();
  const { orgs, switchOrg } = useShell();
  const { theme, scheme } = useAppearance();
  const badges = useBadges();
  return (
    <aside
      className="sticky top-0 hidden h-dvh w-66 shrink-0 flex-col gap-4.5 overflow-y-auto bg-navy px-3.5 pb-5 text-white lg:flex"
      style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
    >
      <Link to="/admin" className="flex items-center gap-2.5 px-1.5">
        <Logo size={36} />
        <span>
          <span className="block font-figures text-xl leading-none font-bold">{t('app.name')}</span>
          <span className="mt-0.75 block text-xs opacity-70">{t('admin.panel')}</span>
        </span>
      </Link>
      <label className="relative flex items-center gap-2.5 rounded-xl border border-white/14 bg-white/6 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-brand-yellow font-bold text-[#111833]">
          {orgName(org).trim()[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{orgName(org)}</span>
          <span className="block text-xs opacity-70">{t(`orgType.${org.type}`)}</span>
        </span>
        {orgs.length > 1 && (
          <>
            <Icon name="unfold_more" size={20} className="opacity-70" />
            <select
              aria-label={t('admin.organization')}
              value={org.id}
              onChange={(e) => switchOrg(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {orgName(o)}
                </option>
              ))}
            </select>
          </>
        )}
      </label>
      <nav aria-label={t('admin.menu')} className="flex flex-col gap-4">
        {SIDEBAR.map((group, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1.5 text-[11.5px] font-semibold opacity-55">
              {t(group.title ?? 'admin.more.operations')}
            </div>
            {group.items.map(([to, icon, label, badge]) => {
              const n = badge ? badges[badge] : 0;
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/admin'}
                  className={({ isActive }) =>
                    cn(
                      'group flex min-h-10.5 items-center gap-2.5 rounded-[10px] px-2.5 text-[14.5px]',
                      isActive
                        ? 'bg-white/12 font-bold text-white'
                        : 'font-medium text-white/78 hover:bg-white/6',
                    )
                  }
                >
                  <Icon name={icon} size={21} />
                  <span className="flex-1">{t(label)}</span>
                  {n > 0 && (
                    <span
                      className={cn(
                        'flex h-5.5 min-w-5.5 items-center justify-center rounded-full px-1.5 text-xs font-bold',
                        badge === 'alerts' && 'bg-[#E5484D] text-white',
                        badge === 'requests' && 'bg-brand-yellow text-[#111833]',
                        badge === 'unreachable' && 'bg-[#F59E0B] text-[#111833]',
                      )}
                    >
                      {n}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 border-t border-white/10 px-1.5 pt-2.5">
        <Link
          to="/account"
          className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-white/14 font-bold"
          aria-label={t('gd.tabs.account')}
        >
          {me ? displayName(me).trim()[0] : ''}
        </Link>
        <Link to="/account" className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{me ? displayName(me) : ''}</span>
          <span className="block text-xs opacity-70">{t('role.org_admin')}</span>
        </Link>
        <button
          type="button"
          aria-label={t('admin.darkMode')}
          aria-pressed={scheme === 'dark'}
          onClick={() => setAppearance(theme, scheme === 'dark' ? 'light' : 'dark')}
          className="flex size-9 items-center justify-center rounded-[10px] bg-white/10"
        >
          <Icon name={scheme === 'dark' ? 'light_mode' : 'dark_mode'} size={20} />
        </button>
      </div>
    </aside>
  );
}

// ─── Screen frame ───────────────────────────────────────────────────────────

/**
 * One admin screen: title bar (back arrow on inner screens, logo on the tab roots), the pinned
 * critical alert, the content, and an optional footer that takes the tab bar's place.
 */
export function AdminScreen({
  title,
  sub,
  back,
  footer,
  action,
  wide = false,
  hideAlertBar = false,
  children,
}: {
  title: string;
  sub?: ReactNode;
  /** Parent screen; inner screens show a back arrow to it. */
  back?: string;
  footer?: ReactNode;
  /** Main action of the page ("add route"), in the page header. */
  action?: { label: string; onClick: () => void };
  /** Uses the full width on desktop (lists with a side panel, tables). */
  wide?: boolean;
  hideAlertBar?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { setHideTabs } = useShell();
  const hasFooter = footer != null;
  useEffect(() => {
    setHideTabs(hasFooter);
    return () => setHideTabs(false);
  }, [hasFooter, setHideTabs]);

  return (
    <>
      <div className="sticky top-0 z-20">
        <header
          className="flex items-center gap-2 bg-navy px-3 pb-3 text-white lg:hidden"
          style={{ paddingTop: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
        >
          {back ? (
            <Link
              to={back}
              aria-label={t('common.back')}
              className="flex size-11 items-center justify-center rounded-full active:bg-white/10"
            >
              <Icon name="chevron_right" size={26} flip="ltr" />
            </Link>
          ) : (
            <Logo size={34} className="mx-1.5 lg:hidden" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{title}</h1>
            {sub && <div className="truncate text-[12.5px] opacity-75">{sub}</div>}
          </div>
        </header>
        {!hideAlertBar && <CriticalBar />}
      </div>
      <main
        className={cn(
          'flex w-full flex-1 flex-col gap-3.5 p-4 lg:gap-5 lg:p-7',
          wide ? 'lg:max-w-[1280px]' : 'mx-auto max-w-3xl lg:mx-0 lg:max-w-[1280px]',
        )}
      >
        {/* Desktop page header (Claude Design "Tammeni Admin"); phones use the navy bar. */}
        <div className="hidden flex-wrap items-end gap-4 lg:flex">
          <div className="min-w-55 flex-1">
            <h1 className="text-[26px] font-bold">{title}</h1>
            {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
          </div>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="flex min-h-10.5 items-center gap-1.5 rounded-xl bg-primary px-4.5 text-[14.5px] font-bold text-primary-foreground"
            >
              <Icon name="add" size={20} />
              {action.label}
            </button>
          )}
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-primary text-[15px] font-bold text-primary lg:hidden"
          >
            <Icon name="add" size={20} />
            {action.label}
          </button>
        )}
        {children}
      </main>
      {footer && (
        <div
          data-tabbar="footer"
          className="sticky bottom-0 z-20 border-t border-border bg-background px-4 pt-3 lg:static lg:border-0 lg:bg-transparent lg:px-7"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-3xl lg:mx-0">{footer}</div>
        </div>
      )}
    </>
  );
}

function CriticalBar() {
  const { t } = useTranslation();
  const { critical, sounding, toggleSound } = useShell();
  const now = useMinute();
  const first = critical[0];
  if (!first) return null;
  const minutes = Math.max(0, Math.round((now - new Date(first.openedAt).getTime()) / 60_000));
  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 bg-alert px-3.5 py-2.5 text-alert-foreground lg:flex-wrap lg:gap-3.5 lg:px-7 lg:py-3"
    >
      <Icon name="warning" fill size={24} className={sounding ? 'animate-blink' : undefined} />
      <Link
        to={`/admin/alerts/${first.id}`}
        className="min-w-0 flex-1 text-sm leading-snug lg:min-w-55 lg:text-[15px]"
      >
        <b>{t('admin.criticalBar')}</b> {t(`alertType.${first.type}`)} ·{' '}
        <span dir="ltr">{first.trip.vehicle.plateNumber}</span>
        <span className="hidden lg:inline"> · {t('admin.minutesSince', { count: minutes })}</span>
        {critical.length > 1 && ` (+${critical.length - 1})`}
      </Link>
      <Link
        to={`/admin/alerts/${first.id}`}
        className="hidden min-h-9.5 items-center rounded-[10px] bg-white px-4 text-sm font-bold text-alert lg:flex"
      >
        {t('admin.handleAlert')}
      </Link>
      <button
        type="button"
        onClick={toggleSound}
        aria-label={sounding ? t('admin.silence') : t('admin.silenced')}
        aria-pressed={!sounding}
        className="flex size-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-white/60 lg:h-9.5 lg:w-auto lg:px-3.5"
      >
        <Icon name={sounding ? 'volume_up' : 'volume_off'} size={20} />
        <span className="hidden text-sm font-semibold lg:inline">
          {sounding ? t('admin.silence') : t('admin.silencedShort')}
        </span>
      </button>
    </div>
  );
}

function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** True from 1024px: side panels instead of separate screens (Claude Design "Tammeni Admin"). */
export function useWide() {
  const query = '(min-width: 64rem)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

// Building blocks now live in the shared kit.
export {
  IconTile,
  Initial,
  Panel,
  Pill,
  RowLink,
  SectionTitle,
  TONES,
  type Tone,
} from '@/components/ui/kit';
