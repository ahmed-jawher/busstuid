import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { BackBar, Screen } from '@/components/ui/kit';
import { LEGAL } from './legal-content';

/**
 * How to delete an account and a child's data, on a page that opens without signing in.
 *
 * Google Play and the App Store both require a public address that explains this for any app
 * with accounts, and a person who has already deleted the app cannot be asked to open it to find
 * out. What it describes is exactly what the code does (me.service.ts `deleteAccount`,
 * child-data.ts `removeChildForGuardian`, jobs/retention.service.ts).
 */
export function DeleteAccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/welcome'));
  const steps = t('del.steps', { returnObjects: true }) as string[];
  const removed = t('del.removedList', { returnObjects: true }) as string[];
  const kept = t('del.keptList', { returnObjects: true }) as string[];
  return (
    <Screen className="gap-4">
      <BackBar onBack={back} title={t('del.title')} />
      <article className="flex flex-col gap-5 pb-10 text-[15px] leading-relaxed">
        <h1 className="text-[26px] font-bold">{t('del.title')}</h1>
        <p className="text-justify">{t('del.intro')}</p>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{t('del.inApp')}</h2>
          <ol className="flex list-decimal flex-col gap-1.5 ps-5">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{t('del.byEmail')}</h2>
          <p className="text-justify">{t('del.byEmailBody')}</p>
          <a
            href={`mailto:${LEGAL.contactEmail}?subject=${encodeURIComponent(t('del.mailSubject'))}`}
            dir="ltr"
            className="font-semibold text-primary underline"
          >
            {LEGAL.contactEmail}
          </a>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{t('del.removed')}</h2>
          <ul className="flex list-disc flex-col gap-1.5 ps-5">
            {removed.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{t('del.kept')}</h2>
          <p className="text-justify">{t('del.keptWhy')}</p>
          <ul className="flex list-disc flex-col gap-1.5 ps-5">
            {kept.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <nav className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm font-semibold text-primary">
          <Link to="/privacy">{t('legal.privacy')}</Link>
          <Link to="/terms">{t('legal.terms')}</Link>
        </nav>
      </article>
    </Screen>
  );
}
