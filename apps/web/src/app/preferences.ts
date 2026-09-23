import { useSyncExternalStore } from 'react';
import type { Locale } from '@wusool/shared';
import type { ThemeName } from '@wusool/ui-tokens';
import { platform } from '@/platform';

export type Scheme = 'light' | 'dark';

export const prefs = {
  locale: (): Locale => (platform.preferences.get('locale') === 'en' ? 'en' : 'ar'),
  // Bahrain only (Claude Design "Tammeni Brand"): the Saudi theme is no longer offered.
  theme: (): ThemeName => 'bh',
  // Dark by default: most use is inside the vehicle (PLAN §13).
  scheme: (): Scheme => (platform.preferences.get('scheme') === 'light' ? 'light' : 'dark'),
};

export function applyTheme(theme: ThemeName, scheme: Scheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.scheme = scheme;
}

// Theme and scheme can be changed from the header and from the admin "More" screen; both read
// them through this hook so they never disagree.
const listeners = new Set<() => void>();

export function setAppearance(theme: ThemeName, scheme: Scheme): void {
  platform.preferences.set('theme', theme);
  platform.preferences.set('scheme', scheme);
  applyTheme(theme, scheme);
  listeners.forEach((l) => l());
}

export function useAppearance(): { theme: ThemeName; scheme: Scheme } {
  const key = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => `${prefs.theme()}:${prefs.scheme()}`,
  );
  const [theme, scheme] = key.split(':') as [ThemeName, Scheme];
  return { theme, scheme };
}
