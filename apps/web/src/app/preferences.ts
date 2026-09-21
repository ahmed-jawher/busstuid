import type { Locale } from '@wusool/shared';
import type { ThemeName } from '@wusool/ui-tokens';
import { platform } from '@/platform';

export type Scheme = 'light' | 'dark';

export const prefs = {
  locale: (): Locale => (platform.preferences.get('locale') === 'en' ? 'en' : 'ar'),
  theme: (): ThemeName => (platform.preferences.get('theme') === 'sa' ? 'sa' : 'bh'),
  // Dark by default: most use is inside the vehicle (PLAN §13).
  scheme: (): Scheme => (platform.preferences.get('scheme') === 'light' ? 'light' : 'dark'),
};

export function applyTheme(theme: ThemeName, scheme: Scheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.scheme = scheme;
}
