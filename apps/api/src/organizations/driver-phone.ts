import { Errors } from '../common/api-error';
import type { Tx } from '../database/prisma.service';

/**
 * Guardians link a child to an independent driver by the driver's phone number, and phone
 * numbers are not verified. So a number may belong to at most one active independent driver,
 * otherwise a stranger could register someone else's number and receive enrollment requests
 * (PLAN §5, §20.3). Must run inside a transaction on the system role.
 */
export async function assertDriverPhoneAvailable(
  tx: Tx,
  phone: string,
  exceptUserId?: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'driver-phone:' + phone}))`;
  const clash = await tx.membership.findFirst({
    where: {
      role: 'org_admin',
      status: 'active',
      organization: { type: 'independent_driver', status: { not: 'suspended' }, deletedAt: null },
      user: {
        phoneE164: phone,
        status: 'active',
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      },
    },
    select: { userId: true },
  });
  if (clash) throw Errors.conflict('phone_in_use_by_driver');
}

export async function isIndependentDriver(tx: Tx, userId: string): Promise<boolean> {
  const m = await tx.membership.findFirst({
    where: {
      userId,
      role: 'org_admin',
      status: 'active',
      organization: { type: 'independent_driver', deletedAt: null },
    },
    select: { userId: true },
  });
  return m !== null;
}
