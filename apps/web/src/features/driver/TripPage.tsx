import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { checkTripEnd, isTripActive, UNDO_WINDOW_MS, type TripStudentStatus } from '@wusool/shared';
import { Icon, type IconName } from '@/components/Icon';
import { useClearActionToasts, useToast } from '@/components/toast';
import { BackBar, ErrorLine, Initial, inputClass, Screen, Sheet } from '@/components/ui/kit';
import { Spinner } from '@/components/ui/layout';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { displayName, formatTime } from '@/lib/format';
import type { Manifest, ManifestStudent } from '@/lib/types';
import { platform } from '@/platform';
import { enqueueTap, flushTrip, pendingFor } from './trip-sync';

// Driver trip screen (Claude Design "Tammeni Driver"): children grouped by stop in driving order;
// finished children shrink to one line so attention stays on who is left. Ending is staged: red
// screen with the alarm if anyone is on board, then undecided children, then a press-and-hold
// "the bus is empty" (PLAN §6.3).

type TapType = 'board' | 'alight' | 'absent';
const NEXT: Record<TapType, TripStudentStatus> = {
  board: 'boarded',
  alight: 'alighted',
  absent: 'absent',
};
const HEARTBEAT_MS = 2 * 60_000;
const SYNC_MS = 5_000;
const REMINDER_ID = 'onboard-reminder';
const HOLD_MS = 1200;

interface Override {
  status: TripStudentStatus;
  prev: TripStudentStatus;
  clientEventId: string;
  at: number;
}

type Row = ManifestStudent & { status: TripStudentStatus };
type Stage = 'list' | 'onboard' | 'unresolved' | 'confirm' | 'force' | 'done';

const STATUS_LOOK: Record<TripStudentStatus, [IconName, string]> = {
  expected: ['hourglass_top', 'text-muted'],
  boarded: ['directions_bus', 'text-primary'],
  alighted: ['check_circle', 'text-status-alighted'],
  absent: ['do_not_disturb_on', 'text-muted'],
  missing: ['warning', 'text-alert'],
  resolved: ['check_circle', 'text-status-alighted'],
};

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
  const clearUndoToasts = useClearActionToasts();
  const navigate = useNavigate();
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [stage, setStage] = useState<Stage>('list');
  const [adding, setAdding] = useState(false);
  const [, forceTick] = useState(0);

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
    const tick = setInterval(() => forceTick((n) => n + 1), 1_000); // undo countdowns
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [tripId, sync]);

  // Drop a child's local override only once the server shows that same status. A response to a
  // request that started before the latest send can arrive after it; clearing on timing alone
  // would briefly flash the old status (caught by the E2E suite).
  useEffect(() => {
    const server = trip?.students;
    if (!server) return;
    setOverrides((current) => {
      const next = { ...current };
      let changed = false;
      for (const s of server) {
        const o = next[s.studentId];
        // Keep the tap time while its undo window is open, so the undo button stays.
        if (o?.status === s.status && (o.at === 0 || Date.now() - o.at >= UNDO_WINDOW_MS)) {
          delete next[s.studentId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [trip]);

  const students: Row[] = useMemo(
    () =>
      (trip?.students ?? []).map((s) => ({
        ...s,
        status: overrides[s.studentId]?.status ?? s.status,
      })),
    [trip, overrides],
  );
  const counts = useMemo(() => {
    const c = { onboard: 0, alighted: 0, absent: 0, waiting: 0, total: students.length };
    for (const s of students) {
      if (s.status === 'boarded' || s.status === 'missing') c.onboard++;
      else if (s.status === 'expected') c.waiting++;
      else if (s.status === 'absent') c.absent++;
      else c.alighted++;
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
    async (s: Row, type: TapType | 'undo', undo?: Override) => {
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

  const check = checkTripEnd(students);
  const onboard = students.filter((s) => check.onboard.includes(s.studentId));
  const unresolved = students.filter((s) => check.unresolved.includes(s.studentId));

  // Full-screen end steps have their buttons at the bottom, where an undo toast would sit on
  // top of them; the undo stays on each child's card instead.
  useEffect(() => {
    if (stage !== 'list') clearUndoToasts();
  }, [stage, clearUndoToasts]);

  // The local alarm sounds while the red screen shows a child still on board (PLAN §3.5).
  useEffect(() => {
    if (stage === 'onboard' && onboard.length > 0) platform.alarm.start();
    else platform.alarm.stop();
    return () => platform.alarm.stop();
  }, [stage, onboard.length]);

  // Each stage moves on by itself once its children are decided.
  useEffect(() => {
    if (stage === 'onboard' && onboard.length === 0)
      setStage(unresolved.length > 0 ? 'unresolved' : 'confirm');
    else if (stage === 'unresolved' && unresolved.length === 0)
      setStage(onboard.length > 0 ? 'onboard' : 'confirm');
  }, [stage, onboard.length, unresolved.length]);

  const endTrip = () =>
    setStage(onboard.length > 0 ? 'onboard' : unresolved.length > 0 ? 'unresolved' : 'confirm');

  const end = useMutation({
    mutationFn: async (body: object) => {
      await sync();
      // The server decides with the full picture, so every queued tap must be delivered first.
      if ((await pendingFor(tripId)).length > 0) throw new ApiError(0, 'must_sync_first');
      return api(`/trips/${tripId}/end`, { method: 'POST', body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['manifest', tripId] });
      await qc.invalidateQueries({ queryKey: ['driver-today'] });
      setStage('done');
    },
    onError: async (e) => {
      if (
        e instanceof ApiError &&
        (e.code === 'students_onboard' || e.code === 'students_unresolved')
      ) {
        await qc.invalidateQueries({ queryKey: ['manifest', tripId] });
        setStage(e.code === 'students_onboard' ? 'onboard' : 'unresolved');
      }
    },
  });

  if (manifest.isLoading)
    return (
      <Screen>
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  if (manifest.error || !trip)
    return (
      <Screen>
        <BackBar to="/driver" />
        <ErrorLine>{errorMessage(manifest.error)}</ErrorLine>
      </Screen>
    );

  const ended = trip.status === 'completed' || trip.status === 'completed_with_alert';
  if (stage === 'done' || (ended && stage === 'list'))
    return <DoneScreen forced={trip.status === 'completed_with_alert'} counts={counts} />;
  if (stage === 'onboard')
    return (
      <OnboardScreen
        rows={onboard}
        onAlight={(s) => void record(s, 'alight')}
        onForce={() => setStage('force')}
        onBack={() => setStage('list')}
      />
    );
  if (stage === 'confirm')
    return (
      <ConfirmScreen
        counts={counts}
        blocked={!online && pending > 0}
        error={end.error}
        busy={end.isPending}
        onConfirm={() => end.mutate({ confirmEmpty: true })}
        onBack={() => setStage('list')}
      />
    );
  if (stage === 'force')
    return (
      <ForceScreen
        count={onboard.length + unresolved.length}
        error={end.error}
        busy={end.isPending}
        onConfirm={(reason) => end.mutate({ force: true, reason })}
        onBack={() => setStage(onboard.length > 0 ? 'onboard' : 'list')}
      />
    );

  // ── The list ──
  const groups = new Map<string, { n: number | null; name: string; rows: Row[] }>();
  for (const s of [...students].sort((a, b) => (a.stopSequence ?? 999) - (b.stopSequence ?? 999))) {
    const key = s.stop?.id ?? 'none';
    if (!groups.has(key))
      groups.set(key, {
        n: s.stop?.sequence ?? null,
        name: s.stop?.name ?? t('driver.noStop'),
        rows: [],
      });
    groups.get(key)!.rows.push(s);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header
        className="sticky top-0 z-20 bg-navy text-white"
        style={{ paddingTop: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
      >
        <div className="mx-auto flex max-w-lg flex-col gap-3 px-3 pb-3.5">
          <div className="flex items-center gap-1">
            <Link
              to="/driver"
              aria-label={t('common.back')}
              className="flex size-12 items-center justify-center rounded-full active:bg-white/10"
            >
              <Icon name="chevron_right" flip="ltr" size={28} />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">
                {trip.route?.name ?? trip.vehicle.plateNumber} ·{' '}
                {t(`directionShort.${trip.direction}`)}
              </h1>
              <div className="text-[13px] opacity-80">
                {t('drv.bus', { plate: trip.vehicle.plateNumber })} ·{' '}
                {formatTime(trip.plannedStartAt)} – {formatTime(trip.plannedEndAt)}
              </div>
            </div>
            <SyncPill online={online} pending={pending} />
          </div>
          <div aria-live="polite" className="grid grid-cols-3 gap-2 px-1">
            {(
              [
                [counts.onboard, t('admin.onboard'), 'text-[#AEB9FF]'],
                [counts.alighted + counts.absent, t('admin.doneOrAbsent'), 'text-[#7EE2A0]'],
                [counts.waiting, t('admin.waiting'), ''],
              ] as const
            ).map(([n, label, color]) => (
              <div key={label} className="rounded-[14px] bg-white/10 px-3 py-2.5">
                <div className={cn('font-figures text-[30px] leading-none font-bold', color)}>
                  {n}
                </div>
                <div className="mt-1.5 text-[13px] font-semibold">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-3.5 pt-1.5 pb-8">
        {trip.status === 'scheduled' &&
          start.error &&
          !(start.error instanceof ApiError && start.error.code === 'push_not_enabled') && (
            <div className="pt-3">
              <ErrorLine>{errorMessage(start.error)}</ErrorLine>
            </div>
          )}
        {[...groups.values()].map((g) => {
          const left = g.rows.filter(
            (s) => s.status === 'expected' || s.status === 'boarded',
          ).length;
          return (
            <section key={g.name}>
              <div className="flex items-center gap-2 px-1 pt-4 pb-2.5">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    left ? 'bg-primary text-primary-foreground' : 'bg-ok-soft text-status-alighted',
                  )}
                >
                  {g.n ?? '–'}
                </span>
                <h2 className="flex-1 text-[15px] font-bold">{g.name}</h2>
                <span className="text-[13px] font-semibold text-muted">
                  {left ? t('drv.left', { count: left }) : t('drv.stopDone')}
                </span>
              </div>
              <ul className="flex flex-col gap-2.5">
                {g.rows.map((s) => {
                  const o = overrides[s.studentId];
                  const secondsLeft =
                    o && o.at > 0 ? Math.ceil((UNDO_WINDOW_MS - (Date.now() - o.at)) / 1000) : 0;
                  return (
                    <li key={s.studentId}>
                      <StudentCard
                        s={s}
                        disabled={!active}
                        onTap={(type) => void record(s, type)}
                        undoIn={secondsLeft > 0 ? secondsLeft : 0}
                        onUndo={o ? () => void record(s, 'undo', o) : undefined}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {active && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4.5 flex min-h-13 w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-border text-[15px] font-semibold"
          >
            <Icon name="person_add" />
            {t('driver.addStudent')}
          </button>
        )}
      </main>

      <div
        data-tabbar="footer"
        className="sticky bottom-0 z-10 border-t border-border bg-background px-3.5 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-lg">
          {trip.status === 'scheduled' ? (
            <button
              type="button"
              disabled={start.isPending}
              onClick={() => start.mutate()}
              className="flex min-h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-xl font-bold text-primary-foreground disabled:opacity-60"
            >
              <Icon name="play_arrow" fill size={28} />
              {t('driver.startTrip')}
            </button>
          ) : (
            active && (
              <button
                type="button"
                onClick={endTrip}
                className="flex min-h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-foreground text-xl font-bold text-background"
              >
                <Icon name="flag" size={26} />
                {t('driver.endTrip')}
              </button>
            )
          )}
        </div>
      </div>

      <UnresolvedSheet
        open={stage === 'unresolved'}
        rows={unresolved}
        onTap={(s, type) => void record(s, type)}
        onForce={() => setStage('force')}
        onClose={() => setStage('list')}
      />
      <AddStudentSheet
        open={adding}
        tripId={tripId}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          void qc.invalidateQueries({ queryKey: ['manifest', tripId] });
        }}
      />
    </div>
  );
}

function SyncPill({ online, pending }: { online: boolean; pending: number }) {
  const { t } = useTranslation();
  if (!online || pending > 0)
    return (
      <span className="inline-flex shrink-0 items-center gap-1.25 rounded-full bg-[#F59E0B] px-2.75 py-1.5 text-[13px] font-bold text-[#1A1200]">
        <Icon name="cloud_off" size={17} />
        {pending > 0 ? t('driver.pendingSync', { count: pending }) : t('driver.offline')}
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center gap-1.25 rounded-full bg-[#7EE2A0]/18 px-2.75 py-1.5 text-[13px] font-bold text-[#7EE2A0]">
      <Icon name="cloud_done" size={17} />
      {t('driver.synced')}
    </span>
  );
}

function Photo({ s, size }: { s: Row; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!s.photoUrl || failed)
    return <Initial name={displayName(s)} size={size} className="rounded-2xl" />;
  return (
    <img
      src={s.photoUrl}
      alt=""
      className="shrink-0 rounded-2xl object-cover"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

function StudentCard({
  s,
  disabled,
  onTap,
  undoIn,
  onUndo,
}: {
  s: Row;
  disabled: boolean;
  onTap: (type: TapType) => void;
  undoIn: number;
  onUndo?: () => void;
}) {
  const { t } = useTranslation();
  const [icon, color] = STATUS_LOOK[s.status];
  const label = `${t(`status.${s.status}`)}${s.isUnexpected ? ` · ${t('driver.unexpected')}` : ''}`;
  const closed = s.status === 'alighted' || s.status === 'absent' || s.status === 'resolved';
  if (closed) {
    return (
      <article
        aria-label={displayName(s)}
        className="flex items-center gap-2.5 rounded-2xl bg-surface px-3 py-2.5"
      >
        <Icon name={icon} fill size={24} className={color} />
        <span className="flex-1 text-base font-semibold">
          <h2 className="inline">{displayName(s)}</h2>{' '}
          <span className="text-sm font-medium text-muted">· {label}</span>
        </span>
        {undoIn > 0 && onUndo && !disabled && (
          <button
            type="button"
            onClick={onUndo}
            className="min-h-11 rounded-xl border-[1.5px] border-primary px-3.5 text-sm font-bold text-primary"
          >
            {t('driver.undo')} {t('drv.seconds', { count: undoIn })}
          </button>
        )}
      </article>
    );
  }
  return (
    <article
      aria-label={displayName(s)}
      className={cn(
        'flex flex-col gap-3 rounded-[20px] bg-surface p-3.5',
        s.status === 'boarded' && 'border-2 border-primary',
        s.status === 'missing' && 'border-2 border-alert',
        s.status === 'expected' && 'border-[1.5px] border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <Photo s={s} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[21px] leading-tight font-bold">{displayName(s)}</h2>
          <div className={cn('mt-1 flex items-center gap-1.25 text-sm font-semibold', color)}>
            <Icon name={icon} fill size={18} />
            {label}
          </div>
        </div>
      </div>
      {s.status === 'expected' && (
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onTap('board')}
            className="flex min-h-16 flex-2 items-center justify-center gap-2 rounded-2xl bg-primary text-[21px] font-bold text-primary-foreground disabled:opacity-50"
          >
            <Icon name="login" size={28} />
            {t('driver.board')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onTap('absent')}
            className="min-h-16 flex-1 rounded-2xl border-2 border-border text-lg font-bold disabled:opacity-50"
          >
            {t('driver.absent')}
          </button>
        </div>
      )}
      {s.status === 'boarded' && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onTap('alight')}
          className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-status-alighted text-[21px] font-bold text-white disabled:opacity-50"
        >
          <Icon name="logout" size={28} />
          {t('driver.alight')}
        </button>
      )}
    </article>
  );
}

// ─── End of trip ────────────────────────────────────────────────────────────

function OnboardScreen({
  rows,
  onAlight,
  onForce,
  onBack,
}: {
  rows: Row[];
  onAlight: (s: Row) => void;
  onForce: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Screen tone="alert" className="gap-4 pt-14">
      <div className="flex items-center gap-3.5">
        <div className="flex size-16 items-center justify-center rounded-full bg-white/20 animate-pulse-ring">
          <Icon name="notifications_active" fill size={34} />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1.5 text-[13px] font-bold">
          <Icon name="volume_up" size={18} />
          {t('drv.alarmOn')}
        </span>
      </div>
      <h1 className="text-[28px] leading-snug font-bold">{t('driver.onboardTitle')}</h1>
      <p className="text-[17px] leading-relaxed">{t('driver.onboardBody')}</p>
      <ul className="flex flex-col gap-2.5">
        {rows.map((s) => (
          <li
            key={s.studentId}
            className="flex items-center gap-3 rounded-[18px] bg-white p-3 text-[#0A0F24]"
          >
            <Photo s={s} size={52} />
            <span className="flex-1 text-[19px] font-bold">{displayName(s)}</span>
            <button
              type="button"
              onClick={() => onAlight(s)}
              className="min-h-14 rounded-[14px] bg-[#15803D] px-5.5 text-lg font-bold text-white"
            >
              {t('driver.alight')}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onForce}
        className="min-h-14 rounded-[14px] border-2 border-white/70 text-base font-bold"
      >
        {t('driver.forceEnd')}
      </button>
      <button type="button" onClick={onBack} className="min-h-11 text-[15px] font-semibold">
        {t('drv.backToList')}
      </button>
    </Screen>
  );
}

function UnresolvedSheet({
  open,
  rows,
  onTap,
  onForce,
  onClose,
}: {
  open: boolean;
  rows: Row[];
  onTap: (s: Row, type: TapType) => void;
  onForce: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onClose} title={t('driver.unresolvedTitle')}>
      <p className="text-base text-muted">{t('driver.unresolvedBody')}</p>
      <ul className="flex max-h-[45dvh] flex-col gap-3 overflow-y-auto">
        {rows.map((s) => (
          <li
            key={s.studentId}
            className="flex items-center gap-2 rounded-2xl border-[1.5px] border-border p-2.5"
          >
            <span className="flex-1 ps-1 text-lg font-bold">{displayName(s)}</span>
            <button
              type="button"
              onClick={() => onTap(s, 'board')}
              className="min-h-13 rounded-xl bg-primary px-4.5 text-base font-bold text-primary-foreground"
            >
              {t('driver.board')}
            </button>
            <button
              type="button"
              onClick={() => onTap(s, 'absent')}
              className="min-h-13 rounded-xl border-2 border-border px-4 text-base font-bold"
            >
              {t('driver.absent')}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onForce}
        className="min-h-11 text-[15px] font-semibold text-alert"
      >
        {t('driver.forceEnd')}
      </button>
      <button type="button" onClick={onClose} className="min-h-12 text-[15px] font-semibold">
        {t('common.back')}
      </button>
    </Sheet>
  );
}

/** "The bus is empty" needs a long press, so it cannot be confirmed by a stray tap. */
function HoldButton({
  onDone,
  disabled,
  children,
}: {
  onDone: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  };
  const begin = () => {
    if (disabled || timer.current) return;
    const started = Date.now();
    timer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        onDone();
      }
    }, 30);
  };
  useEffect(() => () => stop(), []);
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      className="relative min-h-18 touch-none overflow-hidden rounded-[18px] bg-primary-soft text-primary select-none disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 start-0 bg-primary"
        style={{ width: `${progress * 100}%` }}
      />
      <span
        className={cn(
          'relative flex items-center justify-center gap-2.5 text-[19px] font-bold',
          progress > 0.55 && 'text-primary-foreground',
        )}
      >
        {children}
      </span>
    </button>
  );
}

function ConfirmScreen({
  counts,
  blocked,
  error,
  busy,
  onConfirm,
  onBack,
}: {
  counts: { alighted: number; absent: number };
  blocked: boolean;
  error: unknown;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Screen className="gap-4">
      <BackBar onBack={onBack} />
      <div className="flex size-21 items-center justify-center rounded-3xl bg-primary-soft text-primary">
        <Icon name="airline_seat_recline_normal" size={46} />
      </div>
      <h1 className="text-[28px] font-bold">{t('driver.confirmEmptyTitle')}</h1>
      <p className="text-[19px] leading-relaxed font-medium">{t('drv.confirmBody')}</p>
      <div className="grid grid-cols-2 gap-2.5 rounded-[18px] bg-surface px-4 py-3.5">
        <div>
          <div className="font-figures text-[26px] font-bold text-status-alighted">
            {counts.alighted}
          </div>
          <div className="text-sm font-semibold text-muted">{t('drv.gotOff')}</div>
        </div>
        <div>
          <div className="font-figures text-[26px] font-bold text-muted">{counts.absent}</div>
          <div className="text-sm font-semibold text-muted">{t('drv.absentMany')}</div>
        </div>
      </div>
      {blocked && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[14px] bg-warning-soft px-3.5 py-3 text-[14.5px] font-semibold text-warning"
        >
          <Icon name="wifi_off" />
          {t('drv.syncFirst')}
        </div>
      )}
      {error != null && <ErrorLine>{errorMessage(error)}</ErrorLine>}
      <div className="flex-1" />
      <HoldButton onDone={onConfirm} disabled={blocked || busy}>
        <Icon name="touch_app" size={28} />
        {t('drv.holdEmpty')}
      </HoldButton>
      <div className="-mt-1.5 text-center text-[13px] text-muted">{t('drv.holdWhy')}</div>
    </Screen>
  );
}

function ForceScreen({
  count,
  error,
  busy,
  onConfirm,
  onBack,
}: {
  count: number;
  error: unknown;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 5;
  return (
    <Screen className="gap-4">
      <BackBar onBack={onBack} />
      <h1 className="text-[26px] font-bold text-alert">{t('driver.forceTitle')}</h1>
      <div
        role="alert"
        className="flex gap-2.5 rounded-2xl bg-alert-soft px-4 py-3.5 text-base leading-relaxed font-semibold text-alert"
      >
        <Icon name="warning" fill size={24} />
        {t('driver.forceWarning', { count })}
      </div>
      <label className="flex flex-col gap-2 text-[15px] font-bold">
        {t('driver.forceReason')}
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('drv.forcePlaceholder')}
          className={cn(inputClass, 'resize-none py-3 font-normal')}
        />
      </label>
      <div className="text-[13px] text-muted">{t('drv.min5')}</div>
      {error != null && <ErrorLine>{errorMessage(error)}</ErrorLine>}
      <div className="flex-1" />
      <button
        type="button"
        disabled={!ok || busy}
        onClick={() => onConfirm(reason.trim())}
        className={cn(
          'min-h-16 rounded-2xl text-lg font-bold text-white',
          ok ? 'bg-alert' : 'bg-muted',
        )}
      >
        {t('driver.forceConfirm')}
      </button>
    </Screen>
  );
}

function DoneScreen({
  forced,
  counts,
}: {
  forced: boolean;
  counts: { total: number; alighted: number; absent: number };
}) {
  const { t } = useTranslation();
  return (
    <Screen className="items-center gap-4 pt-28 text-center">
      <div
        className={cn(
          'flex size-24 items-center justify-center rounded-full',
          forced ? 'bg-alert-soft text-alert' : 'bg-ok-soft text-status-alighted',
        )}
      >
        <Icon name={forced ? 'warning' : 'verified'} fill size={54} />
      </div>
      <h1 className="mt-1.5 text-[28px] font-bold">
        {forced ? t('drv.doneAlertTitle') : t('drv.doneTitle')}
      </h1>
      <p className="text-[17px] leading-relaxed text-muted">
        {forced ? t('drv.doneAlertBody') : t('drv.doneBody')}
      </p>
      <div className="grid w-full grid-cols-3 gap-2 rounded-[18px] bg-surface p-4">
        {(
          [
            [counts.total, t('drv.students'), ''],
            [counts.alighted, t('drv.gotOff'), 'text-status-alighted'],
            [counts.absent, t('drv.absentMany'), 'text-muted'],
          ] as const
        ).map(([n, label, color]) => (
          <div key={label}>
            <div className={cn('font-figures text-2xl font-bold', color)}>{n}</div>
            <div className="text-[13px] font-semibold text-muted">{label}</div>
          </div>
        ))}
      </div>
      <Link
        to="/driver"
        className="mt-2.5 flex min-h-15 w-full items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground"
      >
        {t('driver.today')}
      </Link>
    </Screen>
  );
}

function AddStudentSheet({
  open,
  tripId,
  onClose,
  onAdded,
}: {
  open: boolean;
  tripId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const candidates = useQuery({
    queryKey: ['candidates', tripId, q],
    queryFn: () =>
      api<(ManifestStudent & { id: string; publicCode: string; guardianNames: string[] })[]>(
        `/trips/${tripId}/candidates?q=${encodeURIComponent(q)}`,
      ),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: (studentId: string) =>
      api(`/trips/${tripId}/students`, { method: 'POST', body: { studentId } }),
    onSuccess: onAdded,
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('driver.addStudent')}>
      <p className="text-sm text-muted">{t('drv.addHint')}</p>
      <input
        type="search"
        aria-label={t('drv.searchHint')}
        placeholder={t('drv.searchHint')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={cn(inputClass, 'bg-background')}
      />
      <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
        {(candidates.data ?? []).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={add.isPending}
              onClick={() => add.mutate(c.id)}
              className="flex min-h-15 w-full items-center gap-3 rounded-[14px] border-[1.5px] border-border px-3 py-2 text-start"
            >
              <Initial name={displayName(c)} size={44} className="rounded-xl" />
              <span className="flex-1">
                <span className="block text-[17px] font-semibold">{displayName(c)}</span>
                <span className="block text-xs text-muted" dir="ltr">
                  {c.publicCode}
                  {c.guardianNames.length > 0 && ` · ${c.guardianNames[0]}`}
                </span>
              </span>
              <Icon name="add_circle" size={24} className="text-primary" />
            </button>
          </li>
        ))}
      </ul>
      {add.error && <ErrorLine>{errorMessage(add.error)}</ErrorLine>}
      <button type="button" onClick={onClose} className="min-h-12 text-[15px] font-semibold">
        {t('common.cancel')}
      </button>
    </Sheet>
  );
}
