import { describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));

describe('selectPlatform', () => {
  it('uses the web implementation in the browser', async () => {
    const { platform } = await import('./index');
    expect(platform.kind).toBe('web');
    expect(platform.localNotifications.worksInBackground).toBe(false);
  });
});
