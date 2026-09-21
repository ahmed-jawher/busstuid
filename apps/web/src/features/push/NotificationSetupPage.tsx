import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, Notice, PageHeader } from '@/components/ui/layout';
import { api } from '@/lib/api';
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
 * §7). Drivers cannot start a trip until the test has succeeded.
 */
export function NotificationSetupPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const ready = usePushReady();

  const enable = useMutation({
    mutationFn: async () => {
      const { publicKey } = await api<{ publicKey: string }>('/push/vapid-public-key');
      const reg = await platform.push.subscribe(publicKey);
      if (reg.provider !== 'webpush') throw new Error('unsupported');
      const sub = await api<{ id: string }>('/push/subscriptions', {
        method: 'POST',
        body: {
          provider: 'webpush',
          platform: 'web',
          endpoint: reg.endpoint,
          keys: { p256dh: reg.p256dh, auth: reg.auth },
          userAgent: navigator.userAgent.slice(0, 300),
        },
      });
      await api(`/push/subscriptions/${sub.id}/test`, { method: 'POST' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['push-subscriptions'] }),
  });

  const needsInstall = isIos() && !isStandalone();
  const unsupported = !platform.push.isSupported();
  const denied = enable.error instanceof Error && enable.error.message === 'push-permission-denied';

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t('push.title')} />
      <Card className="space-y-4">
        <p>{t('push.why')}</p>
        <Notice tone="warning">{t('push.limits')}</Notice>

        {needsInstall ? (
          <Notice tone="info">
            <p className="mb-2 font-semibold">{t('push.iosInstallTitle')}</p>
            <ol className="list-decimal space-y-1 ps-5">
              <li>{t('push.iosStep1')}</li>
              <li>{t('push.iosStep2')}</li>
              <li>{t('push.iosStep3')}</li>
            </ol>
          </Notice>
        ) : unsupported ? (
          <Notice tone="danger">{t('push.unsupported')}</Notice>
        ) : ready ? (
          <Notice tone="success">{t('push.ready')}</Notice>
        ) : null}

        {denied && <Notice tone="danger">{t('push.denied')}</Notice>}
        {enable.error && !denied && <Notice tone="danger">{errorMessage(enable.error)}</Notice>}
        {enable.isSuccess && <Notice tone="success">{t('push.testSent')}</Notice>}

        {!needsInstall && !unsupported && (
          <Button
            size="touch"
            className="w-full"
            disabled={enable.isPending}
            onClick={() => enable.mutate()}
          >
            {ready ? t('push.sendTestAgain') : t('push.enable')}
          </Button>
        )}
        {next && ready && (
          <Button variant="outline" size="touch" className="w-full" onClick={() => navigate(next)}>
            {t('common.continue')}
          </Button>
        )}
      </Card>
    </div>
  );
}
