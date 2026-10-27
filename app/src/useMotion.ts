import { useCallback, useEffect, useState } from 'react';
import { motionChoice, prefersStill, subscribeMotion, writeMotion } from './motionPrefs';

export interface MotionController {
  /** What the figures are doing right now. */
  on: boolean;
  /** The remembered choice, or `null` until the reader presses the control. */
  choice: boolean | null;
  set: (next: boolean) => void;
  toggle: () => void;
}

/**
 * The shared motion switch (`app/src/useMotion.ts`).
 *
 * Mounted once in the header, where the control lives, and once in each surface that draws motion —
 * a hook is cheap and a context would put the header above the router for one boolean. Until the
 * reader chooses, the OS setting decides; after that the choice wins on every surface, because that
 * is what one switch means.
 */
export function useMotion(): MotionController {
  const [choice, setChoice] = useState<boolean | null>(() => motionChoice());
  const [still, setStill] = useState<boolean>(() => prefersStill());

  // The OS setting can change while the page is open, and a reader who has not chosen should follow
  // it. One listener, removed with the component.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(
    () =>
      subscribeMotion((on) => {
        // A press on another control (the introduction's own Play/Pause) reaches this one too.
        setChoice(on);
      }),
    []
  );

  const on = choice ?? !still;
  const set = useCallback((next: boolean) => {
    setChoice(writeMotion(next));
  }, []);

  const toggle = useCallback(() => {
    setChoice(writeMotion(!on));
  }, [on]);

  return { on, choice, set, toggle };
}

/** A lesson figure's switch: the same one, named for the surface that asks. */
export function useFigureMotion(): boolean {
  return useMotion().on;
}
