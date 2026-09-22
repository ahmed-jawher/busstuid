import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router';
import { COUNTRIES, type Country } from '@wusool/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextField } from '@/components/ui/form';
import { Card, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui/layout';
import { useToast } from '@/components/toast';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatTime, orgName } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { InboxItem, OrgSummary } from '@/lib/types';

/** Chooses the interface by role; with a single role it goes straight there. */
export function HomePage() {
  const { t } = useTranslation();
  const { me, orgsWith } = useSession();
  const tiles = [
    orgsWith('driver', 'attendant').length > 0 && { to: '/driver', key: 'home.driver', icon: '🚌' },
    orgsWith('org_admin').length > 0 && { to: '/admin', key: 'home.admin', icon: '🏫' },
    { to: '/guardian', key: 'home.guardian', icon: '👪' },
    me?.isPlatformAdmin && { to: '/platform', key: 'home.platform', icon: '🛡️' },
  ].filter(Boolean) as { to: string; key: string; icon: string }[];
  if (tiles.length === 1) return <Navigate to={tiles[0]!.to} replace />;
  return (
    <section className="space-y-4">
      <PageHeader title={t('home.chooseRole')} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {tiles.map((r) => (
          <li key={r.to}>
            <Link
              to={r.to}
              className="flex min-h-touch items-center gap-3 rounded-lg border border-border bg-surface p-4 text-lg font-semibold"
            >
              <span aria-hidden="true">{r.icon}</span>
              {t(r.key)}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        to="/organizations/new"
        className="inline-block text-sm font-semibold text-primary underline"
      >
        {t('admin.createOrg')}
      </Link>
    </section>
  );
}

export function InboxPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api<InboxItem[]>('/me/notifications'),
    refetchInterval: 30_000,
  });
  const read = useMutation({
    mutationFn: (id: string) => api(`/me/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.inbox')} />
      {inbox.isLoading && <Spinner label={t('common.loading')} />}
      {inbox.data?.length === 0 && <EmptyState>{t('inbox.empty')}</EmptyState>}
      <ul className="space-y-2">
        {inbox.data?.map((n) => (
          <li key={n.id}>
            <Link
              to={n.url ?? '#'}
              onClick={() => !n.readAt && read.mutate(n.id)}
              className="block"
            >
              <Card
                className={`${n.readAt ? 'opacity-75' : 'border-2'} ${n.priority === 'critical' ? 'border-alert' : ''}`}
              >
                <p className="font-bold">{n.body}</p>
                <p className="text-xs text-muted">
                  {formatDate(n.createdAt)} {formatTime(n.createdAt)}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { me, refresh, signOut } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const mute = useMutation({
    mutationFn: (muteRoutineNotifications: boolean) =>
      api('/me/notification-settings', { method: 'PATCH', body: { muteRoutineNotifications } }),
    onSuccess: () => refresh(),
  });
  const remove = useMutation({
    mutationFn: () => api('/me', { method: 'DELETE', body: { password } }),
    onSuccess: async () => {
      await signOut();
      toast({ message: t('settings.deleted'), tone: 'success' });
      navigate('/login');
    },
  });
  if (!me) return null;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title={t('nav.settings')} />
      <Card className="space-y-1">
        <p className="font-bold">{me.fullNameAr}</p>
        <p className="text-sm text-muted" dir="ltr">
          {me.email} · {me.phoneE164}
        </p>
        <p className="text-xs text-muted">{t('settings.phoneUnverified')}</p>
      </Card>
      <Card>
        <Link to="/organizations/new" className="font-semibold text-primary underline">
          {t('admin.createOrg')}
        </Link>
      </Card>
      <Card className="space-y-3">
        <Checkbox
          label={t('settings.muteRoutine')}
          checked={me.muteRoutineNotifications}
          onChange={(e) => mute.mutate(e.target.checked)}
        />
        <p className="text-sm text-muted">{t('settings.alertsNeverMuted')}</p>
        <Link to="/notifications/setup" className="font-semibold text-primary underline">
          {t('settings.notificationSetup')}
        </Link>
      </Card>
      <TotpCard enabled={me.totpEnabled} onChange={() => void refresh()} />
      <Button
        variant="outline"
        className="w-full"
        onClick={() => void signOut().then(() => navigate('/login'))}
      >
        {t('settings.signOut')}
      </Button>
      <Button variant="danger" className="w-full" onClick={() => setDeleting(true)}>
        {t('settings.deleteAccount')}
      </Button>
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t('settings.deleteAccount')}
        tone="danger"
      >
        <p>{t('settings.deleteWarning')}</p>
        <TextField
          label={t('auth.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {remove.error && <Notice tone="danger">{errorMessage(remove.error)}</Notice>}
        <Button
          variant="danger"
          className="w-full"
          disabled={!password || remove.isPending}
          onClick={() => remove.mutate()}
        >
          {t('settings.deleteConfirm')}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setDeleting(false)}>
          {t('common.cancel')}
        </Button>
      </Dialog>
    </div>
  );
}

export function CreateOrgPage() {
  const { t } = useTranslation();
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    type: 'independent_driver',
    nameAr: '',
    nameEn: '',
    country: 'BH' as Country,
  });
  const create = useMutation({
    mutationFn: () =>
      api<OrgSummary>('/organizations', {
        method: 'POST',
        body: { ...form, nameEn: form.nameEn.trim() || undefined },
      }),
    onSuccess: async (org) => {
      await refresh();
      navigate(org.type === 'independent_driver' ? '/admin/vehicles' : '/admin');
    },
  });
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title={t('admin.createOrg')} />
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <SelectField
            label={t('admin.orgType')}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {(['independent_driver', 'school', 'transport_company'] as const).map((type) => (
              <option key={type} value={type}>
                {t(`orgType.${type}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('admin.orgNameAr')}
            required
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
          />
          <TextField
            label={t('admin.orgNameEn')}
            dir="ltr"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
          />
          <SelectField
            label={t('auth.country')}
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value as Country })}
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {t(`countries.${c}`)}
              </option>
            ))}
          </SelectField>
          {form.type !== 'independent_driver' && (
            <Notice tone="info">{t('admin.needsReview')}</Notice>
          )}
          {create.error && <Notice tone="danger">{errorMessage(create.error)}</Notice>}
          <Button type="submit" size="touch" className="w-full" disabled={create.isPending}>
            {t('admin.createOrg')}
          </Button>
        </form>
      </Card>
    </div>
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
    <div className="space-y-4">
      <PageHeader title={t('home.platform')} subtitle={t('platform.intro')} />
      {pending.data?.length === 0 && <EmptyState>{t('platform.nothingPending')}</EmptyState>}
      <ul className="space-y-2">
        {pending.data?.map((o) => (
          <li key={o.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold">{orgName(o)}</p>
                <p className="text-sm text-muted">
                  {t(`orgType.${o.type}`)} · {t(`countries.${o.country}`)}
                </p>
              </div>
              <Button onClick={() => approve.mutate(o.id)}>{t('admin.approve')}</Button>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Optional authenticator-app code at sign-in (PLAN §5.1), recommended for admins. */
function TotpCard({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
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
  const codeField = (
    <TextField
      label={t('auth.totpCode')}
      inputMode="numeric"
      maxLength={6}
      dir="ltr"
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
    />
  );
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{t('settings.totpTitle')}</h2>
      <p className="text-sm text-muted">
        {enabled ? t('settings.totpOn') : t('settings.totpIntro')}
      </p>
      {enabled ? (
        <>
          <TextField
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {codeField}
          <Button
            variant="outline"
            disabled={!password || code.length !== 6 || disable.isPending}
            onClick={() => disable.mutate()}
          >
            {t('settings.totpDisable')}
          </Button>
        </>
      ) : setup ? (
        <>
          <p className="text-sm">{t('settings.totpScan')}</p>
          <a href={setup.otpauthUri} className="font-semibold text-primary underline">
            {t('settings.totpOpenApp')}
          </a>
          <p className="break-all rounded-md border border-border p-2 font-mono text-sm" dir="ltr">
            {setup.secret}
          </p>
          {codeField}
          <Button disabled={code.length !== 6 || enable.isPending} onClick={() => enable.mutate()}>
            {t('settings.totpEnable')}
          </Button>
        </>
      ) : (
        <>
          <TextField
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={!password || start.isPending}
            onClick={() => start.mutate()}
          >
            {t('settings.totpStart')}
          </Button>
        </>
      )}
      {error && <Notice tone="danger">{errorMessage(error)}</Notice>}
    </Card>
  );
}
