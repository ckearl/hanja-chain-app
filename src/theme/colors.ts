// ── Theme tokens, ported from the Claude Design mock (app.jsx) ──────────
// Dark is the primary design direction; ink-blue is the default accent.

export const ACCENTS = {
  ink: { hex: '#4f86c6', label: 'ink-blue' },
  celadon: { hex: '#5f9e8f', label: 'celadon' },
  indigo: { hex: '#6b78d6', label: 'indigo' },
  seal: { hex: '#c2604f', label: 'seal-red' },
} as const;

export type AccentId = keyof typeof ACCENTS;
export type Scheme = 'dark' | 'light';

type PaletteColors = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  border2: string;
  text: string;
  text2: string;
  text3: string;
  ink: string;
  shadow: string;
};

const PALETTE: Record<Scheme, PaletteColors> = {
  dark: {
    bg: '#0e1014',
    surface: '#171a20',
    surface2: '#1d222a',
    surface3: '#262c35',
    border: '#2a313a',
    border2: '#3a424d',
    text: '#edeff2',
    text2: '#9aa1ac',
    text3: '#646b76',
    ink: '#f4f6f9',
    shadow: 'rgba(0,0,0,0.4)',
  },
  light: {
    bg: '#f3f1ea',
    surface: '#ffffff',
    surface2: '#f6f3ec',
    surface3: '#ece6da',
    border: '#e6dfd0',
    border2: '#d8d0bf',
    text: '#1b1d22',
    text2: '#5e636c',
    text3: '#9a9080',
    ink: '#23262c',
    shadow: 'rgba(40,36,28,0.10)',
  },
} as const;

export type Theme = {
  scheme: Scheme;
  accent: string;
  accentId: AccentId;
} & PaletteColors;

export function makeTheme(scheme: Scheme, accentId: AccentId): Theme {
  return {
    ...PALETTE[scheme],
    scheme,
    accentId,
    accent: ACCENTS[accentId].hex,
  };
}

// Convert a hex accent to an rgba() with the given alpha (for tinted fills).
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Type scale + spacing, shared across screens.
export const FONT = {
  hanjaHero: 120,
  hanjaLg: 44,
  hanjaMd: 30,
  hanjaSm: 22,
};

export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
