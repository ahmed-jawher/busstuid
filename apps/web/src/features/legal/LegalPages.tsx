import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { BackBar, Screen } from '@/components/ui/kit';
import { PRIVACY_AR, PRIVACY_EN, TERMS_AR, TERMS_EN, type LegalDocument } from './legal-content';

/**
 * An agreement, read the way an agreement is read: a preamble and numbered clauses, each one
 * citable on its own. The stores need a public address for both documents, so the page opens
 * without an account, and its back button works even when opened from outside the app.
 */
function LegalScreen({ doc, other }: { doc: LegalDocument; other: { to: string; label: string } }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Back goes back, to the half-filled sign-up form or the settings screen the reader came from —
  // not to the start of the app, which threw their answers away. Opened from a store listing
  // there is nothing behind it, and then the welcome screen is the right place.
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/welcome'));
  return (
    <Screen className="gap-4">
      <BackBar onBack={back} title={doc.title} />
      <article className="flex flex-col gap-4 pb-10 text-[15px] leading-loose">
        <header className="flex flex-col gap-2">
          <h1 className="text-[26px] font-bold">{doc.title}</h1>
          <p className="text-xs text-muted">
            {t('legal.updated')}: {doc.updated}
          </p>
          <p className="text-justify">{doc.preamble}</p>
        </header>
        <ol className="flex flex-col gap-3.5">
          {doc.clauses.map((clause) => (
            <li key={clause} className="text-justify">
              {clause}
            </li>
          ))}
        </ol>
        <nav className="flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm font-semibold text-primary">
          <Link to={other.to}>{t(other.label)}</Link>
          <button type="button" onClick={back} className="min-h-11">
            {t('common.back')}
          </button>
        </nav>
      </article>
    </Screen>
  );
}

const inArabic = (language: string) => !language.startsWith('en');

export function PrivacyPage() {
  const { i18n } = useTranslation();
  return (
    <LegalScreen
      doc={inArabic(i18n.language) ? PRIVACY_AR : PRIVACY_EN}
      other={{ to: '/terms', label: 'legal.terms' }}
    />
  );
}

export function TermsPage() {
  const { i18n } = useTranslation();
  return (
    <LegalScreen
      doc={inArabic(i18n.language) ? TERMS_AR : TERMS_EN}
      other={{ to: '/privacy', label: 'legal.privacy' }}
    />
  );
}
