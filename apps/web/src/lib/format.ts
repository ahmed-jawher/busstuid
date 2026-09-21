import i18n from 'i18next';

const locale = () => (i18n.language === 'en' ? 'en-GB' : 'ar-BH');

// Latin digits by default (PLAN §15); the `nu` extension keeps Arabic text with 0-9 digits.
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(`${locale()}-u-nu-latn`, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(`${locale()}-u-nu-latn`, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

export function displayName(p: { fullNameAr: string; fullNameEn?: string | null }): string {
  return i18n.language === 'en' && p.fullNameEn ? p.fullNameEn : p.fullNameAr;
}

export function orgName(o: { nameAr: string; nameEn?: string | null }): string {
  return i18n.language === 'en' && o.nameEn ? o.nameEn : o.nameAr;
}
