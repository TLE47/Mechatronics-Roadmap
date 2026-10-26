/**
 * The sound engine (`app/src/audio/engine.ts`) — the only module that owns an AudioContext.
 *
 * **Nothing is downloaded.** Every cue and both beds are synthesised from oscillators and gain
 * envelopes at the moment they play, so sound costs the bundle a few kilobytes of code and no audio
 * files, no licences, and no third-party request. That is also why it is a lazy chunk: a learner who
 * never enables sound never fetches it.
 *
 * The graph, from the plan's section 6:
 *
 *     lab bed ─┐
 *     focus bed ┴→ music bus → duck → master ─→ destination
 *     cues ─────────→ sfx bus ──────↗
 *
 * Three properties matter and are tested (`scripts/test_audio.mjs`):
 *
 * 1. **No context before a gesture.** The constructor touches nothing. `enable()` is called from a
 *    click or key press, so the browser's autoplay policy is satisfied by the design rather than by a
 *    resume-after-rejection workaround.
 * 2. **Ducking is one number, applied once.** A run lowers the music bus to `DUCK_GAIN` and restores
 *    it afterwards; the sfx bus never ducks, because the relay click is the cue. Focus is a *scene*
 *    factor on the same multiplier, so the two cannot fight: `music = level × scene × duck`.
 * 3. **Cues are short, quiet and bounded.** Nothing here lasts past 1.2 s, nothing is a buzzer, and a
 *    rain of runs cannot pile up: at most one cue per `CUE_GAP_MS`.
 *
 * The level numbers are relative balances, not decibels; the beds are deliberately far under the cues.
 */

import type { SoundCue, SoundScene } from './facade.ts';
import { type SoundPrefs } from './prefs.ts';

/** Music level while a run is active: about −10 dB, enough to get out of the way of the checks. */
export const DUCK_GAIN = 0.32;
/** Focus mode keeps the bed, quieter: the plan's "heavier room-tone duck". */
export const FOCUS_GAIN = 0.45;
/** At most one cue per this many milliseconds, so a watch loop cannot turn into a machine gun. */
export const CUE_GAP_MS = 60;
/** How long a level change takes. Long enough to be a fade, short enough to be a response. */
export const RAMP_SECONDS = 0.12;
/** The bed crossfade in and out of focus mode. */
export const SCENE_SECONDS = 1.2;

export interface SoundDebug {
  running: boolean;
  ducked: boolean;
  scene: SoundScene;
  cues: SoundCue[];
  muted: boolean;
}

export interface EngineOptions {
  /** Injected by the tests; the browser passes nothing. */
  createContext?: () => AudioContext;
  now?: () => number;
}

function defaultContext(): AudioContext {
  const Ctor =
    typeof globalThis.AudioContext === 'function'
      ? globalThis.AudioContext
      : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is not available in this browser');
  return new Ctor();
}

/** Schedule a number on an AudioParam without assuming the browser's automation curve. */
function ramp(param: AudioParam, value: number, at: number, seconds = RAMP_SECONDS): void {
  try {
    param.cancelScheduledValues(at);
  } catch {
    // Older implementations: a linear ramp from wherever it is still moves the right way.
  }
  try {
    param.setValueAtTime(value, at);
  } catch {
    // A fake context in the tests may only implement the ramp.
  }
  try {
    param.linearRampToValueAtTime(value, at + seconds);
  } catch {
    param.value = value;
  }
}

interface Tone {
  freq: number;
  type: OscillatorType;
  duration: number;
  peak: number;
  attack?: number;
  delay?: number;
}

/** What each cue is, in one place, so the sounds can be reasoned about (and tested) as data. */
export const CUE_TONES: Record<SoundCue, Tone[]> = {
  // A relay closing: the bench answering the Run button.
  'run-start': [
    { freq: 140, type: 'square', duration: 0.035, peak: 0.16 },
    { freq: 420, type: 'sine', duration: 0.07, peak: 0.05, delay: 0.02 },
  ],
  // The pips cascade the screen draws, heard: a rising third, then a short shimmer.
  'run-pass': [
    { freq: 523.25, type: 'triangle', duration: 0.2, peak: 0.16 },
    { freq: 659.25, type: 'triangle', duration: 0.2, peak: 0.16, delay: 0.09 },
    { freq: 783.99, type: 'triangle', duration: 0.24, peak: 0.16, delay: 0.18 },
    { freq: 1046.5, type: 'sine', duration: 0.5, peak: 0.05, delay: 0.26 },
  ],
  // A neutral low tick: "not this time", never a buzzer.
  'run-fail': [{ freq: 196, type: 'sine', duration: 0.16, peak: 0.14, attack: 0.008 }],
  // The stamp: a two-note stinger that lasts under a second and does not wait for anything.
  verify: [
    { freq: 392, type: 'triangle', duration: 0.5, peak: 0.15, attack: 0.02 },
    { freq: 587.33, type: 'triangle', duration: 0.8, peak: 0.13, attack: 0.02, delay: 0.08 },
    { freq: 783.99, type: 'sine', duration: 0.9, peak: 0.06, attack: 0.02, delay: 0.16 },
  ],
  // First light on the bench, played once when sound is enabled.
  boot: [
    { freq: 98, type: 'sine', duration: 1.0, peak: 0.14, attack: 0.25 },
    { freq: 147, type: 'sine', duration: 0.9, peak: 0.06, attack: 0.3, delay: 0.1 },
  ],
};

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private labBed: GainNode | null = null;
  private focusBed: GainNode | null = null;
  private levels: SoundPrefs = { on: false, music: 0.6, sfx: 0.8 };
  private scene: SoundScene = 'home';
  private ducked = false;
  private lastCueAt = -Infinity;
  private cues: SoundCue[] = [];
  private booted = false;
  private readonly createContext: () => AudioContext;
  private readonly now: () => number;

  constructor(options: EngineOptions = {}) {
    this.createContext = options.createContext ?? defaultContext;
    this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  get isDucked(): boolean {
    return this.ducked;
  }

  /** Called from the toggle (a gesture). Idempotent: the graph is built once. */
  async enable(prefs: SoundPrefs): Promise<void> {
    this.levels = { ...prefs, on: true };
    const ctx = this.ensureContext();
    await ctx.resume().catch(() => undefined);
    this.applyLevels(0);
    if (!this.booted) {
      this.booted = true;
      this.cue('boot');
    }
  }

  /** Mute everything and let the context go quiet, without tearing the graph down. */
  async disable(): Promise<void> {
    this.levels = { ...this.levels, on: false };
    if (!this.ctx || !this.master) return;
    this.applyLevels();
    await this.ctx.suspend().catch(() => undefined);
  }

  /** Apply a preference change while enabled (a level, or the master toggle). */
  apply(prefs: SoundPrefs): void {
    const wasOn = this.levels.on;
    this.levels = { ...prefs };
    if (!this.ctx) return;
    this.applyLevels();
    if (wasOn && !prefs.on) {
      // A fade is enough; suspending immediately would cut the fade off.
      const ctx = this.ctx;
      setTimeout(() => {
        if (!this.levels.on) void ctx.suspend().catch(() => undefined);
      }, RAMP_SECONDS * 1000 + 40);
    }
    if (!wasOn && prefs.on) void this.ctx.resume().catch(() => undefined);
  }

  /** One cue. Silent while off, during a scene change, or within `CUE_GAP_MS` of the last one. */
  cue(cue: SoundCue): void {
    const ctx = this.ctx;
    if (!ctx || !this.levels.on || !this.sfxBus) return;
    const at = this.now();
    // The gap exists for the cues a loop can repeat — the Run click and the stamp. A verdict is the
    // end of a run and always plays: dropping it would leave the bed ducked with nothing to lift it.
    const gated = cue === 'run-start' || cue === 'verify';
    if (gated && at - this.lastCueAt < CUE_GAP_MS) return;
    if (gated) this.lastCueAt = at;
    this.cues.push(cue);
    if (this.cues.length > 20) this.cues.shift();
    const start = ctx.currentTime + 0.01;
    for (const tone of CUE_TONES[cue]) this.playTone(tone, start + (tone.delay ?? 0));
  }

  /** A run lowers the bed; its verdict restores it. The sfx bus is never part of this. */
  setDucked(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.applyLevels();
  }

  /** Home is the lab; focus is the quieter current. Both crossfade over `SCENE_SECONDS`. */
  setScene(scene: SoundScene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.applyLevels(SCENE_SECONDS);
  }

  debug(): SoundDebug {
    return {
      running: this.running,
      ducked: this.ducked,
      scene: this.scene,
      cues: [...this.cues],
      muted: !this.levels.on,
    };
  }

  // ---- graph ----------------------------------------------------------------------------------

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = this.createContext();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const duck = ctx.createGain();
    duck.gain.value = 1;
    duck.connect(master);

    const musicBus = ctx.createGain();
    musicBus.connect(duck);

    const sfxBus = ctx.createGain();
    sfxBus.connect(master);

    const labBed = ctx.createGain();
    labBed.gain.value = 0;
    labBed.connect(musicBus);
    this.buildBed(ctx, labBed, [
      { freq: 55, peak: 0.5 },
      { freq: 82.5, peak: 0.35, detune: 4 },
    ], 240);

    const focusBed = ctx.createGain();
    focusBed.gain.value = 0;
    focusBed.connect(musicBus);
    this.buildBed(ctx, focusBed, [
      { freq: 523.25, peak: 0.22 },
      { freq: 783.99, peak: 0.16, detune: -3 },
    ], 1600);

    this.ctx = ctx;
    this.master = master;
    this.duck = duck;
    this.musicBus = musicBus;
    this.sfxBus = sfxBus;
    this.labBed = labBed;
    this.focusBed = focusBed;
    return ctx;
  }

  /** A bed is two detuned sines through a low-pass, at a level well under the cues. */
  private buildBed(
    ctx: AudioContext,
    out: GainNode,
    partials: { freq: number; peak: number; detune?: number }[],
    cutoff: number
  ): void {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7;
    filter.connect(out);
    for (const partial of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = partial.freq;
      if (partial.detune) osc.detune.value = partial.detune;
      const gain = ctx.createGain();
      // The bed's own partial level; the master music bus applies the learner's number on top.
      gain.gain.value = partial.peak * 0.08;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
    }
  }

  /**
   * The one place the three multipliers meet: `music level × scene factor × duck factor`, and the
   * master's on/off. Called on enable, on every preference change, and on duck/scene transitions.
   */
  private applyLevels(seconds = RAMP_SECONDS): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.musicBus || !this.duck || !this.sfxBus) return;
    const at = ctx.currentTime;
    const sceneFactor = this.scene === 'focus' ? FOCUS_GAIN : 1;
    const duckFactor = this.ducked ? DUCK_GAIN : 1;
    ramp(this.master.gain, this.levels.on ? 1 : 0, at, seconds);
    ramp(this.duck.gain, duckFactor, at, seconds);
    ramp(this.musicBus.gain, this.levels.music * sceneFactor * 0.9, at, seconds);
    ramp(this.sfxBus.gain, this.levels.sfx, at, seconds);
    if (this.labBed) ramp(this.labBed.gain, this.scene === 'focus' ? 0 : 1, at, seconds);
    if (this.focusBed) ramp(this.focusBed.gain, this.scene === 'focus' ? 1 : 0, at, seconds);
  }

  private playTone(tone: Tone, at: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    osc.type = tone.type;
    osc.frequency.value = tone.freq;
    const gain = ctx.createGain();
    const attack = tone.attack ?? 0.01;
    const end = at + tone.duration;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(tone.peak, at + attack);
    gain.gain.linearRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(at);
    osc.stop(end + 0.02);
  }
}

/**
 * The engine reads the bus, and nothing else does. Exported so the control can wire one listener and
 * the tests can drive the same function without React.
 */
export function handleSoundMessage(engine: SoundEngine, message: { kind: 'cue'; cue: SoundCue } | { kind: 'scene'; scene: SoundScene }): void {
  if (message.kind === 'scene') {
    engine.setScene(message.scene);
    return;
  }
  // A run lowers the bed; anything that ends one raises it again. `verify` is included on purpose:
  // a pass may be reported without its run-start in a future surface, and a duck that nothing lifts
  // is a bed that never comes back.
  engine.setDucked(message.cue === 'run-start');
  engine.cue(message.cue);
}
