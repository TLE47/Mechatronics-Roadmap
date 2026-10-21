import { useCallback, useEffect, useState } from 'react';
import {
  Theme,
  ThemeChoice,
  applyTheme,
  currentChoice,
  prefersDark,
  resolveTheme,
  saveChoice,
  toggleTheme,
  watchSystemTheme,
} from './theme';

export interface ThemeController {
  /** The theme actually on screen, after the choice and the OS default are combined. */
  theme: Theme;
  /** What the learner picked, or `system` when they never picked. */
  choice: ThemeChoice;
  /** Flips the visible theme and remembers the side that was picked. */
  toggle: () => void;
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
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark());
  const theme = resolveTheme(choice, systemDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Only follow the OS while the learner has not picked a side. After a click the
  // stored choice is the answer, even if the OS flips at sunset.
  useEffect(() => {
    if (choice !== 'system') return undefined;
    return watchSystemTheme(setSystemDark);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    saveChoice(next);
    setChoiceState(next);
    applyTheme(resolveTheme(next, prefersDark()));
  }, []);

  const toggle = useCallback(() => {
    const next = toggleTheme(theme);
    saveChoice(next);
    setChoiceState(next);
    applyTheme(next);
  }, [theme]);

  return { theme, choice, toggle, setChoice };
}
