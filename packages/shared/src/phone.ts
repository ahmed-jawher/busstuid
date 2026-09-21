import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import type { Country } from './enums';

/**
 * Normalises a phone number to E.164. Numbers are format-checked only, never verified
 * (PLAN §5.1). Local numbers are read in the given country (+973 / +966 by default).
 */
export function normalizePhone(raw: string, defaultCountry: Country): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}
