/**
 * The three palettes: the stored choice, the OS default, and the attribute that
 * re-points every token in index.css.
 *
 * Four rules, and the tests in `scripts/test_theme.mjs` exist to keep them:
 *
 * 1. First visit follows the OS — `prefers-contrast: more` before
 *    `prefers-color-scheme`, because a reader who asked for contrast is asking
 *    for something a dark palette does not give them. Nothing is stored until
 *    the learner picks, so a browser that flips to dark at sunset flips the
 *    workbench with it.
 * 2. A pick is explicit and persisted: `localStorage[STORAGE_KEY_THEME]` wins
 *    from then on, on every tab and every visit.
 * 3. There are **two controls, because there are two questions**: the flip is
 *    dark ↔ light (from high contrast it returns to the OS palette), and high
 *    contrast is its own on/off button (`aria-pressed`, which a three-state
 *    cycle could not state honestly). Each names what it will give you.
 * 4. Everything here is safe to import on the server: no module-level `window`,
 *    no top-level side effects. `App` renders the dark shell during SSR and the
 *    effect below corrects it after mount; the inline script in index.html sets
 *    the attribute before first paint, so nothing flashes.
 */

export type Theme = 'light' | 'dark' | 'contrast';
/** What the learner picked. `system` is the untouched first visit, not a fourth button. */
export type ThemeChoice = Theme | 'system';

export const STORAGE_KEY_THEME = 'mechalab_theme_v1';
export const THEME_ATTRIBUTE = 'data-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const CONTRAST_QUERY = '(prefers-contrast: more)';

/** The storage name is also written by the pre-paint script in index.html; keep them in step. */
export function parseChoice(raw: string | null | undefined): ThemeChoice {
  return raw === 'light' || raw === 'dark' || raw === 'contrast' || raw === 'system' ? raw : 'system';
}

export function resolveTheme(
  choice: ThemeChoice,
  systemDark: boolean,
  systemContrast = false
): Theme {
  if (choice !== 'system') return choice;
  if (systemContrast) return 'contrast';
  return systemDark ? 'dark' : 'light';
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

export function prefersContrast(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(CONTRAST_QUERY).matches;
  } catch {
    return false;
  }
}

export function currentTheme(): Theme {
  return resolveTheme(currentChoice(), prefersDark(), prefersContrast());
}

/** The palette the OS would pick, ignoring contrast: where leaving high contrast lands. */
export function defaultTheme(systemDark: boolean): Theme {
  return systemDark ? 'dark' : 'light';
}

/**
 * The everyday flip, dark ↔ light. From high contrast it returns to the OS's own palette rather
 * than to whichever of the two the learner came from — one rule, no remembered third state.
 */
export function toggleTheme(theme: Theme, fallback: Theme): Theme {
  if (theme === 'contrast') return fallback;
  return theme === 'dark' ? 'light' : 'dark';
}

/** The contrast control, which is a real on/off: pressed means the contrast palette is on screen. */
export function toggleContrast(theme: Theme, fallback: Theme): Theme {
  return theme === 'contrast' ? fallback : 'contrast';
}

/** The browser chrome colour each palette declares, for `meta[name="theme-color"]`. */
const THEME_COLOR: Record<Theme, string> = {
  dark: '#070b12',
  light: '#f8f6f2',
  contrast: '#000000',
};

/** Write the attribute the stylesheet keys off, plus the browser's own scrollbar/form colour. */
export function applyTheme(theme: Theme, root?: HTMLElement | null): void {
  if (typeof document === 'undefined') return;
  const el = root ?? document.documentElement;
  if (!el) return;
  el.setAttribute(THEME_ATTRIBUTE, theme);
  // The contrast palette is a dark palette: a light `color-scheme` would hand every native
  // control and scrollbar a white chrome the page's own panels sit inside.
  el.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

/** True while the learner has not picked a side, so the OS is still in charge. */
export function followsSystem(choice: ThemeChoice): boolean {
  return choice === 'system';
}

export interface SystemTheme {
  dark: boolean;
  moreContrast: boolean;
}

function observe(query: MediaQueryList, handler: (event: MediaQueryListEvent) => void): () => void {
  // Safari < 14 only has addListener/removeListener.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }
  query.addListener(handler);
  return () => query.removeListener(handler);
}

/** Notify when the OS flips either query while `choice` is `system`; returns the unsubscribe. */
export function watchSystemTheme(onChange: (system: SystemTheme) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let darkQuery: MediaQueryList;
  let contrastQuery: MediaQueryList;
  try {
    darkQuery = window.matchMedia(DARK_QUERY);
    contrastQuery = window.matchMedia(CONTRAST_QUERY);
  } catch {
    return () => {};
  }
  const report = () =>
    onChange({ dark: darkQuery.matches, moreContrast: contrastQuery.matches });
  const stopDark = observe(darkQuery, report);
  const stopContrast = observe(contrastQuery, report);
  return () => {
    stopDark();
    stopContrast();
  };
}

/** The palette's full name, for a button's `aria-label` and the title. */
export const THEME_NAMES: Record<Theme, string> = {
  dark: 'dark',
  light: 'light',
  contrast: 'high contrast',
};

/** What the flip will give you, said as the thing it hands over rather than the thing it leaves. */
export function themeLabel(theme: Theme, fallback: Theme): string {
  const next = toggleTheme(theme, fallback);
  return `Switch to ${THEME_NAMES[next]} theme`;
}

/** The word drawn beside the flip's icon, naming the same palette as `themeLabel`. */
export function themeShortLabel(theme: Theme, fallback: Theme): string {
  return toggleTheme(theme, fallback) === 'light' ? 'Light' : 'Dark';
}

/** The contrast control's name, which is the same words whether it is on or off. */
export const CONTRAST_LABEL = 'High contrast';
/** What pressing the contrast control will do, for its title. */
export function contrastHint(theme: Theme): string {
  return theme === 'contrast'
    ? 'High contrast is on. Leave it for the dark or light palette.'
    : 'White on black, with 7:1 text and strong panel edges — for low vision.';
}
