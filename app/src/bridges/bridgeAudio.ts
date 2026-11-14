/**
 * The three sounds P.9's dials make (`app/src/bridges/bridgeAudio.ts`).
 *
 * A detent is a tick you feel in the hand; a mark landing has to sound like something *happened*,
 * so it is a two-note rise rather than a louder single tick; and the fifth mark is a small arpeggio,
 * because finishing should be obviously different from succeeding once. Three short envelopes on
 * oscillators, no files and no dependency, so a lesson with a visual still fetches only its own
 * chunk.
 *
 * The context is built by the first gesture that asks for a sound and never at load: a page that
 * makes noise before it is touched is the thing this module exists to avoid. `soundAllowed` decides
 * whether a tick is sent at all, so reduced motion silences the card even with sound switched on.
 */

import { soundAllowed } from './bridgeChase';

/** What is being celebrated. */
export type Tick = 'detent' | 'mark' | 'done';

/** `[frequency, seconds]`, played in order: a detent is one blip, the finish is three notes. */
const TONES: Record<Tick, readonly (readonly [number, number])[]> = {
  detent: [[880, 0.02]],
  mark: [[659, 0.05], [988, 0.09]],
  done: [[523, 0.07], [784, 0.07], [1047, 0.16]],
};

/** The loudest a tick gets at its peak, before the destination mixes it with anything else. */
const PEAK: Record<Tick, number> = { detent: 0.05, mark: 0.11, done: 0.16 };

let context: AudioContext | null = null;

/** Whether this system has asked for less motion — which also means no sound from this card. */
export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The context, built on demand. Null where the browser has no WebAudio at all. */
function audioContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** A gesture asking for sound is what may start the context; nothing here runs on mount. */
export function unlock(muted: boolean): void {
  if (muted || reducedMotion()) return;
  const audio = audioContext();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
}

/**
 * Play one tick, if the reader wants sound at all. Called from the same `move` every input uses, so
 * a keyboard landing is heard exactly like a dragged one.
 */
export function tick(kind: Tick, muted: boolean): void {
  if (!soundAllowed(muted, reducedMotion())) return;
  const audio = audioContext();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  let at = audio.currentTime;
  for (const [frequency, seconds] of TONES[kind]) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = kind === 'detent' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(PEAK[kind], at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + seconds + 0.02);
    at += seconds;
  }
}
