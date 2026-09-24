import { describe, expect, it } from 'vitest';
import { createStudentSchema, normalizePhone, registerSchema } from './index';

describe('normalizePhone', () => {
  it('reads local numbers in the default country and returns E.164', () => {
    expect(normalizePhone('3600 1234', 'BH')).toBe('+97336001234');
    expect(normalizePhone('0501234567', 'SA')).toBe('+966501234567');
    expect(normalizePhone('+966 50 123 4567', 'BH')).toBe('+966501234567');
  });

  it('rejects invalid numbers', () => {
    expect(normalizePhone('12', 'BH')).toBeNull();
    expect(normalizePhone('not a phone', 'SA')).toBeNull();
  });
});

describe('registerSchema', () => {
  const valid = {
    email: '  Parent@Example.COM ',
    password: 'correct horse battery',
    fullNameAr: 'فاطمة علي',
    phone: '36001234',
    country: 'BH',
    acceptTerms: true,
  };

  it('normalises email and phone', () => {
    const out = registerSchema.parse(valid);
    expect(out.email).toBe('parent@example.com');
    expect(out.phone).toBe('+97336001234');
    expect(out.locale).toBe('ar');
  });

  it('rejects an invalid phone', () => {
    const res = registerSchema.safeParse({ ...valid, phone: '12345' });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe('phone_invalid');
  });

  it('refuses a sign-up that does not agree to the terms', () => {
    for (const acceptTerms of [undefined, false, 'true']) {
      const res = registerSchema.safeParse({ ...valid, acceptTerms });
      expect(res.success).toBe(false);
      expect(JSON.stringify(res.error?.issues)).toContain('terms_not_accepted');
    }
  });
});

describe('createStudentSchema', () => {
  it('requires explicit consent', () => {
    const res = createStudentSchema.safeParse({
      fullNameAr: 'سارة',
      dateOfBirth: '2018-05-01',
      schoolName: 'مدرسة',
      organizationId: '0192f5e0-0000-7000-8000-000000000000',
      consent: 'false',
    });
    expect(res.success).toBe(false);
  });
});
