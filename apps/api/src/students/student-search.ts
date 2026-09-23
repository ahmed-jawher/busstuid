import type { Prisma } from '@prisma/client';

/**
 * One search box for drivers and schools: a name, the child's short code, or the guardian's
 * phone number — brothers and sisters share a number, so a phone search finds them together
 * (PLAN §6.2).
 */
export function studentSearchFilter(q: string): Prisma.StudentWhereInput[] {
  const filters: Prisma.StudentWhereInput[] = [
    { fullNameAr: { contains: q, mode: 'insensitive' } },
    { fullNameEn: { contains: q, mode: 'insensitive' } },
  ];
  const code = q.trim().toUpperCase();
  if (/^[A-Z]\w{3,9}$/.test(code)) filters.push({ publicCode: code });
  // Phone numbers are typed in many shapes (+973 3600 1234, 36001234, 0097336001234): compare
  // the last digits only, which is what makes a number unique inside a country.
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 6) {
    filters.push({
      guardians: { some: { guardian: { phoneE164: { endsWith: digits.slice(-8) } } } },
    });
  }
  return filters;
}
