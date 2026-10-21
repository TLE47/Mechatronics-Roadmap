/**
 * The palette reference's own address: `?view=theme`.
 *
 * The workbench is one static page on GitHub Pages, so there is no server to answer `/theme` — a real
 * path would 404 before the app ever loads. The query string is the address the app can actually keep,
 * and it is the same shape as a lesson's (`?lesson=P.1`): it survives a reload, a bookmark and a
 * shared link, and it needs nothing from the host.
 */

export const VIEW_QUERY_KEY = 'view';
export const THEME_VIEW = 'theme';

/** True when the address asks for the token table rather than the workbench. */
export function isThemeView(search: string): boolean {
  return new URLSearchParams(search).get(VIEW_QUERY_KEY) === THEME_VIEW;
}

/** The address bar's answer, or false when there is no address to read (SSR, the smoke test). */
export function themeViewFromLocation(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  return isThemeView(window.location.search || '');
}

/** The link to the page, relative to the app's base path. */
export function themeViewSearch(): string {
  return `?${VIEW_QUERY_KEY}=${THEME_VIEW}`;
}
