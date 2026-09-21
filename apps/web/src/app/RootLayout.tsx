import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import type { ThemeName } from '@wusool/ui-tokens';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { platform } from '@/platform';
import { applyTheme, prefs, type Scheme } from './preferences';

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const { signedIn } = useSession();
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

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 items-center px-2 text-sm font-semibold ${isActive ? 'text-primary underline underline-offset-4' : ''}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <div
        role="status"
        className="bg-warning px-4 py-2 text-center text-sm font-semibold text-white dark:text-black"
      >
        {t('app.betaBanner')}
      </div>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Link to="/" className="text-xl font-bold text-primary">
            {t('app.name')}
          </Link>
          <nav aria-label={t('nav.main')} className="flex flex-wrap items-center gap-1">
            {signedIn && (
              <>
                <NavLink to="/inbox" className={navLink}>
                  {t('nav.inbox')}
                </NavLink>
                <NavLink to="/settings" className={navLink}>
                  {t('nav.settings')}
                </NavLink>
              </>
            )}
            <Button
              variant="ghost"
              onClick={() => update(theme, scheme === 'dark' ? 'light' : 'dark')}
              aria-label={t('settings.scheme')}
            >
              {scheme === 'dark' ? '☀️' : '🌙'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => update(theme === 'bh' ? 'sa' : 'bh', scheme)}
              aria-label={t('settings.theme')}
            >
              {t(theme === 'bh' ? 'settings.themeBh' : 'settings.themeSa')}
            </Button>
            <Button
              variant="ghost"
              onClick={toggleLanguage}
              lang={i18n.language === 'ar' ? 'en' : 'ar'}
            >
              {t('settings.language')}
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
