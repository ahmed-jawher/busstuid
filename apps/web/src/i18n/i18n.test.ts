import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ar from './ar.json';
import en from './en.json';

// Every UI string lives in ar.json / en.json (CLAUDE.md). These checks keep them complete.

type Tree = { [k: string]: string | Tree };
const flatten = (t: Tree, prefix = ''): string[] =>
  Object.entries(t).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`),
  );

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(name) ? [p] : [];
  });
}

const arKeys = new Set(flatten(ar as Tree));
const enKeys = new Set(flatten(en as Tree));

describe('translations', () => {
  it('Arabic and English have exactly the same keys', () => {
    expect([...arKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !arKeys.has(k))).toEqual([]);
  });

  it('every static key used in the app exists', () => {
    const src = path.resolve(__dirname, '..');
    const used = new Set<string>();
    for (const f of files(src, /\.tsx?$/)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z][\w]*\.[\w.]+)'/g))
        used.add(m[1]!);
    }
    expect([...used].filter((k) => !arKeys.has(k))).toEqual([]);
  });

  it('every error code the API can return has a message', () => {
    const apiSrc = path.resolve(__dirname, '../../../api/src');
    const codes = new Set<string>();
    for (const f of files(apiSrc, /\.ts$/)) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/Errors\.\w+\('([a-z_]+)'/g)) codes.add(m[1]!);
      for (const m of text.matchAll(/new ApiError\([^,]+,\s*'([a-z_]+)'/g)) codes.add(m[1]!);
      for (const m of text.matchAll(/error: '([a-z_]+)'/g)) codes.add(m[1]!);
    }
    expect(codes.size).toBeGreaterThan(40);
    expect([...codes].filter((c) => !arKeys.has(`errors.${c}`))).toEqual([]);
  });
});
