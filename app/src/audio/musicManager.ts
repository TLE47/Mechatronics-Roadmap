/**
 * The music manager (`app/src/audio/musicManager.ts`).
 *
 * One owner for the sound runtime, and the API the header's widget speaks: `togglePlay`,
 * `setGenre`, `setVolume`. It sits between the store (`prefs.ts`) and the synthesiser
 * (`engine.ts`) so that neither the widget nor the panel has to know how either works:
 *
 *  - **The store is the state.** Every method here writes `SoundPrefs`; the subscription below is the
 *    one place those writes reach the engine. Before this module, `SoundControl` applied changes it
 *    made itself and ignored writes that arrived from anywhere else — the panel and a test could
 *    disagree with the mix. A single apply path means one writer, one mix.
 *  - **The engine is lazy and singular.** `engine.ts` is a dynamic import, instantiated once, and
 *    never imported by the widget's chunk. A learner who keeps sound off downloads the control and
 *    this module, not the synthesiser.
 *  - **The gesture rule lives here.** A remembered "on" is armed, not playing: `enable()` runs from the
 *    first pointer or key press, or from the press that turns sound on. Nothing autoplays.
 *
 * `configureMusicManager` injects a loader for the Node suite; the browser never calls it.
 */

import {
  cachedSoundPrefs,
  writeSoundPrefs,
  subscribeSoundPrefs,
  DEFAULT_SOUND_PREFS,
  RANDOMIZE_INTERVAL_MINUTES,
  type SoundPrefs,
} from './prefs.ts';
import {
  categoryOf,
  defaultTapeFor,
  isMusicCategory,
  randomTapeId,
  type MusicCategory,
} from './musicCatalogue.ts';
import {
  LESSON_PASS_EVENT,
  SOUND_EVENT,
  previewUi,
  readSoundMessage,
  type UiRole,
} from './facade.ts';
import { FOCUS_EVENT, readFocus } from '../focusMode.ts';

type EngineModule = typeof import('./engine.ts');
type Engine = InstanceType<EngineModule['SoundEngine']>;

let loadModule: () => Promise<EngineModule> = () => import('./engine.ts');
let loading: Promise<Engine> | null = null;
let engine: Engine | null = null;
let handle: EngineModule['handleSoundMessage'] | null = null;
let installed = false;
let armed = false;
let disarm: (() => void) | null = null;
const armedListeners = new Set<(armed: boolean) => void>();
let randomizeTimer: number | null = null;
/** The mode + tape the pending timer belongs to, so a volume move does not postpone it. */
let randomizeTimerKey = '';

function setArmed(on: boolean): void {
  if (armed === on) return;
  armed = on;
  for (const listener of [...armedListeners]) listener(on);
}

/** The panel prints whether a remembered "on" is still waiting for its first gesture. */
export function subscribeArmed(listener: (armed: boolean) => void): () => void {
  armedListeners.add(listener);
  listener(armed);
  return () => {
    armedListeners.delete(listener);
  };
}

/** Tests inject a fake module; the app never calls this. */
export function configureMusicManager(load: () => Promise<EngineModule>): void {
  loadModule = load;
}

/**
 * Load the synthesiser without constructing a second one.
 *
 * The first caller starts the import, the rest share it, and the instance's mode is set from the
 * store as soon as it exists — so a change written while the chunk was in flight is not lost.
 */
function loadEngine(): Promise<Engine> {
  if (!loading) {
    loading = loadModule().then((module) => {
      const instance = new module.SoundEngine();
      engine = instance;
      handle = module.handleSoundMessage;
      instance.apply(cachedSoundPrefs());
      // A read-only snapshot for the browser suites: no secret, no setter.
      if (typeof window !== 'undefined') {
        (window as unknown as { __mechalabAudio?: () => unknown }).__mechalabAudio = () =>
          instance.debug();
      }
      return instance;
    });
  }
  return loading;
}

/** Every write goes to the engine through `install`'s subscription; nothing here applies directly. */
function apply(next: SoundPrefs): void {
  engine?.apply(next);
}

/** Pick a tape the learner is not already hearing, but only while sound is on. */
function randomizeNow(): string | null {
  const prefs = cachedSoundPrefs();
  if (!prefs.on || prefs.randomize === 'off') return null;
  const tape = randomTapeId(prefs.tape, Math.random, prefs.excluded);
  if (tape === prefs.tape) return null;
  change({ tape });
  return tape;
}

function clearRandomizeTimer(): void {
  if (randomizeTimer === null) return;
  window.clearTimeout(randomizeTimer);
  randomizeTimer = null;
}

/**
 * Keep one timer for timed randomisation, and none for the other modes.
 *
 * The key is the tape and the mode, not the whole preference: moving the volume slider must not
 * restart a twenty-minute wait. A timer that fires writes a new tape through the store, which
 * re-enters here and starts the next interval from that choice.
 */
function scheduleRandomize(prefs: SoundPrefs): void {
  const key = prefs.on && prefs.randomize === 'time' ? `time:${prefs.tape}` : '';
  if (key === randomizeTimerKey) return;
  clearRandomizeTimer();
  randomizeTimerKey = key;
  if (!key || typeof window === 'undefined' || typeof window.setTimeout !== 'function') return;
  randomizeTimer = window.setTimeout(() => {
    randomizeTimer = null;
    randomizeTimerKey = '';
    randomizeNow();
    scheduleRandomize(cachedSoundPrefs());
  }, RANDOMIZE_INTERVAL_MINUTES * 60 * 1000);
}

/** Start playback inside (or as soon after) a gesture, and record that the arm has fired. */
function start(): void {
  void loadEngine().then(async (instance) => {
    instance.setScene(readFocus() ? 'focus' : 'home');
    await instance.enable(cachedSoundPrefs());
    setArmed(true);
    // The arm has fired: a listener left behind would enable a second time on the next gesture.
    disarm?.();
    disarm = null;
  });
}

function syncArming(prefs: SoundPrefs): void {
  if (!prefs.on || armed) {
    disarm?.();
    disarm = null;
    return;
  }
  if (disarm) return;
  // `once` on both, because the first gesture is the permission; the other listener is removed by
  // hand when either fires, so a key press does not leave the pointer listener behind.
  const release = () => {
    disarm?.();
    disarm = null;
  };
  const kick = () => {
    release();
    start();
  };
  window.addEventListener('pointerdown', kick, { once: true, passive: true });
  window.addEventListener('keydown', kick, { once: true });
  disarm = () => {
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
}

/**
 * Wire the singleton runtime once.
 *
 * Both the header's control and focus mode's pill mount a control; the listeners and the idle warm-up
 * belong to the module, not to whichever instance painted first. The store subscription is also the
 * one place a change becomes a mix — including a change that came from the panel or a test.
 */
export function install(): void {
  if (installed) return;
  installed = true;
  subscribeSoundPrefs((next) => {
    apply(next);
    syncArming(next);
    scheduleRandomize(next);
  });
  if (typeof window === 'undefined') return;

  window.addEventListener(SOUND_EVENT, (event) => {
    const message = readSoundMessage(event);
    if (!message) return;
    // Inside the event, synchronously, once the chunk is here: the press that turns the clicks off is
    // still heard (see `facade.ts`).
    if (engine && handle) {
      handle(engine, message);
      return;
    }
    void loadEngine().then((instance) => {
      if (handle) handle(instance, message);
    });
  });

  window.addEventListener(FOCUS_EVENT, (event) => {
    const on = Boolean((event as CustomEvent<{ on?: boolean }>).detail?.on);
    void loadEngine().then((instance) => instance.setScene(on ? 'focus' : 'home'));
  });

  // The runner reports the pass; this owner decides whether it means a new tape.
  window.addEventListener(LESSON_PASS_EVENT, () => {
    randomizeAfterLesson();
  });

  // Warm the chunk after first paint, never before it: a learner who keeps sound off downloads no
  // audio code beyond the control.
  const idle = (
    window as unknown as { requestIdleCallback?: (cb: () => void, opts: { timeout: number }) => number }
  ).requestIdleCallback;
  if (idle) idle(() => void loadEngine(), { timeout: 2000 });
  else window.setTimeout(() => void loadEngine(), 800);

  // A remembered "on" from a previous visit is armed, not playing.
  syncArming(cachedSoundPrefs());
  scheduleRandomize(cachedSoundPrefs());
}

/** One press: off in one go, or on and starting from the press itself. */
export function togglePlay(): SoundPrefs {
  const next = change({ on: !cachedSoundPrefs().on });
  if (next.on) start();
  else {
    setArmed(false);
    disarm?.();
    disarm = null;
  }
  return next;
}

/**
 * Choose a genre door.
 *
 * The door's own `defaultTape` is what plays, not whichever tape happened to be first: selecting
 * Synthwave must be a retrowave loop the first time, and selecting it again must not restart a tape
 * the learner already picked inside the door.
 */
export function setGenre(genre: MusicCategory): string {
  if (!isMusicCategory(genre)) return cachedSoundPrefs().tape;
  const current = cachedSoundPrefs().tape;
  const inDoor = categoryOf(current) === genre;
  const tape = inDoor ? current : defaultTapeFor(genre).id;
  if (tape !== current) change({ tape });
  return tape;
}

/** The music fader, 0..1, clamped by the store. Returns what is actually rendered. */
export function setVolume(volume: number): number {
  return change({ music: volume }).music;
}

/**
 * A newly verified lesson: change the tape only when the learner asked for lesson mode.
 *
 * The runner calls this once per lesson; `randomizeNow` still honours the master switch, so a
 * remembered "on" that has not had its first gesture does not quietly rewrite the choice.
 */
export function randomizeAfterLesson(): string | null {
  if (cachedSoundPrefs().randomize !== 'lesson') return null;
  return randomizeNow();
}

/** A preview is a request to hear one tick, so it plays even with the interface clicks switched off. */
export function preview(role: UiRole): void {
  if (!cachedSoundPrefs().on) return;
  void loadEngine();
  previewUi(role);
}

/** Reset levels and switches, but never switch the learner's sound off behind their back. */
export function reset(): SoundPrefs {
  const current = cachedSoundPrefs();
  return change({ ...DEFAULT_SOUND_PREFS, on: current.on, tape: current.tape });
}

/** The one writer the UI calls for a patch; the subscription above applies it to the mix. */
export function change(patch: Partial<SoundPrefs>): SoundPrefs {
  return writeSoundPrefs(patch);
}
