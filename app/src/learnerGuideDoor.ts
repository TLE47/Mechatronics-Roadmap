/**
 * The guide's door (`app/src/learnerGuideDoor.ts`).
 *
 * General settings is a lazy chunk; App is not. App needs one fact from the guide — the event that
 * says "open it" — and importing that from `learnerGuide.ts` would pull all fourteen steps and their
 * copy into the entry bundle, which is exactly the chunk the lazy guide exists to keep out. This
 * module is the one string and the one dispatcher, so the event crosses the boundary without the
 * content.
 */

export const OPEN_LEARNER_GUIDE_EVENT = 'mechalab-open-learner-guide';

/**
 * Whether the guide opens itself on a visit.
 *
 * On by default: a tour of the workbench that lives behind a gear menu is a tour most new learners
 * never find. The checkbox at the foot of the guide and the toggle in General settings write this
 * one record, so either door can stop the guide reopening. Stored beside — never inside — the
 * guide's step, so turning it off does not lose the learner's place.
 */
export const GUIDE_REOPEN_STORAGE_KEY = 'mechalab_guide_reopen_v1';

/** The tiny part of `Storage` this module uses, so the unit suite can pass a plain object. */
export interface GuidePrefStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): GuidePrefStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** On unless the learner turned it off; a blocked store keeps the default rather than hiding the guide. */
export function readGuideReopen(store: GuidePrefStore | null = browserStore()): boolean {
  try {
    return store?.getItem(GUIDE_REOPEN_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeGuideReopen(
  on: boolean,
  store: GuidePrefStore | null = browserStore()
): boolean {
  try {
    store?.setItem(GUIDE_REOPEN_STORAGE_KEY, on ? '1' : '0');
  } catch {
    // A blocked store costs the preference, never the page.
  }
  return on;
}

export function openLearnerGuide(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(OPEN_LEARNER_GUIDE_EVENT));
    }
  } catch {
    // A blocked event costs the press, never the page.
  }
}
