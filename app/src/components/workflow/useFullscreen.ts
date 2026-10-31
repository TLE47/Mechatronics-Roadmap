import { useEffect, useRef, useState } from 'react';

/**
 * The workflow pane at full size (`components/workflow/useFullscreen.ts`).
 *
 * A view, never a document field: the page behind it cannot scroll, Escape leaves, and leaving puts
 * the lesson back at the line the learner was reading. The line is read in the press, before the
 * pane leaves the flow and shortens the page under it, and restored a frame after the cleanup, once
 * the pane is back and the page is its real height again.
 *
 * `full` is deliberately not stored: a reload opens the pane in its normal frame.
 */
export function useFullscreen(): [boolean, () => void] {
  const [full, setFull] = useState(false);
  const savedLine = useRef(0);
  useEffect(() => {
    if (!full) return;
    const page = document.documentElement;
    const prior = page.style.overflow;
    page.style.overflow = 'hidden';
    // The press menu stops its own Escape, so a key that dismisses a menu never also leaves.
    const key = (event: KeyboardEvent) => event.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      page.style.overflow = prior;
      requestAnimationFrame(() => scrollTo(0, savedLine.current));
    };
  }, [full]);
  const toggle = () => {
    if (!full) savedLine.current = scrollY;
    setFull(!full);
  };
  return [full, toggle];
}
