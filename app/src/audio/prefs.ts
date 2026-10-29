/**
 * The sound preference (`app/src/audio/prefs.ts`).
 *
 * Sound is **off until asked for**, and asking is remembered. Three rules, from the story plan:
 *
 * 1. **No autoplay on landing.** Remembering that sound was on is not permission to play it at a
 *    stranger's desk. The preference is a fact about the learner, not a licence: `SoundControl` arms a
 *    one-shot gesture listener and starts on the first pointer or key press, never at load.
 * 2. **One click from muted.** The control is a toggle, and the value it writes is the value the
 *    engine reads, so there is no second "master" that can disagree. The focus pill carries the same
 *    button, because focus hides the header and a mute you cannot reach is not a mute.
 * 3. **The store never decides what is on screen.** `readSoundPrefs` is the starting value and
 *    `writeSoundPrefs` returns what to render, so blocked storage costs the memory, never the toggle —
 *    the same contract as `focusMode.ts` and the fold keys.
 *
 * The numbers are deliberately few: a master toggle, the music bed, the room, and the effects, plus
 * two choices that are switches rather than levels — whether the interface clicks at all, and whether
 * the music is a song or a drone. Per-cue volume is an implementation detail, and every knob here is
 * one a learner can reason about in a second.
 */

import { DEFAULT_TAPE, isTapeId, tapeById } from './musicCatalogue.ts';

export interface SoundPrefs {
  /** The master. Off means nothing is scheduled and the context is suspended. */
  on: boolean;
  /** Bed level, 0..1. The beds are quiet by construction; this is the relative balance. */
  music: number;
  /**
   * Room-tone level, 0..1 — the rain, the floor, the city. Separate from `music` because the bed is
   * an instrument and the room is a place, and a learner may want one without the other.
   */
  room: number;
  /** Cue level, 0..1. Every interface tick and every verdict rides this number. */
  sfx: number;
  /**
   * Whether the interface makes any sound at all. Separate from `sfx` because a learner may want the
   * verdicts and the room while finding a tick under every button distracting — and a slider at zero
   * would be a hidden way to say the same thing.
   */
  clicks: boolean;
  /**
   * Which music: a tape id from `MUSIC_TAPES`, or `drone` for the two detuned oscillators.
   *
   * An id rather than a category, because a category with two tapes must remember which one — and a
   * catalogue id outlives a panel that groups it differently.
   */
  tape: string;
}

export const SOUND_STORAGE_KEY = 'mechalab_sound_v1';
export const SOUND_SCHEMA = 'mechalab.sound/2';

/** What a fresh browser hears: nothing, until the toggle is pressed. */
export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  on: false,
  music: 0.6,
  room: 0.45,
  sfx: 0.8,
  clicks: true,
  tape: DEFAULT_TAPE,
};

/** A level that would not round-trip is a level the slider could never show. */
export function clampLevel(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, Math.round(number * 100) / 100));
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Parse a stored value. Exported because the archive's merge and the tests both need the same
 * answer: anything that is not a well-formed record falls back to the default, and a stored `on:
 * true` is honoured — the *gesture* gate is the engine's, not the parser's.
 */
export function parseSoundPrefs(raw: string | null | undefined): SoundPrefs {
  if (!raw) return { ...DEFAULT_SOUND_PREFS };
  try {
    // `beds` is the pre-tape field this record may still carry; it is read only to migrate it.
    const parsed = JSON.parse(raw) as (Partial<SoundPrefs> & { beds?: unknown }) | null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SOUND_PREFS };
    return {
      on: parsed.on === true,
      music: clampLevel(parsed.music, DEFAULT_SOUND_PREFS.music),
      // A record written before the Room fader existed simply has no `room`; it gets the default.
      room: clampLevel(parsed.room, DEFAULT_SOUND_PREFS.room),
      sfx: clampLevel(parsed.sfx, DEFAULT_SOUND_PREFS.sfx),
      // Same for the two switches: an old record keeps its levels and gains today's defaults.
      clicks: parsed.clicks !== false,
      tape: storedTape(parsed.tape, parsed.beds),
    };
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

/**
 * The tape a stored record names, migrating the pre-tape field.
 *
 * Before this field existed the choice was `beds: 'lofi' | 'synth'`. Both old values have an exact
 * new meaning — `lofi` was these same two recordings, `synth` was the drone — so a learner who chose
 * the drone in an earlier visit keeps the drone, and everyone else keeps the recording they had.
 * Anything else is the default tape: a catalogue can lose an id between releases, and a lost id must
 * cost the choice, never the control.
 */
function storedTape(tape: unknown, legacyBeds: unknown): string {
  if (isTapeId(tape)) return tape;
  if (legacyBeds === 'synth') return 'drone';
  // A legacy record named no tape inside lo-fi; the first tape is the one it was hearing.
  return legacyBeds === 'lofi' ? 'lab-night' : DEFAULT_TAPE;
}

export function readSoundPrefs(): SoundPrefs {
  const store = storage();
  if (!store) return { ...DEFAULT_SOUND_PREFS };
  try {
    return parseSoundPrefs(store.getItem(SOUND_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

type Listener = (prefs: SoundPrefs) => void;
const listeners = new Set<Listener>();
let current: SoundPrefs | null = null;

/** The last value written or read, shared by every mounted control (the header and the focus pill). */
export function cachedSoundPrefs(): SoundPrefs {
  if (!current) current = readSoundPrefs();
  return { ...current };
}

export function subscribeSoundPrefs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Write a patch, notify every control, and return the value to render.
 *
 * `on: true` is written even when storage refuses: the preference is what the learner just chose.
 */
export function writeSoundPrefs(patch: Partial<SoundPrefs>): SoundPrefs {
  const base = cachedSoundPrefs();
  const next: SoundPrefs = {
    on: typeof patch.on === 'boolean' ? patch.on : base.on,
    music: clampLevel(patch.music, base.music),
    room: clampLevel(patch.room, base.room),
    sfx: clampLevel(patch.sfx, base.sfx),
    clicks: typeof patch.clicks === 'boolean' ? patch.clicks : base.clicks,
    tape: isTapeId(patch.tape) ? patch.tape : base.tape,
  };
  current = next;
  const store = storage();
  if (store) {
    try {
      store.setItem(SOUND_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Blocked or full: the choice lasts this visit only.
    }
  }
  for (const listener of [...listeners]) {
    try {
      listener({ ...next });
    } catch {
      // A broken listener must not take the control down with it.
    }
  }
  return { ...next };
}

/** What the button says, and what a screen reader announces after the press. */
export function soundLabel(on: boolean): string {
  return on ? 'Sound on — mute everything' : 'Sound off — turn on cues and room tone';
}

/** The panel's one-line explanation; the same words in both variants. */
export function soundHint(on: boolean): string {
  if (!on) return 'Nothing plays until you turn this on. The choice is remembered.';
  const tape = cachedSoundPrefs().tape;
  return tape === 'drone'
    ? 'Two detuned oscillators under the room tone, a tick under the controls. Muted in one click.'
    : `${tapeById(tape).title} under the room tone, a tick under the controls. Muted in one click.`;
}
