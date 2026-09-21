import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui/layout';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatTime, orgName } from '@/lib/format';
import type { DriverTrip } from '@/lib/types';
import { usePushReady } from '../push/NotificationSetupPage';

export function DriverTodayPage() {
  const { t } = useTranslation();
  const pushReady = usePushReady();
  const trips = useQuery({
    queryKey: ['driver-today'],
    queryFn: () => api<DriverTrip[]>('/driver/today'),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t('driver.today')} />
      {pushReady === false && (
        <Notice tone="warning">
          {t('driver.pushRequired')}{' '}
          <Link to="/notifications/setup?next=/driver" className="font-bold underline">
            {t('push.enable')}
          </Link>
        </Notice>
      )}
      {trips.isLoading && <Spinner label={t('common.loading')} />}
      {trips.error && <Notice tone="danger">{errorMessage(trips.error)}</Notice>}
      {trips.data?.length === 0 && <EmptyState>{t('driver.noTrips')}</EmptyState>}
      <ul className="space-y-3">
        {trips.data?.map((trip) => (
          <li key={trip.id}>
            <Link to={`/trip/${trip.id}`} className="block">
              <Card
                className={
                  trip.status === 'in_progress' || trip.status === 'overdue'
                    ? 'border-2 border-primary'
                    : ''
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold">
                    {trip.route?.name ?? trip.vehicle.plateNumber}
                  </h2>
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-sm font-semibold">
                    {t(`tripStatus.${trip.status}`)}
                  </span>
                </div>
                <p className="text-muted">
                  {t(`direction.${trip.direction}`)} · {trip.vehicle.plateNumber} ·{' '}
                  {formatTime(trip.plannedStartAt)}–{formatTime(trip.plannedEndAt)}
                </p>
                <p className="text-sm text-muted">{orgName(trip.organization)}</p>
                <p className="mt-2 font-semibold">
                  {t('driver.counter', {
                    onboard: trip.counts.onboard,
                    done: trip.counts.alighted + trip.counts.absent,
                    waiting: trip.counts.waiting,
                  })}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
