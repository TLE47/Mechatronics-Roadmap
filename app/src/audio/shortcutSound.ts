/**
 * The keyboard's side of interface sound (`app/src/audio/shortcutSound.ts`).
 *
 * A shortcut is a control press without a pointer, so the delegated `SoundClicks` listener never
 * sees it. Each handler calls this with the role its printed button would have: Run is `primary`,
 * a layout preset or Focus is `toggle`, a door is `nav`.
 *
 * Two guards keep one press from becoming a rattle or a held key from becoming a machine gun:
 *
 * - `event.repeat` is a held key, not a second press.
 * - the same role within `SHORTCUT_TICK_GUARD_MS` is the same press arriving twice (a caller that
 *   also bubbles, or a shortcut that also activates a focused control). A different role is always
 *   allowed, so two real keys in quick succession still sound like two things.
 *
 * The helper is deliberately DOM-free apart from that read: the sound engine and the click map stay
 * testable in Node, and a page with sound off pays for one no-op dispatch.
 */

import { playUi, type UiRole } from './facade.ts';

/** A second tick for one physical press is a duplicate, not a rhythm. */
export const SHORTCUT_TICK_GUARD_MS = 40;

let lastRole: UiRole | null = null;
let lastAt = -Infinity;

/**
 * Sound one shortcut press, after the handler has matched it and before/after `preventDefault`.
 *
 * Returns whether a tick was dispatched, so a suite (or a caller deciding whether a key did
 * anything) can tell a guarded duplicate from a real press.
 */
export function playShortcut(
  role: UiRole,
  event?: { repeat?: boolean } | null
): boolean {
  if (event?.repeat) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (lastRole === role && now - lastAt < SHORTCUT_TICK_GUARD_MS) return false;
  lastRole = role;
  lastAt = now;
  playUi(role);
  return true;
}
