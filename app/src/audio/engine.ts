/**
 * The sound engine (`app/src/audio/engine.ts`) — the only module that owns an AudioContext.
 *
 * **Cues are synthesised; the room is one recorded loop.** Every cue and every interface tick is
 * oscillators, filtered noise and gain envelopes scheduled at the moment they play. The rain is the
 * single exception (`assets/rain-loop.m4a`, fetched only after sound is switched on, with a
 * synthesised fallback when the file cannot be had). That keeps a muted visit at zero audio bytes
 * and gives the room a texture no oscillator stack quite reaches.
 *
 * The graph:
 *
 *     rain → gust ─┐
 *     floor ───────┴→ room bus ─┐
 *     city ─────────────────────┤
 *     tape ─────────→ music bus ┴→ duck → master → limiter → destination
 *     clicks + cues ─→ sfx bus ─────┘
 *     bench (a run) ─→ sfx bus
 *
 * Five properties matter and are tested (`scripts/test_audio.mjs`):
 *
 * 1. **No context before a gesture.** The constructor touches nothing. `enable()` is called from a
 *    click or key press, so the browser's autoplay policy is satisfied by the design rather than by
 *    a resume-after-rejection workaround.
 * 2. **Ducking is one number, applied once.** A run lowers the bed *and* the room to `DUCK_GAIN`
 *    and restores them afterwards; the bench and the cues live on the effects bus, which never
 *    ducks, because the machine under load is the point of the moment.
 * 3. **Cues are short, quiet and bounded.** Nothing lasts past 1.2 s, nothing is a buzzer, and a
 *    rain of runs cannot pile up: at most one cue per `CUE_GAP_MS`.
 * 4. **Clicks are furniture, not a verdict.** Their own gap (`UI_GAP_MS`), their own level
 *    (`CLICK_PEAK`), and a cap of `MAX_VOICES` ticks per second so even a caller that ignores the gap
 *    cannot clip the mix. They are the only thing that pans.
 * 5. **The room is a fact about the state.** `ambience.ts` says which layers are audible; the engine
 *    only ramps the numbers it is given.
 *
 * The level numbers are relative balances, not decibels; the room is deliberately far under the cues.
 */

import type { SoundCue, SoundMessage, SoundScene, UiRole } from './facade.ts';
import { clampPan } from './facade.ts';
import { DEFAULT_SOUND_PREFS, type SoundPrefs } from './prefs.ts';
import { ROOM_TRIM, roomMix, type RoomLayer } from './ambience.ts';
import { DRONE_ID, tapeById } from './musicCatalogue.ts';

/** Music and room level while a run is active: about −10 dB, enough to get out of the way. */
export const DUCK_GAIN = 0.32;
/** Focus mode keeps the room, quieter: the plan's "heavier room-tone duck". */
export const FOCUS_GAIN = 0.45;
/** At most one cue per this many milliseconds, so a watch loop cannot turn into a machine gun. */
export const CUE_GAP_MS = 60;
/** At most one interface tick per this many milliseconds — a click, not a rattle. */
export const UI_GAP_MS = 35;
/** At most this many interface ticks may sound in any one `VOICE_WINDOW_MS`. */
export const MAX_VOICES = 16;
/** The window the click cap counts over: a second of interface, not a session of it. */
export const VOICE_WINDOW_MS = 1000;
/** No single click tone is louder than this: well under the quietest verdict. */
export const CLICK_PEAK = 0.1;
/** How long a level change takes. Long enough to be a fade, short enough to be a response. */
export const RAMP_SECONDS = 0.12;
/** The bed crossfade in and out of focus mode. */
export const SCENE_SECONDS = 1.2;
/** The rain's swell after a failed run: one breath in, half a second out. */
export const GUST_SECONDS = 0.5;
export const GUST_GAIN = 1.55;
/**
 * The tapes are RMS-matched by `scripts/build_music.mjs`; this is where a tape sits
 * under the learner's Music fader, chosen so a tape change is not a jump in loudness from the drone.
 * The faders do the rest, and the cues are never touched.
 */
export const BED_TRIM = 0.22;
/**
 * How many decoded tapes the engine keeps alive.
 *
 * Every visited tape stays looping at zero gain, so switching back is instant instead of a second
 * fetch-and-decode. Three is enough for A/B listening and small enough that hunting through all eight
 * tapes cannot keep eight decoded buffers resident.
 */
export const MAX_TAPE_NODES = 3;

export type RainSource = 'none' | 'file' | 'synth';
/** Which music is audible: the chosen tape, the drone, or nothing loaded yet. */
export type MusicSource = 'none' | 'file' | 'synth';

export interface SoundDebug {
  running: boolean;
  ducked: boolean;
  scene: SoundScene;
  cues: SoundCue[];
  /** The last few interface ticks, for a browser suite to read without reaching into audio nodes. */
  uiCues: UiRole[];
  muted: boolean;
  /** The Room fader's value, 0..1. */
  room: number;
  /** Where the rain came from: the recorded loop, the fallback, or nothing yet. */
  rain: RainSource;
  /** Where the music came from: the chosen tape, the drone, or nothing loaded yet. */
  musicSource: MusicSource;
  /**
   * The last twenty duck transitions, oldest first. A run can finish in less time than a browser
   * suite polls, so the *history* is what a test can assert without racing the machine.
   */
  duckHistory: boolean[];
  /** Whether the interface ticks are on at all. */
  clicks: boolean;
  /** Which tape the learner asked for: a catalogue id, or `drone`. */
  tape: string;
}

export interface EngineOptions {
  /** Injected by the tests; the browser passes nothing. */
  createContext?: () => AudioContext;
  now?: () => number;
  /** Injected by the tests: `null` exercises the synthesised-rain fallback. */
  loadRain?: () => Promise<AudioBuffer | null>;
  /** Injected by the tests: `null` exercises the drone fallback for a tape that will not load. */
  loadTape?: (tapeId: string) => Promise<AudioBuffer | null>;
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

/** A noise transient: the sound of something touching something else. */
interface Noise {
  duration: number;
  peak: number;
  type: BiquadFilterType;
  freq: number;
  q?: number;
}

/** One interface tick: a body (tones) and, usually, an edge (one noise transient). */
export interface ClickSpec {
  tones: Tone[];
  noise?: Noise;
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

/**
 * The seven clicks. Same language throughout — a struck body plus a breath of filtered noise — but
 * a different shape for each kind of control, so the interface has an accent rather than a beep.
 */
export const CLICK_SPECS: Record<UiRole, ClickSpec> = {
  // A tab: dry metal, low, gone before the panel is.
  nav: {
    tones: [{ freq: 240, type: 'triangle', duration: 0.045, peak: 0.055 }],
    noise: { duration: 0.03, peak: 0.05, type: 'highpass', freq: 1800 },
  },
  // Run, Continue, Open: the same relay as the cue, shorter, with a spring release.
  primary: {
    tones: [
      { freq: 150, type: 'square', duration: 0.04, peak: 0.07 },
      { freq: 420, type: 'sine', duration: 0.06, peak: 0.04, delay: 0.02 },
    ],
    noise: { duration: 0.025, peak: 0.05, type: 'bandpass', freq: 900, q: 0.9 },
  },
  // A latch: two stages, the second smaller.
  toggle: {
    tones: [
      { freq: 320, type: 'square', duration: 0.025, peak: 0.06 },
      { freq: 180, type: 'triangle', duration: 0.04, peak: 0.045, delay: 0.03 },
    ],
    noise: { duration: 0.02, peak: 0.04, type: 'highpass', freq: 2500 },
  },
  // A list row: a brush, not a click.
  row: {
    tones: [{ freq: 180, type: 'sine', duration: 0.03, peak: 0.03 }],
    noise: { duration: 0.035, peak: 0.06, type: 'lowpass', freq: 1200 },
  },
  // A chip or a badge: glass, small and high.
  chip: {
    tones: [{ freq: 520, type: 'triangle', duration: 0.04, peak: 0.04 }],
    noise: { duration: 0.025, peak: 0.05, type: 'bandpass', freq: 2400, q: 1.2 },
  },
  // A detent: the tiniest sound in the app.
  slider: {
    tones: [{ freq: 660, type: 'sine', duration: 0.02, peak: 0.02 }],
    noise: { duration: 0.015, peak: 0.03, type: 'highpass', freq: 3000 },
  },
  // Closing, skipping, discarding: an unlatch, lower and darker than anything else.
  close: {
    tones: [{ freq: 150, type: 'triangle', duration: 0.05, peak: 0.05 }],
    noise: { duration: 0.03, peak: 0.05, type: 'lowpass', freq: 700 },
  },
};

/** A click's full length, for the voice budget. */
export function clickLength(spec: ClickSpec): number {
  const body = spec.tones.reduce((end, tone) => Math.max(end, (tone.delay ?? 0) + tone.duration), 0);
  return Math.max(body, spec.noise?.duration ?? 0);
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private musicBus: GainNode | null = null;
  private roomBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private labBed: GainNode | null = null;
  private focusBed: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private floorGain: GainNode | null = null;
  private cityGain: GainNode | null = null;
  private benchGain: GainNode | null = null;
  private gustGain: GainNode | null = null;
  private rain: RainSource = 'none';
  private rainLoading: Promise<void> | null = null;
  private tapeNodes: Map<string, { gain: GainNode; source: AudioBufferSourceNode }> = new Map();
  private loadedTape: string | null = null;
  private musicFailed = false;
  private tapeLoading: Promise<void> | null = null;
  private tapeLoadingId: string | null = null;
  private tape: string = DEFAULT_SOUND_PREFS.tape;
  private clicks = DEFAULT_SOUND_PREFS.clicks;
  private noiseBuffer: AudioBuffer | null = null;
  private levels: SoundPrefs = { ...DEFAULT_SOUND_PREFS };
  private scene: SoundScene = 'home';
  private ducked = false;
  private duckHistory: boolean[] = [];
  private lastCueAt = -Infinity;
  private lastUiAt = -Infinity;
  private voices: number[] = [];
  private cues: SoundCue[] = [];
  private uiCues: UiRole[] = [];
  private booted = false;
  private readonly createContext: () => AudioContext;
  private readonly now: () => number;
  private readonly loadRain?: () => Promise<AudioBuffer | null>;
  private readonly loadTape?: (tapeId: string) => Promise<AudioBuffer | null>;

  constructor(options: EngineOptions = {}) {
    this.createContext = options.createContext ?? defaultContext;
    this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.loadRain = options.loadRain;
    this.loadTape = options.loadTape;
  }

  /**
   * Which music is audible right now.
   *
   * `file` only for the tape the learner asked for *and* that is decoded: a tape that is still loading,
   * or one whose fetch failed, leaves the drone playing, so this answers what is heard rather than what
   * was requested.
   */
  get musicSource(): MusicSource {
    if (this.tape === DRONE_ID) return 'synth';
    if (this.loadedTape === this.tape && this.tapeNodes.has(this.tape)) return 'file';
    return this.musicFailed ? 'synth' : 'none';
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  get isDucked(): boolean {
    return this.ducked;
  }

  /** Called from the toggle (a gesture). Idempotent: the graph is built once. */
  async enable(prefs: SoundPrefs): Promise<void> {
    this.levels = normalise(prefs, true);
    this.tape = this.levels.tape;
    this.clicks = this.levels.clicks;
    const ctx = this.ensureContext();
    await ctx.resume().catch(() => undefined);
    this.applyLevels(0);
    // The room and the tape arrive when they arrive: a slow fetch must never delay the boot cue or
    // the gesture. Until the tape lands, the drone is what plays — music from the first moment.
    void this.ensureRain();
    void this.ensureTape();
    if (!this.booted) {
      this.booted = true;
      this.cue('boot');
    }
  }

  /** Mute everything and let the context go quiet, without tearing the graph down. */
  async disable(): Promise<void> {
    this.levels = normalise(this.levels, false);
    if (!this.ctx || !this.master) return;
    this.applyLevels();
    await this.ctx.suspend().catch(() => undefined);
  }

  /** Apply a preference change while enabled (a level, or the master toggle). */
  apply(prefs: SoundPrefs): void {
    const wasOn = this.levels.on;
    const wasTape = this.tape;
    this.levels = normalise(prefs, prefs.on === true);
    this.tape = this.levels.tape;
    this.clicks = this.levels.clicks;
    if (!this.ctx) return;
    // Choosing a tape mid-session, or raising Music from zero, starts the fetch then and there;
    // choosing the drone, or turning music off, needs no network at all.
    const wanted = this.levels.on && this.tape !== DRONE_ID && this.levels.music > 0;
    if (wanted && (wasTape !== this.tape || this.loadedTape !== this.tape)) void this.ensureTape();
    // A tape change is a scene change, not a fader move: crossfade it over the same 1.2 s.
    this.applyLevels(wasTape === this.tape ? RAMP_SECONDS : SCENE_SECONDS);
    if (wasOn && !this.levels.on) {
      // A fade is enough; suspending immediately would cut the fade off.
      const ctx = this.ctx;
      setTimeout(() => {
        if (!this.levels.on) void ctx.suspend().catch(() => undefined);
      }, RAMP_SECONDS * 1000 + 40);
    }
    if (!wasOn && this.levels.on) void this.ctx.resume().catch(() => undefined);
  }

  /** One cue. Silent while off, or within `CUE_GAP_MS` of the last one. */
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
    const destination = this.sfxBus;
    for (const tone of CUE_TONES[cue]) this.playTone(tone, start + (tone.delay ?? 0), destination);
  }

  /**
   * One interface tick, placed by `pan`.
   *
   * Separate from `cue` in every way that matters: its own gap, its own peak, and a cap on how many
   * may overlap, so holding down a key on a focused button cannot turn the mix into a rattle.
   */
  playUi(role: UiRole, pan = 0, preview = false): void {
    const ctx = this.ctx;
    const spec = CLICK_SPECS[role];
    if (!ctx || !this.levels.on || (!this.clicks && !preview) || !this.sfxBus || !spec) return;
    const at = this.now();
    // The gap is the normal pacing, and a preview is exempt: the press that opened the panel has just
    // sounded, and a preview swallowed by it would be a button that does nothing.
    if (!preview && at - this.lastUiAt < UI_GAP_MS) return;
    // The cap is the backstop for anything that ignores the gap (a slider drag, several listeners on
    // one press), and it is a rate over a second, not a session budget.
    this.voices = this.voices.filter((shown) => at - shown < VOICE_WINDOW_MS);
    if (this.voices.length >= MAX_VOICES) return;
    this.lastUiAt = at;
    this.voices.push(at);
    this.uiCues.push(role);
    if (this.uiCues.length > 20) this.uiCues.shift();

    const start = ctx.currentTime + 0.005;
    const destination = this.panner(pan);
    for (const tone of spec.tones) this.playTone(tone, start + (tone.delay ?? 0), destination);
    if (spec.noise) this.playNoise(spec.noise, start, destination);
  }

  /** A run lowers the bed and the room; its verdict restores them. The sfx bus is never part of this. */
  setDucked(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.duckHistory.push(on);
    if (this.duckHistory.length > 20) this.duckHistory.shift();
    this.applyLevels();
  }

  /** Home is the lab; focus is the quieter current. Both crossfade over `SCENE_SECONDS`. */
  setScene(scene: SoundScene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.applyLevels(SCENE_SECONDS);
  }

  /** A failed run pulls one breath of rain into the room; it decays on its own. */
  gust(): void {
    const ctx = this.ctx;
    const node = this.gustGain;
    if (!ctx || !node) return;
    const at = ctx.currentTime;
    try {
      node.gain.cancelScheduledValues(at);
      node.gain.setValueAtTime(GUST_GAIN, at);
      node.gain.linearRampToValueAtTime(1, at + GUST_SECONDS);
    } catch {
      node.gain.value = 1;
    }
  }

  debug(): SoundDebug {
    return {
      running: this.running,
      ducked: this.ducked,
      scene: this.scene,
      cues: [...this.cues],
      uiCues: [...this.uiCues],
      muted: !this.levels.on,
      room: this.levels.room,
      rain: this.rain,
      duckHistory: [...this.duckHistory],
      musicSource: this.musicSource,
      clicks: this.clicks,
      tape: this.tape,
    };
  }

  // ---- graph ----------------------------------------------------------------------------------

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = this.createContext();

    // The limiter is the last thing before the speakers: twenty fast clicks must not clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(limiter);

    const duck = ctx.createGain();
    duck.gain.value = 1;
    duck.connect(master);

    const musicBus = ctx.createGain();
    musicBus.connect(duck);

    // The room is its own bus under the duck, so the Room fader is independent of the music bed's.
    const roomBus = ctx.createGain();
    roomBus.gain.value = 0;
    roomBus.connect(duck);

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

    // ---- the room's four layers ---------------------------------------------------------------
    // Rain: the gain the recorded loop (or its fallback) is played into. The gust sits after it, so
    // a failed run swells the same signal whatever the source.
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    const gustGain = ctx.createGain();
    gustGain.gain.value = 1;
    rainGain.connect(gustGain);
    gustGain.connect(roomBus);

    // Floor: mains hum and its harmonic, through a low-pass so it is a hum and not a tone.
    const floorFilter = ctx.createBiquadFilter();
    floorFilter.type = 'lowpass';
    floorFilter.frequency.value = 140;
    const floorGain = ctx.createGain();
    floorGain.gain.value = 0;
    floorFilter.connect(floorGain);
    floorGain.connect(roomBus);
    for (const [freq, peak] of [[50, 0.5], [100, 0.25]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = peak;
      osc.connect(gain);
      gain.connect(floorFilter);
      osc.start();
    }

    // City: the same noise buffer, band-passed into distance and looped.
    const cityFilter = ctx.createBiquadFilter();
    cityFilter.type = 'bandpass';
    cityFilter.frequency.value = 420;
    cityFilter.Q.value = 0.7;
    const cityGain = ctx.createGain();
    cityGain.gain.value = 0;
    cityFilter.connect(cityGain);
    cityGain.connect(roomBus);
    const citySource = ctx.createBufferSource();
    citySource.buffer = this.noiseFor(ctx);
    citySource.loop = true;
    citySource.connect(cityFilter);
    citySource.start();

    // Bench: machinery, on the effects bus, because it is the one thing a run should make louder.
    const benchFilter = ctx.createBiquadFilter();
    benchFilter.type = 'lowpass';
    benchFilter.frequency.value = 620;
    const benchGain = ctx.createGain();
    benchGain.gain.value = 0;
    benchFilter.connect(benchGain);
    benchGain.connect(sfxBus);
    for (const [freq, peak, type] of [[118, 0.5, 'sawtooth'], [236, 0.2, 'triangle']] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = peak;
      osc.connect(gain);
      gain.connect(benchFilter);
      osc.start();
    }

    this.ctx = ctx;
    this.master = master;
    this.limiter = limiter;
    this.duck = duck;
    this.musicBus = musicBus;
    this.roomBus = roomBus;
    this.sfxBus = sfxBus;
    this.labBed = labBed;
    this.focusBed = focusBed;
    this.rainGain = rainGain;
    this.gustGain = gustGain;
    this.floorGain = floorGain;
    this.cityGain = cityGain;
    this.benchGain = benchGain;
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
   * The one place the multipliers meet: the learner's three numbers, the scene factor, the duck
   * factor, and the room mix for the state. Called on enable, on every preference change, and on
   * duck/scene transitions.
   */
  private applyLevels(seconds = RAMP_SECONDS): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.musicBus || !this.duck || !this.sfxBus) return;
    const at = ctx.currentTime;
    const sceneFactor = this.scene === 'focus' ? FOCUS_GAIN : 1;
    const duckFactor = this.ducked ? DUCK_GAIN : 1;
    const mix = roomMix(this.scene, this.ducked);
    ramp(this.master.gain, this.levels.on ? 1 : 0, at, seconds);
    ramp(this.duck.gain, duckFactor, at, seconds);
    ramp(this.musicBus.gain, this.levels.music * sceneFactor * 0.9, at, seconds);
    ramp(this.sfxBus.gain, this.levels.sfx, at, seconds);
    // The drone plays until the chosen tape is actually decoded, then steps aside; the two are never
    // both audible, so a scene or tape change is one crossfade either way.
    const tapeReady =
      this.tape !== DRONE_ID && this.loadedTape === this.tape && this.tapeNodes.has(this.tape);
    const droneOn = !tapeReady;
    if (this.labBed) ramp(this.labBed.gain, this.scene === 'focus' || !droneOn ? 0 : 1, at, seconds);
    if (this.focusBed) ramp(this.focusBed.gain, this.scene === 'focus' && droneOn ? 1 : 0, at, seconds);
    // Only the chosen tape is audible: the retained ones sit at zero and cost no mix headroom.
    for (const [id, node] of this.tapeNodes) {
      ramp(node.gain.gain, tapeReady && id === this.tape ? BED_TRIM : 0, at, seconds);
    }
    if (this.roomBus) ramp(this.roomBus.gain, this.levels.room * sceneFactor, at, seconds);
    this.rampRoom(this.rainGain, mix.rain, 'rain', at, seconds);
    this.rampRoom(this.floorGain, mix.floor, 'floor', at, seconds);
    this.rampRoom(this.cityGain, mix.city, 'city', at, seconds);
    // The bench is on the effects bus, so its level is the learner's effects number, not the room's.
    this.rampRoom(this.benchGain, mix.bench, 'bench', at, seconds, this.levels.sfx);
  }

  private rampRoom(
    node: GainNode | null,
    value: number,
    layer: RoomLayer,
    at: number,
    seconds: number,
    scale = 1
  ): void {
    if (!node) return;
    ramp(node.gain, value * ROOM_TRIM[layer] * scale, at, seconds);
  }

  /** Resolves when the room's source is decided: the recorded loop, or its fallback. */
  whenRoomReady(): Promise<void> {
    return this.rainLoading ?? Promise.resolve();
  }

  /** The recorded loop, or the synthesised fallback. Started once, after the first gesture. */
  private ensureRain(): Promise<void> {
    if (this.rainLoading) return this.rainLoading;
    this.rainLoading = (async () => {
      let buffer: AudioBuffer | null = null;
      try {
        buffer = this.loadRain ? await this.loadRain() : await this.fetchRain();
      } catch {
        buffer = null;
      }
      if (!this.ctx || !this.rainGain) return;
      if (buffer) {
        this.startRainSource(buffer);
        this.rain = 'file';
      } else {
        this.startSynthRain();
        this.rain = 'synth';
      }
      this.applyLevels();
    })();
    return this.rainLoading;
  }

  /**
   * The one network request sound ever makes. The URL lives in its own module so a Node test that
   * imports this engine never sees an `.m4a` import, and the file is fetched only here.
   */
  private async fetchRain(): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    const { RAIN_URL } = await import('./rainAsset.ts');
    const response = await fetch(RAIN_URL, { cache: 'force-cache' });
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  }

  private startRainSource(buffer: AudioBuffer): void {
    const ctx = this.ctx;
    if (!ctx || !this.rainGain) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 240;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(filter);
    filter.connect(this.rainGain);
    source.start();
  }

  private startSynthRain(): void {
    const ctx = this.ctx;
    if (!ctx || !this.rainGain) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const level = ctx.createGain();
    level.gain.value = 0.7;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseFor(ctx);
    source.loop = true;
    source.connect(filter);
    filter.connect(level);
    level.connect(this.rainGain);
    source.start();
  }

  /** Resolves when the chosen tape is decided: the loop, or the drone that covers its absence. */
  whenMusicReady(): Promise<void> {
    return this.tapeLoading ?? Promise.resolve();
  }

  /**
   * Fetch and start the chosen tape, unless it is already here.
   *
   * One file, on demand: the learner chooses a category and a tape, and only that loop is requested.
   * A refusal at any step (offline, a 404, a browser without AAC) leaves `musicFailed` and the drone
   * playing: a missed fetch is a different texture, never silence. A tape that arrives after the
   * learner has moved on is kept for an instant switch back, but never becomes the one that plays.
   */
  private ensureTape(): Promise<void> {
    const id = this.tape;
    if (id === DRONE_ID || !this.levels.on || this.levels.music <= 0) return Promise.resolve();
    if (this.tapeNodes.has(id)) {
      this.loadedTape = id;
      this.musicFailed = false;
      return this.tapeLoading ?? Promise.resolve();
    }
    if (this.tapeLoading && this.tapeLoadingId === id) return this.tapeLoading;
    this.tapeLoadingId = id;
    this.tapeLoading = (async () => {
      let buffer: AudioBuffer | null = null;
      try {
        buffer = this.loadTape ? await this.loadTape(id) : await this.fetchTape(id);
      } catch {
        buffer = null;
      }
      if (this.tapeLoadingId === id) this.tapeLoadingId = null;
      if (!this.ctx || !this.musicBus) return;
      if (!buffer) {
        // Only the tape still being asked for may report a failure: a slow 404 for the one before it
        // must not blank out the loop that has since taken over.
        if (this.tape === id) {
          this.musicFailed = true;
          this.applyLevels();
        }
        return;
      }
      this.startTape(id, buffer);
      if (this.tape === id) {
        this.loadedTape = id;
        this.musicFailed = false;
        this.applyLevels(SCENE_SECONDS);
      }
    })();
    return this.tapeLoading;
  }

  /** Start one tape's loop at zero gain, evicting the least recently used once `MAX_TAPE_NODES` is full. */
  private startTape(id: string, buffer: AudioBuffer): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus || this.tapeNodes.has(id)) return;
    while (this.tapeNodes.size >= MAX_TAPE_NODES) {
      const oldest = this.tapeNodes.keys().next().value;
      if (oldest === undefined) break;
      const node = this.tapeNodes.get(oldest);
      this.tapeNodes.delete(oldest);
      try {
        node?.source.stop();
        node?.source.disconnect();
        node?.gain.disconnect();
      } catch {
        // A node that never started cannot be stopped; dropping it is enough.
      }
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
    this.tapeNodes.set(id, { gain, source });
  }

  /** The tapes' URLs live in their own module, so this engine is importable under Node. */
  private async fetchTape(id: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    const { loadTape } = await import('./musicBeds.ts');
    return loadTape(tapeById(id), ctx);
  }

  /** One second of deterministic noise, shared by every layer and click that needs a texture. */
  private noiseFor(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.max(1, Math.floor(ctx.sampleRate));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x2f6e2b1;
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[index] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  /** A click's panner, or the bus itself on a browser without stereo placement. */
  private panner(pan: number): AudioNode {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) throw new Error('the graph is not built yet');
    if (typeof ctx.createStereoPanner !== 'function') return bus;
    const node = ctx.createStereoPanner();
    node.pan.value = clampPan(pan);
    node.connect(bus);
    return node;
  }

  private playTone(tone: Tone, at: number, destination: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
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
    gain.connect(destination);
    osc.start(at);
    osc.stop(end + 0.02);
  }

  /** The edge of a click: a short burst of the shared noise buffer through a filter. */
  private playNoise(noise: Noise, at: number, destination: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseFor(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = noise.type;
    filter.frequency.value = noise.freq;
    if (noise.q !== undefined) filter.Q.value = noise.q;
    const gain = ctx.createGain();
    const end = at + noise.duration;
    gain.gain.setValueAtTime(noise.peak, at);
    gain.gain.linearRampToValueAtTime(0.0001, end);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(at);
    source.stop(end + 0.02);
  }
}

/** Every preference, with the numbers this engine needs, whatever the caller sent. */
function normalise(prefs: Partial<SoundPrefs>, on: boolean): SoundPrefs {
  return {
    on,
    music: typeof prefs.music === 'number' ? prefs.music : DEFAULT_SOUND_PREFS.music,
    sfx: typeof prefs.sfx === 'number' ? prefs.sfx : DEFAULT_SOUND_PREFS.sfx,
    room: typeof prefs.room === 'number' ? prefs.room : DEFAULT_SOUND_PREFS.room,
    clicks: typeof prefs.clicks === 'boolean' ? prefs.clicks : DEFAULT_SOUND_PREFS.clicks,
    tape: typeof prefs.tape === 'string' && prefs.tape ? prefs.tape : DEFAULT_SOUND_PREFS.tape,
  };
}

/**
 * The engine reads the bus, and nothing else does. Exported so the control can wire one listener and
 * the tests can drive the same function without React.
 */
export function handleSoundMessage(engine: SoundEngine, message: SoundMessage): void {
  if (message.kind === 'ui') {
    engine.playUi(message.role, message.pan ?? 0);
    return;
  }
  if (message.kind === 'preview') {
    // The panel's preview buttons: the same tick a real control would make, at the centre of the
    // room, and even with interface clicks switched off — asking to hear one is not chatter.
    engine.playUi(message.role, 0, true);
    return;
  }
  if (message.kind === 'scene') {
    engine.setScene(message.scene);
    return;
  }
  // A run lowers the bed; anything that ends one raises it again. `verify` is included on purpose:
  // a pass may be reported without its run-start in a future surface, and a duck that nothing lifts
  // is a bed that never comes back.
  engine.setDucked(message.cue === 'run-start');
  engine.cue(message.cue);
  if (message.cue === 'run-fail') engine.gust();
}
