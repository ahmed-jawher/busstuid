import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { setAppearance, useAppearance } from '@/app/preferences';
import { Icon, type IconName } from '@/components/Icon';
import { ErrorLine, Pill, type Tone } from '@/components/ui/kit';
import { EmptyState, Spinner } from '@/components/ui/layout';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { displayName, formatDate, formatTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { DriverTrip } from '@/lib/types';
import { firstName, greeting } from '../guardian/guardian-data';
import { usePushReady } from '../push/NotificationSetupPage';

/**
 * Driver home (Claude Design "Tammeni Driver"): one card per trip with one big action — start,
 * continue, or see the summary. High contrast and 64px buttons for use in the vehicle.
 */
export function DriverTodayPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pushReady = usePushReady();
  const { theme, scheme } = useAppearance();
  const trips = useQuery({
    queryKey: ['driver-today'],
    queryFn: () => api<DriverTrip[]>('/driver/today'),
    refetchInterval: 60_000,
  });
  const start = useMutation({
    mutationFn: (id: string) => api(`/trips/${id}/start`, { method: 'POST' }),
    onSuccess: async (_, id) => {
      await qc.invalidateQueries({ queryKey: ['driver-today'] });
      navigate(`/trip/${id}`);
    },
    onError: (e, id) => {
      if (e instanceof ApiError && e.code === 'push_not_enabled')
        navigate(`/notifications/setup?next=${encodeURIComponent(`/trip/${id}`)}`);
    },
  });
  const list = trips.data ?? [];
  const active = list.find((x) => x.status === 'in_progress' || x.status === 'overdue');
  const nextId = active ? null : list.find((x) => x.status === 'scheduled')?.id;
  const name = me ? displayName(me) : '';

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header
        className="bg-navy text-white"
        style={{ paddingTop: 'max(1.25rem, calc(env(safe-area-inset-top) + 0.75rem))' }}
      >
        <div className="mx-auto flex max-w-lg flex-col gap-4 px-4.5 pb-5.5">
          <div className="flex items-center gap-3">
            <Link
              to="/account"
              aria-label={t('gd.tabs.account')}
              className="flex size-11.5 items-center justify-center rounded-full bg-white/14 text-[19px] font-bold"
            >
              {name.trim()[0]}
            </Link>
            <div className="flex-1">
              <div className="text-sm opacity-80">{greeting(t)}</div>
              <div className="text-[21px] font-bold">{firstName(name)}</div>
            </div>
            <button
              type="button"
              aria-label={t('admin.darkMode')}
              aria-pressed={scheme === 'dark'}
              onClick={() => setAppearance(theme, scheme === 'dark' ? 'light' : 'dark')}
              className="flex size-12 items-center justify-center rounded-full bg-white/14"
            >
              <Icon name={scheme === 'dark' ? 'light_mode' : 'dark_mode'} size={24} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {pushReady === false ? (
              <Link
                to="/notifications/setup?next=/driver"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#F59E0B] px-3 py-1.5 text-[13px] font-semibold text-[#1A1200]"
              >
                <Icon name="notifications_off" size={18} />
                {t('drv.pushOff')}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-semibold">
                <Icon name="notifications_active" fill size={18} className="text-[#7EE2A0]" />
                {t('drv.pushOn')}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-semibold">
              <Icon name="calendar_today" size={18} />
              {formatDate(new Date().toISOString())}
            </span>
          </div>
        </div>
      </header>

      <main
        className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-4 pt-5"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <h1 className="text-[22px] font-bold">{t('driver.today')}</h1>
        {pushReady === false && (
          <p className="text-sm font-semibold text-warning">{t('driver.pushRequired')}</p>
        )}
        {trips.isLoading && <Spinner label={t('common.loading')} />}
        {trips.error && <ErrorLine>{errorMessage(trips.error)}</ErrorLine>}
        {start.error &&
          !(start.error instanceof ApiError && start.error.code === 'push_not_enabled') && (
            <ErrorLine>{errorMessage(start.error)}</ErrorLine>
          )}
        {list.length === 0 && !trips.isLoading && <EmptyState>{t('driver.noTrips')}</EmptyState>}
        {list.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            isNext={trip.id === nextId}
            starting={start.isPending && start.variables === trip.id}
            onStart={() => start.mutate(trip.id)}
          />
        ))}
      </main>
    </div>
  );
}

function TripCard({
  trip,
  isNext,
  starting,
  onStart,
}: {
  trip: DriverTrip;
  isNext: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const c = trip.counts;
  const total = c.onboard + c.alighted + c.waiting + c.absent + c.missing;
  const active = trip.status === 'in_progress' || trip.status === 'overdue';
  const done = trip.status === 'completed' || trip.status === 'completed_with_alert';
  const pill: [string, Tone] = active
    ? [t(`tripStatus.${trip.status}`), trip.status === 'overdue' ? 'warning' : 'ok']
    : done
      ? [
          t(`tripStatus.${trip.status}`),
          trip.status === 'completed_with_alert' ? 'alert' : 'neutral',
        ]
      : isNext
        ? [t('drv.next'), 'primary']
        : [t('tripStatus.scheduled'), 'neutral'];
  const button = (icon: IconName, label: string) => (
    <>
      <Icon name={icon} fill size={28} />
      {label}
    </>
  );
  const base =
    'flex min-h-16 items-center justify-center gap-2.5 rounded-2xl text-xl font-bold disabled:opacity-60';
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-[22px] bg-surface p-4.5',
        active || isNext ? 'border-2 border-primary' : 'border border-border',
      )}
    >
      <div className="flex items-center gap-2">
        <Pill tone={pill[1]} className="px-3 text-[13px]">
          {pill[0]}
        </Pill>
        <span className="flex-1" />
        <span className="text-[15px] font-bold" dir="ltr">
          {formatTime(trip.plannedStartAt)} – {formatTime(trip.plannedEndAt)}
        </span>
      </div>
      <div>
        <h2 className="text-[22px] leading-tight font-bold">
          {trip.route?.name ?? trip.vehicle.plateNumber} · {t(`direction.${trip.direction}`)}
        </h2>
        <p className="mt-1 text-[15px] text-muted">
          {active
            ? t('drv.counts', {
                onboard: c.onboard,
                done: c.alighted + c.absent,
                waiting: c.waiting,
              })
            : t('drv.meta', { plate: trip.vehicle.plateNumber, count: total })}
        </p>
      </div>
      {active ? (
        <Link to={`/trip/${trip.id}`} className={cn(base, 'bg-primary text-primary-foreground')}>
          {button('arrow_back', t('drv.continue'))}
        </Link>
      ) : done ? (
        <Link
          to={`/trip/${trip.id}`}
          className={cn(base, 'border-2 border-border bg-transparent text-foreground')}
        >
          {button('summarize', t('drv.summary'))}
        </Link>
      ) : isNext ? (
        <button
          type="button"
          disabled={starting}
          onClick={onStart}
          className={cn(base, 'bg-primary text-primary-foreground')}
        >
          {button('play_arrow', t('driver.startTrip'))}
        </button>
      ) : (
        <Link to={`/trip/${trip.id}`} className={cn(base, 'bg-surface-2 text-muted')}>
          {button('schedule', t('drv.startsAt', { time: formatTime(trip.plannedStartAt) }))}
        </Link>
      )}
    </article>
  );
}
