// The ministry's school list a guardian picks from (data.gov.bh, packages/shared/src/schools.ts).
import { BAHRAIN_SCHOOLS } from '@wusool/shared';
import { normalizeForSearch, searchSchools } from '../src/organizations/schools.controller';
import { registerVerified } from './helpers/actors';
import { createTestApp, type TestApp } from './helpers/app';

describe('school list', () => {
  it('holds every published school once, with both names', () => {
    expect(BAHRAIN_SCHOOLS.length).toBeGreaterThan(500);
    const ar = new Set(BAHRAIN_SCHOOLS.map((s) => s.ar));
    const en = new Set(BAHRAIN_SCHOOLS.map((s) => s.en));
    expect(ar.size).toBe(BAHRAIN_SCHOOLS.length);
    expect(en.size).toBe(BAHRAIN_SCHOOLS.length);
    for (const s of BAHRAIN_SCHOOLS) {
      expect(s.ar).toMatch(/[؀-ۿ]/);
      expect(s.en).toMatch(/[A-Za-z]/);
    }
  });

  it('covers schools, kindergartens and nurseries', () => {
    const kinds = new Set(BAHRAIN_SCHOOLS.map((s) => s.kind));
    expect([...kinds].sort()).toEqual(['kindergarten', 'nursery', 'private', 'public']);
    expect(searchSchools(BAHRAIN_SCHOOLS, 'روضة الجنان').length).toBeGreaterThan(0);
    expect(searchSchools(BAHRAIN_SCHOOLS, 'nursery').length).toBeGreaterThan(0);
  });

  it('finds a school however the name is typed', () => {
    const found = (q: string) => searchSchools(BAHRAIN_SCHOOLS, q).map((s) => s.ar);
    // Different spellings of the same Arabic name (alef with and without hamza, ta marbuta).
    expect(found('مدرسة الإبداع')).toEqual(
      expect.arrayContaining([expect.stringContaining('الابداع')]),
    );
    expect(found('ابداع')).not.toHaveLength(0);
    // English, any case, words in any order.
    expect(found('british school')).toEqual(
      expect.arrayContaining([expect.stringContaining('البريطانية')]),
    );
    expect(found('SCHOOL BRITISH')).not.toHaveLength(0);
    // Nonsense finds nothing; an empty search shows a first page.
    expect(found('zzzz لا يوجد')).toEqual([]);
    expect(searchSchools(BAHRAIN_SCHOOLS, '')).toHaveLength(25);
    expect(normalizeForSearch('مَدْرَسَة الأمل')).toBe('مدرسه الامل');
  });
});

describe('school list endpoint', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t?.close());

  it('serves matches to a signed-in guardian, and refuses strangers', async () => {
    const guardian = await registerVerified(t);
    const res = await t.http
      .get('/v1/schools?country=BH&q=' + encodeURIComponent('الرفاع'))
      .set(guardian.auth)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({ ar: expect.any(String), en: expect.any(String) });
    expect(res.body.length).toBeLessThanOrEqual(25);
    await t.http.get('/v1/schools?country=BH').expect(401);
  });
});
