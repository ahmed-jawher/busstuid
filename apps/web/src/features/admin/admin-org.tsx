import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form';
import { EmptyState, Notice } from '@/components/ui/layout';
import { api, type RequestOptions } from '@/lib/api';
import { orgName } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { AlertRow, OrgSummary } from '@/lib/types';
import { platform } from '@/platform';

const OrgContext = createContext<OrgSummary | null>(null);

export function useAdminOrg(): OrgSummary {
  const org = useContext(OrgContext);
  if (!org) throw new Error('useAdminOrg outside AdminLayout');
  return org;
}

/** API call in the current organisation (sends X-Organization-Id). */
export function useOrgApi() {
  const org = useAdminOrg();
  return useMemo(
    () =>
      <T,>(path: string, opts: Omit<RequestOptions, 'orgId'> = {}) =>
        api<T>(path, { ...opts, orgId: org.id }),
    [org.id],
  );
}

const NAV = [
  ['', 'admin.nav.live'],
  ['alerts', 'admin.nav.alerts'],
  ['enrollments', 'admin.nav.enrollments'],
  ['students', 'admin.nav.students'],
  ['routes', 'admin.nav.routes'],
  ['vehicles', 'admin.nav.vehicles'],
  ['members', 'admin.nav.members'],
  ['unreachable', 'admin.nav.unreachable'],
  ['audit', 'admin.nav.audit'],
] as const;

export function AdminLayout() {
  const { t } = useTranslation();
  const { orgsWith } = useSession();
  const orgs = orgsWith('org_admin');
  const [orgId, setOrgId] = useState(() => platform.preferences.get('adminOrg') ?? '');
  const org = orgs.find((o) => o.id === orgId) ?? orgs[0];

  if (!org) {
    return (
      <EmptyState>
        {t('admin.noOrg')}{' '}
        <Link to="/organizations/new" className="font-bold text-primary underline">
          {t('admin.createOrg')}
        </Link>
      </EmptyState>
    );
  }
  return (
    <OrgContext.Provider value={org}>
      <div className="space-y-4">
        {orgs.length > 1 && (
          <SelectField
            label={t('admin.organization')}
            value={org.id}
            onChange={(e) => {
              setOrgId(e.target.value);
              platform.preferences.set('adminOrg', e.target.value);
            }}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {orgName(o)}
              </option>
            ))}
          </SelectField>
        )}
        {org.status === 'pending_review' && (
          <Notice tone="warning">{t('admin.pendingReview')}</Notice>
        )}
        <AlertsBar />
        <nav aria-label={t('admin.menu')} className="-mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2 whitespace-nowrap">
            {NAV.map(([to, key]) => (
              <li key={to}>
                <NavLink
                  end
                  to={`/admin/${to}`}
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border'
                    }`
                  }
                >
                  {t(key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <Outlet />
      </div>
    </OrgContext.Provider>
  );
}

/**
 * Pinned alert bar with a sound for critical alerts (PLAN §7 minute 5, §13). The sound stops
 * when the admin silences it; it starts again if a new critical alert appears.
 */
function AlertsBar() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const alerts = useQuery({
    queryKey: ['org-alerts', 'open'],
    queryFn: () => call<AlertRow[]>('/alerts'),
    refetchInterval: 10_000,
  });
  const critical = (alerts.data ?? []).filter((a) => a.severity === 'critical');
  const silenced = useRef(new Set<string>());
  const [, rerender] = useState(0);
  const sounding = critical.some((a) => !silenced.current.has(a.id));

  useEffect(() => {
    if (sounding) platform.alarm.start();
    else platform.alarm.stop();
    return () => platform.alarm.stop();
  }, [sounding]);

  if (!alerts.data?.length) return null;
  return (
    <Notice
      tone={critical.length ? 'danger' : 'warning'}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <Link to="/admin/alerts" className="font-bold underline">
        🚨 {t('admin.openAlerts', { count: alerts.data.length })}
      </Link>
      {sounding && (
        <Button
          variant="outline"
          onClick={() => {
            critical.forEach((a) => silenced.current.add(a.id));
            rerender((n) => n + 1);
          }}
        >
          🔇 {t('admin.silence')}
        </Button>
      )}
    </Notice>
  );
}

export function AdminSection({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        {actions}
      </div>
      {children}
    </section>
  );
}
