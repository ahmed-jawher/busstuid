import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BAHRAIN_SCHOOLS, type DirectorySchool } from '@wusool/shared';
import { z } from 'zod';
import { ApiZodQuery, zod } from '../common/zod';

const schoolsQuery = z.object({
  country: z.enum(['BH', 'SA']).default('BH'),
  q: z.string().trim().max(80).default(''),
});

const LIMIT = 25;

/** Arabic is written in several ways; compare a plain form so a search finds the school. */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // vowel marks and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function searchSchools(list: readonly DirectorySchool[], q: string): DirectorySchool[] {
  const needle = normalizeForSearch(q);
  if (!needle) return list.slice(0, LIMIT);
  const words = needle.split(' ');
  return list
    .filter((s) => {
      const hay = `${normalizeForSearch(s.ar)} ${normalizeForSearch(s.en)}`;
      return words.every((w) => hay.includes(w));
    })
    .slice(0, LIMIT);
}

/**
 * The schools a guardian picks from when adding a child (PLAN §5 step 3). Published by the
 * ministry, so every family writes the same school the same way. Typing a name that is not in
 * the list still works — new and private schools appear before any list does.
 */
@ApiTags('organizations')
@ApiBearerAuth()
@Controller('schools')
export class SchoolsController {
  @Get()
  @ApiZodQuery(schoolsQuery)
  list(@Query(zod(schoolsQuery)) q: z.output<typeof schoolsQuery>) {
    const list = q.country === 'BH' ? BAHRAIN_SCHOOLS : [];
    return searchSchools(list, q.q);
  }
}
