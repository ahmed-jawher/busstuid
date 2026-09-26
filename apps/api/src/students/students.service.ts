import { Inject, Injectable } from '@nestjs/common';
import {
  PRIVACY_POLICY_VERSION,
  type CreateStudentInput,
  type UpdateStudentInput,
} from '@wusool/shared';
import { Errors } from '../common/api-error';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService, type Tx } from '../database/prisma.service';
import { verifyPassword } from '../auth/passwords';
import { removeChildForGuardian } from './child-data';
import { processStudentPhoto, signPhotoUrl, verifyPhotoSignature } from './photos';

const CONSENT_PURPOSE = 'transport_safety';

const CHILD_SELECT = {
  id: true,
  publicCode: true,
  fullNameAr: true,
  fullNameEn: true,
  dateOfBirth: true,
  schoolName: true,
  notes: true,
  photoVersion: true,
  enrollmentRequests: {
    select: {
      id: true,
      status: true,
      createdAt: true,
      decidedAt: true,
      organization: { select: { id: true, type: true, nameAr: true, nameEn: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
  driverInvitations: {
    where: { status: 'pending' },
    select: { id: true, driverName: true, driverPhoneE164: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  },
} as const;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  photoUrl(studentId: string, version: number): string | null {
    return signPhotoUrl(this.config.publicApiUrl, this.config.photoUrlSecret, studentId, version);
  }

  /**
   * Guardian adds a child (PLAN §5 step 3): profile, mandatory face photo, consent, and a link
   * request to the transport organisation — all in one transaction.
   */
  async create(guardianId: string, input: CreateStudentInput, photo: Buffer) {
    if (input.organizationId) await this.assertOrganizationAcceptsStudents(input.organizationId);
    const processed = await processStudentPhoto(photo);
    const dob = parseBirthDate(input.dateOfBirth);

    const child = await this.prisma.withContext({ userId: guardianId }, async (tx) => {
      const student = await tx.student.create({
        data: {
          createdByGuardianId: guardianId,
          fullNameAr: input.fullNameAr,
          fullNameEn: input.fullNameEn ?? null,
          dateOfBirth: dob,
          schoolName: input.schoolName,
          notes: input.notes ?? null,
          photoVersion: 1,
        },
        select: { id: true },
      });
      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianUserId: guardianId,
          relationship: input.relationship,
          isPrimary: true,
        },
      });
      await tx.consent.create({
        data: {
          guardianUserId: guardianId,
          studentId: student.id,
          purpose: CONSENT_PURPOSE,
          policyVersion: PRIVACY_POLICY_VERSION,
        },
      });
      await tx.studentPhoto.create({ data: { studentId: student.id, ...processed } });
      if (input.organizationId) {
        await tx.enrollmentRequest.create({
          data: {
            studentId: student.id,
            organizationId: input.organizationId,
            requestedBy: guardianId,
          },
        });
      }
      return tx.student.findUniqueOrThrow({ where: { id: student.id }, select: CHILD_SELECT });
    });
    return this.toChild(child);
  }

  /**
   * Corrects a child's profile (PLAN §5). The school a family typed wrongly, or the child who
   * changed school, is edited here — linking to a transport organisation is a separate, deliberate
   * step, so nothing is re-sent to anybody by changing a name.
   */
  async update(guardianId: string, studentId: string, input: UpdateStudentInput) {
    const child = await this.prisma.withContext({ userId: guardianId }, async (tx) => {
      await this.findGuarded(tx, guardianId, studentId);
      await tx.student.update({
        where: { id: studentId },
        data: {
          ...(input.fullNameAr !== undefined ? { fullNameAr: input.fullNameAr } : {}),
          ...(input.fullNameEn !== undefined ? { fullNameEn: input.fullNameEn } : {}),
          ...(input.dateOfBirth !== undefined
            ? { dateOfBirth: parseBirthDate(input.dateOfBirth) }
            : {}),
          ...(input.schoolName !== undefined ? { schoolName: input.schoolName } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
      return tx.student.findUniqueOrThrow({ where: { id: studentId }, select: CHILD_SELECT });
    });
    return this.toChild(child);
  }

  /**
   * Takes a link request back while it is still pending — the family picked the wrong school, or
   * changed their mind. An approved link is not touched here: only the organisation removes a
   * child it already carries.
   */
  async withdrawEnrollment(guardianId: string, studentId: string, requestId: string) {
    return this.prisma.withContext({ userId: guardianId }, async (tx) => {
      await this.findGuarded(tx, guardianId, studentId);
      const request = await tx.enrollmentRequest.findFirst({
        where: { id: requestId, studentId, status: 'pending' },
        select: { id: true },
      });
      if (!request) throw Errors.notFound();
      await tx.enrollmentRequest.delete({ where: { id: request.id } });
      return { status: 'withdrawn' as const };
    });
  }

  /**
   * The family's driver has no account yet. Nothing is sent to the number (PLAN §2: no SMS): the
   * invitation waits, and turns into an ordinary link request the moment that driver registers
   * with the same number. `consentContact` is the guardian's permission for us to name them to
   * that driver, kept with the version, time, address and device (PLAN §14).
   */
  async inviteDriver(
    guardianId: string,
    studentId: string,
    input: { nameAr: string; phone: string },
    evidence: { ip?: string | null; userAgent?: string | null },
  ) {
    return this.prisma.withContext({ userId: guardianId }, async (tx) => {
      await this.findGuarded(tx, guardianId, studentId);
      const waiting = await tx.driverInvitation.findFirst({
        where: { studentId, driverPhoneE164: input.phone, status: 'pending' },
        select: { id: true },
      });
      if (waiting) throw Errors.conflict('driver_already_invited');
      return tx.driverInvitation.create({
        data: {
          studentId,
          invitedBy: guardianId,
          driverName: input.nameAr,
          driverPhoneE164: input.phone,
          policyVersion: PRIVACY_POLICY_VERSION,
          consentIp: evidence.ip ?? null,
          consentUserAgent: evidence.userAgent?.slice(0, 300) ?? null,
        },
        select: { id: true, driverName: true, driverPhoneE164: true, createdAt: true },
      });
    });
  }

  /** The guardian withdraws an invitation they no longer want followed up. */
  async cancelInvitation(guardianId: string, studentId: string, invitationId: string) {
    return this.prisma.withContext({ userId: guardianId }, async (tx) => {
      await this.findGuarded(tx, guardianId, studentId);
      const invitation = await tx.driverInvitation.findFirst({
        where: { id: invitationId, studentId, status: 'pending' },
        select: { id: true },
      });
      if (!invitation) throw Errors.notFound();
      await tx.driverInvitation.update({
        where: { id: invitation.id },
        data: { status: 'cancelled' },
      });
      return { status: 'cancelled' as const };
    });
  }

  async listChildren(guardianId: string) {
    const children = await this.prisma.withContext({ userId: guardianId }, (tx) =>
      tx.student.findMany({
        where: { deletedAt: null, guardians: { some: { guardianUserId: guardianId } } },
        select: CHILD_SELECT,
        orderBy: { createdAt: 'asc' },
      }),
    );
    return children.map((c) => this.toChild(c));
  }

  /** 404 rather than 403 for other people's children, so ids cannot be probed. */
  async getChild(guardianId: string, studentId: string) {
    const child = await this.prisma.withContext({ userId: guardianId }, (tx) =>
      this.findGuarded(tx, guardianId, studentId),
    );
    return this.toChild(child);
  }

  async replacePhoto(guardianId: string, studentId: string, photo: Buffer) {
    const processed = await processStudentPhoto(photo);
    const child = await this.prisma.withContext({ userId: guardianId }, async (tx) => {
      await this.findGuarded(tx, guardianId, studentId);
      await tx.studentPhoto.upsert({
        where: { studentId },
        create: { studentId, ...processed },
        update: processed,
      });
      await tx.student.update({
        where: { id: studentId },
        data: { photoVersion: { increment: 1 } },
      });
      return tx.student.findUniqueOrThrow({ where: { id: studentId }, select: CHILD_SELECT });
    });
    return this.toChild(child);
  }

  /** Links an existing child to one more organisation (e.g. a school and a transport company). */
  async requestEnrollment(guardianId: string, studentId: string, organizationId: string) {
    await this.assertOrganizationAcceptsStudents(organizationId);
    return this.prisma.withContext({ userId: guardianId }, async (tx) => {
      await this.findGuarded(tx, guardianId, studentId);
      const already = await tx.orgStudent.findFirst({
        where: { studentId, organizationId, status: 'active' },
      });
      if (already) throw Errors.conflict('already_enrolled');
      const pending = await tx.enrollmentRequest.findFirst({
        where: { studentId, organizationId, status: 'pending' },
      });
      if (pending) throw Errors.conflict('request_pending');
      return tx.enrollmentRequest.create({
        data: { studentId, organizationId, requestedBy: guardianId },
        select: { id: true, status: true, createdAt: true },
      });
    });
  }

  /**
   * Everything stored about a child, for the guardian's right of access (PLAN §14). Read under
   * RLS as the guardian, so it contains exactly what they are allowed to see.
   */
  async exportChild(guardianId: string, studentId: string) {
    return this.prisma.withContext({ userId: guardianId }, async (tx) => {
      const child = await this.findGuarded(tx, guardianId, studentId);
      const [photo, consents, trips, events, alerts] = await Promise.all([
        tx.studentPhoto.findUnique({
          where: { studentId },
          select: { content: true, mimeType: true },
        }),
        tx.consent.findMany({
          where: { studentId },
          select: { purpose: true, policyVersion: true, grantedAt: true, withdrawnAt: true },
        }),
        tx.tripStudent.findMany({
          where: { studentId },
          select: {
            status: true,
            boardedAt: true,
            alightedAt: true,
            stop: { select: { name: true } },
            trip: { select: { id: true, direction: true, serviceDate: true, status: true } },
          },
        }),
        tx.tripEvent.findMany({
          where: { studentId },
          orderBy: { clientRecordedAt: 'asc' },
          select: { tripId: true, eventType: true, clientRecordedAt: true, lat: true, lng: true },
        }),
        tx.alert.findMany({
          where: { studentId },
          select: {
            type: true,
            severity: true,
            status: true,
            openedAt: true,
            resolvedAt: true,
            resolutionReason: true,
          },
        }),
      ]);
      const { photoVersion: _v, ...profile } = child;
      return {
        exportedAt: new Date(),
        child: { ...profile, dateOfBirth: child.dateOfBirth.toISOString().slice(0, 10) },
        photo: photo
          ? `data:${photo.mimeType};base64,${Buffer.from(photo.content).toString('base64')}`
          : null,
        consents,
        trips,
        events,
        alerts,
      };
    });
  }

  /**
   * Guardian deletes a child's data (PLAN §14). With another guardian still linked, only the
   * caller's link is removed. Safety records (trip events, alerts) remain, without name or photo.
   */
  async deleteChild(guardianId: string, studentId: string, password: string) {
    const user = await this.prisma.system.user.findUnique({
      where: { id: guardianId },
      select: { passwordHash: true },
    });
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      throw Errors.forbidden('password_incorrect');
    }
    await this.prisma.withContext({ userId: guardianId }, (tx) =>
      this.findGuarded(tx, guardianId, studentId),
    );
    const outcome = await this.prisma.systemTx((tx) =>
      removeChildForGuardian(tx, studentId, guardianId),
    );
    return { outcome };
  }

  /** Serves a photo for a valid signed URL (the URL itself is the authorisation). */
  async photoForSignedUrl(studentId: string, version: number, exp: number, sig: string) {
    if (!verifyPhotoSignature(this.config.photoUrlSecret, studentId, version, exp, sig)) {
      throw Errors.forbidden('photo_link_invalid');
    }
    const photo = await this.prisma.system.studentPhoto.findFirst({
      where: { studentId, student: { photoVersion: version, deletedAt: null } },
      select: { content: true, mimeType: true, sha256: true },
    });
    if (!photo) throw Errors.notFound();
    return photo;
  }

  private async findGuarded(tx: Tx, guardianId: string, studentId: string) {
    const child = await tx.student.findFirst({
      where: {
        id: studentId,
        deletedAt: null,
        guardians: { some: { guardianUserId: guardianId } },
      },
      select: CHILD_SELECT,
    });
    if (!child) throw Errors.notFound();
    return child;
  }

  private async assertOrganizationAcceptsStudents(organizationId: string): Promise<void> {
    const org = await this.prisma.system.organization.findUnique({
      where: { id: organizationId },
      select: { status: true, deletedAt: true },
    });
    if (!org || org.deletedAt || org.status !== 'active') {
      throw Errors.badRequest('organization_unavailable');
    }
  }

  private toChild<T extends { id: string; photoVersion: number; dateOfBirth: Date }>(child: T) {
    const { photoVersion, dateOfBirth, ...rest } = child;
    return {
      ...rest,
      dateOfBirth: dateOfBirth.toISOString().slice(0, 10),
      photoUrl: this.photoUrl(child.id, photoVersion),
    };
  }
}

function parseBirthDate(iso: string): Date {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw Errors.badRequest('date_invalid');
  }
  const ageYears = (Date.now() - date.getTime()) / (365.25 * 24 * 3_600_000);
  if (ageYears < 2 || ageYears > 21) throw Errors.badRequest('date_of_birth_out_of_range');
  return date;
}
