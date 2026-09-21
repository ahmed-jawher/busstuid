import type { Country } from './enums';

export interface CountryDefaults {
  dialCode: string;
  timezone: string;
  emergencyNumber: string;
  theme: 'bh' | 'sa';
}

// PLAN §20.3: per-country defaults.
export const COUNTRY_DEFAULTS: Record<Country, CountryDefaults> = {
  BH: { dialCode: '+973', timezone: 'Asia/Bahrain', emergencyNumber: '999', theme: 'bh' },
  SA: { dialCode: '+966', timezone: 'Asia/Riyadh', emergencyNumber: '911', theme: 'sa' },
};
