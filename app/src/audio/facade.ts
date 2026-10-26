/**
 * The sound bus (`app/src/audio/facade.ts`).
 *
 * The runner, the focus toggle and the verification path all need to *say* something happened, and
 * none of them should pay for the synthesiser. So they dispatch a named event on `window`, and the
 * engine — a lazy chunk, fetched after first paint — listens. A page with sound off, or a browser
 * that never enables it, carries only this file: a type, two functions, no audio code.
 *
 * The contract is deliberately tiny and testable without a browser:
 *
 * - `playCue('run-start' | 'run-pass' | 'run-fail' | 'verify' | 'boot')` says what happened.
 * - `setSoundScene('home' | 'focus')` says which room the learner is in.
 *
 * Cues are **facts**, not prompts: they never carry a message, never wait for a reply, and never
 * fire when the engine is not listening. A missing listener is silence, which is the correct default.
 */

export type SoundCue = 'run-start' | 'run-pass' | 'run-fail' | 'verify' | 'boot';
export type SoundScene = 'home' | 'focus';

export type SoundMessage =
  | { kind: 'cue'; cue: SoundCue }
  | { kind: 'scene'; scene: SoundScene };

export const SOUND_EVENT = 'mechalab:sound';

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

export function setSoundScene(scene: SoundScene): void {
  dispatch({ kind: 'scene', scene });
}

/** Read a dispatched event back into the message, or null when it is not one of ours. */
export function readSoundMessage(event: Event): SoundMessage | null {
  const detail = (event as CustomEvent<SoundMessage>).detail;
  if (!detail || typeof detail !== 'object') return null;
  if (detail.kind === 'cue' && typeof detail.cue === 'string') return detail;
  if (detail.kind === 'scene' && (detail.scene === 'home' || detail.scene === 'focus')) return detail;
  return null;
}
