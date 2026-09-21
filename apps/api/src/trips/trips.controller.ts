import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiHeaders, ApiTags } from '@nestjs/swagger';
import {
  addTripStudentSchema,
  endTripSchema,
  heartbeatSchema,
  isoDateSchema,
  tripEventsBatchSchema,
} from '@wusool/shared';
import { z } from 'zod';
import { Audit } from '../audit/audit';
import {
  Auth,
  Org,
  OrgRoles,
  RequireVerifiedEmail,
  type AuthContext,
  type OrgContext,
} from '../common/auth-context';
import { ApiZodBody, ApiZodQuery, zod } from '../common/zod';
import { PrismaService } from '../database/prisma.service';
import { GuardianTripsService } from './guardian-trips.service';
import { TripGenerationService } from './trip-generation.service';
import { countStatuses, TripsService } from './trips.service';

// Retried writes are safe without the header too: start/end are state-checked under a row lock
// and events are de-duplicated by clientEventId. The header is accepted for clients that send it.
const IDEMPOTENCY_HEADER = { name: 'Idempotency-Key', required: false };
const candidatesQuery = z.object({ q: z.string().trim().max(60).default('') });

@ApiTags('driver')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller()
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get('driver/today')
  today(@Auth() auth: AuthContext) {
    return this.trips.driverToday(auth.userId);
  }

  @Post('trips/:id/start')
  @Audit('trip.start', 'trip', { idParam: 'id' })
  @HttpCode(HttpStatus.OK)
  @ApiHeaders([IDEMPOTENCY_HEADER])
  start(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.start(auth.userId, id);
  }

  @Get('trips/:id/manifest')
  manifest(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.manifest(auth.userId, id);
  }

  @Post('trips/:id/events')
  @HttpCode(HttpStatus.OK)
  @ApiHeaders([IDEMPOTENCY_HEADER])
  @ApiZodBody(tripEventsBatchSchema)
  events(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(tripEventsBatchSchema)) body: z.output<typeof tripEventsBatchSchema>,
  ) {
    return this.trips.recordEvents(auth.userId, id, body.events);
  }

  @Post('trips/:id/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(heartbeatSchema)
  heartbeat(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(heartbeatSchema)) body: z.output<typeof heartbeatSchema>,
  ) {
    return this.trips.heartbeat(auth.userId, id, body.state);
  }

  @Post('trips/:id/end')
  @Audit('trip.end', 'trip', { idParam: 'id', bodyFields: ['confirmEmpty', 'force', 'reason'] })
  @HttpCode(HttpStatus.OK)
  @ApiHeaders([IDEMPOTENCY_HEADER])
  @ApiZodBody(endTripSchema)
  end(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(endTripSchema)) body: z.output<typeof endTripSchema>,
  ) {
    return this.trips.end(auth.userId, id, body);
  }

  @Get('trips/:id/candidates')
  @ApiZodQuery(candidatesQuery)
  candidates(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(candidatesQuery)) q: z.output<typeof candidatesQuery>,
  ) {
    return this.trips.searchCandidates(auth.userId, id, q.q);
  }

  @Post('trips/:id/students')
  @Audit('trip.add_unexpected_student', 'trip', { idParam: 'id', bodyFields: ['studentId'] })
  @ApiZodBody(addTripStudentSchema)
  addStudent(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(addTripStudentSchema)) body: z.output<typeof addTripStudentSchema>,
  ) {
    return this.trips.addUnexpectedStudent(auth.userId, id, body.studentId);
  }
}

const dateQuery = z.object({ date: isoDateSchema.optional() });

@ApiTags('organization')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@OrgRoles('org_admin')
@Controller('org/trips')
export class OrgTripsController {
  constructor(
    private readonly generation: TripGenerationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiZodQuery(dateQuery)
  async list(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Query(zod(dateQuery)) q: z.output<typeof dateQuery>,
  ) {
    const date = q.date ?? (await this.generation.today(org.id));
    const rows = await this.prisma.withContext({ userId: auth.userId, orgId: org.id }, (tx) =>
      tx.trip.findMany({
        where: { serviceDate: new Date(`${date}T00:00:00Z`) },
        orderBy: { plannedStartAt: 'asc' },
        select: {
          id: true,
          direction: true,
          status: true,
          plannedStartAt: true,
          plannedEndAt: true,
          startedAt: true,
          endedAt: true,
          endType: true,
          lastHeartbeatAt: true,
          driverId: true,
          route: { select: { name: true } },
          vehicle: { select: { plateNumber: true } },
          students: { select: { status: true } },
        },
      }),
    );
    return rows.map(({ students, ...trip }) => ({ ...trip, counts: countStatuses(students) }));
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(dateQuery)
  async generate(@Org() org: OrgContext, @Body(zod(dateQuery)) body: z.output<typeof dateQuery>) {
    const date = body.date ?? (await this.generation.today(org.id));
    return { date, ...(await this.generation.generateForOrg(org.id, date)) };
  }
}

const historyQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

@ApiTags('guardian')
@ApiBearerAuth()
@Controller('children')
export class GuardianTripsController {
  constructor(private readonly guardianTrips: GuardianTripsService) {}

  @Get(':id/today')
  today(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.guardianTrips.today(auth.userId, id);
  }

  @Get(':id/history')
  @ApiZodQuery(historyQuery)
  history(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(historyQuery)) q: z.output<typeof historyQuery>,
  ) {
    return this.guardianTrips.history(auth.userId, id, q.days);
  }
}
