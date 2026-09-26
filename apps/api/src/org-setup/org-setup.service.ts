import { Injectable } from '@nestjs/common';
import { defaultRouteName, defaultStopName, type Role } from '@wusool/shared';
import type { z } from 'zod';
import type {
  routeSchema,
  updateRouteSchema,
  updateVehicleSchema,
  vehicleSchema,
} from '@wusool/shared';
import { Errors } from '../common/api-error';
import { PrismaService, type Tx } from '../database/prisma.service';
import { TripGenerationService } from '../trips/trip-generation.service';

type Ctx = { userId: string; orgId: string };

const ROUTE_SELECT = {
  id: true,
  name: true,
  direction: true,
  defaultVehicleId: true,
  defaultDriverId: true,
  plannedStart: true,
  plannedEnd: true,
  daysOfWeek: true,
  status: true,
  stops: {
    where: { deletedAt: null },
    orderBy: { sequence: 'asc' },
    select: { id: true, sequence: true, name: true, lat: true, lng: true },
  },
} as const;

/** Organisation admin setup: fleet, routes, stops, rider assignments and members (PLAN §11). */
@Injectable()
export class OrgSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: TripGenerationService,
  ) {}

  private tx<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>) {
    return this.prisma.withContext(ctx, fn);
  }

  // ── Vehicles ──

  listVehicles(ctx: Ctx) {
    return this.tx(ctx, (tx) =>
      tx.vehicle.findMany({ where: { deletedAt: null }, orderBy: { plateNumber: 'asc' } }),
    );
  }

  createVehicle(ctx: Ctx, input: z.output<typeof vehicleSchema>) {
    return this.tx(ctx, (tx) =>
      tx.vehicle.create({ data: { organizationId: ctx.orgId, ...input } }),
    );
  }

  async updateVehicle(ctx: Ctx, id: string, input: z.output<typeof updateVehicleSchema>) {
    return this.tx(ctx, async (tx) => {
      const found = await tx.vehicle.findFirst({ where: { id, deletedAt: null } });
      if (!found) throw Errors.notFound();
      return tx.vehicle.update({ where: { id }, data: input });
    });
  }

  // ── Routes ──

  listRoutes(ctx: Ctx) {
    return this.tx(ctx, (tx) =>
      tx.route.findMany({
        where: { deletedAt: null },
        select: ROUTE_SELECT,
        orderBy: { name: 'asc' },
      }),
    );
  }

  getRoute(ctx: Ctx, id: string) {
    return this.tx(ctx, async (tx) => {
      const route = await tx.route.findFirst({
        where: { id, deletedAt: null },
        select: {
          ...ROUTE_SELECT,
          students: {
            where: { activeTo: null },
            select: {
              studentId: true,
              stopId: true,
              student: { select: { fullNameAr: true, fullNameEn: true } },
            },
          },
        },
      });
      if (!route) throw Errors.notFound();
      return route;
    });
  }

  async createRoute(ctx: Ctx, input: z.output<typeof routeSchema>) {
    const route = await this.tx(ctx, async (tx) => {
      await this.assertVehicleAndDriver(
        tx,
        ctx.orgId,
        input.defaultVehicleId,
        input.defaultDriverId,
      );
      const { stops, name, ...route } = input;
      const created = await tx.route.create({
        data: {
          organizationId: ctx.orgId,
          ...route,
          // Both may be left out: a school should not have to invent a route name or a list of
          // stops before its bus can run (PLAN §11).
          name: name?.trim() || defaultRouteName(route.direction, route.plannedStart),
          daysOfWeek: [...new Set(route.daysOfWeek)],
        },
      });
      const stopList = stops.length > 0 ? stops : [{ name: defaultStopName(route.direction) }];
      await tx.routeStop.createMany({
        data: stopList.map((s, i) => ({
          organizationId: ctx.orgId,
          routeId: created.id,
          sequence: i + 1,
          name: s.name,
          lat: 'lat' in s ? s.lat : undefined,
          lng: 'lng' in s ? s.lng : undefined,
        })),
      });
      return tx.route.findUniqueOrThrow({ where: { id: created.id }, select: ROUTE_SELECT });
    });
    this.generation.invalidate(ctx.orgId);
    return route;
  }

  async updateRoute(ctx: Ctx, id: string, input: z.output<typeof updateRouteSchema>) {
    const route = await this.tx(ctx, async (tx) => {
      const route = await tx.route.findFirst({ where: { id, deletedAt: null } });
      if (!route) throw Errors.notFound();
      const start = input.plannedStart ?? route.plannedStart;
      const end = input.plannedEnd ?? route.plannedEnd;
      if (start >= end) throw Errors.badRequest('end_before_start');
      await this.assertVehicleAndDriver(
        tx,
        ctx.orgId,
        input.defaultVehicleId ?? route.defaultVehicleId,
        input.defaultDriverId ?? route.defaultDriverId,
      );
      return tx.route.update({
        where: { id },
        data: {
          ...input,
          daysOfWeek: input.daysOfWeek ? [...new Set(input.daysOfWeek)] : undefined,
        },
        select: ROUTE_SELECT,
      });
    });
    this.generation.invalidate(ctx.orgId);
    return route;
  }

  /**
   * Replaces who rides a route. Removed riders get an end date instead of being deleted, so
   * past manifests stay explainable.
   */
  setRouteStudents(
    ctx: Ctx,
    routeId: string,
    assignments: { studentId: string; stopId: string }[],
  ) {
    return this.tx(ctx, async (tx) => {
      const route = await tx.route.findFirst({
        where: { id: routeId, deletedAt: null },
        select: { id: true, stops: { where: { deletedAt: null }, select: { id: true } } },
      });
      if (!route) throw Errors.notFound();
      const stopIds = new Set(route.stops.map((s) => s.id));
      const studentIds = [...new Set(assignments.map((a) => a.studentId))];
      if (studentIds.length !== assignments.length) throw Errors.badRequest('duplicate_student');
      if (assignments.some((a) => !stopIds.has(a.stopId)))
        throw Errors.badRequest('stop_not_on_route');
      const enrolled = await tx.orgStudent.count({
        where: { organizationId: ctx.orgId, status: 'active', studentId: { in: studentIds } },
      });
      if (enrolled !== studentIds.length) throw Errors.badRequest('student_not_enrolled');

      const today = new Date(new Date().toISOString().slice(0, 10));
      await tx.routeStudent.updateMany({
        where: { routeId, activeTo: null },
        data: { activeTo: today },
      });
      await tx.routeStudent.createMany({
        data: assignments.map((a) => ({
          organizationId: ctx.orgId,
          routeId,
          studentId: a.studentId,
          stopId: a.stopId,
          activeFrom: today,
        })),
      });
      return { routeId, riders: assignments.length };
    });
  }

  // ── Members ──

  listMembers(ctx: Ctx) {
    return this.tx(ctx, (tx) =>
      tx.membership.findMany({
        where: { organizationId: ctx.orgId, status: 'active' },
        select: {
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              publicCode: true,
              email: true,
              fullNameAr: true,
              fullNameEn: true,
              phoneE164: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  /** Adds an existing, verified account to the organisation. */
  async addMember(
    ctx: Ctx,
    email: string,
    role: Extract<Role, 'org_admin' | 'driver' | 'attendant'>,
  ) {
    const user = await this.prisma.system.user.findFirst({
      where: { email, status: 'active' },
      select: { id: true, emailVerifiedAt: true },
    });
    if (!user) throw Errors.notFound('user_not_found');
    if (!user.emailVerifiedAt) throw Errors.badRequest('user_not_verified');
    return this.tx(ctx, (tx) =>
      tx.membership.upsert({
        where: { userId_organizationId_role: { userId: user.id, organizationId: ctx.orgId, role } },
        create: { userId: user.id, organizationId: ctx.orgId, role },
        update: { status: 'active' },
        select: { userId: true, role: true, status: true },
      }),
    );
  }

  async removeMember(ctx: Ctx, userId: string, role: Role) {
    return this.tx(ctx, async (tx) => {
      if (role === 'org_admin') {
        const admins = await tx.membership.count({
          where: { organizationId: ctx.orgId, role: 'org_admin', status: 'active' },
        });
        if (admins <= 1) throw Errors.conflict('last_admin');
      }
      const res = await tx.membership.updateMany({
        where: { organizationId: ctx.orgId, userId, role, status: 'active' },
        data: { status: 'revoked' },
      });
      if (res.count === 0) throw Errors.notFound();
    });
  }

  private async assertVehicleAndDriver(
    tx: Tx,
    orgId: string,
    vehicleId: string | null,
    driverId: string | null,
  ) {
    if (vehicleId) {
      const v = await tx.vehicle.findFirst({
        where: { id: vehicleId, deletedAt: null, status: 'active' },
      });
      if (!v) throw Errors.badRequest('vehicle_not_found');
    }
    if (driverId) {
      const d = await tx.membership.findFirst({
        where: { userId: driverId, organizationId: orgId, role: 'driver', status: 'active' },
      });
      if (!d) throw Errors.badRequest('driver_not_member');
    }
  }
}
