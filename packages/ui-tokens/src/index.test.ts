import { describe, expect, it } from 'vitest';
import { buildTokensCss, themes } from './index';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('ui tokens', () => {
  it('emits variables for both themes and schemes', () => {
    const css = buildTokensCss();
    expect(css).toContain("[data-theme='sa']");
    expect(css).toContain("[data-theme='bh'][data-scheme='dark']");
    expect(css).toContain('--ws-status-alert');
  });

  it('meets WCAG AA contrast for text and primary buttons (PLAN §15)', () => {
    for (const schemes of Object.values(themes)) {
      for (const c of Object.values(schemes)) {
        expect(contrast(c.foreground, c.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.muted, c.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.primaryForeground, c.primary)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
