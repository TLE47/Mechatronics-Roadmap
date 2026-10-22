import { useCallback, useEffect, useState } from 'react';
import {
  SystemTheme,
  Theme,
  ThemeChoice,
  applyTheme,
  currentChoice,
  defaultTheme,
  prefersContrast,
  prefersDark,
  resolveTheme,
  saveChoice,
  toggleContrast,
  togglePaper,
  toggleTheme,
  watchSystemTheme,
} from './theme';

export interface ThemeController {
  /** The theme actually on screen, after the choice and the OS default are combined. */
  theme: Theme;
  /** What the learner picked, or `system` when they never picked. */
  choice: ThemeChoice;
  /** The palette the OS would pick right now, which is where leaving high contrast lands. */
  fallback: Theme;
  /** Flips dark ↔ light (from high contrast: back to the OS palette) and remembers it. */
  toggle: () => void;
  /** Turns the contrast palette on, or back off to the OS palette. */
  toggleContrast: () => void;
  /** Turns the paper palette on, or back off to the OS palette. */
  togglePaper: () => void;
  setChoice: (choice: ThemeChoice) => void;
}

/**
 * One hook, mounted once (in the header), so the attribute and the button can
 * never disagree. The attribute is applied in an effect rather than during
 * render: React 19's StrictMode renders twice, and writing to <html> mid-render
 * is exactly the kind of side effect that double-render punishes.
 */
export function useTheme(): ThemeController {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => currentChoice());
  const [system, setSystem] = useState<SystemTheme>(() => ({
    dark: prefersDark(),
    moreContrast: prefersContrast(),
  }));
  const theme = resolveTheme(choice, system.dark, system.moreContrast);
  const fallback = defaultTheme(system.dark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Only follow the OS while the learner has not picked a side. After a click the
  // stored choice is the answer, even if the OS flips at sunset.
  useEffect(() => {
    if (choice !== 'system') return undefined;
    return watchSystemTheme(setSystem);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    saveChoice(next);
    setChoiceState(next);
    applyTheme(resolveTheme(next, prefersDark(), prefersContrast()));
  }, []);

  const toggle = useCallback(() => {
    const next = toggleTheme(theme, fallback);
    saveChoice(next);
    setChoiceState(next);
    applyTheme(next);
  }, [theme, fallback]);

  const toggleContrastMode = useCallback(() => {
    const next = toggleContrast(theme, fallback);
    saveChoice(next);
    setChoiceState(next);
    applyTheme(next);
  }, [theme, fallback]);

  const togglePaperMode = useCallback(() => {
    const next = togglePaper(theme, fallback);
    saveChoice(next);
    setChoiceState(next);
    applyTheme(next);
  }, [theme, fallback]);

  return {
    theme,
    choice,
    fallback,
    toggle,
    toggleContrast: toggleContrastMode,
    togglePaper: togglePaperMode,
    setChoice,
  };
}
