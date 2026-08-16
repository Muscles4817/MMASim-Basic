/**
 * Theme.
 *
 * Three states, not two: `system` (follow the OS, and keep following it if it changes),
 * plus explicit `light` and `dark`. Only the explicit choices stamp `data-theme`, so the
 * default genuinely tracks the OS rather than snapshotting it once at load.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'mmasim:theme';

interface ThemeContextValue {
  choice: ThemeChoice;
  /** What is actually being displayed right now. */
  resolved: 'light' | 'dark';
  setChoice(choice: ThemeChoice): void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A blocked storage API is not a reason to refuse to change theme.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      choice,
      resolved: choice === 'system' ? (systemDark ? 'dark' : 'light') : choice,
      setChoice,
    }),
    [choice, systemDark, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
