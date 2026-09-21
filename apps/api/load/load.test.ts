// Load test (PLAN §17 phase 5): 200 trips at the same time against the real API on a real
// PostgreSQL 16. Each virtual driver starts a trip, taps 10 children on and off in small batches
// with heartbeats in between (the pattern of the driver app), and ends the trip — while the
// watchdog and escalation jobs run alongside. Run: pnpm --filter @wusool/api loadtest
// (through Vitest + SWC, because Nest needs decorator metadata).
import 'reflect-metadata';
import { expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { startTestPostgres } from '@wusool/dev-stack';
import { AppModule } from '../src/app.module';
import { signJwt } from '../src/auth/jwt';
import { configureApp } from '../src/bootstrap';
import { parseConfig } from '../src/config/env';
import { roleUrl, provisionLoginRoles } from '../src/database/roles';
import { JobsService } from '../src/jobs/jobs.service';
import { PUSH_PROVIDER } from '../src/push/push.provider';

const TRIPS = Number(process.env.LOAD_TRIPS ?? 200);
const CHILDREN = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Pause between a driver's requests. Default is a stress pace; LOAD_THINK_MS=2000 is realistic. */
const THINK_MS = Number(process.env.LOAD_THINK_MS ?? 100);
const jitter = () => sleep(THINK_MS * (0.4 + Math.random() * 1.2));

type Sample = { endpoint: string; ms: number; status: number };

async function main(): Promise<{ completed: number; errors: number }> {
  const started = Date.now();
  const pg = await startTestPostgres({ database: 'wusool_load' });
  const apiRoot = path.resolve(__dirname, '..');
  execSync(`"${path.join(apiRoot, 'node_modules/.bin/prisma')}" migrate deploy`, {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: pg.url, DATABASE_ADMIN_URL: pg.url },
    stdio: 'pipe',
  });
  await provisionLoginRoles(pg.url, { app: 'load-app', system: 'load-system' });
  const pool = (u: string) =>
    `${u}${u.includes('?') ? '&' : '?'}connection_limit=40&pool_timeout=20`;

  const config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: pool(roleUrl(pg.url, 'wusool_app', 'load-app')),
    DATABASE_SYSTEM_URL: pool(roleUrl(pg.url, 'wusool_system', 'load-system')),
    JWT_ACCESS_SECRET: 'load-access-secret-0123456789abcdef0123456',
    JWT_REFRESH_SECRET: 'load-refresh-secret-0123456789abcdef012345',
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
    PHOTO_URL_SECRET: 'load-photo-secret-0123456789abcdef01234567',
    VAPID_PUBLIC_KEY: 'unused',
    VAPID_PRIVATE_KEY: 'unused',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(PUSH_PROVIDER)
    .useValue({ send: async () => ({ ok: true }) })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, config);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/v1`.replace('[::1]', '127.0.0.1');
  const jobs = app.get(JobsService);

  // ── Seed: one organisation, TRIPS vehicles/drivers/routes, CHILDREN children per route ──
  console.log(`seeding ${TRIPS} trips × ${CHILDREN} children…`);
  const db = new PrismaClient({ datasourceUrl: pg.url });
  const org = await db.organization.create({
    data: {
      type: 'transport_company',
      nameAr: 'اختبار الحمل',
      country: 'BH',
      timezone: 'Asia/Bahrain',
      status: 'active',
    },
  });
  const guardian = await db.user.create({
    data: {
      email: 'load.guardian@example.com',
      phoneE164: '+97330000000',
      fullNameAr: 'ولي',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
  });
  await db.pushSubscription.create({
    data: {
      userId: guardian.id,
      provider: 'webpush',
      platform: 'web',
      endpoint: 'https://push.load.invalid/g',
      p256dh: 'k'.repeat(20),
      authSecret: 'a'.repeat(10),
      lastTestOkAt: new Date(),
    },
  });
  const drivers: { token: string; tripId?: string; children: string[] }[] = [];
  for (let i = 0; i < TRIPS; i++) {
    const driver = await db.user.create({
      data: {
        email: `load.driver.${i}@example.com`,
        phoneE164: `+9733${String(1_000_000 + i)}`,
        fullNameAr: `سائق ${i}`,
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
        memberships: { create: { organizationId: org.id, role: 'driver' } },
        pushSubscriptions: {
          create: {
            provider: 'webpush',
            platform: 'web',
            endpoint: `https://push.load.invalid/${i}`,
            p256dh: 'k'.repeat(20),
            authSecret: 'a'.repeat(10),
            lastTestOkAt: new Date(),
          },
        },
      },
    });
    const vehicle = await db.vehicle.create({
      data: { organizationId: org.id, plateNumber: `L ${i}`, type: 'bus', capacity: 30 },
    });
    const route = await db.route.create({
      data: {
        organizationId: org.id,
        name: `خط ${i}`,
        direction: 'to_school',
        defaultVehicleId: vehicle.id,
        defaultDriverId: driver.id,
        plannedStart: '00:01',
        plannedEnd: '23:58',
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        stops: { create: { organizationId: org.id, sequence: 1, name: 'محطة' } },
      },
      include: { stops: true },
    });
    const children: string[] = [];
    for (let c = 0; c < CHILDREN; c++) {
      const s = await db.student.create({
        data: {
          createdByGuardianId: guardian.id,
          fullNameAr: `طالب ${i}-${c}`,
          dateOfBirth: new Date('2016-01-01'),
          schoolName: 'مدرسة',
          guardians: {
            create: { guardianUserId: guardian.id, relationship: 'mother', isPrimary: true },
          },
          orgStudents: { create: { organizationId: org.id } },
        },
      });
      await db.routeStudent.create({
        data: {
          organizationId: org.id,
          routeId: route.id,
          studentId: s.id,
          stopId: route.stops[0]!.id,
          activeFrom: new Date('2026-01-01'),
        },
      });
      children.push(s.id);
    }
    drivers.push({
      token: signJwt({ sub: driver.id, ev: true }, config.jwtAccessSecret, 3600),
      children,
    });
  }

  const samples: Sample[] = [];
  const call = async (
    endpoint: string,
    token: string,
    method: string,
    url: string,
    body?: unknown,
  ) => {
    const t0 = performance.now();
    const res = await fetch(`${base}${url}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    samples.push({ endpoint, ms: performance.now() - t0, status: res.status });
    return res.ok ? res.json() : null;
  };

  // Every driver opens "today" (generates trips lazily) and finds their trip.
  await Promise.all(
    drivers.map(async (d) => {
      const today = (await call('GET /driver/today', d.token, 'GET', '/driver/today')) as
        { id: string }[] | null;
      d.tripId = today?.[0]?.id;
    }),
  );
  console.log(`running ${drivers.length} concurrent trips…`);
  const runStart = Date.now();
  let watchdogRuns = 0;
  let running = true;
  const background = (async () => {
    while (running) {
      await jobs.run('trip-watchdog');
      await jobs.run('alert-escalation');
      watchdogRuns++;
      await sleep(1000);
    }
  })();

  const tap = (studentId: string, type: string) => ({
    clientEventId: randomUUID(),
    studentId,
    type,
    clientRecordedAt: new Date().toISOString(),
  });
  await Promise.all(
    drivers.map(async (d) => {
      if (!d.tripId) return;
      await call('POST /trips/:id/start', d.token, 'POST', `/trips/${d.tripId}/start`);
      await call('GET /trips/:id/manifest', d.token, 'GET', `/trips/${d.tripId}/manifest`);
      for (const type of ['board', 'alight']) {
        for (let k = 0; k < CHILDREN; k += 2) {
          await jitter();
          await call('POST /trips/:id/events', d.token, 'POST', `/trips/${d.tripId}/events`, {
            events: d.children.slice(k, k + 2).map((s) => tap(s, type)),
          });
          if (k % 4 === 0) {
            await call(
              'POST /trips/:id/heartbeat',
              d.token,
              'POST',
              `/trips/${d.tripId}/heartbeat`,
              { state: 'foreground' },
            );
          }
        }
      }
      await call('POST /trips/:id/end', d.token, 'POST', `/trips/${d.tripId}/end`, {
        confirmEmpty: true,
      });
    }),
  );
  running = false;
  await background;
  const runSeconds = (Date.now() - runStart) / 1000;

  // ── Results ──
  const completed = await db.trip.count({ where: { status: 'completed' } });
  const events = await db.tripEvent.count();
  const byEndpoint = new Map<string, Sample[]>();
  for (const s of samples) byEndpoint.set(s.endpoint, [...(byEndpoint.get(s.endpoint) ?? []), s]);
  const pct = (xs: number[], p: number) =>
    xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;
  const rows = [...byEndpoint].map(([endpoint, list]) => {
    const ms = list.map((s) => s.ms).sort((a, b) => a - b);
    return {
      endpoint,
      requests: list.length,
      errors: list.filter((s) => s.status >= 400).length,
      p50: Math.round(pct(ms, 50)),
      p95: Math.round(pct(ms, 95)),
      p99: Math.round(pct(ms, 99)),
      max: Math.round(ms.at(-1)!),
    };
  });
  const report = {
    trips: TRIPS,
    thinkMs: THINK_MS,
    childrenPerTrip: CHILDREN,
    completedTrips: completed,
    tripEvents: events,
    requests: samples.length,
    errors: samples.filter((s) => s.status >= 400).length,
    runSeconds: Math.round(runSeconds),
    throughputRps: Math.round(samples.length / runSeconds),
    watchdogAndEscalationRuns: watchdogRuns,
    machine: `${os.cpus()[0]?.model.trim()} × ${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()}`,
    totalSeconds: Math.round((Date.now() - started) / 1000),
  };
  console.log(JSON.stringify(report, null, 2));
  console.table(rows);

  await db.$disconnect();
  await app.close();
  await pg.stop();
  return { completed, errors: report.errors };
}

it(`${TRIPS} concurrent trips complete without errors`, async () => {
  const result = await main();
  expect(result).toEqual({ completed: TRIPS, errors: 0 });
}, 900_000);
