/**
 * The motion preference (`app/src/motionPrefs.ts`).
 *
 * One switch for the moving drawings, on every screen. Three rules:
 *
 * 1. **A choice is a fact, not a guess.** The header's Motion button writes exactly the value the
 *    figures read, so the button and the page cannot disagree. `null` means "never chose", and a
 *    first visit is on: the first press replaces that for every surface. There is one rule, not a
 *    different one per page, because one switch that means two things is not a switch.
 * 2. **Off means off, and cheaper.** Every moving figure stops its frame loop rather than drawing
 *    invisible frames, and an off-screen figure never starts one: turning motion off is also how a
 *    reader on a slow machine makes the app do less work.
 * 3. **Blocked storage costs the memory, not the control.** A browser that refuses `localStorage`
 *    still toggles for the visit.
 *
 * The legacy key is the introduction's own (`mechalab_intro_motion_v1`). It is read once when the new
 * key is absent so an existing choice survives this change, and the next write lands on the new key.
 */

export const MOTION_KEY = 'mechalab_motion_v1';
/** The introduction's key before the preference became app-wide. */
const LEGACY_MOTION_KEY = 'mechalab_intro_motion_v1';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** The chosen value, or `null` when the reader has never pressed the control. */
export function motionChoice(): boolean | null {
  const store = storage();
  if (!store) return null;
  try {
    const stored = store.getItem(MOTION_KEY);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
    const legacy = store.getItem(LEGACY_MOTION_KEY);
    if (legacy === 'on') return true;
    if (legacy === 'off') return false;
  } catch {
    // A store that throws is a store with no opinion.
  }
  return null;
}

/**
 * Whether figures move: the reader's choice, or **on** for a first visit.
 *
 * A first visit is on. The owner's call is that a page opens on its drawings rather than on the
 * still frames of something a reader has to discover a switch to start; `prefers-reduced-motion` is
 * honoured on the surfaces that animate CSS (`HeroArm`, the tour) and by the switch itself, which is
 * one press away at the top of the header and remembered. Off is still the cheap setting: every
 * frame loop stops instead of drawing frames nobody sees.
 */
export function motionEnabled(): boolean {
  return motionChoice() ?? true;
}

type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

export function subscribeMotion(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Write the choice, notify every control, and return what to render. */
export function writeMotion(on: boolean): boolean {
  const store = storage();
  if (store) {
    try {
      store.setItem(MOTION_KEY, on ? 'on' : 'off');
    } catch {
      // Blocked or full: the choice lasts this visit only.
    }
  }
  for (const listener of [...listeners]) {
    try {
      listener(on);
    } catch {
      // A broken listener must not take the control down with it.
    }
  }
  return on;
}

/** The header button's accessible name, and what a screen reader announces after the press. */
export function motionLabel(on: boolean): string {
  return on ? 'Motion on — stop the moving figures' : 'Motion off — play the moving figures';
}

/** The one-line explanation under the header's tooltip. */
export function motionHint(on: boolean): string {
  return on
    ? 'Figures move while they are on screen. Off stops every frame loop, not only the drawing.'
    : 'Figures are still. On plays them while they are on screen.';
}
