import { Injectable } from '@nestjs/common';
import { COUNTRY_DEFAULTS, type Country, type OrganizationType } from '@wusool/shared';
import { Errors } from '../common/api-error';
import { PrismaService } from '../database/prisma.service';
import { assertDriverPhoneAvailable } from './driver-phone';

const PUBLIC_ORG = { id: true, type: true, nameAr: true, nameEn: true, country: true } as const;

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Independent drivers are active at once: guardians only reach them by phone and must confirm
   * the name shown. Schools and companies start as `pending_review` and are hidden from the
   * directory until a platform admin approves them, so nobody can pose as a real school.
   */
  async create(
    userId: string,
    input: { type: OrganizationType; nameAr: string; nameEn?: string; country: Country },
  ) {
    return this.prisma.systemTx(async (tx) => {
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
      const org = await tx.organization.create({
        data: {
          type: input.type,
          nameAr: input.nameAr,
          nameEn: input.nameEn ?? null,
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
      }
      return org;
    });
  }

  /** Active schools and transport companies a guardian can pick from (PLAN §5 step 3). */
  directory(country: Country, type?: 'school' | 'transport_company') {
    return this.prisma.system.organization.findMany({
      where: {
        country,
        status: 'active',
        deletedAt: null,
        type: type ?? { in: ['school', 'transport_company'] },
      },
      select: PUBLIC_ORG,
      orderBy: { nameAr: 'asc' },
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
