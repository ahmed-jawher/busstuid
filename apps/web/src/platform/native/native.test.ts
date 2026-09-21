// Native device ports with the Capacitor plugins replaced by fakes (PLAN §20, phase 6): the
// real plugins only run inside the Android/iOS apps.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (payload: never) => void;
const state = vi.hoisted(() => ({
  platform: 'android',
  pushPermission: 'prompt' as string,
  grant: 'granted' as string,
  listeners: new Map<string, (payload: unknown) => void>(),
  registerOutcome: { token: 'fcm-token' } as { token?: string; error?: string },
  scheduled: [] as { id: number; schedule: { at: Date } }[],
  cancelled: [] as number[],
  channels: [] as string[],
}));

const listen = (event: string, fn: Listener) => {
  state.listeners.set(event, fn as (payload: unknown) => void);
  return Promise.resolve({ remove: async () => void state.listeners.delete(event) });
};

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => state.platform, isNativePlatform: () => false },
}));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: listen,
    checkPermissions: async () => ({ receive: state.pushPermission }),
    requestPermissions: async () => ({ receive: state.grant }),
    register: async () => {
      queueMicrotask(() => {
        const { token, error } = state.registerOutcome;
        if (token) state.listeners.get('registration')?.({ value: token });
        else state.listeners.get('registrationError')?.({ error });
      });
    },
    unregister: async () => undefined,
    createChannel: async (c: { id: string }) => void state.channels.push(`push:${c.id}`),
  },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    addListener: listen,
    checkPermissions: async () => ({ display: 'prompt' }),
    requestPermissions: async () => ({ display: state.grant }),
    schedule: async ({ notifications }: { notifications: typeof state.scheduled }) =>
      void state.scheduled.push(...notifications),
    cancel: async ({ notifications }: { notifications: { id: number }[] }) =>
      void state.cancelled.push(...notifications.map((n) => n.id)),
    getPending: async () => ({ notifications: state.scheduled.map((n) => ({ id: n.id })) }),
    createChannel: async (c: { id: string }) => void state.channels.push(`local:${c.id}`),
  },
}));
vi.mock('@aparajita/capacitor-secure-storage', () => {
  const store = new Map<string, string>([['broken', '']]);
  return {
    SecureStorage: {
      get: async (k: string) => {
        if (k === 'broken') throw new Error('corrupt');
        return store.get(k) ?? null;
      },
      set: async (k: string, v: string) => void store.set(k, v),
      remove: async (k: string) => store.delete(k),
    },
  };
});
vi.mock('@capacitor/camera', () => ({
  Camera: {
    getPhoto: async () => {
      throw new Error('User cancelled photos app');
    },
  },
  CameraResultType: { Uri: 'uri' },
  CameraSource: { Prompt: 'PROMPT' },
}));
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    getCurrentPosition: async () => ({ coords: { latitude: 24.7, longitude: 46.6, accuracy: 12 } }),
  },
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: async () => undefined },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING' },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: listen } }));
vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: { keepAwake: async () => undefined, allowSleep: async () => undefined },
}));
vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));

const { selectPlatform } = await import('../index');
const { numericIds, REPEATS } = await import('./local-notifications');
const { openInApp } = await import('./open-url');

beforeEach(() => {
  state.platform = 'android';
  state.pushPermission = 'prompt';
  state.grant = 'granted';
  state.registerOutcome = { token: 'fcm-token' };
  state.scheduled.length = 0;
  state.cancelled.length = 0;
});

describe('native platform', () => {
  it('is selected in the apps, schedules in the background and creates Android channels', async () => {
    const p = selectPlatform(true);
    expect(p.kind).toBe('native');
    expect(p.localNotifications.worksInBackground).toBe(true);
    await vi.waitFor(() =>
      expect(state.channels).toEqual(
        expect.arrayContaining([
          'push:wusool_critical',
          'push:wusool_default',
          'local:wusool_reminders',
        ]),
      ),
    );
  });

  it('registers Android devices with FCM and iPhones with APNs', async () => {
    expect(await selectPlatform(true).push.subscribe('unused')).toEqual({
      provider: 'fcm',
      platform: 'android',
      nativeToken: 'fcm-token',
    });
    state.platform = 'ios';
    state.registerOutcome = { token: 'ab'.repeat(32) };
    expect(await selectPlatform(true).push.subscribe('unused')).toEqual({
      provider: 'apns',
      platform: 'ios',
      nativeToken: 'ab'.repeat(32),
    });
  });

  it('reports a refused permission or a failed registration', async () => {
    state.grant = 'denied';
    const push = selectPlatform(true).push;
    await expect(push.subscribe('unused')).rejects.toThrow('push-permission-denied');
    state.grant = 'granted';
    state.registerOutcome = { error: 'no google play services' };
    await expect(push.subscribe('unused')).rejects.toThrow(/push-registration-failed/);
    state.pushPermission = 'prompt-with-rationale';
    expect(await push.permission()).toBe('prompt');
  });

  it('opens the screen of a tapped notification, and only screens of this app', () => {
    const opened: string[] = [];
    const go = (u: string) => opened.push(u);
    openInApp('/alert/42', go);
    openInApp('https://evil.example', go);
    openInApp('//evil.example', go);
    openInApp('/\\evil.example', go);
    openInApp(42, go);
    expect(opened).toEqual(['/alert/42']);
  });

  it('schedules a repeating driver reminder as a series and cancels all of it', async () => {
    const local = selectPlatform(true).localNotifications;
    expect(await local.requestPermission()).toBe(true);
    const before = Date.now();
    await local.schedule({ id: 'trip-1', title: 'تذكير', body: 'أنهِ الرحلة', everyMinutes: 5 });
    expect(state.scheduled).toHaveLength(REPEATS);
    const times = state.scheduled.map((n) => n.schedule.at.getTime() - before);
    expect(times[0]).toBeGreaterThanOrEqual(5 * 60_000);
    expect(times[1]! - times[0]!).toBe(5 * 60_000);

    state.cancelled.length = 0;
    await local.cancel('trip-1');
    expect(state.cancelled).toEqual(numericIds('trip-1'));
    await local.schedule({ id: 'once', title: 't', body: 'b' });
    expect(state.scheduled).toHaveLength(REPEATS + 1);
    state.cancelled.length = 0;
    await local.cancelAll();
    expect(state.cancelled).toEqual(state.scheduled.map((n) => n.id));
  });

  it('gives each reminder its own stable range of notification ids', () => {
    expect(numericIds('trip-1')).toEqual(numericIds('trip-1'));
    const a = new Set(numericIds('trip-1'));
    expect(numericIds('trip-2').some((n) => a.has(n))).toBe(false);
    expect(Math.max(...numericIds('x'.repeat(500)))).toBeLessThan(2 ** 31);
  });

  it('keeps secrets in the keychain and treats a corrupt entry as signed out', async () => {
    const storage = selectPlatform(true).secureStorage;
    await storage.set('refresh', 'token-1');
    expect(await storage.get('refresh')).toBe('token-1');
    await storage.remove('refresh');
    expect(await storage.get('refresh')).toBeNull();
    expect(await storage.get('broken')).toBeNull();
  });

  it('degrades gracefully: cancelled photo, one-shot location, lifecycle listeners', async () => {
    const p = selectPlatform(true);
    expect(await p.camera.pickPhoto()).toBeNull();
    expect(await p.geolocation.current()).toEqual({ lat: 24.7, lng: 46.6, accuracyM: 12 });
    let paused = 0;
    const stop = p.appLifecycle.onPause(() => paused++);
    await vi.waitFor(() => expect(state.listeners.has('pause')).toBe(true));
    state.listeners.get('pause')?.(undefined);
    expect(paused).toBe(1);
    stop();
    await vi.waitFor(() => expect(state.listeners.has('pause')).toBe(false));
    p.haptics.success();
    await p.keepAwake.enable();
    await p.keepAwake.disable();
  });
});
