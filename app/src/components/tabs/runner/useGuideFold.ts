import { useState } from 'react';

/** The brief's own "hide the guide" switch, one value for every lesson. */
export const STORAGE_KEY_GUIDE_HIDDEN = 'mechalab_guide_hidden_v1';

export interface GuideFold {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  toggle: () => void;
}

/**
 * Whether the learner folded the first-run guide away (`runner/useGuideFold.ts`).
 *
 * The per-lesson dismiss says "not this one again"; this says "not while I work", so it is one
 * remembered cell rather than a list of ids. It lives in the runner rather than the tab so the tab's
 * state budget stays a ratchet on the screens it assembles.
 */
export function useGuideFold(): GuideFold {
  const [hidden, setHiddenState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_GUIDE_HIDDEN) === '1';
    } catch {
      return false;
    }
  });
  const setHidden = (next: boolean) => {
    setHiddenState(next);
    try {
      localStorage.setItem(STORAGE_KEY_GUIDE_HIDDEN, next ? '1' : '0');
    } catch {
      // Blocked storage: the choice lasts this visit.
    }
  };
  return { hidden, setHidden, toggle: () => setHidden(!hidden) };
}
