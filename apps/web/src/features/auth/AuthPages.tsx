import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { SignupRole } from '@wusool/shared';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { useToast } from '@/components/toast';
import {
  BackBar,
  bigButton,
  ErrorLine,
  FieldLabel,
  IconBadge,
  inputClass,
  PhoneInput,
  Screen,
  Segmented,
} from '@/components/ui/kit';
import { api, ApiError, session, type Tokens } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { useSession } from '@/lib/session';

// Onboarding (Claude Design "Tammeni Onboarding"): welcome, sign in, then three steps — who you
// are, your details, the email code — followed by notifications and a role-specific "ready".

export function WelcomePage() {
  const { t } = useTranslation();
  const bullets: [IconName, string][] = [
    ['notifications_active', t('onb.welcome.b1')],
    ['shield', t('onb.welcome.b2')],
    ['location_off', t('onb.welcome.b3')],
  ];
  return (
    <Screen tone="navy" className="gap-4.5 pt-16">
      <Logo size={96} className="mt-10" />
      <div className="mt-4 font-figures text-[52px] leading-tight font-bold">{t('app.name')}</div>
      <p className="max-w-[300px] text-xl leading-relaxed opacity-90">{t('onb.welcome.tagline')}</p>
      <ul className="mt-2.5 flex flex-col gap-2.5 text-[15px] opacity-90">
        {bullets.map(([icon, text]) => (
          <li key={icon} className="flex items-center gap-2.5">
            <Icon name={icon} className="text-brand-yellow" />
            {text}
          </li>
        ))}
      </ul>
      <div className="flex-1" />
      <Link to="/register" className={cn(bigButton, 'bg-white text-brand-navy')}>
        {t('auth.createAccount')}
      </Link>
      <Link to="/login" className={cn(bigButton, 'border-[1.5px] border-white/45 text-white')}>
        {t('auth.signIn')}
      </Link>
    </Screen>
  );
}

function Step({ n }: { n: number }) {
  const { t } = useTranslation();
  return <span className="text-[13px] text-muted">{t('onb.step', { n, total: 3 })}</span>;
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
    <Screen>
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <BackBar to="/welcome" />
        <div>
          <h1 className="text-[28px] font-bold">{t('onb.welcomeTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('onb.welcomeSub')}</p>
        </div>
        <FieldLabel label={t('auth.email')}>
          <input
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={cn(inputClass, 'text-end')}
          />
        </FieldLabel>
        <FieldLabel label={t('auth.password')}>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        {needsTotp && (
          <FieldLabel label={t('auth.totpCode')} hint={t('auth.totpHint')}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              dir="ltr"
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
              className={cn(inputClass, 'text-center tracking-[0.4em]')}
            />
          </FieldLabel>
        )}
        <Link to="/forgot-password" className="self-start text-sm font-semibold text-primary">
          {t('auth.forgotPassword')}
        </Link>
        {login.error && !(needsTotp && !totp) && <ErrorLine>{errorMessage(login.error)}</ErrorLine>}
        <div className="flex-1" />
        <button
          type="submit"
          disabled={login.isPending}
          className={cn(bigButton, 'bg-primary text-primary-foreground')}
        >
          {t('auth.signIn')}
        </button>
        <Link
          to="/register"
          className="flex min-h-11 items-center justify-center text-[15px] font-semibold text-primary"
        >
          {t('onb.noAccount')}
        </Link>
      </form>
    </Screen>
  );
}

const ROLES: { role: SignupRole; icon: IconName }[] = [
  { role: 'guardian', icon: 'family_restroom' },
  { role: 'staff_driver', icon: 'badge' },
  { role: 'independent_driver', icon: 'directions_car' },
  { role: 'organization', icon: 'apartment' },
];

/** Step 1: who are you? The answer decides the form and where the account lands. */
function RolePicker({
  initial,
  onPick,
}: {
  initial?: SignupRole;
  onPick: (r: SignupRole) => void;
}) {
  const { t } = useTranslation();
  const [role, setRole] = useState<SignupRole>(initial ?? 'guardian');
  return (
    <Screen className="gap-3.5">
      <BackBar to="/welcome" end={<Step n={1} />} />
      <h1 className="text-[27px] font-bold">{t('signup.whoAreYou')}</h1>
      <p className="mb-1 text-[15px] text-muted">{t('onb.roleIntro')}</p>
      <div role="radiogroup" aria-label={t('signup.whoAreYou')} className="flex flex-col gap-3.5">
        {ROLES.map((r) => {
          const on = r.role === role;
          return (
            <button
              key={r.role}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setRole(r.role)}
              className={cn(
                'flex min-h-20 items-center gap-3.5 rounded-[18px] bg-surface p-4 text-start',
                on ? 'border-2 border-primary' : 'border border-border',
              )}
            >
              <span
                className={cn(
                  'flex size-12 shrink-0 items-center justify-center rounded-[14px]',
                  on ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-primary',
                )}
              >
                <Icon name={r.icon} size={26} />
              </span>
              <span className="flex-1">
                <span className="block text-[17px] font-bold">{t(`signup.role.${r.role}`)}</span>
                <span className="mt-0.5 block text-[13.5px] leading-normal text-muted">
                  {t(`signup.roleHint.${r.role}`)}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'size-6 shrink-0 rounded-full',
                  on ? 'border-[7px] border-primary' : 'border-2 border-[#B9C0D4]',
                )}
              />
            </button>
          );
        })}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => onPick(role)}
        className={cn(bigButton, 'bg-primary text-primary-foreground')}
      >
        {t('common.continue')}
      </button>
      <p className="text-center text-sm">
        {t('auth.haveAccount')}{' '}
        <Link className="font-semibold text-primary" to="/login">
          {t('auth.signIn')}
        </Link>
      </p>
    </Screen>
  );
}

/** Scores 0-4 like the design: length 8 and 12, letters with digits, a symbol. */
function passwordScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[0-9]/.test(pw) && /[a-zA-Z؀-ۿ]/.test(pw)) s++;
  if (/[^a-zA-Z0-9؀-ۿ]/.test(pw)) s++;
  return pw.length < 8 ? 0 : s;
}

const STRENGTH = ['', 'bg-alert', 'bg-warning', 'bg-primary', 'bg-status-alighted'];
const STRENGTH_TEXT = [
  'text-muted',
  'text-alert',
  'text-warning',
  'text-primary',
  'text-status-alighted',
];

function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();
  const score = passwordScore(password);
  return (
    <>
      <div className="mt-1 flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn('h-1 flex-1 rounded-sm', i < score ? STRENGTH[score] : 'bg-border')}
          />
        ))}
      </div>
      <span
        aria-live="polite"
        className={cn('text-[12.5px] font-medium', password ? STRENGTH_TEXT[score] : 'text-muted')}
      >
        {password ? t(`onb.strength.${score}`) : t('auth.passwordHint')}
      </span>
    </>
  );
}

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = ROLES.find((c) => c.role === params.get('as'));
  const [form, setForm] = useState({ fullNameAr: '', email: '', phone: '', password: '' });
  const [org, setOrg] = useState({
    type: 'school' as 'school' | 'transport_company',
    nameAr: '',
  });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const register = useMutation({
    mutationFn: () =>
      api('/auth/register', {
        method: 'POST',
        body: {
          ...form,
          phone: form.phone.replace(/\D/g, ''),
          // Bahrain only (Claude Design "Tammeni Brand").
          country: 'BH',
          locale: i18n.language === 'en' ? 'en' : 'ar',
          signupRole: role?.role,
          ...(role?.role === 'organization'
            ? { organization: { type: org.type, nameAr: org.nameAr } }
            : {}),
        },
      }),
    onSuccess: () =>
      navigate(`/verify-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`),
  });

  if (!role) return <RolePicker onPick={(r) => setParams({ as: r })} />;

  // Checked here first so each field says what is wrong before anything is sent.
  const problems: Record<string, string> = {};
  if (form.fullNameAr.trim().length < 2) problems.fullNameAr = t('onb.err.name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) problems.email = t('onb.err.email');
  if (form.phone.replace(/\D/g, '').length !== 8) problems.phone = t('onb.err.phone');
  if (form.password.length < 8) problems.password = t('onb.err.password');
  if (role.role === 'organization' && org.nameAr.trim().length < 2)
    problems['organization.nameAr'] = t('onb.err.org');
  const server = fieldErrors(register.error);
  const err = (k: string) => (tried ? (problems[k] ?? server[k]) : server[k]) || undefined;
  const firstProblem = tried ? Object.values(problems)[0] : undefined;

  return (
    <Screen className="gap-3.5">
      <form
        noValidate
        className="flex flex-1 flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (Object.keys(problems).length === 0) register.mutate();
        }}
      >
        <BackBar
          onBack={() => setParams({})}
          title={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.25 text-[13px] font-semibold text-primary">
              <Icon name={role.icon} size={17} />
              {t(`signup.role.${role.role}`)}
            </span>
          }
          end={<Step n={2} />}
        />
        <h1 className="text-[27px] font-bold">{t('onb.yourDetails')}</h1>
        {role.role === 'organization' && (
          <>
            <Segmented
              label={t('admin.orgType')}
              value={org.type}
              onChange={(type) => setOrg({ ...org, type })}
              options={[
                { value: 'school', label: t('orgType.school') },
                { value: 'transport_company', label: t('orgType.transport_company') },
              ]}
            />
            <FieldLabel label={t('onb.orgName')} error={err('organization.nameAr')}>
              <input
                value={org.nameAr}
                onChange={(e) => setOrg({ ...org, nameAr: e.target.value })}
                aria-invalid={!!err('organization.nameAr') || undefined}
                className={inputClass}
              />
            </FieldLabel>
          </>
        )}
        <FieldLabel
          label={role.role === 'organization' ? t('signup.managerName') : t('auth.fullName')}
          error={err('fullNameAr')}
        >
          <input
            autoComplete="name"
            value={form.fullNameAr}
            onChange={(e) => set('fullNameAr')(e.target.value)}
            aria-invalid={!!err('fullNameAr') || undefined}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label={t('auth.email')} error={err('email')}>
          <input
            type="email"
            dir="ltr"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            placeholder="name@example.com"
            aria-invalid={!!err('email') || undefined}
            className={cn(inputClass, 'text-end')}
          />
        </FieldLabel>
        <FieldLabel
          label={t('auth.phone')}
          error={err('phone')}
          hint={role.role === 'independent_driver' ? t('onb.phoneHintDriver') : t('onb.phoneHint')}
        >
          <PhoneInput value={form.phone} onChange={set('phone')} invalid={!!err('phone')} />
        </FieldLabel>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {t('auth.password')}
          <input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password')(e.target.value)}
            aria-invalid={!!err('password') || undefined}
            className={inputClass}
          />
          <PasswordStrength password={form.password} />
          {err('password') && tried && problems.password === undefined && (
            <span className="text-[12.5px] font-semibold text-alert">{err('password')}</span>
          )}
        </label>
        {role.role === 'staff_driver' && (
          <p className="text-[13.5px] text-muted">{t('signup.staffDriverNote')}</p>
        )}
        {firstProblem && <ErrorLine>{firstProblem}</ErrorLine>}
        {register.error && !Object.keys(server).length && (
          <ErrorLine>{errorMessage(register.error)}</ErrorLine>
        )}
        <div className="flex-1" />
        <button
          type="submit"
          disabled={register.isPending}
          className={cn(bigButton, 'bg-primary text-primary-foreground')}
        >
          {t('onb.createAccountButton')}
        </button>
        <p className="text-center text-[12.5px] leading-relaxed text-muted">{t('onb.terms')}</p>
      </form>
    </Screen>
  );
}

const RESEND_SECONDS = 60;

/** Six boxes over one real input, so paste and SMS-style autofill still work. */
function CodeBoxes({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative mt-1.5" dir="ltr">
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              'flex h-15 items-center justify-center rounded-[14px] bg-surface font-figures text-[26px] font-bold',
              invalid
                ? 'border-[1.5px] border-alert'
                : i === value.length
                  ? 'border-2 border-primary'
                  : value[i]
                    ? 'border-[1.5px] border-foreground'
                    : 'border border-border',
            )}
          >
            {value[i] ?? ''}
          </div>
        ))}
      </div>
      <input
        aria-label={t('auth.code')}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="absolute inset-0 w-full cursor-text text-base opacity-0"
      />
    </div>
  );
}

function useCountdown(seconds: number) {
  const [until, setUntil] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return {
    left: Math.max(0, Math.ceil((until - now) / 1000)),
    restart: () => setUntil(Date.now() + seconds * 1000),
  };
}

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const timer = useCountdown(RESEND_SECONDS);
  const verify = useMutation({
    mutationFn: (c: string) =>
      api<Tokens>('/auth/verify-email', { method: 'POST', body: { email, code: c } }),
    onSuccess: async (tokens) => {
      await session.store(tokens);
      await qc.invalidateQueries({ queryKey: ['me'] });
      // Notifications are a safety requirement, so they come straight after sign-up.
      navigate('/notifications/setup?next=/ready&onboarding=1', { replace: true });
    },
  });
  const resend = useMutation({
    mutationFn: () =>
      api('/auth/resend-code', { method: 'POST', body: { email, purpose: 'verify_email' } }),
    onSuccess: () => {
      timer.restart();
      toast({ message: t('auth.codeResent'), tone: 'success' });
    },
    onError: (e) => toast({ message: errorMessage(e), tone: 'error' }),
  });
  const submitted = useRef('');
  const onCode = (v: string) => {
    setCode(v);
    // Checked as soon as the sixth digit is in (pasted or typed).
    if (v.length === 6 && submitted.current !== v && email) {
      submitted.current = v;
      verify.mutate(v);
    }
  };
  return (
    <Screen className="gap-3.5">
      <BackBar to="/register" end={<Step n={3} />} />
      <IconBadge icon="mark_email_unread" />
      <h1 className="text-[27px] font-bold">{t('onb.checkEmail')}</h1>
      {params.get('email') ? (
        <p className="text-[15.5px] leading-relaxed text-muted">
          {t('onb.codeSentTo')}{' '}
          <b dir="ltr" className="text-foreground">
            {email}
          </b>
          {t('onb.codeValid')}
        </p>
      ) : (
        <FieldLabel label={t('auth.email')}>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(inputClass, 'text-end')}
          />
        </FieldLabel>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) verify.mutate(code);
        }}
        className="flex flex-col gap-3.5"
      >
        <CodeBoxes value={code} onChange={onCode} invalid={!!verify.error} />
        {verify.error && <ErrorLine>{errorMessage(verify.error)}</ErrorLine>}
        <button
          type="submit"
          disabled={verify.isPending || code.length !== 6}
          className={cn(bigButton, 'bg-primary text-primary-foreground')}
        >
          {t('auth.verify')}
        </button>
      </form>
      <div className="text-sm text-muted">
        {t('onb.noCode')}{' '}
        <button
          type="button"
          disabled={timer.left > 0 || resend.isPending || !email}
          onClick={() => resend.mutate()}
          className={cn('font-semibold', timer.left > 0 ? 'text-muted' : 'text-primary')}
        >
          {timer.left > 0
            ? t('onb.resendIn', { time: `0:${String(timer.left).padStart(2, '0')}` })
            : t('auth.resendCode')}
        </button>
      </div>
    </Screen>
  );
}

function SimpleAuthScreen({
  title,
  back,
  children,
}: {
  title: string;
  back: string;
  children: ReactNode;
}) {
  return (
    <Screen className="gap-4">
      <BackBar to={back} />
      <h1 className="text-[27px] font-bold">{title}</h1>
      {children}
    </Screen>
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
    <SimpleAuthScreen title={t('auth.forgotPassword')} back="/login">
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <p className="text-[15px] text-muted">{t('onb.forgotIntro')}</p>
        <FieldLabel label={t('auth.email')}>
          <input
            type="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(inputClass, 'text-end')}
          />
        </FieldLabel>
        {send.error && <ErrorLine>{errorMessage(send.error)}</ErrorLine>}
        <div className="flex-1" />
        <button
          type="submit"
          disabled={send.isPending}
          className={cn(bigButton, 'bg-primary text-primary-foreground')}
        >
          {t('auth.sendCode')}
        </button>
      </form>
    </SimpleAuthScreen>
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
    <SimpleAuthScreen title={t('auth.resetPassword')} back="/forgot-password">
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          reset.mutate();
        }}
      >
        {!params.get('email') && (
          <FieldLabel label={t('auth.email')}>
            <input
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(inputClass, 'text-end')}
            />
          </FieldLabel>
        )}
        <CodeBoxes value={code} onChange={setCode} invalid={!!reset.error} />
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {t('auth.newPassword')}
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
          <PasswordStrength password={newPassword} />
        </label>
        {reset.error && <ErrorLine>{errorMessage(reset.error)}</ErrorLine>}
        <div className="flex-1" />
        <button
          type="submit"
          disabled={reset.isPending || code.length !== 6}
          className={cn(bigButton, 'bg-primary text-primary-foreground')}
        >
          {t('auth.resetPassword')}
        </button>
      </form>
    </SimpleAuthScreen>
  );
}

export function isUnverified(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'email_not_verified';
}

/** After sign-up and notifications: what to do next, by the kind of account (onboarding step 7). */
export function ReadyPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const [copied, setCopied] = useState(false);
  if (!me) return null;
  const role = me.signupRole;
  const first = me.fullNameAr.trim().split(/\s+/)[0] ?? '';
  const next: Record<SignupRole, { title: string; body: string; cta: string; to: string }> = {
    guardian: {
      title: t('onb.ready.guardianTitle', { name: first }),
      body: t('onb.ready.guardianBody'),
      cta: t('onb.ready.guardianCta'),
      to: '/children/new',
    },
    staff_driver: {
      title: t('onb.ready.title'),
      body: t('signup.waitingBody'),
      cta: t('onb.ready.driverCta'),
      to: '/',
    },
    independent_driver: {
      title: t('onb.ready.title'),
      body: t('onb.ready.independentBody'),
      cta: t('onb.ready.adminCta'),
      to: '/admin',
    },
    organization: {
      title: t('onb.ready.orgTitle'),
      body: t('onb.ready.orgBody'),
      cta: t('onb.ready.adminCta'),
      to: '/admin',
    },
  };
  const v = next[role];
  return (
    <Screen className="gap-4 pt-24">
      <IconBadge icon="check_circle" tone="ok" size={84} round fill />
      <h1 className="text-[28px] font-bold">{v.title}</h1>
      <p className="text-[16.5px] leading-relaxed text-muted">{v.body}</p>
      {role === 'staff_driver' && (
        <div className="flex items-center gap-2.5 rounded-[14px] border border-dashed border-primary bg-surface p-3.5">
          <span dir="ltr" className="flex-1 truncate text-base font-semibold">
            {me.email}
          </span>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard?.writeText(me.email).then(() => setCopied(true))
            }
            className="min-h-10 rounded-[10px] bg-primary-soft px-3.5 text-sm font-semibold text-primary"
          >
            {copied ? t('onb.ready.copied') : t('onb.ready.copy')}
          </button>
        </div>
      )}
      <div className="flex-1" />
      <Link to={v.to} replace className={cn(bigButton, 'bg-primary text-primary-foreground')}>
        {v.cta}
      </Link>
    </Screen>
  );
}
