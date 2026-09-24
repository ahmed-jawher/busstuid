import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ENROLLABLE_ORG_TYPES, type EnrollableOrgType } from '@wusool/shared';
import { setAppearance, useAppearance } from '@/app/preferences';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { useToast } from '@/components/toast';
import {
  BackBar,
  bigButton,
  ErrorLine,
  FieldLabel,
  IconTile,
  inputClass,
  Panel,
  PersonBadge,
  RowButton,
  RowLink,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  Switch,
  type Tone,
} from '@/components/ui/kit';
import { EmptyState, Spinner } from '@/components/ui/layout';
import { api, session, type Tokens } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatTime, displayName, orgName } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { InboxItem, OrgSummary } from '@/lib/types';
import { platform } from '@/platform';
import { usePushReady, usePushSubscriptions } from '../push/NotificationSetupPage';

/** Chooses the interface by role; with a single role it goes straight there. */
export function HomePage() {
  const { t } = useTranslation();
  const { me, orgsWith } = useSession();
  const tiles = [
    orgsWith('driver', 'attendant').length > 0 && {
      to: '/driver',
      key: 'home.driver',
      icon: 'directions_bus',
    },
    orgsWith('org_admin').length > 0 && { to: '/admin', key: 'home.admin', icon: 'dashboard' },
    me?.isGuardian && { to: '/guardian', key: 'home.guardian', icon: 'family_restroom' },
    me?.isPlatformAdmin && { to: '/platform', key: 'home.platform', icon: 'shield' },
  ].filter(Boolean) as { to: string; key: string; icon: IconName }[];
  if (tiles.length === 1) return <Navigate to={tiles[0]!.to} replace />;
  if (tiles.length === 0) {
    // Signed up as an organisation whose creation did not happen (e.g. phone clash): finish it.
    if (me?.signupRole === 'independent_driver' || me?.signupRole === 'organization') {
      const type = me.signupRole === 'organization' ? 'school' : 'independent_driver';
      return <Navigate to={`/organizations/new?type=${type}`} replace />;
    }
    return <StaffDriverWaiting />;
  }
  return (
    <Screen className="gap-4">
      <div className="flex items-center gap-2.5 pt-10">
        <Logo size={40} />
        <h1 className="text-[26px] font-bold">{t('home.chooseRole')}</h1>
      </div>
      <ul className="flex flex-col gap-3">
        {tiles.map((r) => (
          <li key={r.to}>
            <Link
              to={r.to}
              className="flex min-h-18 items-center gap-3.5 rounded-[18px] border border-border bg-surface p-4 text-[17px] font-bold"
            >
              <IconTile icon={r.icon} size={48} />
              <span className="flex-1">{t(r.key)}</span>
              <Icon name="chevron_right" flip="rtl" className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/account" className="px-1 text-sm font-semibold text-primary">
        {t('gd.tabs.account')}
      </Link>
    </Screen>
  );
}

/** A driver employed by a school or company, before their organisation has added them. */
function StaffDriverWaiting() {
  const { t } = useTranslation();
  const { me, refresh } = useSession();
  const [copied, setCopied] = useState(false);
  useQuery({ queryKey: ['staff-driver-wait'], queryFn: refresh, refetchInterval: 30_000 });
  return (
    <Screen className="gap-4 pt-20">
      <div className="flex size-21 items-center justify-center rounded-full bg-ok-soft text-status-alighted">
        <Icon name="check_circle" fill size={46} />
      </div>
      <h1 className="text-[28px] font-bold">{t('signup.waitingTitle')}</h1>
      <p className="text-[16.5px] leading-relaxed text-muted">{t('signup.waitingBody')}</p>
      <div className="flex items-center gap-2.5 rounded-[14px] border border-dashed border-primary bg-surface p-3.5">
        <span dir="ltr" className="flex-1 truncate text-base font-semibold">
          {me?.email}
        </span>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard?.writeText(me?.email ?? '').then(() => setCopied(true))
          }
          className="min-h-10 rounded-[10px] bg-primary-soft px-3.5 text-sm font-semibold text-primary"
        >
          {copied ? t('onb.ready.copied') : t('onb.ready.copy')}
        </button>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => void refresh()}
        className={cn(bigButton, 'bg-primary text-primary-foreground')}
      >
        {t('signup.checkAgain')}
      </button>
      <p className="text-center text-sm text-muted">
        {t('signup.alsoParent')}{' '}
        <Link to="/children/new" className="font-semibold text-primary">
          {t('guardian.addChild')}
        </Link>
        {' · '}
        <Link to="/account" className="font-semibold text-primary">
          {t('gd.tabs.account')}
        </Link>
      </p>
    </Screen>
  );
}

// ─── Notifications inbox ────────────────────────────────────────────────────

const TEMPLATE_LOOK: Record<string, [IconName, Tone]> = {
  boarded: ['directions_bus', 'primary'],
  alighted: ['check_circle', 'ok'],
  absent: ['do_not_disturb_on', 'neutral'],
  student_left_onboard: ['warning', 'alert'],
  trip_overdue: ['schedule', 'warning'],
  driver_device_silent: ['signal_disconnected', 'warning'],
  unexpected_student: ['person_alert', 'neutral'],
  resolved: ['verified', 'ok'],
  enrollment_approved: ['link', 'primary'],
  enrollment_rejected: ['cancel', 'neutral'],
  enrollment_reopened: ['hourglass_top', 'warning'],
};

const dayKey = (iso: string) => new Date(iso).toDateString();

export function InboxPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { me } = useSession();
  const [filter, setFilter] = useState<'all' | 'alerts'>('all');
  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api<InboxItem[]>('/me/notifications'),
    refetchInterval: 30_000,
  });
  const read = useMutation({
    mutationFn: (id: string) => api(`/me/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const items = (inbox.data ?? []).filter(
    (n) => filter === 'all' || n.alertId !== null || n.priority !== 'normal',
  );
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const groups = [
    { title: t('gd.today'), items: items.filter((n) => dayKey(n.createdAt) === today) },
    { title: t('gd.yesterday'), items: items.filter((n) => dayKey(n.createdAt) === yesterday) },
    {
      title: t('gd.older'),
      items: items.filter((n) => ![today, yesterday].includes(dayKey(n.createdAt))),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <Screen tabs={me?.isGuardian} className="gap-3.5">
      {me?.isGuardian ? (
        <h1 className="pt-10 text-[26px] font-bold">{t('nav.inbox')}</h1>
      ) : (
        <BackBar title={t('nav.inbox')} />
      )}
      <Segmented
        label={t('nav.inbox')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('gd.all') },
          { value: 'alerts', label: t('admin.nav.alerts') },
        ]}
      />
      {inbox.isLoading && <Spinner label={t('common.loading')} />}
      {!inbox.isLoading && groups.length === 0 && (
        <div className="flex flex-col items-center gap-2.5 px-5 py-12 text-center text-muted">
          <Icon name="notifications_off" size={40} />
          <p className="text-[15px] leading-relaxed">
            {filter === 'alerts' ? t('gd.noAlerts') : t('inbox.empty')}
          </p>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <SectionTitle>{g.title}</SectionTitle>
          <Panel>
            {g.items.map((n) => {
              const [icon, tone] = TEMPLATE_LOOK[n.template] ?? ['notifications', 'primary'];
              return (
                <Link
                  key={n.id}
                  to={n.url ?? '#'}
                  onClick={() => !n.readAt && read.mutate(n.id)}
                  className={cn(
                    'flex items-center gap-3 border-b border-border px-3.5 py-3.25 last:border-b-0',
                    !n.readAt && 'bg-primary-soft/40',
                  )}
                >
                  <IconTile icon={icon} tone={tone} size={38} fill />
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-[15px] leading-snug',
                      n.readAt ? 'font-medium' : 'font-semibold',
                    )}
                  >
                    {n.body}
                  </span>
                  <span className="shrink-0 text-[12.5px] text-muted">
                    {dayKey(n.createdAt) === today || dayKey(n.createdAt) === yesterday
                      ? formatTime(n.createdAt)
                      : formatDate(n.createdAt)}
                  </span>
                </Link>
              );
            })}
          </Panel>
        </section>
      ))}
    </Screen>
  );
}

// ─── Account ────────────────────────────────────────────────────────────────

/** Account (Claude Design "Tammeni Guardian" → حسابي); every role uses it. */
export function AccountPage() {
  const { t, i18n } = useTranslation();
  const { me, refresh, signOut, orgsWith } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const { theme, scheme } = useAppearance();
  const pushReady = usePushReady();
  const subs = usePushSubscriptions();
  const [sheet, setSheet] = useState<'password' | 'totp' | 'delete' | null>(null);
  const mute = useMutation({
    mutationFn: (muteRoutineNotifications: boolean) =>
      api('/me/notification-settings', { method: 'PATCH', body: { muteRoutineNotifications } }),
    onSuccess: () => refresh(),
  });
  const test = useMutation({
    mutationFn: async () => {
      const sub = subs.data?.find((s) => s.lastTestOkAt) ?? subs.data?.[0];
      if (!sub) throw new Error('no-device');
      await api(`/push/subscriptions/${sub.id}/test`, { method: 'POST' });
    },
    onSuccess: () => toast({ message: t('gd.acc.testSent'), tone: 'success' }),
    onError: () => navigate('/notifications/setup'),
  });
  if (!me) return null;
  const roles =
    [
      orgsWith('driver', 'attendant').length > 0,
      orgsWith('org_admin').length > 0,
      me.isGuardian,
      me.isPlatformAdmin,
    ].filter(Boolean).length > 1;
  const toggleLanguage = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    platform.preferences.set('locale', next);
    void i18n.changeLanguage(next);
  };

  return (
    <Screen tabs={me.isGuardian} className="gap-3.5">
      {me.isGuardian ? (
        <h1 className="pt-10 text-[26px] font-bold">{t('gd.tabs.account')}</h1>
      ) : (
        <BackBar title={t('gd.tabs.account')} />
      )}
      <div className="flex items-center gap-3.5 rounded-[20px] border border-border bg-surface p-4">
        <PersonBadge name={displayName(me)} size={54} />
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-bold">{displayName(me)}</div>
          <div className="truncate text-[13px] text-muted" dir="ltr">
            {me.email}
          </div>
          <div className="text-[13px] text-muted" dir="ltr">
            {me.phoneE164}
          </div>
          <div className="text-[13px] text-muted">
            {t('settings.myCode')}: <span dir="ltr">{me.publicCode}</span>
          </div>
          {me.termsAcceptedAt && (
            <div className="text-[12.5px] text-muted">
              {t('legal.acceptedOn', {
                date: formatDate(me.termsAcceptedAt),
                version: me.termsVersion,
              })}
            </div>
          )}
        </div>
      </div>

      <SectionTitle>{t('nav.inbox')}</SectionTitle>
      <Panel>
        {pushReady ? (
          <Row>
            <Icon name="check_circle" fill className="text-status-alighted" />
            <span className="flex-1 text-[15px]">{t('push.ready')}</span>
          </Row>
        ) : (
          <RowLink to="/notifications/setup" className="text-warning">
            <Icon name="notifications_off" />
            <span className="flex-1 text-[15px] font-semibold">{t('guardian.enablePush')}</span>
          </RowLink>
        )}
        {pushReady && (
          <RowButton
            onClick={() => test.mutate()}
            disabled={test.isPending}
            className="text-primary"
          >
            <Icon name="notifications_active" />
            <span className="flex-1 text-[15px] font-semibold">{t('push.sendTestAgain')}</span>
          </RowButton>
        )}
        {me.isGuardian && (
          <Switch
            icon="notifications_paused"
            label={t('gd.acc.muteRoutine')}
            hint={t('settings.alertsNeverMuted')}
            checked={me.muteRoutineNotifications}
            disabled={mute.isPending}
            onChange={(v) => mute.mutate(v)}
          />
        )}
      </Panel>

      <SectionTitle>{t('gd.acc.appearance')}</SectionTitle>
      <Panel>
        <Switch
          icon="dark_mode"
          label={t('admin.darkMode')}
          checked={scheme === 'dark'}
          onChange={(dark) => setAppearance(theme, dark ? 'dark' : 'light')}
        />
        <RowButton onClick={toggleLanguage} chevron>
          <Icon name="translate" className="text-muted" />
          <span className="flex-1 text-[15px]">{t('gd.acc.language')}</span>
          <span className="text-sm text-muted">{t('gd.acc.currentLanguage')}</span>
        </RowButton>
      </Panel>

      <SectionTitle>{t('gd.acc.security')}</SectionTitle>
      <Panel>
        <RowButton onClick={() => setSheet('password')} chevron>
          <Icon name="lock" className="text-muted" />
          <span className="flex-1 text-[15px]">{t('gd.acc.changePassword')}</span>
        </RowButton>
        <RowButton onClick={() => setSheet('totp')} chevron>
          <Icon name="shield_person" className="text-muted" />
          <span className="flex-1 text-[15px]">{t('settings.totpTitle')}</span>
          <span className="text-sm text-muted">
            {me.totpEnabled ? t('gd.acc.on') : t('gd.acc.off')}
          </span>
        </RowButton>
      </Panel>

      <SectionTitle>{t('gd.acc.more')}</SectionTitle>
      <Panel>
        {roles && (
          <RowLink to="/">
            <Icon name="apps" className="text-muted" />
            <span className="flex-1 text-[15px]">{t('home.chooseRole')}</span>
          </RowLink>
        )}
        {!me.isGuardian && (
          <RowLink to="/children/new">
            <Icon name="person_add" className="text-muted" />
            <span className="flex-1 text-[15px]">{t('guardian.addChild')}</span>
          </RowLink>
        )}
        <RowLink to="/organizations/new">
          <Icon name="apartment" className="text-muted" />
          <span className="flex-1 text-[15px]">{t('admin.createOrg')}</span>
        </RowLink>
        <RowLink to="/help">
          <Icon name="support" className="text-muted" />
          <span className="flex-1 text-[15px]">{t('gd.svc.help')}</span>
        </RowLink>
      </Panel>

      <button
        type="button"
        onClick={() => void signOut().then(() => navigate('/welcome'))}
        className="mt-1.5 min-h-12.5 rounded-[14px] border border-border bg-surface text-[15px] font-semibold"
      >
        {t('settings.signOut')}
      </button>
      <button
        type="button"
        onClick={() => setSheet('delete')}
        className="min-h-11 text-sm font-semibold text-alert"
      >
        {t('settings.deleteAccount')}
      </button>

      <ChangePasswordSheet open={sheet === 'password'} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'totp'} onClose={() => setSheet(null)} title={t('settings.totpTitle')}>
        <TotpPanel enabled={me.totpEnabled} onChange={() => void refresh()} />
        <button type="button" onClick={() => setSheet(null)} className="min-h-11 font-semibold">
          {t('common.close')}
        </button>
      </Sheet>
      <DeleteAccountSheet open={sheet === 'delete'} onClose={() => setSheet(null)} />
    </Screen>
  );
}

function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () =>
      api<Tokens>('/me/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      }),
    onSuccess: async (tokens) => {
      // Other devices are signed out; this one continues with the fresh session.
      await session.store(tokens);
      setCurrent('');
      setNext('');
      onClose();
      toast({ message: t('gd.acc.passwordChanged'), tone: 'success' });
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('gd.acc.changePassword')}>
      <FieldLabel label={t('gd.acc.currentPassword')}>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={cn(inputClass, 'bg-background')}
        />
      </FieldLabel>
      <FieldLabel label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={cn(inputClass, 'bg-background')}
        />
      </FieldLabel>
      <p className="text-[13px] text-muted">{t('gd.acc.otherDevices')}</p>
      {change.error && <ErrorLine>{errorMessage(change.error)}</ErrorLine>}
      <button
        type="button"
        disabled={!current || next.length < 8 || change.isPending}
        onClick={() => change.mutate()}
        className={cn(
          bigButton,
          'min-h-13 rounded-[14px] bg-primary text-base text-primary-foreground',
        )}
      >
        {t('common.save')}
      </button>
      <button type="button" onClick={onClose} className="min-h-11 font-semibold">
        {t('common.cancel')}
      </button>
    </Sheet>
  );
}

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const remove = useMutation({
    mutationFn: () => api('/me', { method: 'DELETE', body: { password } }),
    onSuccess: async () => {
      await signOut();
      toast({ message: t('settings.deleted'), tone: 'success' });
      navigate('/welcome');
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.deleteAccount')} tone="danger">
      <p className="text-sm leading-relaxed text-muted">{t('settings.deleteWarning')}</p>
      <FieldLabel label={t('gd.passwordToConfirm')}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={cn(inputClass, 'bg-background')}
        />
      </FieldLabel>
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
        {t('settings.deleteConfirm')}
      </button>
      <button type="button" onClick={onClose} className="min-h-11 font-semibold">
        {t('common.cancel')}
      </button>
    </Sheet>
  );
}

/** Optional authenticator-app code at sign-in (PLAN §5.1), recommended for admins. */
function TotpPanel({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const start = useMutation({
    mutationFn: () =>
      api<{ secret: string; otpauthUri: string }>('/me/totp/setup', {
        method: 'POST',
        body: { password },
      }),
    onSuccess: (s) => {
      setSetup(s);
      setPassword('');
    },
  });
  const enable = useMutation({
    mutationFn: () => api('/me/totp/enable', { method: 'POST', body: { code } }),
    onSuccess: () => {
      setSetup(null);
      setCode('');
      onChange();
    },
  });
  const disable = useMutation({
    mutationFn: () => api('/me/totp/disable', { method: 'POST', body: { password, code } }),
    onSuccess: () => {
      setPassword('');
      setCode('');
      onChange();
    },
  });
  const error = start.error ?? enable.error ?? disable.error;
  const passwordField = (
    <FieldLabel label={t('auth.password')}>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={cn(inputClass, 'bg-background')}
      />
    </FieldLabel>
  );
  const codeField = (
    <FieldLabel label={t('auth.totpCode')}>
      <input
        inputMode="numeric"
        maxLength={6}
        dir="ltr"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className={cn(inputClass, 'bg-background text-center tracking-[0.4em]')}
      />
    </FieldLabel>
  );
  const action = cn(bigButton, 'min-h-12 rounded-[14px] text-base');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {enabled ? t('settings.totpOn') : t('settings.totpIntro')}
      </p>
      {enabled ? (
        <>
          {passwordField}
          {codeField}
          <button
            type="button"
            disabled={!password || code.length !== 6 || disable.isPending}
            onClick={() => disable.mutate()}
            className={cn(action, 'border border-border')}
          >
            {t('settings.totpDisable')}
          </button>
        </>
      ) : setup ? (
        <>
          <p className="text-sm">{t('settings.totpScan')}</p>
          <a href={setup.otpauthUri} className="font-semibold text-primary underline">
            {t('settings.totpOpenApp')}
          </a>
          <p className="rounded-xl border border-border p-2 font-mono text-sm break-all" dir="ltr">
            {setup.secret}
          </p>
          {codeField}
          <button
            type="button"
            disabled={code.length !== 6 || enable.isPending}
            onClick={() => enable.mutate()}
            className={cn(action, 'bg-primary text-primary-foreground')}
          >
            {t('settings.totpEnable')}
          </button>
        </>
      ) : (
        <>
          {passwordField}
          <button
            type="button"
            disabled={!password || start.isPending}
            onClick={() => start.mutate()}
            className={cn(action, 'bg-primary text-primary-foreground')}
          >
            {t('settings.totpStart')}
          </button>
        </>
      )}
      {error && <ErrorLine>{errorMessage(error)}</ErrorLine>}
    </div>
  );
}

// ─── Organisations ──────────────────────────────────────────────────────────

export function CreateOrgPage() {
  const { t } = useTranslation();
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    type: (ENROLLABLE_ORG_TYPES as readonly string[]).includes(params.get('type') ?? '')
      ? (params.get('type') as EnrollableOrgType)
      : ('independent_driver' as const),
    nameAr: '',
    nameEn: '',
  });
  const create = useMutation({
    mutationFn: () =>
      api<OrgSummary>('/organizations', {
        method: 'POST',
        body: { ...form, country: 'BH' },
      }),
    onSuccess: async (org) => {
      await refresh();
      navigate(org.type === 'independent_driver' ? '/admin/vehicles' : '/admin');
    },
  });
  return (
    <Screen className="gap-4">
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <BackBar title={t('admin.createOrg')} />
        <Segmented
          label={t('admin.orgType')}
          value={form.type}
          onChange={(type) => setForm({ ...form, type })}
          options={(['independent_driver', ...ENROLLABLE_ORG_TYPES] as const).map((v) => ({
            value: v,
            label: t(`orgType.${v}`),
          }))}
        />
        <FieldLabel label={t('admin.orgNameAr')}>
          <input
            required
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label={t('admin.orgNameEn')}>
          <input
            required
            dir="ltr"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            className={cn(inputClass, 'text-start')}
          />
        </FieldLabel>
        {form.type !== 'independent_driver' && (
          <p className="rounded-[14px] bg-primary-soft px-3.5 py-3 text-sm leading-relaxed">
            {t('admin.needsReview')}
          </p>
        )}
        {create.error && <ErrorLine>{errorMessage(create.error)}</ErrorLine>}
        <div className="flex-1" />
        <button
          type="submit"
          disabled={create.isPending}
          className={cn(bigButton, 'bg-primary text-primary-foreground')}
        >
          {t('admin.createOrg')}
        </button>
      </form>
    </Screen>
  );
}

export function PlatformPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const pending = useQuery({
    queryKey: ['platform-pending'],
    queryFn: () => api<OrgSummary[]>('/platform/organizations/pending'),
  });
  const approve = useMutation({
    mutationFn: (id: string) => api(`/platform/organizations/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-pending'] }),
  });
  return (
    <Screen className="gap-4" wide>
      <BackBar title={t('home.platform')} />
      <p className="text-sm text-muted">{t('platform.intro')}</p>
      {pending.data?.length === 0 && <EmptyState>{t('platform.nothingPending')}</EmptyState>}
      {approve.error && <ErrorLine>{errorMessage(approve.error)}</ErrorLine>}
      {(pending.data?.length ?? 0) > 0 && (
        <Panel>
          {pending.data?.map((o) => (
            <div
              key={o.id}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <IconTile icon={o.type === 'school' ? 'school' : 'directions_bus'} size={38} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{orgName(o)}</p>
                <p className="text-[13px] text-muted">{t(`orgType.${o.type}`)}</p>
              </div>
              <button
                type="button"
                disabled={approve.isPending}
                onClick={() => approve.mutate(o.id)}
                className="min-h-10 rounded-[10px] bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                {t('admin.approve')}
              </button>
            </div>
          ))}
        </Panel>
      )}
    </Screen>
  );
}
