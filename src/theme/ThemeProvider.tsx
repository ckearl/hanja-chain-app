import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { type AccentId, makeTheme, type Scheme, type Theme } from './colors';

type ThemeContextValue = {
  t: Theme;
  scheme: Scheme;
  accentId: AccentId;
  setScheme: (s: Scheme) => void;
  setAccent: (a: AccentId) => void;
  toggleScheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Dark + ink are the design defaults. Persistence (MMKV) comes later — for now
// these live in memory so we can build and iterate on the UI.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setScheme] = useState<Scheme>('dark');
  const [accentId, setAccent] = useState<AccentId>('ink');

  const value = useMemo<ThemeContextValue>(() => {
    const t = makeTheme(scheme, accentId);
    return {
      t,
      scheme,
      accentId,
      setScheme,
      setAccent,
      toggleScheme: () => setScheme((s) => (s === 'dark' ? 'light' : 'dark')),
    };
  }, [scheme, accentId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
