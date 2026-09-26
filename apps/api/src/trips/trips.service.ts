import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  checkTripEnd,
  foldStudentEvents,
  isTripActive,
  isUndoInWindow,
  localDate,
  type TripEventInput,
  type TripStatus,
  type TripStudentStatus,
} from '@wusool/shared';
import { EscalationService } from '../alerts/escalation.service';
import { ApiError, Errors } from '../common/api-error';
import { SideEffects } from '../common/side-effects';
import { PrismaService, type Tx } from '../database/prisma.service';
import {
  RoutineNotificationsService,
  type StatusChange,
} from '../notifications/routine-notifications.service';
import { studentSearchFilter } from '../students/student-search';
import { StudentsService } from '../students/students.service';
import { loadTripFor } from './trip-access';
import { TripGenerationService } from './trip-generation.service';

/** Late offline taps are accepted if recorded on the device up to this long after the end. */
const LATE_EVENT_GRACE_MS = 5 * 60_000;

export type EventResult =
  | { clientEventId: string; status: 'accepted' | 'duplicate' }
  | { clientEventId: string; status: 'rejected'; reason: string };

const STATUS_ORDER: Record<TripStudentStatus, number> = {
  expected: 0,
  boarded: 1,
  missing: 1,
  alighted: 2,
  absent: 2,
  resolved: 2,
};

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: TripGenerationService,
    private readonly students: StudentsService,
    private readonly escalation: EscalationService,
    private readonly routine: RoutineNotificationsService,
    private readonly effects: SideEffects,
  ) {}

  /** Trips the caller works on today, across every organisation they drive for (PLAN §11). */
  async driverToday(userId: string) {
    const memberships = await this.prisma.system.membership.findMany({
      where: {
        userId,
        status: 'active',
        role: { in: ['driver', 'attendant'] },
        organization: { status: 'active', deletedAt: null },
      },
      select: { organizationId: true, role: true },
    });
    const trips = [];
    for (const orgId of new Set(memberships.map((m) => m.organizationId))) {
      const date = await this.generation.today(orgId);
      await this.generation.ensureGenerated(orgId, date);
      const isAttendant = memberships.some(
        (m) => m.organizationId === orgId && m.role === 'attendant',
      );
      const rows = await this.prisma.system.trip.findMany({
        where: {
          organizationId: orgId,
          serviceDate: new Date(`${date}T00:00:00Z`),
          status: { not: 'cancelled' },
          ...(isAttendant ? {} : { driverId: userId }),
        },
        orderBy: { plannedStartAt: 'asc' },
        select: {
          id: true,
          direction: true,
          status: true,
          plannedStartAt: true,
          plannedEndAt: true,
          startedAt: true,
          endedAt: true,
          route: { select: { name: true } },
          vehicle: { select: { plateNumber: true, type: true } },
          organization: { select: { id: true, nameAr: true, nameEn: true } },
          students: { select: { status: true } },
        },
      });
      trips.push(...rows.map(({ students, ...t }) => ({ ...t, counts: countStatuses(students) })));
    }
    return trips;
  }

  /**
   * Starts a trip (PLAN §6.1). Refused unless the driver has a device that passed the test
   * notification (PLAN §7) — otherwise alerts could silently never reach them.
   */
  async start(userId: string, tripId: string) {
    const ref = await loadTripFor(this.prisma, userId, tripId, 'start');
    const pushReady = await this.prisma.system.pushSubscription.count({
      where: { userId, revokedAt: null, lastTestOkAt: { not: null } },
    });
    if (pushReady === 0) throw Errors.forbidden('push_not_enabled');

    try {
      return await this.prisma.withContext({ userId, orgId: ref.organizationId }, async (tx) => {
        const trip = await lockTrip(tx, tripId);
        if (isTripActive(trip.status)) return this.summary(tx, tripId); // idempotent retry
        if (trip.status !== 'scheduled') throw Errors.conflict('trip_not_startable');
        const org = await tx.organization.findUniqueOrThrow({
          where: { id: ref.organizationId },
          select: { timezone: true },
        });
        const today = localDate(new Date(), org.timezone);
        if (trip.service_date.toISOString().slice(0, 10) !== today) {
          throw Errors.conflict('trip_not_today');
        }
        const now = new Date();
        await tx.trip.update({
          where: { id: tripId },
          data: {
            status: 'in_progress',
            startedAt: now,
            lastHeartbeatAt: now,
            lastDeviceState: 'foreground',
          },
        });
        return this.summary(tx, tripId);
      });
    } catch (e) {
      // The partial unique index allows one active trip per vehicle (PLAN §6.1).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw Errors.conflict('vehicle_busy');
      }
      throw e;
    }
  }

  /** Everything the driver screen needs, with short-lived photo links (PLAN §6.2, §11). */
  async manifest(userId: string, tripId: string) {
    const ref = await loadTripFor(this.prisma, userId, tripId, 'operate');
    return this.prisma.withContext({ userId, orgId: ref.organizationId }, async (tx) => {
      const trip = await tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: {
          id: true,
          direction: true,
          status: true,
          serviceDate: true,
          plannedStartAt: true,
          plannedEndAt: true,
          startedAt: true,
          endedAt: true,
          route: { select: { name: true } },
          vehicle: { select: { plateNumber: true, type: true } },
          organization: { select: { id: true, nameAr: true, nameEn: true } },
          students: {
            select: {
              studentId: true,
              status: true,
              isUnexpected: true,
              boardedAt: true,
              alightedAt: true,
              stopSequence: true,
              stop: { select: { id: true, name: true, sequence: true } },
              student: { select: { fullNameAr: true, fullNameEn: true, photoVersion: true } },
            },
          },
        },
      });
      const students = trip.students
        .map(({ student, ...s }) => ({
          ...s,
          fullNameAr: student.fullNameAr,
          fullNameEn: student.fullNameEn,
          photoUrl: this.students.photoUrl(s.studentId, student.photoVersion),
        }))
        // Waiting by stop order, then those on board, then the finished ones (PLAN §6.2).
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            (a.stopSequence ?? 999) - (b.stopSequence ?? 999) ||
            a.fullNameAr.localeCompare(b.fullNameAr, 'ar'),
        );
      return { ...trip, students, counts: countStatuses(trip.students) };
    });
  }

  /**
   * Stores a batch of taps (possibly offline, late, out of order, or resent) and rebuilds each
   * affected child's state from the complete history (PLAN §3.6, §16 tests 5 and 6).
   */
  async recordEvents(userId: string, tripId: string, events: TripEventInput[]) {
    const ref = await loadTripFor(this.prisma, userId, tripId, 'operate');
    // Idempotency across organisations: a clientEventId seen anywhere is never stored twice.
    const seen = new Map(
      (
        await this.prisma.system.tripEvent.findMany({
          where: { clientEventId: { in: events.map((e) => e.clientEventId) } },
          select: { clientEventId: true, tripId: true },
        })
      ).map((e) => [e.clientEventId, e.tripId]),
    );

    const changes: StatusChange[] = [];
    const response = await this.prisma.withContext(
      { userId, orgId: ref.organizationId },
      async (tx) => {
        const trip = await lockTrip(tx, tripId);
        if (trip.status === 'scheduled' || trip.status === 'cancelled' || !trip.started_at) {
          throw Errors.conflict('trip_not_started');
        }
        // Re-check under the trip lock: a concurrent resend of the same batch may have just landed.
        for (const e of await tx.tripEvent.findMany({
          where: { clientEventId: { in: events.map((ev) => ev.clientEventId) } },
          select: { clientEventId: true, tripId: true },
        })) {
          seen.set(e.clientEventId, e.tripId);
        }
        const onTrip = new Set(
          (await tx.tripStudent.findMany({ where: { tripId }, select: { studentId: true } })).map(
            (s) => s.studentId,
          ),
        );

        const results: EventResult[] = [];
        const touched = new Set<string>();
        const newEventIds = new Set<string>();
        const batchIds = new Set<string>();
        // Oldest first, so an undo in the same batch finds its target.
        const ordered = [...events].sort((a, b) =>
          a.clientRecordedAt.localeCompare(b.clientRecordedAt),
        );
        for (const e of ordered) {
          const reject = (reason: string) =>
            results.push({ clientEventId: e.clientEventId, status: 'rejected', reason });
          if (seen.has(e.clientEventId) || batchIds.has(e.clientEventId)) {
            if (seen.get(e.clientEventId) && seen.get(e.clientEventId) !== tripId)
              reject('event_id_conflict');
            else results.push({ clientEventId: e.clientEventId, status: 'duplicate' });
            continue;
          }
          if (!onTrip.has(e.studentId)) {
            reject('student_not_on_trip');
            continue;
          }
          const recordedAt = new Date(e.clientRecordedAt);
          if (
            trip.ended_at &&
            recordedAt.getTime() > trip.ended_at.getTime() + LATE_EVENT_GRACE_MS
          ) {
            reject('trip_ended');
            continue;
          }

          let undoesEventId: string | null = null;
          if (e.type === 'undo') {
            const target = await tx.tripEvent.findFirst({
              where: { tripId, studentId: e.studentId, clientEventId: e.undoesClientEventId },
              select: { id: true, eventType: true, clientRecordedAt: true },
            });
            if (!target || target.eventType === 'undo') {
              reject('undo_target_not_found');
              continue;
            }
            if (!isUndoInWindow(target.clientRecordedAt, recordedAt)) {
              reject('undo_window_expired');
              continue;
            }
            undoesEventId = target.id;
          }

          const created = await tx.tripEvent.create({
            data: {
              organizationId: ref.organizationId,
              tripId,
              studentId: e.studentId,
              eventType: e.type,
              undoesEventId,
              recordedBy: userId,
              clientEventId: e.clientEventId,
              clientRecordedAt: recordedAt,
              lat: e.lat,
              lng: e.lng,
              accuracyM: e.accuracyM,
            },
            select: { id: true },
          });
          newEventIds.add(created.id);
          batchIds.add(e.clientEventId);
          touched.add(e.studentId);
          results.push({ clientEventId: e.clientEventId, status: 'accepted' });
        }

        for (const studentId of touched) {
          changes.push(...(await rebuildProjection(tx, tripId, studentId, newEventIds)));
        }
        // Any accepted tap proves the device is alive.
        if (touched.size > 0) {
          await tx.trip.update({ where: { id: tripId }, data: { lastHeartbeatAt: new Date() } });
        }
        const students = await tx.tripStudent.findMany({
          where: { tripId, studentId: { in: [...touched] } },
          select: { studentId: true, status: true, boardedAt: true, alightedAt: true },
        });
        return { results, students };
      },
    );
    // After commit: tell guardians (PLAN §5). Failures are retried by the dispatch job.
    if (changes.length > 0) {
      this.effects.run('routine notifications', () =>
        this.routine.notifyGuardians(
          tripId,
          [...changes].sort((a, b) => a.at.getTime() - b.at.getTime()),
        ),
      );
    }
    return response;
  }

  async heartbeat(userId: string, tripId: string, state: 'foreground' | 'app_backgrounded') {
    const ref = await loadTripFor(this.prisma, userId, tripId, 'operate');
    return this.prisma.withContext({ userId, orgId: ref.organizationId }, async (tx) => {
      const trip = await tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: { status: true },
      });
      if (!isTripActive(trip.status)) return { status: trip.status, serverTime: new Date() };
      await tx.trip.update({
        where: { id: tripId },
        data: { lastHeartbeatAt: new Date(), lastDeviceState: state },
      });
      return { status: trip.status, serverTime: new Date() };
    });
  }

  /**
   * Ends a trip (PLAN §6.3). A normal end needs every child alighted or absent and an explicit
   * "vehicle is empty" confirmation. A forced end is always possible — the driver must never be
   * trapped — but any child still on board (or never accounted for) raises a critical alert.
   */
  async end(
    userId: string,
    tripId: string,
    input: { confirmEmpty: true } | { force: true; reason: string },
  ) {
    const ref = await loadTripFor(this.prisma, userId, tripId, 'end');
    const alertIds: string[] = [];
    const response = await this.prisma.withContext(
      { userId, orgId: ref.organizationId },
      async (tx) => {
        const trip = await lockTrip(tx, tripId);
        if (!isTripActive(trip.status)) throw Errors.conflict('trip_not_active');

        const riders = await tx.tripStudent.findMany({
          where: { tripId },
          select: {
            studentId: true,
            status: true,
            student: { select: { fullNameAr: true, fullNameEn: true } },
          },
        });
        const check = checkTripEnd(riders);
        const now = new Date();
        const names = (ids: string[]) =>
          riders
            .filter((r) => ids.includes(r.studentId))
            .map((r) => ({
              studentId: r.studentId,
              fullNameAr: r.student.fullNameAr,
              fullNameEn: r.student.fullNameEn,
            }));

        if ('confirmEmpty' in input) {
          if (check.onboard.length > 0) {
            throw new ApiError(HttpStatus.CONFLICT, 'students_onboard', undefined, {
              students: names(check.onboard),
            });
          }
          if (check.unresolved.length > 0) {
            throw new ApiError(HttpStatus.CONFLICT, 'students_unresolved', undefined, {
              students: names(check.unresolved),
            });
          }
          await tx.trip.update({
            where: { id: tripId },
            data: { status: 'completed', endedAt: now, endType: 'normal', emptyConfirmedAt: now },
          });
          return { ...(await this.summary(tx, tripId)), alertsOpened: 0 };
        }

        // Forced end: children never accounted for become "missing" — unknown is treated as danger.
        if (check.unresolved.length > 0) {
          await tx.tripStudent.updateMany({
            where: { tripId, studentId: { in: check.unresolved } },
            data: { status: 'missing' },
          });
        }
        const alerting = [
          ...check.onboard.map((studentId) => ({
            studentId,
            severity: 'critical' as const,
            reason: 'recorded_onboard',
          })),
          ...check.unresolved.map((studentId) => ({
            studentId,
            severity: 'high' as const,
            reason: 'never_recorded',
          })),
        ];
        const status: TripStatus = alerting.length > 0 ? 'completed_with_alert' : 'completed';
        await tx.trip.update({
          where: { id: tripId },
          data: { status, endedAt: now, endType: 'forced', forceReason: input.reason },
        });
        for (const a of alerting) {
          const alert = await tx.alert.create({
            data: {
              organizationId: ref.organizationId,
              tripId,
              studentId: a.studentId,
              type: 'student_left_onboard',
              severity: a.severity,
              // Escalation starts immediately (PLAN §7).
              nextEscalationAt: now,
            },
          });
          alertIds.push(alert.id);
          await tx.alertEvent.create({
            data: {
              organizationId: ref.organizationId,
              alertId: alert.id,
              action: 'opened',
              actorUserId: userId,
              payload: { reason: a.reason, forceReason: input.reason },
            },
          });
        }
        return { ...(await this.summary(tx, tripId)), alertsOpened: alerting.length };
      },
    );
    this.kickAlerts(alertIds);
    return response;
  }

  /** Sends new alerts right after commit instead of waiting for the minute job. */
  private kickAlerts(ids: string[]): void {
    if (ids.length > 0)
      this.effects.run('alert dispatch', () => this.escalation.processAlerts(ids));
  }

  /** Enrolled children not on this trip, for "add a student from the organisation" (PLAN §6.2). */
  async searchCandidates(userId: string, tripId: string, q: string) {
    const ref = await loadTripFor(this.prisma, userId, tripId, 'operate');
    return this.prisma.withContext({ userId, orgId: ref.organizationId }, async (tx) => {
      const rows = await tx.student.findMany({
        where: {
          deletedAt: null,
          orgStudents: { some: { organizationId: ref.organizationId, status: 'active' } },
          tripStudents: { none: { tripId } },
          ...(q ? { OR: studentSearchFilter(q) } : {}),
        },
        select: {
          id: true,
          publicCode: true,
          fullNameAr: true,
          fullNameEn: true,
          schoolName: true,
          photoVersion: true,
          guardians: {
            select: { guardian: { select: { fullNameAr: true, phoneE164: true } } },
            take: 2,
          },
        },
        orderBy: { fullNameAr: 'asc' },
        take: 20,
      });
      return rows.map(({ photoVersion, guardians, ...s }) => ({
        ...s,
        // Lets the driver see they found the right family, e.g. two brothers on one number.
        guardianNames: guardians.map((g) => g.guardian.fullNameAr),
        photoUrl: this.students.photoUrl(s.id, photoVersion),
      }));
    });
  }

  /** "Add a student from the organisation" for a child not on today's list (PLAN §6.2). */
  async addUnexpectedStudent(userId: string, tripId: string, studentId: string) {
    const ref = await loadTripFor(this.prisma, userId, tripId, 'operate');
    let alertId = '';
    const response = await this.prisma.withContext(
      { userId, orgId: ref.organizationId },
      async (tx) => {
        const trip = await lockTrip(tx, tripId);
        if (!isTripActive(trip.status)) throw Errors.conflict('trip_not_active');
        const enrolled = await tx.orgStudent.findFirst({
          where: { organizationId: ref.organizationId, studentId, status: 'active' },
        });
        if (!enrolled) throw Errors.badRequest('student_not_enrolled');
        const existing = await tx.tripStudent.findUnique({
          where: { tripId_studentId: { tripId, studentId } },
        });
        if (existing) throw Errors.conflict('student_already_on_trip');
        await tx.tripStudent.create({
          data: { organizationId: ref.organizationId, tripId, studentId, isUnexpected: true },
        });
        const alert = await tx.alert.create({
          data: {
            organizationId: ref.organizationId,
            tripId,
            studentId,
            type: 'unexpected_student',
            severity: 'low',
            nextEscalationAt: new Date(),
          },
        });
        alertId = alert.id;
        await tx.alertEvent.create({
          data: {
            organizationId: ref.organizationId,
            alertId: alert.id,
            action: 'opened',
            actorUserId: userId,
          },
        });
        return { tripId, studentId, status: 'expected', isUnexpected: true };
      },
    );
    this.kickAlerts([alertId]);
    return response;
  }

  private async summary(tx: Tx, tripId: string) {
    const trip = await tx.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        endedAt: true,
        endType: true,
        emptyConfirmedAt: true,
        students: { select: { status: true } },
      },
    });
    const { students, ...rest } = trip;
    return { ...rest, counts: countStatuses(students) };
  }
}

/** Serialises writers on one trip: events, start and end never interleave. */
async function lockTrip(tx: Tx, tripId: string) {
  const rows = await tx.$queryRaw<
    { status: TripStatus; started_at: Date | null; ended_at: Date | null; service_date: Date }[]
  >`SELECT status, started_at, ended_at, service_date FROM trips WHERE id = ${tripId}::uuid FOR UPDATE`;
  const trip = rows[0];
  if (!trip) throw Errors.notFound();
  return trip;
}

const TAP_STATUS = { board: 'boarded', alight: 'alighted', absent: 'absent' } as const;

/**
 * Rebuilds one child's projection. Returns one guardian notification per tap from `newEventIds`
 * that actually took effect, in device-time order — so a late offline batch still tells the
 * guardian both "boarded 6:45" and "got off 7:05", not just the final state.
 */
async function rebuildProjection(
  tx: Tx,
  tripId: string,
  studentId: string,
  newEventIds: ReadonlySet<string>,
): Promise<StatusChange[]> {
  const current = await tx.tripStudent.findUniqueOrThrow({
    where: { tripId_studentId: { tripId, studentId } },
    select: { status: true },
  });
  // A child whose alert was resolved by a human stays resolved (PLAN §7).
  if (current.status === 'resolved') return [];
  const events = await tx.tripEvent.findMany({
    where: { tripId, studentId },
    select: {
      id: true,
      eventType: true,
      undoesEventId: true,
      clientRecordedAt: true,
      serverReceivedAt: true,
    },
  });
  const folded = foldStudentEvents(
    events.map((e) => ({
      id: e.id,
      type: e.eventType,
      undoesEventId: e.undoesEventId,
      clientRecordedAt: e.clientRecordedAt,
      serverReceivedAt: e.serverReceivedAt,
    })),
  );
  // After a forced end an unaccounted child is "missing"; only a real tap may change that.
  const status =
    current.status === 'missing' && folded.status === 'expected' ? 'missing' : folded.status;
  await tx.tripStudent.update({
    where: { tripId_studentId: { tripId, studentId } },
    data: { status, boardedAt: folded.boardedAt, alightedAt: folded.alightedAt },
  });
  const byId = new Map(events.map((e) => [e.id, e]));
  return folded.applied
    .filter((id) => newEventIds.has(id))
    .map((id) => byId.get(id)!)
    .filter((e): e is typeof e & { eventType: keyof typeof TAP_STATUS } => e.eventType !== 'undo')
    .map((e) => ({ studentId, status: TAP_STATUS[e.eventType], at: e.clientRecordedAt }));
}

export function countStatuses(students: { status: TripStudentStatus }[]) {
  const c = { onboard: 0, alighted: 0, waiting: 0, absent: 0, missing: 0 };
  for (const s of students) {
    if (s.status === 'boarded') c.onboard++;
    else if (s.status === 'alighted' || s.status === 'resolved') c.alighted++;
    else if (s.status === 'expected') c.waiting++;
    else if (s.status === 'absent') c.absent++;
    else if (s.status === 'missing') c.missing++;
  }
  return c;
}
