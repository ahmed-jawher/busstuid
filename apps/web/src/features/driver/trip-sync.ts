import type { TripEventInput } from '@wusool/shared';
import { api, ApiError } from '@/lib/api';
import { platform } from '@/platform';

// Offline-first taps (PLAN §3.6, §13): every tap is written to a durable device queue first,
// then sent in batches. The server de-duplicates by clientEventId, so resending is always safe.

export interface QueuedTap {
  tripId: string;
  event: TripEventInput;
}

interface BatchResult {
  results: (
    | { clientEventId: string; status: 'accepted' | 'duplicate' }
    | { clientEventId: string; status: 'rejected'; reason: string }
  )[];
  students: { studentId: string; status: string }[];
}

const queue = platform.offlineQueue<QueuedTap>('trip-events');

export async function enqueueTap(tripId: string, event: TripEventInput): Promise<void> {
  await queue.enqueue(event.clientEventId, { tripId, event });
}

export async function pendingFor(tripId: string): Promise<QueuedTap[]> {
  return (await queue.list()).map((i) => i.payload).filter((p) => p.tripId === tripId);
}

let flushing: Promise<FlushOutcome> | null = null;

export interface FlushOutcome {
  sent: number;
  rejected: { clientEventId: string; reason: string }[];
  offline: boolean;
}

/**
 * Sends everything queued for a trip. Items leave the queue only once the server has answered
 * for them (accepted, duplicate or rejected); a network failure keeps them for the next try.
 */
export function flushTrip(tripId: string): Promise<FlushOutcome> {
  flushing ??= (async () => {
    try {
      const items = (await queue.list()).filter((i) => i.payload.tripId === tripId);
      if (items.length === 0) return { sent: 0, rejected: [], offline: false };
      try {
        const res = await api<BatchResult>(`/trips/${tripId}/events`, {
          method: 'POST',
          body: { events: items.slice(0, 500).map((i) => i.payload.event) },
        });
        await queue.remove(res.results.map((r) => r.clientEventId));
        return {
          sent: res.results.length,
          rejected: res.results.flatMap((r) =>
            r.status === 'rejected' ? [{ clientEventId: r.clientEventId, reason: r.reason }] : [],
          ),
          offline: false,
        };
      } catch (e) {
        if (e instanceof ApiError && e.status === 0)
          return { sent: 0, rejected: [], offline: true };
        // A trip that is no longer accepting taps: drop them so the queue cannot wedge, but report.
        if (e instanceof ApiError && (e.status === 404 || e.code === 'trip_not_started')) {
          await queue.remove(items.map((i) => i.id));
          return {
            sent: 0,
            rejected: items.map((i) => ({ clientEventId: i.id, reason: e.code })),
            offline: false,
          };
        }
        throw e;
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
