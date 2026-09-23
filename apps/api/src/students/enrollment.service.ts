import { Injectable } from '@nestjs/common';
import type { NotificationTemplate } from '@wusool/shared';
import { Errors } from '../common/api-error';
import { SideEffects } from '../common/side-effects';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StudentsService } from './students.service';

/** How long an admin can take back an approval or rejection (a mis-tap, not a change of mind). */
export const DECISION_UNDO_MS = 10 * 60_000;

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentsService: StudentsService,
    private readonly notifications: NotificationsService,
    private readonly effects: SideEffects,
  ) {}

  /**
   * Pending requests show only the child's name and school — no photo, no birth date — until
   * the organisation approves (PLAN §5, §20.3). RLS hides unapproved students from the
   * organisation, so this narrow, org-filtered read runs on the system role on purpose.
   */
  async list(orgId: string, status: 'pending' | 'approved' | 'rejected') {
    const rows = await this.prisma.system.enrollmentRequest.findMany({
      where: { organizationId: orgId, status },
      select: {
        id: true,
        status: true,
        createdAt: true,
        decidedAt: true,
        requestedBy: true,
        student: {
          select: {
            id: true,
            fullNameAr: true,
            fullNameEn: true,
            schoolName: true,
            guardians: {
              select: {
                guardianUserId: true,
                relationship: true,
                guardian: { select: { fullNameAr: true, fullNameEn: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    // Who asked, and how they are related to the child, so the admin can recognise the family.
    return rows.map(({ requestedBy, student: { guardians, ...student }, ...row }) => {
      const g = guardians.find((x) => x.guardianUserId === requestedBy);
      return {
        ...row,
        student,
        guardian: g
          ? {
              fullNameAr: g.guardian.fullNameAr,
              fullNameEn: g.guardian.fullNameEn,
              relationship: g.relationship,
            }
          : null,
      };
    });
  }

  async decide(
    orgId: string,
    adminId: string,
    requestId: string,
    decision: 'approved' | 'rejected',
    note?: string,
  ) {
    return this.prisma
      .withContext({ userId: adminId, orgId }, async (tx) => {
        const request = await tx.enrollmentRequest.findFirst({
          where: { id: requestId, organizationId: orgId },
        });
        if (!request) throw Errors.notFound();
        if (request.status !== 'pending') throw Errors.conflict('request_already_decided');
        const at = new Date();
        const updated = await tx.enrollmentRequest.update({
          where: { id: requestId },
          data: {
            status: decision,
            decidedBy: adminId,
            decidedAt: at,
            decisionNote: note ?? null,
          },
          select: { id: true, status: true, decidedAt: true, studentId: true },
        });
        if (decision === 'approved') {
          const key = { organizationId: orgId, studentId: request.studentId };
          const link = await tx.orgStudent.findUnique({ where: { organizationId_studentId: key } });
          // joinedAt marks the link this approval made, which is what an undo may take back.
          if (!link) await tx.orgStudent.create({ data: { ...key, joinedAt: at } });
          else if (link.status !== 'active')
            await tx.orgStudent.update({
              where: { organizationId_studentId: key },
              data: { status: 'active', removedAt: null, joinedAt: at },
            });
        }
        return updated;
      })
      .then((updated) => {
        this.notifyGuardians(
          updated.studentId,
          orgId,
          decision === 'approved' ? 'enrollment_approved' : 'enrollment_rejected',
        );
        return updated;
      });
  }

  /**
   * Takes back an approval or rejection within {@link DECISION_UNDO_MS}. An approval can only be
   * undone while the child is not on any route yet, so no trip ever loses a child silently; the
   * guardian is told the request is waiting again (their trip notifications stop until then).
   */
  async undo(orgId: string, adminId: string, requestId: string) {
    const result = await this.prisma.withContext({ userId: adminId, orgId }, async (tx) => {
      const request = await tx.enrollmentRequest.findFirst({
        where: { id: requestId, organizationId: orgId },
      });
      if (!request) throw Errors.notFound();
      if (request.status !== 'approved' && request.status !== 'rejected')
        throw Errors.conflict('request_not_decided');
      if (!request.decidedAt || Date.now() - request.decidedAt.getTime() > DECISION_UNDO_MS)
        throw Errors.conflict('undo_window_passed');
      if (request.status === 'approved') {
        const onRoute = await tx.routeStudent.count({
          where: {
            organizationId: orgId,
            studentId: request.studentId,
            OR: [{ activeTo: null }, { activeTo: { gte: new Date() } }],
          },
        });
        if (onRoute > 0) throw Errors.conflict('student_on_route');
        // Only a link this approval created (or re-activated) is taken back.
        await tx.orgStudent.updateMany({
          where: {
            organizationId: orgId,
            studentId: request.studentId,
            status: 'active',
            joinedAt: { gte: request.decidedAt },
          },
          data: { status: 'removed', removedAt: new Date() },
        });
      }
      return tx.enrollmentRequest.update({
        where: { id: requestId },
        data: { status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null },
        select: { id: true, status: true, decidedAt: true, studentId: true },
      });
    });
    this.notifyGuardians(result.studentId, orgId, 'enrollment_reopened');
    return result;
  }

  private notifyGuardians(studentId: string, orgId: string, template: NotificationTemplate) {
    this.effects.run(`notify ${template}`, async () => {
      const ids = await this.prisma.systemTx(async (tx) => {
        const [student, org] = await Promise.all([
          tx.student.findUniqueOrThrow({
            where: { id: studentId },
            select: {
              fullNameAr: true,
              fullNameEn: true,
              guardians: { select: { guardianUserId: true } },
            },
          }),
          tx.organization.findUniqueOrThrow({
            where: { id: orgId },
            select: { nameAr: true, nameEn: true },
          }),
        ]);
        return this.notifications.createInTx(
          tx,
          student.guardians.map((g) => ({
            userId: g.guardianUserId,
            template,
            priority: template === 'enrollment_reopened' ? ('high' as const) : ('normal' as const),
            payload: {
              student: { ar: student.fullNameAr, en: student.fullNameEn },
              organization: { ar: org.nameAr, en: org.nameEn },
              url: `/child/${studentId}`,
            },
          })),
        );
      });
      await this.notifications.dispatch(ids);
    });
  }

  /** Approved students with photos — visible to the organisation through RLS. */
  async students(orgId: string, userId: string) {
    const rows = await this.prisma.withContext({ userId, orgId }, (tx) =>
      tx.orgStudent.findMany({
        where: { organizationId: orgId, status: 'active', student: { deletedAt: null } },
        select: {
          joinedAt: true,
          student: {
            select: {
              id: true,
              fullNameAr: true,
              fullNameEn: true,
              schoolName: true,
              dateOfBirth: true,
              photoVersion: true,
              // Current route and stop in this organisation (admin student list, PLAN §10).
              routeStudents: {
                where: {
                  organizationId: orgId,
                  OR: [{ activeTo: null }, { activeTo: { gte: new Date() } }],
                  route: { deletedAt: null, status: 'active' },
                },
                select: {
                  route: { select: { id: true, name: true, direction: true } },
                  stop: { select: { name: true, sequence: true } },
                },
              },
            },
          },
        },
        orderBy: { student: { fullNameAr: 'asc' } },
      }),
    );
    return rows.map(({ joinedAt, student }) => ({
      id: student.id,
      fullNameAr: student.fullNameAr,
      fullNameEn: student.fullNameEn,
      schoolName: student.schoolName,
      dateOfBirth: student.dateOfBirth.toISOString().slice(0, 10),
      joinedAt,
      photoUrl: this.studentsService.photoUrl(student.id, student.photoVersion),
      routes: student.routeStudents.map((r) => ({
        routeId: r.route.id,
        routeName: r.route.name,
        direction: r.route.direction,
        stopName: r.stop.name,
        stopSequence: r.stop.sequence,
      })),
    }));
  }
}
