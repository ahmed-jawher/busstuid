import { describe, expect, it } from 'vitest';
import {
  canTransitionTrip,
  checkTripEnd,
  foldStudentEvents,
  isoWeekday,
  localDate,
  zonedTimeToUtc,
  type FoldableEvent,
} from './trip-rules';

const t0 = new Date('2026-09-21T03:00:00Z');
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
let n = 0;
const ev = (
  type: FoldableEvent['type'],
  second: number,
  extra: Partial<FoldableEvent> = {},
): FoldableEvent => ({
  id: `e${String(n++).padStart(3, '0')}`,
  type,
  clientRecordedAt: at(second),
  serverReceivedAt: at(second + 1),
  ...extra,
});

describe('trip status machine', () => {
  it('allows the documented transitions only', () => {
    expect(canTransitionTrip('scheduled', 'in_progress')).toBe(true);
    expect(canTransitionTrip('in_progress', 'overdue')).toBe(true);
    expect(canTransitionTrip('overdue', 'completed_with_alert')).toBe(true);
    expect(canTransitionTrip('scheduled', 'completed')).toBe(false);
    expect(canTransitionTrip('completed', 'in_progress')).toBe(false);
    expect(canTransitionTrip('completed_with_alert', 'completed')).toBe(false);
  });
});

describe('foldStudentEvents', () => {
  it('boards then alights', () => {
    const r = foldStudentEvents([ev('board', 0), ev('alight', 600)]);
    expect(r.status).toBe('alighted');
    expect(r.boardedAt).toEqual(at(0));
    expect(r.alightedAt).toEqual(at(600));
  });

  it('orders by device time, not arrival (PLAN §16 test 6)', () => {
    const alight = ev('alight', 600, { serverReceivedAt: at(5) });
    const board = ev('board', 0, { serverReceivedAt: at(900) });
    expect(foldStudentEvents([alight, board]).status).toBe('alighted');
  });

  it('ignores an alight for a child who never boarded', () => {
    const alight = ev('alight', 10);
    const r = foldStudentEvents([alight]);
    expect(r.status).toBe('expected');
    expect(r.ignored).toEqual([alight.id]);
  });

  it('never lets "absent" override "boarded"', () => {
    expect(foldStudentEvents([ev('board', 0), ev('absent', 30)]).status).toBe('boarded');
  });

  it('lets a child board again after alighting', () => {
    expect(foldStudentEvents([ev('board', 0), ev('alight', 60), ev('board', 120)]).status).toBe(
      'boarded',
    );
  });

  it('undo within 60 s reverts the tap; later undo is ignored', () => {
    const alight = ev('alight', 100);
    const quick = foldStudentEvents([
      ev('board', 0),
      alight,
      ev('undo', 130, { undoesEventId: alight.id }),
    ]);
    expect(quick.status).toBe('boarded');

    const late = foldStudentEvents([
      ev('board', 0),
      alight,
      ev('undo', 400, { undoesEventId: alight.id }),
    ]);
    expect(late.status).toBe('alighted');
  });

  it('undo of an absence restores expected', () => {
    const absent = ev('absent', 0);
    expect(foldStudentEvents([absent, ev('undo', 20, { undoesEventId: absent.id })]).status).toBe(
      'expected',
    );
  });
});

describe('checkTripEnd (PLAN §6.3)', () => {
  it('blocks a normal end while anyone is on board or unresolved', () => {
    const r = checkTripEnd([
      { studentId: 'a', status: 'alighted' },
      { studentId: 'b', status: 'boarded' },
      { studentId: 'c', status: 'expected' },
      { studentId: 'd', status: 'absent' },
    ]);
    expect(r).toEqual({ onboard: ['b'], unresolved: ['c'], canEndNormally: false });
  });

  it('allows it when everyone alighted or was absent', () => {
    expect(
      checkTripEnd([
        { studentId: 'a', status: 'alighted' },
        { studentId: 'd', status: 'absent' },
      ]).canEndNormally,
    ).toBe(true);
  });
});

describe('local time helpers', () => {
  it('computes the local date and weekday in Bahrain', () => {
    // 22:30 UTC on Saturday is already Sunday 01:30 in Bahrain (UTC+3).
    expect(localDate(new Date('2026-09-19T22:30:00Z'), 'Asia/Bahrain')).toBe('2026-09-20');
    expect(isoWeekday('2026-09-20')).toBe(7);
    expect(isoWeekday('2026-09-21')).toBe(1);
  });

  it('converts local wall-clock times to UTC', () => {
    expect(zonedTimeToUtc('2026-09-21', '06:15', 'Asia/Riyadh').toISOString()).toBe(
      '2026-09-21T03:15:00.000Z',
    );
  });
});
