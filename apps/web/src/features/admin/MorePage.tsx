import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { setAppearance, useAppearance } from '@/app/preferences';
import { Icon, type IconName } from '@/components/Icon';
import { Notice } from '@/components/ui/layout';
import { cn } from '@/lib/cn';
import { displayName, orgName } from '@/lib/format';
import { useSession } from '@/lib/session';
import { platform } from '@/platform';
import {
  useAdminOrg,
  useMembers,
  useOrgStudents,
  useRoutes,
  useUnreachable,
  useVehicles,
} from './admin-data';
import { AdminScreen, Panel, RowLink, SectionTitle, useOrgSwitcher } from './admin-org';

/** Tab 4: the organisation, its data, follow-up lists and the admin's own preferences. */
export function MorePage() {
  const { t, i18n } = useTranslation();
  const org = useAdminOrg();
  const { me, orgsWith } = useSession();
  const { orgs, switchOrg } = useOrgSwitcher();
  const { theme, scheme } = useAppearance();
  const counts = {
    students: useOrgStudents().data?.length,
    routes: useRoutes().data?.length,
    vehicles: useVehicles().data?.length,
    members: useMembers().data?.length,
  };
  const unreachable = useUnreachable().data?.length ?? 0;
  const otherRoles =
    orgsWith('driver', 'attendant').length > 0 || me?.isGuardian || me?.isPlatformAdmin;

  const groups: {
    title: string;
    items: { to: string; icon: IconName; label: string; meta?: number; badge?: number }[];
  }[] = [
    {
      title: t('admin.more.data'),
      items: [
        {
          to: '/admin/students',
          icon: 'groups',
          label: t('admin.nav.students'),
          meta: counts.students,
        },
        { to: '/admin/routes', icon: 'route', label: t('admin.nav.routes'), meta: counts.routes },
        {
          to: '/admin/vehicles',
          icon: 'directions_bus',
          label: t('admin.nav.vehicles'),
          meta: counts.vehicles,
        },
        {
          to: '/admin/members',
          icon: 'badge',
          label: t('admin.nav.members'),
          meta: counts.members,
        },
      ],
    },
    {
      title: t('admin.more.followUp'),
      items: [
        {
          to: '/admin/unreachable',
          icon: 'notifications_off',
          label: t('admin.nav.unreachable'),
          badge: unreachable,
        },
        { to: '/admin/audit', icon: 'fact_check', label: t('admin.nav.audit') },
      ],
    },
  ];

  const toggleLanguage = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    platform.preferences.set('locale', next);
    void i18n.changeLanguage(next);
  };
  const dark = scheme === 'dark';
  const row =
    'flex min-h-13.5 w-full items-center gap-3 border-b border-border px-3.5 text-start last:border-b-0 active:bg-surface-2';

  return (
    <AdminScreen title={t('admin.more.title')} sub={t('admin.more.sub')}>
      <div className="flex items-center gap-3 rounded-[18px] border border-border bg-surface p-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#F5B82E] text-lg font-bold text-[#111833]">
          {orgName(org).trim()[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">{orgName(org)}</span>
          {me && (
            <span className="block text-[12.5px] text-muted">
              {displayName(me)} · {t('role.org_admin')}
            </span>
          )}
        </span>
      </div>
      {orgs.length > 1 && (
        <label className="flex min-h-12 items-center gap-2 rounded-[14px] border border-border bg-surface px-3.5 text-sm font-semibold">
          <span className="flex-1">{t('admin.organization')}</span>
          <select
            value={org.id}
            onChange={(e) => switchOrg(e.target.value)}
            className="max-w-[60%] bg-transparent text-end text-foreground"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {orgName(o)}
              </option>
            ))}
          </select>
        </label>
      )}
      {org.status === 'pending_review' && (
        <Notice tone="warning">{t('admin.pendingReview')}</Notice>
      )}

      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-1.5">
          <SectionTitle>{g.title}</SectionTitle>
          <Panel>
            {g.items.map((n) => (
              <RowLink key={n.to} to={n.to}>
                <Icon name={n.icon} className="text-primary" />
                <span className="flex-1 text-[15px]">{n.label}</span>
                {!!n.badge && (
                  <span className="flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-warning-soft px-1.5 text-xs font-bold text-warning">
                    {n.badge}
                  </span>
                )}
                {n.meta !== undefined && <span className="text-[13px] text-muted">{n.meta}</span>}
              </RowLink>
            ))}
          </Panel>
        </section>
      ))}

      <section className="flex flex-col gap-1.5">
        <SectionTitle>{t('admin.more.preferences')}</SectionTitle>
        <Panel>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            onClick={() => setAppearance(theme, dark ? 'light' : 'dark')}
            className={row}
          >
            <Icon name="dark_mode" className="text-muted" />
            <span className="flex-1 text-[15px]">{t('admin.darkMode')}</span>
            <span
              className={cn(
                'flex h-7.5 w-12.5 shrink-0 rounded-full p-0.75',
                dark ? 'justify-end bg-primary' : 'justify-start bg-border',
              )}
            >
              <span className="size-6 rounded-full bg-white shadow" />
            </span>
          </button>
          <button
            type="button"
            onClick={toggleLanguage}
            lang={i18n.language === 'ar' ? 'en' : 'ar'}
            className={row}
          >
            <Icon name="language" className="text-muted" />
            <span className="flex-1 text-[15px]">{t('settings.language')}</span>
          </button>
          <RowLink to="/inbox">
            <Icon name="notifications" className="text-muted" />
            <span className="flex-1 text-[15px]">{t('nav.inbox')}</span>
          </RowLink>
          <RowLink to="/settings">
            <Icon name="settings" className="text-muted" />
            <span className="flex-1 text-[15px]">{t('admin.accountSettings')}</span>
          </RowLink>
          {otherRoles && (
            <RowLink to="/">
              <Icon name="home" className="text-muted" />
              <span className="flex-1 text-[15px]">{t('home.chooseRole')}</span>
            </RowLink>
          )}
        </Panel>
      </section>
      <Link to="/organizations/new" className="px-1 text-sm font-semibold text-primary underline">
        {t('admin.createOrg')}
      </Link>
    </AdminScreen>
  );
}
