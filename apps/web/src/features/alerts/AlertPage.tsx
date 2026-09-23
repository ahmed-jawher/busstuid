import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Icon } from '@/components/Icon';
import { BackBar, bigButton, ErrorLine, IconBadge, Pill, Screen } from '@/components/ui/kit';
import { Spinner } from '@/components/ui/layout';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { displayName, formatTime, orgName } from '@/lib/format';
import {
  AlertTimeline,
  ResolveButton,
  ResolveForm,
  useAlertHandling,
  type AlertDetail,
} from './AlertHandling';

interface GuardianAlert {
  id: string;
  type: string;
  severity: string;
  status: string;
  openedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  notifiedAt: string | null;
  resolutionReason: string | null;
  resolvedByRole: 'driver' | 'organization' | null;
  escalationLevel: number;
  student: { fullNameAr: string; fullNameEn: string | null };
  vehicle: { plateNumber: string };
  organization: { nameAr: string; nameEn: string | null };
  driver: { fullNameAr: string; fullNameEn: string | null; phoneE164: string } | null;
  emergencyNumber: string;
}

/**
 * /alert/:id deep link (PLAN §9.1). Crew and admins get the handling view; guardians get the
 * full-screen alert with a free `tel:` call and the emergency number, and are never asked to act.
 */
export function AlertPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const crew = useQuery({
    queryKey: ['alert', id],
    queryFn: () => api<AlertDetail>(`/alerts/${id}`),
    retry: false,
    refetchInterval: 15_000,
  });
  const notCrew = crew.error instanceof ApiError && crew.error.status === 404;
  const guardian = useQuery({
    queryKey: ['guardian-alert', id],
    queryFn: () => api<GuardianAlert>(`/me/alerts/${id}`),
    enabled: notCrew,
    refetchInterval: 15_000,
  });

  if (crew.isLoading || (notCrew && guardian.isLoading))
    return (
      <Screen>
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  if (crew.data) return <CrewAlert alert={crew.data} />;
  if (guardian.data) return <GuardianAlertView alert={guardian.data} />;
  return (
    <Screen>
      <BackBar />
      <ErrorLine>{errorMessage(guardian.error ?? crew.error)}</ErrorLine>
    </Screen>
  );
}

/** Full-screen alert for a guardian (Claude Design "Tammeni Guardian" → alert). */
function GuardianAlertView({ alert: a }: { alert: GuardianAlert }) {
  const { t } = useTranslation();
  const name = displayName(a.student);
  const first = name.trim().split(/\s+/)[0];
  const org = orgName(a.organization);

  if (a.status === 'resolved') {
    return (
      <Screen className="items-center gap-4 pt-24 text-center">
        <IconBadge icon="verified" tone="ok" size={88} round fill />
        <h1 className="mt-2 text-[27px] font-bold">{t('alert.resolvedTitle')}</h1>
        <p className="text-[17px] leading-relaxed">
          {t('alert.resolvedBody', { student: name })} · {formatTime(a.resolvedAt)}
        </p>
        {a.resolutionReason && (
          <div className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-start text-sm text-muted">
            {t('gd.alert.reason')}{' '}
            <b className="text-foreground">{t(`reason.${a.resolutionReason}`)}</b>
            {a.resolvedByRole && (
              <>
                <br />
                {t('gd.alert.closedBy')}{' '}
                {a.resolvedByRole === 'driver'
                  ? t('gd.alert.byDriver')
                  : t('gd.alert.byOrg', { org })}
              </>
            )}
          </div>
        )}
        <Link
          to="/guardian"
          className={cn(
            bigButton,
            'mt-2 min-h-13.5 rounded-[14px] bg-primary text-base text-primary-foreground',
          )}
        >
          {t('gd.backHome')}
        </Link>
      </Screen>
    );
  }

  const driverName = a.driver ? displayName(a.driver) : null;
  return (
    <Screen tone="alert" className="gap-4.5 pt-14">
      <Link
        to="/guardian"
        className="flex items-center gap-1 self-start rounded-full bg-white/15 py-2 ps-3 pe-3.5 text-sm font-semibold"
      >
        <Icon name="chevron_right" flip="ltr" size={20} />
        {t('gd.tabs.home')}
      </Link>
      <div className="mt-2 flex size-19 items-center justify-center rounded-full bg-white/20 animate-pulse-ring">
        <Icon name="warning" fill size={42} />
      </div>
      <div className="text-[15px] font-semibold opacity-90">
        {t('alert.urgent')} · {formatTime(a.openedAt)}
      </div>
      <h1 className="text-[29px] leading-snug font-bold">
        {t(`gd.alert.title.${a.type}`, { name: first, defaultValue: t('alert.urgent') })}
      </h1>
      <p className="text-[17px] leading-relaxed">
        {t(`alert.guardianBody.${a.type}`, {
          student: name,
          vehicle: a.vehicle.plateNumber,
          defaultValue: '',
        })}
      </p>
      <div className="flex flex-col gap-2.5 rounded-2xl bg-black/18 px-4 py-3.5">
        <div className="text-[13px] font-semibold opacity-85">{t('gd.alert.whoIsOnIt')}</div>
        {driverName && (
          <div className="flex items-center gap-2.5 text-[15px]">
            <Icon name="check_circle" fill size={20} />
            <span className="flex-1">{t('gd.alert.driver', { name: driverName })}</span>
            <span className="text-[13px] opacity-85">
              {a.notifiedAt ? t('gd.alert.notifiedAt', { time: formatTime(a.notifiedAt) }) : ''}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2.5 text-[15px]">
          <Icon name={a.acknowledgedAt ? 'check_circle' : 'schedule'} fill size={20} />
          <span className="flex-1">{t('gd.alert.org', { org })}</span>
          <span className="text-[13px] opacity-85">
            {a.acknowledgedAt ? t('gd.alert.following') : t('gd.alert.notified')}
          </span>
        </div>
      </div>
      {a.driver && (
        <a
          href={`tel:${a.driver.phoneE164}`}
          className="mt-1.5 flex min-h-15 items-center justify-center gap-2.5 rounded-2xl bg-white text-lg font-bold text-[#111833]"
        >
          <Icon name="call" fill size={24} />
          {t('alert.callDriver', { name: driverName })}
        </a>
      )}
      {a.driver && (
        <div className="-mt-2 text-center text-[13px] opacity-85">{t('alert.phoneUnverified')}</div>
      )}
      <a
        href={`tel:${a.emergencyNumber}`}
        className={cn(
          'flex min-h-15 items-center justify-center gap-2.5 rounded-2xl border-2 border-white text-lg font-bold',
          a.escalationLevel >= 2 && 'animate-pulse',
        )}
      >
        <Icon name="emergency" size={24} />
        {t('alert.callEmergency', { number: a.emergencyNumber })}
      </a>
      <p className="mt-1 text-center text-[15px] leading-relaxed opacity-95">
        {t('alert.noActionNeeded')}
      </p>
    </Screen>
  );
}

/** The trip's driver handling an alert from the deep link (admins use /admin/alerts/:id). */
function CrewAlert({ alert: a }: { alert: AlertDetail }) {
  const { t } = useTranslation();
  const h = useAlertHandling(a, [['alert', a.id]]);
  const statusTone = { open: 'alert', acknowledged: 'warning', resolved: 'ok' } as const;
  return (
    <div className="flex min-h-dvh flex-col">
      <Screen className="gap-3.5">
        <BackBar title={t(`alertType.${a.type}`)} />
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={a.severity === 'critical' ? 'alertSolid' : 'warning'}>
            {t(`severity.${a.severity}`)}
          </Pill>
          <Pill tone={statusTone[a.status]}>{t(`alertStatus.${a.status}`)}</Pill>
          <span className="text-[13px] text-muted">
            {a.trip.route?.name} · <span dir="ltr">{a.trip.vehicle.plateNumber}</span> ·{' '}
            {formatTime(a.openedAt)}
          </span>
        </div>
        {a.resolutionReason && (
          <p className="rounded-[14px] bg-ok-soft px-3.5 py-3 text-sm font-semibold text-status-alighted">
            {t(`reason.${a.resolutionReason}`)}
          </p>
        )}
        <AlertTimeline alert={a} />
        <ResolveForm h={h} />
      </Screen>
      {h.open && (
        <div
          data-tabbar="footer"
          className="sticky bottom-0 border-t border-border bg-background px-4 pt-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-lg">
            <ResolveButton h={h} />
          </div>
        </div>
      )}
    </div>
  );
}
