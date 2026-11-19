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

export function openLearnerGuide(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(OPEN_LEARNER_GUIDE_EVENT));
    }
  } catch {
    // A blocked event costs the press, never the page.
  }
}
