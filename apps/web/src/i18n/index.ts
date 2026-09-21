import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@wusool/shared';
import ar from './ar.json';
import en from './en.json';

export const resources = { ar: { translation: ar }, en: { translation: en } } as const;

/** Keeps <html lang/dir> in sync so logical CSS properties flip correctly (PLAN §15). */
export function applyDocumentLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export function initI18n(locale: Locale): typeof i18n {
  void i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'ar',
    interpolation: { escapeValue: false },
  });
  applyDocumentLocale(locale);
  i18n.on('languageChanged', (lng) => applyDocumentLocale(lng as Locale));
  return i18n;
}
