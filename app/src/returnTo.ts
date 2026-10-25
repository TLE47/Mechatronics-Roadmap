/**
 * Where a sign-in round trip is allowed to send someone back to.
 *
 * Google sign-in leaves the page, so the lesson the learner was reading has to survive the trip. The
 * only safe way to do that is to accept an internal destination and nothing else: an open redirect is
 * a phishing tool, and `https://evil.example/` in a `return` parameter would otherwise turn this
 * course's sign-in button into a redirector.
 *
 * The rules, in order: strip the origin, require the site's own base path, refuse a scheme, a
 * protocol-relative `//host`, a backslash (browsers treat `\` as `/`), control characters and `..`
 * segments. Anything that does not pass becomes the plain site root.
 *
 * Nothing here touches `window`, so `scripts/test_accounts.mjs` can exercise every rule.
 */

export const RETURN_QUERY_KEY = 'return';

/** A trailing slash on the base is what makes `${base}?lesson=…` a valid address. */
export function normalizeBase(base: string): string {
  const trimmed = base || '/';
  const rooted = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return rooted.endsWith('/') ? rooted : `${rooted}/`;
}

function decoded(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The internal destination `raw` asks for, or the base when it asks for anything outside the site.
 *
 * `base` is Vite's `BASE_URL`: `/Mechatronics-Roadmap/` on Pages, `/` in dev.
 */
export function safeReturnTo(raw: string | null | undefined, base: string): string {
  const root = normalizeBase(base);
  if (!raw) return root;
  // Decoded first so `%2F%2Fevil.example` and `%5Cevil` are judged as what the browser will see.
  let target = decoded(raw.trim());
  if (!target) return root;
  if (/[\u0000-\u001f\u007f\s]/.test(target)) return root;
  if (target.includes('\\')) return root;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return root;
  if (target.startsWith('//')) return root;
  // `?lesson=P.1` is the natural form for a query-only destination: hang it off the base.
  if (target.startsWith('?')) target = `${root}${target}`;
  if (!target.startsWith('/')) return root;
  if (!target.startsWith(root)) return root;
  if (target.split('/').some((segment) => segment === '..' || segment === '.')) return root;
  return target;
}

/** The URL Google or an email link returns to: this origin, this base, and the intended target. */
export function buildReturnUrl(origin: string, base: string, target: string): string {
  const root = normalizeBase(base);
  const destination = safeReturnTo(target, root);
  return `${origin}${root}?${RETURN_QUERY_KEY}=${encodeURIComponent(destination)}`;
}

export interface ReturnTarget {
  /** A whole-screen view the link asked to open, if any. */
  view: 'dashboard' | 'admin' | null;
  /** A lesson the workbench should select, if the link named one the build lists. */
  lessonId: string | null;
}

/**
 * What a `?return=` destination asks the page to open.
 *
 * Only the two view modes and a lesson id are read; everything else in the destination is ignored, so
 * a crafted query cannot make the page do more than it already does.
 */
export function parseReturnTarget(
  search: string,
  isKnownLesson: (id: string) => boolean
): ReturnTarget | null {
  const raw = new URLSearchParams(search).get(RETURN_QUERY_KEY);
  if (!raw) return null;
  const internal = safeReturnTo(raw, '/');
  let params: URLSearchParams;
  try {
    params = new URL(internal, 'https://mechalab.invalid').searchParams;
  } catch {
    return null;
  }
  const view = params.get('view');
  const lesson = params.get('lesson');
  const lessonId = lesson && isKnownLesson(lesson) ? lesson : null;
  const knownView = view === 'dashboard' || view === 'admin' ? view : null;
  if (!knownView && !lessonId) return null;
  return { view: knownView, lessonId };
}
