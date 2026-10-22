/**
 * Focus mode (`app/src/focusMode.ts`).
 *
 * A review is ruined by a screen full of other things to do: the rail offers ten tabs, the header
 * offers eight actions, and the lesson list offers twenty-five lessons — all of it worth having, none
 * of it useful while recalling one answer. Focus mode hides the chrome and leaves the work: the editor,
 * the checks, and the study card, with one pill on screen saying how to get out.
 *
 * Three rules:
 *
 * 1. **The exit is always visible.** Hiding every control is how a focus mode traps a learner on a
 *    page they cannot leave. The pill is rendered by `App` while focus is on, and `Escape` does the
 *    same thing.
 * 2. **The choice is remembered.** It is a preference, not a mode of the page: a learner who studies
 *    in focus keeps it across a reload.
 * 3. **The store never decides what is on screen.** `readFocus` is the starting value and `setFocus`
 *    returns the state to apply, so blocked storage costs the memory of the choice, never the toggle.
 *
 * The state is broadcast on `FOCUS_EVENT` for the same reason the restore is: the header's button and
 * the `App`'s attribute are two surfaces of one fact, and neither owns the other.
 */

export const STORAGE_KEY_FOCUS = 'mechalab_focus_v1';
/** Fired after the toggle, with `detail: { on }` — the header, the pill and the page listen. */
export const FOCUS_EVENT = 'mechalab:focus';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readFocus(): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(STORAGE_KEY_FOCUS) === '1';
  } catch {
    return false;
  }
}

/**
 * Turn focus on or off, remember it, and tell the page.
 *
 * Returns `on` — the state to render — rather than the stored value, because with storage blocked
 * there is no stored value and the toggle must still work for this visit.
 */
export function setFocus(on: boolean): boolean {
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_FOCUS, on ? '1' : '0');
    } catch {
      // Blocked or full: the choice lasts this visit only.
    }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      // The page's own constructor, not this realm's: an event built by another realm's `CustomEvent`
      // is not dispatched by every DOM implementation, and the symptom is a listener that never fires.
      const EventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent;
      window.dispatchEvent(new EventCtor(FOCUS_EVENT, { detail: { on } }));
    } catch {
      // A page with no CustomEvent (a test harness) still gets the return value.
    }
  }
  return on;
}

export function toggleFocus(current: boolean = readFocus()): boolean {
  return setFocus(!current);
}

/** The button's label, which is also what a screen reader announces after the press. */
export function focusLabel(on: boolean): string {
  return on ? 'Leave focus (Esc)' : 'Focus mode (⌘.)';
}
