// Design tokens (PLAN §15). Source of truth for colours, type and radii;
// `scripts/emit-css.ts` turns them into CSS custom properties.
//
// Deliberately no government emblems, names or seals — only colour and type (PLAN §15, §20.3).

export type ThemeName = 'sa' | 'bh';
export type ColorScheme = 'light' | 'dark';

export const fontFamily = {
  sans: "'IBM Plex Sans Arabic', Tahoma, system-ui, sans-serif",
} as const;

export const fontWeights = [400, 500, 600, 700] as const;

export const radius = { sm: '6px', md: '10px', lg: '16px', full: '9999px' } as const;

/** Minimum touch target on driver screens (PLAN §13). */
export const touchTarget = '56px';

interface SchemeColors {
  primary: string;
  primaryForeground: string;
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
}

// TODO: verify against official guideline — placeholder values until checked
// against the published Saudi "Platforms Code" and Bahrain identity guides.
export const themes: Record<ThemeName, Record<ColorScheme, SchemeColors>> = {
  sa: {
    light: {
      primary: '#1b8354',
      primaryForeground: '#ffffff',
      background: '#f7f8f7',
      surface: '#ffffff',
      foreground: '#161616',
      muted: '#5b6660',
      border: '#d2d6d4',
    },
    dark: {
      primary: '#3fae7a',
      primaryForeground: '#0b1410',
      background: '#0f1412',
      surface: '#18201c',
      foreground: '#eef2f0',
      muted: '#a3ada8',
      border: '#2c3631',
    },
  },
  bh: {
    light: {
      primary: '#ce1126',
      primaryForeground: '#ffffff',
      background: '#f8f7f7',
      surface: '#ffffff',
      foreground: '#171515',
      muted: '#625b5c',
      border: '#d8d2d3',
    },
    dark: {
      primary: '#ef5a6a',
      primaryForeground: '#1a0b0d',
      background: '#141011',
      surface: '#1f191a',
      foreground: '#f3eeef',
      muted: '#b0a6a8',
      border: '#382e30',
    },
  },
};

// Trip/alert status colours are fixed across themes and always paired with an icon + text
// (PLAN §15). The alert red is intentionally darker than the Bahrain identity red.
export const statusColors: Record<ColorScheme, Record<string, string>> = {
  light: {
    expected: '#6b7280',
    boarded: '#1d4ed8',
    alighted: '#15803d',
    absent: '#9ca3af',
    alert: '#8b0000',
    alertForeground: '#ffffff',
    warning: '#b45309',
  },
  dark: {
    expected: '#9ca3af',
    boarded: '#60a5fa',
    alighted: '#4ade80',
    absent: '#6b7280',
    alert: '#dc2626',
    alertForeground: '#ffffff',
    warning: '#f59e0b',
  },
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function declarations(scheme: SchemeColors, status: Record<string, string>): string {
  const lines = [
    ...Object.entries(scheme).map(([k, v]) => `  --ws-${kebab(k)}: ${v};`),
    ...Object.entries(status).map(([k, v]) => `  --ws-status-${kebab(k)}: ${v};`),
  ];
  return lines.join('\n');
}

/** Builds the tokens stylesheet. Theme is chosen with `data-theme`, scheme with `data-scheme`. */
export function buildTokensCss(): string {
  const blocks: string[] = [
    `:root {\n  --ws-font-sans: ${fontFamily.sans};\n  --ws-touch-target: ${touchTarget};\n` +
      Object.entries(radius)
        .map(([k, v]) => `  --ws-radius-${k}: ${v};`)
        .join('\n') +
      '\n}',
  ];
  for (const [name, schemes] of Object.entries(themes)) {
    const light = declarations(schemes.light, statusColors.light);
    const dark = declarations(schemes.dark, statusColors.dark);
    const isDefault = name === 'bh';
    const lightSel = isDefault ? `:root, [data-theme='${name}']` : `[data-theme='${name}']`;
    blocks.push(`${lightSel} {\n${light}\n}`);
    const darkSel = isDefault
      ? `[data-scheme='dark'], [data-theme='${name}'][data-scheme='dark']`
      : `[data-theme='${name}'][data-scheme='dark']`;
    blocks.push(`${darkSel} {\n${dark}\n}`);
  }
  return `/* Generated from @wusool/ui-tokens — do not edit by hand. */\n${blocks.join('\n\n')}\n`;
}
