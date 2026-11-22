/**
 * The phone keyboard's small taps (`app/src/keyboard/haptics.ts`).
 *
 * `navigator.vibrate` is the only vibration a web page can ask for, and it is not everywhere:
 * iOS Safari has never shipped it, and a desktop browser that exposes the method does nothing with
 * it. Every call here is therefore a request, never a promise — a missing API, a refused call or a
 * device in a power-saving mode loses only the buzz, and the key's press animation is still the
 * feedback (`components/MobilePythonKeyboard.tsx`).
 *
 * The durations sit at the floor of what a phone will acknowledge. A keyboard is hit several times
 * a second while somebody types, and a long buzz on every letter reads as a broken phone rather
 * than as feedback.
 */

export type HapticPattern = 'light' | 'medium' | 'confirmation';

/**
 * One number is a single vibration in milliseconds; an array is on/off/on, in the Vibration API's
 * own grammar. The confirmation sequence is two short ticks, so "Done" and "123" are distinguishable
 * from a letter without being stronger.
 */
const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 8,
  medium: 18,
  confirmation: [10, 24, 12],
};

/** Ask for one of the keyboard's three taps, where the device offers vibration at all. */
export function haptic(pattern: HapticPattern): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Exposed but refused (a cross-origin frame, a browser setting): the visual press carries it.
  }
}
