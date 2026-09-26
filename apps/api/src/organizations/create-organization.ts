import { randomUUID } from 'node:crypto';
import { COUNTRY_DEFAULTS, type Country, type OrganizationType } from '@wusool/shared';
import { Errors } from '../common/api-error';
import type { Tx } from '../database/prisma.service';
import { assertDriverPhoneAvailable } from './driver-phone';

export const PUBLIC_ORG = {
  id: true,
  type: true,
  nameAr: true,
  nameEn: true,
  country: true,
} as const;

export interface NewOrganization {
  type: OrganizationType;
  nameAr: string;
  nameEn: string;
  country: Country;
}

/**
 * Independent drivers are active at once: guardians only reach them by phone and must confirm
 * the name shown. Schools and companies start as `pending_review` and are hidden from the
 * directory until a platform admin approves them, so nobody can pose as a real school.
 * Used by "register an organisation" and by sign-up (after the email is verified).
 */
export async function createOrganization(tx: Tx, userId: string, input: NewOrganization) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const independent = input.type === 'independent_driver';
  if (independent) {
    const existing = await tx.membership.findFirst({
      where: {
        userId,
        role: 'org_admin',
        status: 'active',
        organization: { type: 'independent_driver' },
      },
    });
    if (existing) throw Errors.conflict('already_independent_driver');
    await assertDriverPhoneAvailable(tx, user.phoneE164, userId);
  }
  // Schools, kindergartens and companies must have names nobody else uses in that country
  // (PLAN §5 step 3): a guardian must never choose between two identical school names.
  // Independent drivers are found by phone, so two of them may share a name.
  const id = randomUUID();
  const keys = independent
    ? { nameKeyAr: id, nameKeyEn: id }
    : { nameKeyAr: input.nameAr.toLowerCase(), nameKeyEn: input.nameEn.toLowerCase() };
  if (!independent) {
    const clash = await tx.organization.findFirst({
      where: {
        country: input.country,
        type: input.type,
        OR: [{ nameKeyAr: keys.nameKeyAr }, { nameKeyEn: keys.nameKeyEn }],
      },
      select: { id: true },
    });
    if (clash) throw Errors.conflict('organization_name_taken');
  }
  const org = await tx.organization.create({
    data: {
      id,
      type: input.type,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      ...keys,
      country: input.country,
      timezone: COUNTRY_DEFAULTS[input.country].timezone,
      status: independent ? 'active' : 'pending_review',
    },
    select: { ...PUBLIC_ORG, status: true },
  });
  await tx.membership.create({ data: { userId, organizationId: org.id, role: 'org_admin' } });
  // An independent driver is the admin of their own organisation and its driver.
  if (independent) {
    await tx.membership.create({ data: { userId, organizationId: org.id, role: 'driver' } });
    await claimDriverInvitations(tx, org.id, user.phoneE164);
  }
  return org;
}

/**
 * Families who added this driver before they had an account (PLAN §5). Their invitations become
 * ordinary link requests, waiting in the driver's own list for them to accept — so a guardian who
 * wrote the number weeks ago does not have to do it again, and the driver still decides.
 */
async function claimDriverInvitations(
  tx: Tx,
  organizationId: string,
  phone: string,
): Promise<void> {
  const waiting = await tx.driverInvitation.findMany({
    where: { driverPhoneE164: phone, status: 'pending', student: { deletedAt: null } },
    select: { id: true, studentId: true, invitedBy: true },
  });
  for (const invitation of waiting) {
    const already = await tx.enrollmentRequest.findFirst({
      where: { studentId: invitation.studentId, organizationId, status: 'pending' },
      select: { id: true },
    });
    if (!already) {
      await tx.enrollmentRequest.create({
        data: {
          studentId: invitation.studentId,
          organizationId,
          requestedBy: invitation.invitedBy,
        },
      });
    }
    await tx.driverInvitation.update({
      where: { id: invitation.id },
      data: { status: 'linked', linkedOrganizationId: organizationId, linkedAt: new Date() },
    });
  }
}
