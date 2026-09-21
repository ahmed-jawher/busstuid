import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import type { ThemeName } from '@wusool/ui-tokens';
import { Button } from '@/components/ui/button';
import { platform } from '@/platform';
import { applyTheme, prefs, type Scheme } from './preferences';

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<ThemeName>(prefs.theme);
  const [scheme, setScheme] = useState<Scheme>(prefs.scheme);

  const toggleLanguage = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    platform.preferences.set('locale', next);
    void i18n.changeLanguage(next);
  };

  const update = (nextTheme: ThemeName, nextScheme: Scheme) => {
    setTheme(nextTheme);
    setScheme(nextScheme);
    platform.preferences.set('theme', nextTheme);
    platform.preferences.set('scheme', nextScheme);
    applyTheme(nextTheme, nextScheme);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <div
        role="status"
        className="bg-warning px-4 py-2 text-center text-sm font-semibold text-white dark:text-black"
      >
        {t('app.betaBanner')}
      </div>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <Link to="/" className="text-xl font-bold text-primary">
          {t('app.name')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => update(theme === 'bh' ? 'sa' : 'bh', scheme)}>
            {t('settings.theme')}: {t(theme === 'bh' ? 'settings.themeBh' : 'settings.themeSa')}
          </Button>
          <Button
            variant="outline"
            onClick={() => update(theme, scheme === 'dark' ? 'light' : 'dark')}
          >
            {t('settings.scheme')}: {t(scheme === 'dark' ? 'settings.dark' : 'settings.light')}
          </Button>
          <Button
            variant="ghost"
            onClick={toggleLanguage}
            lang={i18n.language === 'ar' ? 'en' : 'ar'}
          >
            {t('settings.language')}
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
