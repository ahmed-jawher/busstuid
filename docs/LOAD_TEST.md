# Load test (PLAN §17 phase 5)

`pnpm --filter @wusool/api loadtest` — 200 trips at the same time against the real API and a
real PostgreSQL 16. Each virtual driver opens "today", starts the trip, reads the manifest, taps
10 children on and 10 off in batches of two with heartbeats in between, and ends the trip. The
watchdog and escalation jobs run every second alongside. All 200 drivers act **in lockstep**
(same second), which is harsher than any real morning.

Machine: Intel Core i7-8665U (8 threads, 1.9 GHz laptop), 16 GB, Windows. The load generator,
the API and PostgreSQL all run on this one machine, and the generator shares the API's Node
process — so the numbers are a pessimistic lower bound for a real server.

## Result: 200/200 trips completed, 0 errors (4 000 requests, 4 000 trip events)

### Realistic pace (`LOAD_THINK_MS=2000`: a tap every ~2 s per driver)

| Endpoint                   | Requests | Errors |        p50 |        p95 |     p99 |
| -------------------------- | -------: | -----: | ---------: | ---------: | ------: |
| GET /driver/today          |      200 |      0 |    1748 ms |    1792 ms | 1800 ms |
| POST /trips/:id/start      |      200 |      0 |    1544 ms |    2056 ms | 2113 ms |
| GET /trips/:id/manifest    |      200 |      0 |     781 ms |    1442 ms | 1603 ms |
| **POST /trips/:id/events** |     2000 |      0 | **453 ms** | **819 ms** |  903 ms |
| POST /trips/:id/heartbeat  |     1200 |      0 |     201 ms |     477 ms |  586 ms |
| POST /trips/:id/end        |      200 |      0 |     276 ms |     462 ms |  489 ms |

The slower first three rows are the 200-drivers-in-the-same-second burst at the start (the
first "today" also generates all 200 trips). Taps are saved on the device first and synced in
the background (PLAN §3.6), so tap latency is never visible to the driver.

### Stress pace (default, a request every ~100 ms per driver: ~7× real use)

Also 200/200 completed and 0 errors; latencies rise to p50 ≈ 1.8 s from queueing at about
140 requests per second on this laptop.

## What the load test found and fixed

The first run failed 199 of 200 "today" requests: every driver of the same organisation
generated that day's trips at once, and the generators raced on the one-trip-per-route-and-day
key until their transactions timed out. Generation is now shared by concurrent calls inside a
process and serialised across instances with a PostgreSQL advisory lock
(`TripGenerationService`), creating all missing trips in one transaction.

## Next steps when real traffic exists

- Measure on the production VPS (separate load generator machine).
- If tap latency matters there, the per-request trip-access lookup (two queries) can be cached
  for a few seconds, and `connection_limit` tuned to the VPS's cores.
