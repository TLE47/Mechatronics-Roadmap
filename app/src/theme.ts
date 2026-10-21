/**
 * Light / dark theme: the stored choice, the OS default, and the attribute that
 * re-points every token in index.css.
 *
 * Three rules, and the tests in `scripts/test_theme.mjs` exist to keep them:
 *
 * 1. First visit follows `prefers-color-scheme`. Nothing is stored until the
 *    learner actually picks a mode, so a browser that flips to dark at sunset
 *    flips the workbench with it.
 * 2. A pick is explicit and persisted: `localStorage[STORAGE_KEY_THEME]` wins
 *    from then on, on every tab and every visit.
 * 3. Everything here is safe to import on the server: no module-level `window`,
 *    no top-level side effects. `App` renders the dark shell during SSR and the
 *    effect below corrects it after mount; the inline script in index.html sets
 *    the attribute before first paint, so nothing flashes.
 */

export type Theme = 'light' | 'dark';
/** What the learner picked. `system` is the untouched first visit, not a third button. */
export type ThemeChoice = Theme | 'system';

export const STORAGE_KEY_THEME = 'mechalab_theme_v1';
export const THEME_ATTRIBUTE = 'data-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The storage name is also written by the pre-paint script in index.html; keep them in step. */
export function parseChoice(raw: string | null | undefined): ThemeChoice {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Safari's private mode and a blocked third-party context both throw on access.
    return null;
  }
}

export function readChoice(): ThemeChoice {
  const store = storage();
  if (!store) return 'system';
  try {
    return parseChoice(store.getItem(STORAGE_KEY_THEME));
  } catch {
    return 'system';
  }
}

export function saveChoice(choice: ThemeChoice): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY_THEME, choice);
  } catch {
    // A full or disabled store must not break the shell; the theme still applies for this visit.
  }
}

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    // SSR and the smoke shim have no media query. Dark is the default palette, so
    // rendering "dark" on the server is what the first paint actually shows.
    return true;
  }
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return true;
  }
}

export function currentChoice(): ThemeChoice {
  return readChoice();
}

export function currentTheme(): Theme {
  return resolveTheme(currentChoice(), prefersDark());
}

export function toggleTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/** Write the attribute the stylesheet keys off, plus the browser's own scrollbar/form colour. */
export function applyTheme(theme: Theme, root?: HTMLElement | null): void {
  if (typeof document === 'undefined') return;
  const el = root ?? document.documentElement;
  if (!el) return;
  el.setAttribute(THEME_ATTRIBUTE, theme);
  el.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#070b12' : '#f8f6f2');
}

/** True while the learner has not picked a side, so the OS is still in charge. */
export function followsSystem(choice: ThemeChoice): boolean {
  return choice === 'system';
}

/** Notify when the OS flips while `choice` is `system`; returns the unsubscribe. */
export function watchSystemTheme(onChange: (systemDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let query: MediaQueryList;
  try {
    query = window.matchMedia(DARK_QUERY);
  } catch {
    return () => {};
  }
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  // Safari < 14 only has addListener/removeListener.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }
  query.addListener(handler);
  return () => query.removeListener(handler);
}

/** What the toggle button says it will do, for `aria-label` and the tooltip. */
export function toggleLabel(theme: Theme): string {
  return theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}
