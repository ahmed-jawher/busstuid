import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { Icon } from '@/components/Icon';
import { BackBar, bigButton, ErrorLine, IconBadge, Screen } from '@/components/ui/kit';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { platform } from '@/platform';

interface Subscription {
  id: string;
  lastTestOkAt: string | null;
  failedCount: number;
}

export function usePushSubscriptions() {
  return useQuery({
    queryKey: ['push-subscriptions'],
    queryFn: () => api<Subscription[]>('/push/subscriptions'),
  });
}

/** True when this account has at least one device that passed the test notification. */
export function usePushReady(): boolean | undefined {
  const subs = usePushSubscriptions();
  return subs.data?.some((s) => s.lastTestOkAt !== null);
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * One explanatory screen, then permission, subscription and a test notification (PLAN §5 step 2,
 * §7). Drivers cannot start a trip until the test has succeeded. Styled after Claude Design
 * "Tammeni Onboarding" (step after the email code).
 */
export function NotificationSetupPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const onboarding = params.get('onboarding') === '1';
  const ready = usePushReady();

  const enable = useMutation({
    mutationFn: async () => {
      const { publicKey } = await api<{ publicKey: string }>('/push/vapid-public-key');
      const reg = await platform.push.subscribe(publicKey);
      const userAgent = navigator.userAgent.slice(0, 300);
      const sub = await api<{ id: string }>('/push/subscriptions', {
        method: 'POST',
        body:
          reg.provider === 'webpush'
            ? {
                provider: 'webpush',
                platform: 'web',
                endpoint: reg.endpoint,
                keys: { p256dh: reg.p256dh, auth: reg.auth },
                userAgent,
              }
            : { provider: reg.provider, platform: reg.platform, token: reg.nativeToken, userAgent },
      });
      await api(`/push/subscriptions/${sub.id}/test`, { method: 'POST' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['push-subscriptions'] }),
  });

  // Inside the Android/iOS app there is nothing to install.
  const needsInstall = platform.kind === 'web' && isIos() && !isStandalone();
  const unsupported = !platform.push.isSupported();
  const denied = enable.error instanceof Error && enable.error.message === 'push-permission-denied';
  const working = ready || enable.isSuccess;

  return (
    <Screen className={onboarding ? 'gap-4 pt-16' : 'gap-4'}>
      {!onboarding && <BackBar />}
      <IconBadge icon="notifications_active" tone="warning" size={76} fill />
      <h1 className="text-[27px] font-bold">{t('push.title')}</h1>
      <p className="text-[16.5px] leading-relaxed">{t('push.why')}</p>
      <div className="flex gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm leading-relaxed text-muted">
        <Icon name="battery_alert" className="text-primary" />
        {t('push.limits')}
      </div>

      {needsInstall && (
        <div className="rounded-[14px] bg-primary-soft px-3.5 py-3 text-sm leading-relaxed">
          <p className="mb-2 font-semibold">{t('push.iosInstallTitle')}</p>
          <ol className="list-decimal space-y-1 ps-5">
            <li>{t('push.iosStep1')}</li>
            <li>{t('push.iosStep2')}</li>
            <li>{t('push.iosStep3')}</li>
          </ol>
        </div>
      )}
      {!needsInstall && unsupported && (
        <div
          role="alert"
          className="rounded-[14px] bg-alert-soft px-3.5 py-3 text-sm font-semibold text-alert"
        >
          {t('push.unsupported')}
        </div>
      )}
      {denied && (
        <div
          role="alert"
          className="rounded-[14px] bg-alert-soft px-3.5 py-3 text-sm leading-relaxed font-semibold text-alert"
        >
          {t('push.denied')}
        </div>
      )}
      {enable.error && !denied && <ErrorLine>{errorMessage(enable.error)}</ErrorLine>}
      {working && (
        <div className="flex items-center gap-2 rounded-[14px] bg-ok-soft px-3.5 py-3 text-[15px] font-bold text-status-alighted">
          <Icon name="check_circle" fill />
          {enable.isSuccess ? t('push.testSent') : t('push.ready')}
        </div>
      )}
      <div className="flex-1" />
      {!needsInstall && !unsupported && (!working || !next) && (
        <button
          type="button"
          disabled={enable.isPending}
          onClick={() => enable.mutate()}
          className={cn(
            bigButton,
            working
              ? 'border-[1.5px] border-border bg-surface'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {working ? t('push.sendTestAgain') : denied ? t('push.tryAgain') : t('push.enable')}
        </button>
      )}
      {next && (working || needsInstall || unsupported) && (
        <button
          type="button"
          onClick={() => navigate(next, { replace: true })}
          className={cn(bigButton, 'bg-primary text-primary-foreground')}
        >
          {t('common.continue')}
        </button>
      )}
      {next && onboarding && !working && (
        <button
          type="button"
          onClick={() => navigate(next, { replace: true })}
          className="min-h-11 text-sm font-semibold text-muted"
        >
          {t('push.later')}
        </button>
      )}
    </Screen>
  );
}
