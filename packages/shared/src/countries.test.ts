import { describe, expect, it } from 'vitest';
import { COUNTRIES, COUNTRY_DEFAULTS } from './index';

describe('COUNTRY_DEFAULTS', () => {
  it('defines defaults for every supported country', () => {
    for (const country of COUNTRIES) {
      expect(COUNTRY_DEFAULTS[country].emergencyNumber).toMatch(/^\d{3}$/);
    }
  });

  it('uses the correct emergency numbers', () => {
    expect(COUNTRY_DEFAULTS.BH.emergencyNumber).toBe('999');
    expect(COUNTRY_DEFAULTS.SA.emergencyNumber).toBe('911');
  });
});
