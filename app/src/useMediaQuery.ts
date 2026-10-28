import { useEffect, useState } from 'react';

/**
 * A media query as a boolean, with a listener (`app/src/useMediaQuery.ts`).
 *
 * The runner already owns a phone check for its tour; this hook is for the new shell and sheets,
 * which need the same answer on mount and after a rotation. It initialises from `matchMedia` where
 * there is a window, so the first paint on a phone is already the phone layout rather than desktop
 * layout followed by a jump. On a server it answers `false`: the smoke render has no viewport, and
 * a build must not depend on one.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let media: MediaQueryList;
    try {
      media = window.matchMedia(query);
    } catch {
      return;
    }
    const update = () => setMatches(media.matches);
    update();
    // Safari before 14 only has `addListener`; both calls are guarded because a browser that has
    // neither should still render, just without live rotation.
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, [query]);

  return matches;
}
