import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { checkTripEnd, isTripActive, UNDO_WINDOW_MS, type TripStudentStatus } from '@wusool/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/form';
import { Notice, PageHeader, Spinner } from '@/components/ui/layout';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { displayName, formatTime } from '@/lib/format';
import type { Manifest, ManifestStudent } from '@/lib/types';
import { platform } from '@/platform';
import { enqueueTap, flushTrip, pendingFor } from './trip-sync';

type TapType = 'board' | 'alight' | 'absent';
const NEXT: Record<TapType, TripStudentStatus> = {
  board: 'boarded',
  alight: 'alighted',
  absent: 'absent',
};
const ORDER: Record<TripStudentStatus, number> = {
  expected: 0,
  boarded: 1,
  missing: 1,
  alighted: 2,
  absent: 2,
  resolved: 2,
};
const HEARTBEAT_MS = 2 * 60_000;
const SYNC_MS = 5_000;
const REMINDER_ID = 'onboard-reminder';

interface Override {
  status: TripStudentStatus;
  prev: TripStudentStatus;
  clientEventId: string;
  at: number;
}

/** A tap's position, captured only at that moment and never waited on for long (PLAN §14). */
async function tapLocation() {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 1500));
  return Promise.race([platform.geolocation.current({ timeoutMs: 1500 }), timeout]);
}

export function TripPage() {
  const { id: tripId = '' } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [, forceTick] = useState(0);
  const sentAt = useRef(0);

  const manifest = useQuery({
    queryKey: ['manifest', tripId],
    queryFn: () => api<Manifest>(`/trips/${tripId}/manifest`),
    refetchInterval: 30_000,
  });
  const trip = manifest.data;
  const active = trip ? isTripActive(trip.status) : false;

  // ── Sync ──
  const sync = useCallback(async () => {
    try {
      const out = await flushTrip(tripId);
      setOnline(!out.offline);
      if (out.rejected.length > 0) {
        toast({ message: t('driver.tapRejected'), tone: 'error' });
        setOverrides({});
      }
      if (out.sent > 0) {
        sentAt.current = Date.now();
        await qc.invalidateQueries({ queryKey: ['manifest', tripId] });
      }
    } finally {
      setPending((await pendingFor(tripId)).length);
    }
  }, [tripId, qc, t, toast]);

  useEffect(() => {
    void pendingFor(tripId).then((p) => setPending(p.length));
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = setInterval(() => void sync(), SYNC_MS);
    const tick = setInterval(() => forceTick((n) => n + 1), 5_000); // undo windows expire
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [tripId, sync]);

  // Once fresh server state (fetched after the last send) includes every tap, drop overrides.
  useEffect(() => {
    if (pending === 0 && sentAt.current > 0 && manifest.dataUpdatedAt > sentAt.current)
      setOverrides({});
  }, [manifest.dataUpdatedAt, pending]);

  const students = useMemo(() => {
    const list = (trip?.students ?? []).map((s) => ({
      ...s,
      status: overrides[s.studentId]?.status ?? s.status,
    }));
    return list.sort(
      (a, b) =>
        ORDER[a.status] - ORDER[b.status] || (a.stopSequence ?? 999) - (b.stopSequence ?? 999),
    );
  }, [trip, overrides]);
  const counts = useMemo(() => {
    const c = { onboard: 0, done: 0, waiting: 0 };
    for (const s of students) {
      if (s.status === 'boarded') c.onboard++;
      else if (s.status === 'expected') c.waiting++;
      else c.done++;
    }
    return c;
  }, [students]);

  // ── Device: keep awake, heartbeat, background reminder (PLAN §6.4, §9.1) ──
  const onboardRef = useRef(0);
  onboardRef.current = counts.onboard;
  useEffect(() => {
    if (!active) return;
    void platform.keepAwake.enable();
    const beat = (state: 'foreground' | 'app_backgrounded') =>
      api(`/trips/${tripId}/heartbeat`, { method: 'POST', body: { state } }).catch(() => undefined);
    const timer = setInterval(() => void beat('foreground'), HEARTBEAT_MS);
    const offPause = platform.appLifecycle.onPause(() => {
      void beat('app_backgrounded');
      if (onboardRef.current > 0) {
        void platform.localNotifications.schedule({
          id: REMINDER_ID,
          title: t('driver.reminderTitle'),
          body: t('driver.reminderBody', { count: onboardRef.current }),
          url: `/trip/${tripId}`,
          everyMinutes: 5,
        });
      }
    });
    const offResume = platform.appLifecycle.onResume(() => {
      void platform.localNotifications.cancel(REMINDER_ID);
      void beat('foreground');
      void sync();
    });
    return () => {
      clearInterval(timer);
      offPause();
      offResume();
      void platform.keepAwake.disable();
      void platform.localNotifications.cancel(REMINDER_ID);
    };
  }, [active, tripId, t, sync]);

  // ── Taps ──
  const record = useCallback(
    async (
      s: ManifestStudent & { status: TripStudentStatus },
      type: TapType | 'undo',
      undo?: Override,
    ) => {
      const clientEventId = crypto.randomUUID();
      const now = Date.now();
      // The screen reacts instantly; the location lookup happens after.
      if (type === 'undo' && undo) {
        setOverrides((o) => ({
          ...o,
          [s.studentId]: { status: undo.prev, prev: undo.status, clientEventId, at: 0 },
        }));
      } else if (type !== 'undo') {
        const next = NEXT[type];
        const override: Override = { status: next, prev: s.status, clientEventId, at: now };
        setOverrides((o) => ({ ...o, [s.studentId]: override }));
        platform.haptics.success();
        toast({
          message: t(`driver.recorded.${type}`, { name: displayName(s) }),
          duration: UNDO_WINDOW_MS,
          action: {
            label: t('driver.undo'),
            run: () => void record({ ...s, status: next }, 'undo', override),
          },
        });
      }
      const location = await tapLocation();
      await enqueueTap(tripId, {
        clientEventId,
        studentId: s.studentId,
        type,
        clientRecordedAt: new Date(now).toISOString(),
        ...(type === 'undo' && undo ? { undoesClientEventId: undo.clientEventId } : {}),
        ...(location
          ? { lat: location.lat, lng: location.lng, accuracyM: location.accuracyM }
          : {}),
      });
      setPending((p) => p + 1);
      void sync();
    },
    [tripId, t, toast, sync],
  );

  // ── Start / end ──
  const start = useMutation({
    mutationFn: () => api(`/trips/${tripId}/start`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manifest', tripId] }),
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'push_not_enabled') {
        navigate(`/notifications/setup?next=${encodeURIComponent(`/trip/${tripId}`)}`);
      }
    },
  });

  if (manifest.isLoading) return <Spinner label={t('common.loading')} />;
  if (manifest.error || !trip) return <Notice tone="danger">{errorMessage(manifest.error)}</Notice>;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        back={{ to: '/driver', label: t('driver.today') }}
        title={trip.route?.name ?? trip.vehicle.plateNumber}
        subtitle={`${trip.vehicle.plateNumber} · ${formatTime(trip.plannedStartAt)}–${formatTime(trip.plannedEndAt)}`}
      />

      <div
        className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur"
        aria-live="polite"
      >
        <p className="text-lg font-bold">
          {t('driver.counter', {
            onboard: counts.onboard,
            done: counts.done,
            waiting: counts.waiting,
          })}
        </p>
        <span
          className={`text-sm font-semibold ${pending > 0 ? 'text-warning' : 'text-status-alighted'}`}
        >
          {pending > 0
            ? `⏳ ${t('driver.pendingSync', { count: pending })}`
            : `✓ ${t('driver.synced')}`}
          {!online && ` · ${t('driver.offline')}`}
        </span>
      </div>

      {trip.status === 'scheduled' && (
        <div className="space-y-2">
          {start.error &&
            !(start.error instanceof ApiError && start.error.code === 'push_not_enabled') && (
              <Notice tone="danger">{errorMessage(start.error)}</Notice>
            )}
          <Button
            size="touch"
            className="w-full text-xl"
            disabled={start.isPending}
            onClick={() => start.mutate()}
          >
            {t('driver.startTrip')}
          </Button>
        </div>
      )}
      {!active && trip.status !== 'scheduled' && (
        <Notice tone="info">{t(`tripStatus.${trip.status}`)}</Notice>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {students.map((s) => {
          const o = overrides[s.studentId];
          const canUndo = o && o.at > 0 && Date.now() - o.at < UNDO_WINDOW_MS;
          return (
            <li key={s.studentId}>
              <StudentCard
                student={s}
                disabled={!active}
                onTap={(type) => void record(s, type)}
                onUndo={canUndo ? () => void record(s, 'undo', o) : undefined}
              />
            </li>
          );
        })}
      </ul>

      {active && (
        <div className="space-y-3">
          <AddStudent
            tripId={tripId}
            onAdded={() => qc.invalidateQueries({ queryKey: ['manifest', tripId] })}
          />
          <EndTrip
            tripId={tripId}
            students={students}
            pending={pending}
            sync={sync}
            onTap={(s, type) => void record(s, type)}
            onEnded={() => qc.invalidateQueries({ queryKey: ['manifest', tripId] })}
          />
        </div>
      )}
    </div>
  );
}

function Photo({
  s,
  size = 'lg',
}: {
  s: { photoUrl: string | null; fullNameAr: string };
  size?: 'lg' | 'sm';
}) {
  const [failed, setFailed] = useState(false);
  const cls = size === 'lg' ? 'size-20 text-3xl' : 'size-12 text-xl';
  if (!s.photoUrl || failed) {
    return (
      <div
        className={`${cls} flex shrink-0 items-center justify-center rounded-md bg-border font-bold`}
        aria-hidden="true"
      >
        {s.fullNameAr.slice(0, 1)}
      </div>
    );
  }
  return (
    <img
      src={s.photoUrl}
      alt=""
      className={`${cls} shrink-0 rounded-md object-cover`}
      onError={() => setFailed(true)}
    />
  );
}

function StudentCard({
  student: s,
  disabled,
  onTap,
  onUndo,
}: {
  student: ManifestStudent & { status: TripStudentStatus };
  disabled: boolean;
  onTap: (type: TapType) => void;
  onUndo?: () => void;
}) {
  const { t } = useTranslation();
  const border = {
    expected: 'border-status-expected',
    boarded: 'border-status-boarded border-2',
    alighted: 'border-status-alighted',
    absent: 'border-status-absent opacity-70',
    missing: 'border-alert border-2',
    resolved: 'border-status-alighted',
  }[s.status];
  return (
    <article
      className={`flex h-full flex-col gap-3 rounded-lg border bg-surface p-3 ${border}`}
      aria-label={displayName(s)}
    >
      <div className="flex items-center gap-3">
        <Photo s={s} />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-xl font-bold">{displayName(s)}</h2>
          <p className="truncate text-sm text-muted">
            {s.stop?.name ?? t('driver.noStop')}
            {s.isUnexpected && ` · ${t('driver.unexpected')}`}
          </p>
          <StatusBadge status={s.status} />
        </div>
      </div>
      <div className="mt-auto flex gap-2">
        {s.status === 'expected' && (
          <>
            <Button
              size="touch"
              className="flex-1 bg-status-boarded text-white"
              disabled={disabled}
              onClick={() => onTap('board')}
            >
              {t('driver.board')}
            </Button>
            <Button
              size="touch"
              variant="outline"
              className="flex-1"
              disabled={disabled}
              onClick={() => onTap('absent')}
            >
              {t('driver.absent')}
            </Button>
          </>
        )}
        {s.status === 'boarded' && (
          <Button
            size="touch"
            className="flex-1 bg-status-alighted text-white"
            disabled={disabled}
            onClick={() => onTap('alight')}
          >
            {t('driver.alight')}
          </Button>
        )}
        {(s.status === 'alighted' || s.status === 'absent') && onUndo && (
          <Button
            size="touch"
            variant="outline"
            className="flex-1"
            disabled={disabled}
            onClick={onUndo}
          >
            {t('driver.undo')}
          </Button>
        )}
      </div>
    </article>
  );
}

function AddStudent({ tripId, onAdded }: { tripId: string; onAdded: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const candidates = useQuery({
    queryKey: ['candidates', tripId, q],
    queryFn: () =>
      api<(ManifestStudent & { id: string })[]>(
        `/trips/${tripId}/candidates?q=${encodeURIComponent(q)}`,
      ),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: (studentId: string) =>
      api(`/trips/${tripId}/students`, { method: 'POST', body: { studentId } }),
    onSuccess: () => {
      setOpen(false);
      onAdded();
    },
  });
  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        {t('driver.addStudent')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('driver.addStudent')}>
        <TextField
          label={t('driver.searchByName')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {(candidates.data ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex min-h-touch w-full items-center gap-3 rounded-md border border-border p-2 text-start"
                onClick={() => add.mutate(c.id)}
              >
                <Photo s={c} size="sm" />
                <span className="font-semibold">{displayName(c)}</span>
              </button>
            </li>
          ))}
        </ul>
        {add.error && <Notice tone="danger">{errorMessage(add.error)}</Notice>}
        <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </Dialog>
    </>
  );
}

type Row = ManifestStudent & { status: TripStudentStatus };

/**
 * PLAN §6.3: a child on board blocks the normal end (red screen + local alarm); children never
 * marked must each be decided; then one final "vehicle is empty" confirmation. A forced end is
 * possible but red, double-confirmed and needs a reason.
 */
function EndTrip({
  tripId,
  students,
  pending,
  sync,
  onTap,
  onEnded,
}: {
  tripId: string;
  students: Row[];
  pending: number;
  sync: () => Promise<void>;
  onTap: (s: Row, type: TapType) => void;
  onEnded: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'idle' | 'check' | 'confirm' | 'force'>('idle');
  const [reason, setReason] = useState('');
  const check = checkTripEnd(students);
  const onboard = students.filter((s) => check.onboard.includes(s.studentId));
  const unresolved = students.filter((s) => check.unresolved.includes(s.studentId));

  // The local alarm sounds while the red screen shows a child still on board (PLAN §3.5).
  useEffect(() => {
    if (step === 'check' && onboard.length > 0) platform.alarm.start();
    else platform.alarm.stop();
    return () => platform.alarm.stop();
  }, [step, onboard.length]);

  useEffect(() => {
    if (step === 'check' && check.canEndNormally) setStep('confirm');
  }, [step, check.canEndNormally]);

  const end = useMutation({
    mutationFn: async (body: object) => {
      await sync();
      // The server decides with the full picture, so every queued tap must be delivered first.
      if (pending > 0 && (await pendingFor(tripId)).length > 0) {
        throw new ApiError(0, 'must_sync_first');
      }
      return api(`/trips/${tripId}/end`, { method: 'POST', body });
    },
    onSuccess: () => {
      setStep('idle');
      onEnded();
    },
    onError: (e) => {
      if (
        e instanceof ApiError &&
        (e.code === 'students_onboard' || e.code === 'students_unresolved')
      ) {
        setStep('check');
        onEnded();
      }
    },
  });

  return (
    <>
      <Button
        size="touch"
        variant="outline"
        className="w-full border-2 text-lg"
        onClick={() => setStep(check.canEndNormally ? 'confirm' : 'check')}
      >
        {t('driver.endTrip')}
      </Button>

      <Dialog
        open={step === 'check'}
        onClose={() => setStep('idle')}
        title={onboard.length > 0 ? t('driver.onboardTitle') : t('driver.unresolvedTitle')}
        tone={onboard.length > 0 ? 'danger' : 'default'}
      >
        <p>{onboard.length > 0 ? t('driver.onboardBody') : t('driver.unresolvedBody')}</p>
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {(onboard.length > 0 ? onboard : unresolved).map((s) => (
            <li
              key={s.studentId}
              className="flex items-center gap-3 rounded-md border border-border p-2"
            >
              <Photo s={s} size="sm" />
              <span className="flex-1 font-bold">{displayName(s)}</span>
              {s.status === 'boarded' ? (
                <Button
                  className="bg-status-alighted text-white"
                  onClick={() => onTap(s, 'alight')}
                >
                  {t('driver.alight')}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    className="bg-status-boarded text-white"
                    onClick={() => onTap(s, 'board')}
                  >
                    {t('driver.board')}
                  </Button>
                  <Button variant="outline" onClick={() => onTap(s, 'absent')}>
                    {t('driver.absent')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <Button variant="danger" className="w-full" onClick={() => setStep('force')}>
          {t('driver.forceEnd')}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setStep('idle')}>
          {t('common.back')}
        </Button>
      </Dialog>

      <Dialog
        open={step === 'confirm'}
        onClose={() => setStep('idle')}
        title={t('driver.confirmEmptyTitle')}
      >
        <p className="text-lg">{t('driver.confirmEmptyBody')}</p>
        {end.error && <Notice tone="danger">{errorMessage(end.error)}</Notice>}
        <Button
          size="touch"
          className="w-full"
          disabled={end.isPending}
          onClick={() => end.mutate({ confirmEmpty: true })}
        >
          {t('driver.confirmEmpty')}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setStep('idle')}>
          {t('common.back')}
        </Button>
      </Dialog>

      <Dialog
        open={step === 'force'}
        onClose={() => setStep('idle')}
        title={t('driver.forceTitle')}
        tone="danger"
      >
        <Notice tone="danger">
          {t('driver.forceWarning', { count: onboard.length + unresolved.length })}
        </Notice>
        <TextField
          label={t('driver.forceReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={5}
          required
        />
        {end.error && <Notice tone="danger">{errorMessage(end.error)}</Notice>}
        <Button
          variant="danger"
          size="touch"
          className="w-full"
          disabled={reason.trim().length < 5 || end.isPending}
          onClick={() => end.mutate({ force: true, reason: reason.trim() })}
        >
          {t('driver.forceConfirm')}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setStep('idle')}>
          {t('common.cancel')}
        </Button>
      </Dialog>
    </>
  );
}
