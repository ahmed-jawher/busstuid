import { Injectable } from '@nestjs/common';
import { Errors } from '../common/api-error';
import { PrismaService } from '../database/prisma.service';
import { StudentsService } from './students.service';

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentsService: StudentsService,
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
        student: { select: { id: true, fullNameAr: true, fullNameEn: true, schoolName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return rows;
  }

  async decide(
    orgId: string,
    adminId: string,
    requestId: string,
    decision: 'approved' | 'rejected',
    note?: string,
  ) {
    return this.prisma.withContext({ userId: adminId, orgId }, async (tx) => {
      const request = await tx.enrollmentRequest.findFirst({
        where: { id: requestId, organizationId: orgId },
      });
      if (!request) throw Errors.notFound();
      if (request.status !== 'pending') throw Errors.conflict('request_already_decided');
      const updated = await tx.enrollmentRequest.update({
        where: { id: requestId },
        data: {
          status: decision,
          decidedBy: adminId,
          decidedAt: new Date(),
          decisionNote: note ?? null,
        },
        select: { id: true, status: true, decidedAt: true, studentId: true },
      });
      if (decision === 'approved') {
        await tx.orgStudent.upsert({
          where: {
            organizationId_studentId: { organizationId: orgId, studentId: request.studentId },
          },
          create: { organizationId: orgId, studentId: request.studentId },
          update: { status: 'active', removedAt: null },
        });
      }
      return updated;
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
    }));
  }
}
