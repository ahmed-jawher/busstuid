import { Injectable } from '@nestjs/common';
import { ENROLLABLE_ORG_TYPES, type Country, type EnrollableOrgType } from '@wusool/shared';
import { Errors } from '../common/api-error';
import { createOrganization, PUBLIC_ORG, type NewOrganization } from './create-organization';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, input: NewOrganization) {
    return this.prisma.systemTx((tx) => createOrganization(tx, userId, input));
  }

  /** Active schools and transport companies a guardian can pick from (PLAN §5 step 3). */
  directory(country: Country, type?: EnrollableOrgType, q?: string) {
    return this.prisma.system.organization.findMany({
      where: {
        country,
        status: 'active',
        deletedAt: null,
        type: type ?? { in: [...ENROLLABLE_ORG_TYPES] },
        ...(q
          ? {
              OR: [
                { nameAr: { contains: q, mode: 'insensitive' } },
                { nameEn: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: PUBLIC_ORG,
      orderBy: { nameAr: 'asc' },
      take: 50,
    });
  }

  /** Finds the independent driver behind a phone number so the guardian can confirm the name. */
  async lookupDriver(phone: string) {
    const match = await this.prisma.system.membership.findFirst({
      where: {
        role: 'org_admin',
        status: 'active',
        user: { phoneE164: phone, status: 'active' },
        organization: { type: 'independent_driver', status: 'active', deletedAt: null },
      },
      select: {
        organization: { select: PUBLIC_ORG },
        user: { select: { fullNameAr: true, fullNameEn: true } },
      },
    });
    if (!match) throw Errors.notFound('driver_not_found');
    return {
      ...match.organization,
      driverNameAr: match.user.fullNameAr,
      driverNameEn: match.user.fullNameEn,
    };
  }

  pendingReview() {
    return this.prisma.system.organization.findMany({
      where: { status: 'pending_review', deletedAt: null },
      select: { ...PUBLIC_ORG, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async setStatus(orgId: string, status: 'active' | 'suspended') {
    const org = await this.prisma.system.organization.findUnique({ where: { id: orgId } });
    if (!org || org.deletedAt) throw Errors.notFound();
    return this.prisma.system.organization.update({
      where: { id: orgId },
      data: { status },
      select: { ...PUBLIC_ORG, status: true },
    });
  }
}
