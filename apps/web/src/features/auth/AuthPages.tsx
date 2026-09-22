import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { COUNTRIES, type SignupRole } from '@wusool/shared';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/form';
import { Card, Notice, PageHeader } from '@/components/ui/layout';
import { useToast } from '@/components/toast';
import { api, ApiError, session, type Tokens } from '@/lib/api';
import { errorMessage, fieldErrors } from '@/lib/errors';

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={title} />
      <Card>{children}</Card>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const login = useMutation({
    mutationFn: () =>
      api<Tokens>('/auth/login', {
        method: 'POST',
        body: { email, password, ...(totp ? { totp } : {}) },
      }),
    onSuccess: async (tokens) => {
      await session.store(tokens);
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate(params.get('next') ?? '/', { replace: true });
    },
  });
  // Accounts with TOTP (optional for admins, PLAN §5.1) are asked for a code after the password.
  const needsTotp =
    login.error instanceof ApiError &&
    (login.error.code === 'totp_required' || login.error.code === 'totp_invalid');
  return (
    <AuthCard title={t('auth.signIn')}>
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {needsTotp && (
          <TextField
            label={t('auth.totpCode')}
            hint={t('auth.totpHint')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/D/g, ''))}
          />
        )}
        {login.error && !(needsTotp && !totp) && (
          <Notice tone="danger">{errorMessage(login.error)}</Notice>
        )}
        <Button type="submit" size="touch" className="w-full" disabled={login.isPending}>
          {t('auth.signIn')}
        </Button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <Link className="font-semibold text-primary" to="/register">
          {t('auth.createAccount')}
        </Link>
        <Link className="font-semibold text-primary" to="/forgot-password">
          {t('auth.forgotPassword')}
        </Link>
      </div>
    </AuthCard>
  );
}

const SIGNUP_CHOICES = [
  { role: 'guardian', icon: '👪' },
  { role: 'independent_driver', icon: '🚐' },
  { role: 'organization', icon: '🏫' },
  { role: 'staff_driver', icon: '🚌' },
] as const satisfies readonly { role: SignupRole; icon: string }[];

/** Step 1 of sign-up: what are you? The answer decides the form and where the account lands. */
function SignupRoleChooser({ onPick }: { onPick: (role: SignupRole) => void }) {
  const { t } = useTranslation();
  return (
    <AuthCard title={t('signup.whoAreYou')}>
      <ul className="space-y-3">
        {SIGNUP_CHOICES.map((c) => (
          <li key={c.role}>
            <button
              type="button"
              onClick={() => onPick(c.role)}
              className="flex min-h-touch w-full items-center gap-4 rounded-lg border border-border bg-surface p-4 text-start hover:border-primary focus-visible:border-primary"
            >
              <span className="text-3xl" aria-hidden="true">
                {c.icon}
              </span>
              <span>
                <span className="block text-lg font-bold">{t(`signup.role.${c.role}`)}</span>
                <span className="block text-sm text-muted">{t(`signup.roleHint.${c.role}`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">
        {t('auth.haveAccount')}{' '}
        <Link className="font-semibold text-primary" to="/login">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asParam = params.get('as');
  const role = SIGNUP_CHOICES.find((c) => c.role === asParam)?.role;
  const [form, setForm] = useState({
    fullNameAr: '',
    email: '',
    phone: '',
    country: 'BH',
    password: '',
  });
  const [org, setOrg] = useState({
    type: 'school' as 'school' | 'transport_company',
    nameAr: '',
    nameEn: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
  const register = useMutation({
    mutationFn: () =>
      api('/auth/register', {
        method: 'POST',
        body: {
          ...form,
          locale: i18n.language === 'en' ? 'en' : 'ar',
          signupRole: role,
          ...(role === 'organization'
            ? {
                organization: {
                  type: org.type,
                  nameAr: org.nameAr,
                  nameEn: org.nameEn.trim() || undefined,
                },
              }
            : {}),
        },
      }),
    onSuccess: () =>
      navigate(`/verify-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`),
  });

  if (!role) return <SignupRoleChooser onPick={(r) => setParams({ as: r })} />;

  const fe = fieldErrors(register.error);
  const choice = SIGNUP_CHOICES.find((c) => c.role === role)!;
  return (
    <AuthCard title={t('auth.createAccount')}>
      <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-background p-3">
        <span className="font-semibold">
          {choice.icon} {t(`signup.role.${role}`)}
        </span>
        <button
          type="button"
          className="min-h-11 px-2 text-sm font-semibold text-primary underline"
          onClick={() => setParams({})}
        >
          {t('signup.change')}
        </button>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate();
        }}
      >
        {role === 'organization' && (
          <fieldset className="space-y-4 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-bold">{t('signup.organization')}</legend>
            <SelectField
              label={t('admin.orgType')}
              value={org.type}
              onChange={(e) =>
                setOrg({ ...org, type: e.target.value as 'school' | 'transport_company' })
              }
            >
              <option value="school">{t('orgType.school')}</option>
              <option value="transport_company">{t('orgType.transport_company')}</option>
            </SelectField>
            <TextField
              label={t('admin.orgNameAr')}
              required
              value={org.nameAr}
              onChange={(e) => setOrg({ ...org, nameAr: e.target.value })}
              error={fe['organization.nameAr']}
            />
            <TextField
              label={t('admin.orgNameEn')}
              dir="ltr"
              value={org.nameEn}
              onChange={(e) => setOrg({ ...org, nameEn: e.target.value })}
              error={fe['organization.nameEn']}
            />
            <Notice tone="info">{t('admin.needsReview')}</Notice>
          </fieldset>
        )}
        <TextField
          label={role === 'organization' ? t('signup.managerName') : t('auth.fullName')}
          autoComplete="name"
          required
          value={form.fullNameAr}
          onChange={set('fullNameAr')}
          error={fe.fullNameAr}
        />
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set('email')}
          error={fe.email}
        />
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <SelectField label={t('auth.country')} value={form.country} onChange={set('country')}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {t(`countries.${c}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('auth.phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            dir="ltr"
            required
            value={form.phone}
            onChange={set('phone')}
            error={fe.phone}
            hint={role === 'independent_driver' ? t('signup.driverPhoneHint') : t('auth.phoneHint')}
          />
        </div>
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={set('password')}
          hint={t('auth.passwordHint')}
          error={fe.password}
        />
        {role === 'staff_driver' && <Notice tone="info">{t('signup.staffDriverNote')}</Notice>}
        {register.error && !Object.keys(fe).length && (
          <Notice tone="danger">{errorMessage(register.error)}</Notice>
        )}
        <Button type="submit" size="touch" className="w-full" disabled={register.isPending}>
          {t('auth.createAccount')}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        {t('auth.haveAccount')}{' '}
        <Link className="font-semibold text-primary" to="/login">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const verify = useMutation({
    mutationFn: () => api<Tokens>('/auth/verify-email', { method: 'POST', body: { email, code } }),
    onSuccess: async (tokens) => {
      await session.store(tokens);
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/', { replace: true });
    },
  });
  const resend = useMutation({
    mutationFn: () =>
      api('/auth/resend-code', { method: 'POST', body: { email, purpose: 'verify_email' } }),
    onSuccess: () => toast({ message: t('auth.codeResent'), tone: 'success' }),
    onError: (e) => toast({ message: errorMessage(e), tone: 'error' }),
  });
  return (
    <AuthCard title={t('auth.verifyEmail')}>
      <p className="mb-4 text-muted">{t('auth.verifyEmailIntro')}</p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate();
        }}
      >
        <TextField
          label={t('auth.email')}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t('auth.code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          dir="ltr"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center text-2xl tracking-[0.5em]"
        />
        {verify.error && <Notice tone="danger">{errorMessage(verify.error)}</Notice>}
        <Button
          type="submit"
          size="touch"
          className="w-full"
          disabled={verify.isPending || code.length !== 6}
        >
          {t('auth.verify')}
        </Button>
      </form>
      <Button
        variant="ghost"
        className="mt-3 w-full"
        disabled={!email || resend.isPending}
        onClick={() => resend.mutate()}
      >
        {t('auth.resendCode')}
      </Button>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const send = useMutation({
    mutationFn: () => api('/auth/forgot-password', { method: 'POST', body: { email } }),
    onSuccess: () =>
      navigate(`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`),
  });
  return (
    <AuthCard title={t('auth.forgotPassword')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <TextField
          label={t('auth.email')}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {send.error && <Notice tone="danger">{errorMessage(send.error)}</Notice>}
        <Button type="submit" size="touch" className="w-full" disabled={send.isPending}>
          {t('auth.sendCode')}
        </Button>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const reset = useMutation({
    mutationFn: () =>
      api('/auth/reset-password', { method: 'POST', body: { email, code, newPassword } }),
    onSuccess: () => {
      toast({ message: t('auth.passwordChanged'), tone: 'success' });
      navigate('/login');
    },
  });
  return (
    <AuthCard title={t('auth.resetPassword')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          reset.mutate();
        }}
      >
        <TextField
          label={t('auth.email')}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t('auth.code')}
          inputMode="numeric"
          maxLength={6}
          dir="ltr"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <TextField
          label={t('auth.newPassword')}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          hint={t('auth.passwordHint')}
        />
        {reset.error && <Notice tone="danger">{errorMessage(reset.error)}</Notice>}
        <Button type="submit" size="touch" className="w-full" disabled={reset.isPending}>
          {t('auth.resetPassword')}
        </Button>
      </form>
    </AuthCard>
  );
}

export function isUnverified(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'email_not_verified';
}
