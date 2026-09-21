import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">{t(titleKey)}</h1>
      <p className="text-muted">{t('common.comingSoon')}</p>
      <Link to="/" className="font-semibold text-primary underline">
        {t('common.back')}
      </Link>
    </section>
  );
}
