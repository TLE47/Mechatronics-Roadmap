/**
 * The sound bus (`app/src/audio/facade.ts`).
 *
 * The runner, the focus toggle, the verification path and the interface clicks all need to *say*
 * something happened, and none of them should pay for the synthesiser. So they dispatch a named
 * event on `window`, and the engine — a lazy chunk, fetched after first paint — listens. A page with
 * sound off, or a browser that never enables it, carries only this file: a few types, four
 * functions, no audio code.
 *
 * The contract is deliberately tiny and testable without a browser:
 *
 * - `playCue('run-start' | 'run-pass' | 'run-fail' | 'verify' | 'boot')` says what happened.
 * - `playUi(role, pan)` says what was pressed, and where on the screen it was.
 * - `setSoundScene('home' | 'focus')` says which room the learner is in.
 *
 * Cues are **facts**, not prompts: they never carry a message, never wait for a reply, and never
 * fire when the engine is not listening. A missing listener is silence, which is the correct
 * default.
 *
 * `ui` is a separate kind from `cue` on purpose. A click is furniture — a category of control, not a
 * verdict — so the engine can keep its own level, gap and voice budget for it, and a test can prove
 * that a fast click never steps on a verification. Nothing in the app should ever have to inspect
 * the DOM to know what a control is: `clickMap.ts` decides that, and this file only carries the
 * answer.
 */

export type SoundCue = 'run-start' | 'run-pass' | 'run-fail' | 'verify' | 'boot';
export type SoundScene = 'home' | 'focus';

/**
 * The seven kinds of control in the workbench. One timbre each, so a learner learns the room's
 * language: a tab does not sound like a Run, and closing something never sounds like starting it.
 */
export type UiRole = 'nav' | 'primary' | 'toggle' | 'row' | 'chip' | 'slider' | 'close';

export const UI_ROLES: readonly UiRole[] = ['nav', 'primary', 'toggle', 'row', 'chip', 'slider', 'close'];

/** A click never pans further than this, so the room widens without the sound leaving the screen. */
export const UI_PAN_LIMIT = 0.35;

export type SoundMessage =
  | { kind: 'cue'; cue: SoundCue }
  | { kind: 'scene'; scene: SoundScene }
  | { kind: 'ui'; role: UiRole; pan: number };

export const SOUND_EVENT = 'mechalab:sound';

/** Pan is a position, not an instruction: anything outside the limit is clamped, and NaN is centre. */
export function clampPan(pan: number): number {
  if (!Number.isFinite(pan)) return 0;
  return Math.min(UI_PAN_LIMIT, Math.max(-UI_PAN_LIMIT, pan));
}

export function isUiRole(value: unknown): value is UiRole {
  return typeof value === 'string' && (UI_ROLES as readonly string[]).includes(value);
}

function dispatch(message: SoundMessage): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    // The page's own constructor, not this realm's: an event from another realm is not dispatched by
    // every DOM implementation, and the symptom is a listener that never fires (`focusMode.ts`).
    const EventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent;
    window.dispatchEvent(new EventCtor(SOUND_EVENT, { detail: message }));
  } catch {
    // A page with no CustomEvent still has silence, which is the default anyway.
  }
}

export function playCue(cue: SoundCue): void {
  dispatch({ kind: 'cue', cue });
}

/** One interface tick. `pan` is -1..1 from the pointer's x; it is clamped here so no caller can roar. */
export function playUi(role: UiRole, pan = 0): void {
  dispatch({ kind: 'ui', role, pan: clampPan(pan) });
}

export function setSoundScene(scene: SoundScene): void {
  dispatch({ kind: 'scene', scene });
}

/** Read a dispatched event back into the message, or null when it is not one of ours. */
export function readSoundMessage(event: Event): SoundMessage | null {
  const detail = (event as CustomEvent<Partial<SoundMessage>>).detail;
  if (!detail || typeof detail !== 'object') return null;
  if (detail.kind === 'cue' && typeof detail.cue === 'string') return detail as SoundMessage;
  if (detail.kind === 'scene' && (detail.scene === 'home' || detail.scene === 'focus')) {
    return detail as SoundMessage;
  }
  if (detail.kind === 'ui' && isUiRole(detail.role)) {
    return { kind: 'ui', role: detail.role, pan: clampPan(Number(detail.pan ?? 0)) };
  }
  return null;
}
