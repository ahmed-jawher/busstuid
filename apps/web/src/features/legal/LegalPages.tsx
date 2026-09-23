import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BackBar, Screen } from '@/components/ui/kit';
import { PRIVACY_AR, PRIVACY_EN, TERMS_AR, TERMS_EN, type LegalDocument } from './legal-content';

/** The stores need a public address for both documents, readable without an account. */
function LegalScreen({ doc }: { doc: LegalDocument }) {
  const { t } = useTranslation();
  return (
    <Screen className="gap-4">
      <BackBar title={doc.title} />
      <article className="flex flex-col gap-5 pb-10 text-[15px] leading-relaxed">
        <header className="flex flex-col gap-2">
          <h1 className="text-[26px] font-bold">{doc.title}</h1>
          <p className="text-xs text-muted">
            {t('legal.updated')}: {doc.updated}
          </p>
          {doc.intro.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </header>
        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">{section.heading}</h2>
            {section.body.map((line) =>
              line.startsWith('- ') ? (
                <p key={line} className="ps-4 before:content-['•'] before:me-2 before:text-muted">
                  {line.slice(2)}
                </p>
              ) : (
                <p key={line}>{line}</p>
              ),
            )}
          </section>
        ))}
        <nav className="flex gap-4 border-t border-border pt-4 text-sm font-semibold text-primary">
          <Link to="/privacy">{t('legal.privacy')}</Link>
          <Link to="/terms">{t('legal.terms')}</Link>
        </nav>
      </article>
    </Screen>
  );
}

const inArabic = (language: string) => !language.startsWith('en');

export function PrivacyPage() {
  const { i18n } = useTranslation();
  return <LegalScreen doc={inArabic(i18n.language) ? PRIVACY_AR : PRIVACY_EN} />;
}

export function TermsPage() {
  const { i18n } = useTranslation();
  return <LegalScreen doc={inArabic(i18n.language) ? TERMS_AR : TERMS_EN} />;
}
