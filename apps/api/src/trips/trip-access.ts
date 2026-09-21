import type { Role } from '@wusool/shared';
import { Errors } from '../common/api-error';
import type { PrismaService } from '../database/prisma.service';

export type TripAction =
  /** Start the trip: only the assigned driver. */
  | 'start'
  /** End it: the assigned driver, or an org admin (e.g. the driver forgot, PLAN §6.4). */
  | 'end'
  /** Record taps, read the manifest, heartbeat: driver, attendants and org admins. */
  | 'operate';

export interface TripRef {
  id: string;
  organizationId: string;
  driverId: string;
}

/**
 * Loads a trip and checks the caller may act on it. Unknown trips and trips of organisations the
 * caller does not belong to both answer 404, so trip ids cannot be probed.
 */
export async function loadTripFor(
  prisma: PrismaService,
  userId: string,
  tripId: string,
  action: TripAction,
): Promise<TripRef> {
  const trip = await prisma.system.trip.findUnique({
    where: { id: tripId },
    select: { id: true, organizationId: true, driverId: true },
  });
  if (!trip) throw Errors.notFound();
  const roles = (
    await prisma.system.membership.findMany({
      where: {
        userId,
        organizationId: trip.organizationId,
        status: 'active',
        organization: { status: { not: 'suspended' }, deletedAt: null },
      },
      select: { role: true },
    })
  ).map((m) => m.role as Role);
  if (roles.length === 0) throw Errors.notFound();

  const isDriver = trip.driverId === userId && roles.includes('driver');
  const isAdmin = roles.includes('org_admin');
  const allowed =
    action === 'start'
      ? isDriver
      : action === 'end'
        ? isDriver || isAdmin
        : isDriver || isAdmin || roles.includes('attendant');
  if (!allowed) throw Errors.forbidden('not_trip_crew');
  return trip;
}
