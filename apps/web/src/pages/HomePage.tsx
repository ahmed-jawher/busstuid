import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

const ROLES = [
  { to: '/driver', key: 'home.driver', icon: '🚌' },
  { to: '/guardian', key: 'home.guardian', icon: '👪' },
  { to: '/admin', key: 'home.admin', icon: '🏫' },
] as const;

export function HomePage() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('app.name')}</h1>
        <p className="text-muted">{t('app.tagline')}</p>
      </div>
      <h2 className="text-lg font-semibold">{t('home.chooseRole')}</h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <li key={r.to}>
            <Link
              to={r.to}
              className="flex min-h-touch items-center gap-3 rounded-lg border border-border bg-surface p-4 text-lg font-semibold"
            >
              <span aria-hidden="true">{r.icon}</span>
              {t(r.key)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
