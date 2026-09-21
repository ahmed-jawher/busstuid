import type { TripEventType, TripStatus, TripStudentStatus } from './enums';

// The critical-path rules of PLAN §6 as pure functions, shared by the API and the driver app so
// both reach the same answer offline and online.

// ─── Trip status (PLAN §6) ───────────────────────────────────────────────────

const TRIP_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['overdue', 'completed', 'completed_with_alert'],
  // The watchdog marks a trip overdue; the driver (or an admin) can still end it.
  overdue: ['completed', 'completed_with_alert'],
  completed: [],
  completed_with_alert: [],
  cancelled: [],
};

export function canTransitionTrip(from: TripStatus, to: TripStatus): boolean {
  return TRIP_TRANSITIONS[from].includes(to);
}

export const ACTIVE_TRIP_STATUSES: readonly TripStatus[] = ['in_progress', 'overdue'];
export const isTripActive = (s: TripStatus) => ACTIVE_TRIP_STATUSES.includes(s);

// ─── Student status within a trip (PLAN §6.2) ───────────────────────────────

/** An undo is accepted only within 60 s of the original tap, by device time (PLAN §6.2). */
export const UNDO_WINDOW_MS = 60_000;
/** Allowance for clock jitter between taps on the same device. */
export const UNDO_TOLERANCE_MS = 10_000;

export interface FoldableEvent {
  id: string;
  type: TripEventType;
  undoesEventId?: string | null;
  clientRecordedAt: Date;
  serverReceivedAt: Date;
}

export interface FoldResult {
  status: Extract<TripStudentStatus, 'expected' | 'boarded' | 'alighted' | 'absent'>;
  boardedAt: Date | null;
  alightedAt: Date | null;
  /** Events that changed the state, in the order applied. */
  applied: string[];
  /** Events that had no effect (e.g. "alight" for a child who never boarded). */
  ignored: string[];
}

type State = FoldResult['status'];

/**
 * What a tap does in each state. Deliberately conservative:
 * - a child can board from any state (including after alighting — they got back on);
 * - "absent" never overrides "boarded": we do not un-see a child on the vehicle.
 */
const STEP: Record<Exclude<TripEventType, 'undo'>, Partial<Record<State, State>>> = {
  board: { expected: 'boarded', absent: 'boarded', alighted: 'boarded' },
  alight: { boarded: 'alighted' },
  absent: { expected: 'absent' },
};

export function isUndoInWindow(original: Date, undo: Date): boolean {
  const delta = undo.getTime() - original.getTime();
  return delta >= -UNDO_TOLERANCE_MS && delta <= UNDO_WINDOW_MS + UNDO_TOLERANCE_MS;
}

/**
 * Rebuilds a student's status from their full event history. Events may arrive late and out of
 * order from offline devices, so the order is always the device's `clientRecordedAt`, with the
 * server's receive time as the tie-breaker (PLAN §16 test 6). Undone events are skipped;
 * nothing is ever deleted.
 */
export function foldStudentEvents(events: readonly FoldableEvent[]): FoldResult {
  const byId = new Map(events.map((e) => [e.id, e]));
  const undone = new Set<string>();
  for (const e of events) {
    if (e.type !== 'undo' || !e.undoesEventId) continue;
    const target = byId.get(e.undoesEventId);
    if (
      target &&
      target.type !== 'undo' &&
      isUndoInWindow(target.clientRecordedAt, e.clientRecordedAt)
    ) {
      undone.add(target.id);
    }
  }

  const ordered = events
    .filter((e) => e.type !== 'undo')
    .sort(
      (a, b) =>
        a.clientRecordedAt.getTime() - b.clientRecordedAt.getTime() ||
        a.serverReceivedAt.getTime() - b.serverReceivedAt.getTime() ||
        a.id.localeCompare(b.id),
    );

  const result: FoldResult = {
    status: 'expected',
    boardedAt: null,
    alightedAt: null,
    applied: [],
    ignored: [],
  };
  for (const e of ordered) {
    if (undone.has(e.id) || e.type === 'undo') {
      result.ignored.push(e.id);
      continue;
    }
    const next = STEP[e.type][result.status];
    if (!next) {
      result.ignored.push(e.id);
      continue;
    }
    result.status = next;
    result.applied.push(e.id);
    if (next === 'boarded') {
      result.boardedAt = e.clientRecordedAt;
      result.alightedAt = null;
    } else if (next === 'alighted') {
      result.alightedAt = e.clientRecordedAt;
    }
  }
  return result;
}

// ─── Ending a trip (PLAN §6.3) ──────────────────────────────────────────────

export interface EndCheck {
  /** Recorded as on the vehicle — normal end is refused while any remain. */
  onboard: string[];
  /** Never marked boarded or absent — the driver must decide for each one first. */
  unresolved: string[];
  canEndNormally: boolean;
}

export function checkTripEnd(
  students: readonly { studentId: string; status: TripStudentStatus }[],
): EndCheck {
  const onboard = students.filter((s) => s.status === 'boarded').map((s) => s.studentId);
  const unresolved = students.filter((s) => s.status === 'expected').map((s) => s.studentId);
  return { onboard, unresolved, canEndNormally: onboard.length === 0 && unresolved.length === 0 };
}

// ─── Local dates and times in an organisation's timezone ────────────────────

function parts(date: Date, timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

/** "YYYY-MM-DD" of `instant` as seen in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The UTC instant of local wall-clock `hhmm` on `date` in `timeZone`. */
export function zonedTimeToUtc(date: string, hhmm: string, timeZone: string): Date {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const p = parts(guess, timeZone);
  const asLocal = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}
