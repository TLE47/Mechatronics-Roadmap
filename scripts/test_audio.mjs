/**
 * The sound engine without a browser (`scripts/test_audio.mjs`, `npm run test:audio`).
 *
 * The promises this suite holds, each of which is a rule a learner can feel:
 *
 *  * sound is off until asked for, and the first visit is silent — no context at load;
 *  * a remembered "on" is armed, and only a gesture starts it (nothing autoplays);
 *  * the choice survives a reload, and a blocked store costs the memory, never the toggle;
 *  * a run ducks the bed and its verdict lifts it — and a watched run neither ducks nor clicks;
 *  * focus is quieter, and its factor composes with the duck instead of fighting it;
 *  * every cue is short and quiet, and a burst of runs cannot pile them up.
 *
 * Web Audio is replaced by a recording double: the assertions are about the graph the engine builds
 * and the automation it schedules, which is exactly the part that could be wrong in a browser.
 */

import assert from 'node:assert/strict';
import {
  CUE_GAP_MS,
  CUE_TONES,
  DUCK_GAIN,
  FOCUS_GAIN,
  SoundEngine,
  handleSoundMessage,
} from '../app/src/audio/engine.ts';
import {
  DEFAULT_SOUND_PREFS,
  SOUND_STORAGE_KEY,
  cachedSoundPrefs,
  clampLevel,
  parseSoundPrefs,
  readSoundPrefs,
  subscribeSoundPrefs,
  writeSoundPrefs,
} from '../app/src/audio/prefs.ts';
import {
  SOUND_EVENT,
  playCue,
  readSoundMessage,
  setSoundScene,
} from '../app/src/audio/facade.ts';

let failures = 0;
let passes = 0;
async function check(name, fn) {
  try {
    await fn();
    passes += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message.split('\n').join('\n       ')}`);
  }
}

// ---- the recording double -------------------------------------------------------------------

class FakeParam {
  constructor(value) {
    this.value = value;
    this.calls = [];
  }
  setValueAtTime(value, at) {
    this.calls.push({ kind: 'set', value, at });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value, at) {
    this.calls.push({ kind: 'ramp', value, at });
    this.value = value;
    return this;
  }
  cancelScheduledValues(at) {
    this.calls.push({ kind: 'cancel', at });
    return this;
  }
}

class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.gain = new FakeParam(1);
    this.frequency = new FakeParam(440);
    this.detune = new FakeParam(0);
    this.Q = new FakeParam(1);
    this.type = 'sine';
    this.targets = [];
    this.startedAt = null;
    this.stoppedAt = null;
  }
  connect(target) {
    this.targets.push(target);
    return target;
  }
  disconnect() {}
  start(at = 0) {
    this.startedAt = at;
  }
  stop(at = 0) {
    this.stoppedAt = at;
  }
}

class FakeContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = new FakeNode('destination');
    this.nodes = [];
    this.resumes = 0;
    this.suspends = 0;
  }
  createGain() {
    return this.track(new FakeNode('gain'));
  }
  createOscillator() {
    return this.track(new FakeNode('oscillator'));
  }
  createBiquadFilter() {
    return this.track(new FakeNode('filter'));
  }
  track(node) {
    this.nodes.push(node);
    return node;
  }
  async resume() {
    this.state = 'running';
    this.resumes += 1;
  }
  async suspend() {
    this.state = 'suspended';
    this.suspends += 1;
  }
}

function engineFor(startAt = 0) {
  const context = new FakeContext();
  let clock = startAt;
  const engine = new SoundEngine({
    createContext: () => context,
    now: () => clock,
  });
  return {
    context,
    engine,
    advance: (ms) => {
      clock += ms;
    },
    /** The gain node the engine's master ramps to: the only one wired straight to `destination`. */
    master: () => context.nodes.find((node) => node.targets.includes(context.destination)),
  };
}

/** How many oscillators a call created, i.e. how many tones were scheduled. */
function tonesAfter(context, fn) {
  const before = context.nodes.filter((node) => node.kind === 'oscillator').length;
  fn();
  return context.nodes.filter((node) => node.kind === 'oscillator').length - before;
}

// ---- a localStorage double, so the store's rules are testable ------------------------------

class FakeStorage {
  constructor() {
    this.map = new Map();
    this.failWrites = false;
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    if (this.failWrites) throw new Error('quota');
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new FakeStorage();
}
const storage = globalThis.localStorage;

console.log('MechaLab sound');

await check('a fresh browser is silent, with sensible levels', () => {
  storage.removeItem(SOUND_STORAGE_KEY);
  assert.deepEqual(readSoundPrefs(), DEFAULT_SOUND_PREFS);
  assert.equal(DEFAULT_SOUND_PREFS.on, false, 'the default must be off');
});

await check('a corrupt or hostile record falls back to the default', () => {
  for (const raw of ['not json', '[]', 'null', '{"on":"yes","music":"loud"}']) {
    const prefs = parseSoundPrefs(raw);
    assert.equal(prefs.on, false, `"${raw}" must not enable sound`);
    assert.ok(Number.isFinite(prefs.music) && prefs.music >= 0 && prefs.music <= 1);
  }
});

await check('levels are clamped to 0..1 and rounded to what the slider can show', () => {
  assert.equal(clampLevel(5, 0.5), 1);
  assert.equal(clampLevel(-2, 0.5), 0);
  assert.equal(clampLevel('0.237', 0.5), 0.24);
  assert.equal(clampLevel(Number.NaN, 0.5), 0.5);
  const parsed = parseSoundPrefs('{"on":true,"music":9,"sfx":-1}');
  assert.deepEqual(parsed, { on: true, music: 1, sfx: 0 });
});

await check('the choice round-trips and every control hears it', () => {
  storage.removeItem(SOUND_STORAGE_KEY);
  const seen = [];
  const unsubscribe = subscribeSoundPrefs((prefs) => seen.push(prefs));
  const written = writeSoundPrefs({ on: true, music: 0.4 });
  unsubscribe();
  assert.deepEqual(written, { on: true, music: 0.4, sfx: DEFAULT_SOUND_PREFS.sfx });
  assert.deepEqual(readSoundPrefs(), written, 'the store must hold what the control returned');
  assert.equal(seen.length, 1);
  assert.notEqual(seen[0], written, 'a listener must receive a copy, not the live record');
  const after = writeSoundPrefs({ sfx: 0.1 });
  assert.equal(seen.length, 1, 'an unsubscribed listener must not be called again');
  assert.deepEqual(after, { on: true, music: 0.4, sfx: 0.1 });
  assert.deepEqual(cachedSoundPrefs(), after);
});

await check('a blocked store costs the memory, never the toggle', () => {
  storage.removeItem(SOUND_STORAGE_KEY);
  storage.failWrites = true;
  try {
    const written = writeSoundPrefs({ on: true });
    assert.equal(written.on, true, 'the toggle must still report the value the learner chose');
    assert.equal(cachedSoundPrefs().on, true, 'the choice must survive this visit');
  } finally {
    storage.failWrites = false;
  }
  writeSoundPrefs({ on: false });
});

// ---- the engine ----------------------------------------------------------------------------

await check('constructing an engine creates no AudioContext', () => {
  let calls = 0;
  const engine = new SoundEngine({
    createContext: () => {
      calls += 1;
      return new FakeContext();
    },
    now: () => 0,
  });
  assert.equal(calls, 0, 'a context at import time is an autoplay attempt');
  assert.equal(engine.running, false);
  assert.equal(engine.debug().muted, true);
});

await check('enable builds the graph once, resumes, and plays the boot cue', async () => {
  const { context, engine } = engineFor();
  await engine.enable({ on: true, music: 0.6, sfx: 0.8 });
  assert.equal(context.resumes, 1);
  assert.equal(context.state, 'running');
  assert.equal(engine.running, true);
  const oscillators = context.nodes.filter((node) => node.kind === 'oscillator');
  assert.ok(oscillators.length >= 4, 'two beds of two partials and the boot tone must exist');
  assert.deepEqual(engine.debug().cues, ['boot']);
  await engine.enable({ on: true, music: 0.6, sfx: 0.8 });
  assert.equal(context.resumes, 2, 'enabling twice must resume, not rebuild');
  assert.equal(context.nodes.filter((node) => node.kind === 'oscillator').length, oscillators.length);
});

await check('the master follows the toggle, and disabling suspends the context', async () => {
  const { context, engine } = engineFor();
  await engine.enable({ on: true, music: 0.6, sfx: 0.8 });
  const master = context.nodes.find((node) => node.targets.includes(context.destination));
  assert.ok(master, 'the master gain must reach the destination');
  assert.equal(master.gain.value, 1);
  engine.apply({ on: false, music: 0.6, sfx: 0.8 });
  assert.equal(master.gain.value, 0);
  await engine.disable();
  assert.equal(context.suspends, 1);
  assert.equal(engine.debug().muted, true);
});

await check('a cue is silent while muted', async () => {
  const { context, engine } = engineFor();
  await engine.enable({ on: true, music: 0.6, sfx: 0.8 });
  engine.apply({ on: false, music: 0.6, sfx: 0.8 });
  const scheduled = tonesAfter(context, () => engine.cue('run-pass'));
  assert.equal(scheduled, 0, 'a muted engine must schedule nothing');
});

await check('every cue is short, quiet, and defined', () => {
  assert.deepEqual(Object.keys(CUE_TONES).sort(), ['boot', 'run-fail', 'run-pass', 'run-start', 'verify']);
  for (const [name, tones] of Object.entries(CUE_TONES)) {
    assert.ok(tones.length > 0, `${name} must have at least one tone`);
    const end = Math.max(...tones.map((tone) => (tone.delay ?? 0) + tone.duration));
    assert.ok(end <= 1.2, `${name} lasts ${end}s; the plan caps a stinger at 1.2s`);
    for (const tone of tones) {
      assert.ok(tone.peak <= 0.2, `${name} peaks at ${tone.peak}; a cue is not an anthem`);
    }
  }
});

await check('cues are rate-limited, so a watch loop cannot machine-gun them', async () => {
  const { context, engine, advance } = engineFor(1000);
  await engine.enable({ on: true, music: 0.6, sfx: 0.8 });
  advance(CUE_GAP_MS + 1);
  const first = tonesAfter(context, () => engine.cue('run-start'));
  assert.ok(first > 0);
  const second = tonesAfter(context, () => engine.cue('run-start'));
  assert.equal(second, 0, `a second cue within ${CUE_GAP_MS}ms must be dropped`);
  advance(CUE_GAP_MS + 1);
  const third = tonesAfter(context, () => engine.cue('run-start'));
  assert.ok(third > 0, 'a cue after the gap must play');
});

await check('the phrase matches the moment: pass pips, a fail tick, a verify stinger', async () => {
  const { context, engine, advance } = engineFor(1000);
  await engine.enable({ on: true, music: 0.6, sfx: 0.8 });
  const pass = tonesAfter(context, () => engine.cue('run-pass'));
  advance(200);
  const fail = tonesAfter(context, () => engine.cue('run-fail'));
  advance(200);
  const verify = tonesAfter(context, () => engine.cue('verify'));
  assert.equal(pass, CUE_TONES['run-pass'].length);
  assert.equal(fail, 1);
  assert.equal(verify, CUE_TONES.verify.length);
  assert.ok(verify > fail, 'a verification is the longer phrase');
});

await check('a run ducks the bed and its verdict lifts it', async () => {
  const { context, engine } = engineFor();
  await engine.enable({ on: true, music: 0.6, sfx: 0.8 });
  const gains = context.nodes.filter((node) => node.kind === 'gain');
  const master = gains.find((node) => node.targets.includes(context.destination));
  const duck = gains.find((node) => node.targets.includes(master));
  engine.setDucked(true);
  assert.equal(engine.isDucked, true);
  assert.equal(duck.gain.value, DUCK_GAIN);
  engine.setDucked(false);
  assert.equal(engine.isDucked, false);
  assert.equal(duck.gain.value, 1);
});

await check('focus is quieter, and its factor composes with the duck', async () => {
  const { context, engine } = engineFor();
  await engine.enable({ on: true, music: 0.5, sfx: 0.8 });
  const gains = context.nodes.filter((node) => node.kind === 'gain');
  const master = gains.find((node) => node.targets.includes(context.destination));
  const duck = gains.find((node) => node.targets.includes(master));
  const music = gains.find((node) => node.targets.includes(duck));
  engine.setScene('focus');
  assert.equal(engine.debug().scene, 'focus');
  assert.equal(music.gain.value, 0.5 * FOCUS_GAIN * 0.9);
  engine.setDucked(true);
  assert.equal(music.gain.value, 0.5 * FOCUS_GAIN * 0.9, 'the duck is its own node, not the music bus');
  engine.setScene('home');
  engine.setDucked(false);
  assert.equal(music.gain.value, 0.5 * 0.9);
});

await check('the bus translates facts into the engine: duck on start, lift on the verdict', async () => {
  const { context, engine } = engineFor();
  await engine.enable({ on: true, music: 0.6, sfx: 0.8 });
  handleSoundMessage(engine, { kind: 'cue', cue: 'run-start' });
  assert.equal(engine.isDucked, true);
  handleSoundMessage(engine, { kind: 'cue', cue: 'run-pass' });
  assert.equal(engine.isDucked, false);
  const cues = engine.debug().cues;
  assert.ok(cues.includes('run-start') && cues.includes('run-pass'));
  handleSoundMessage(engine, { kind: 'cue', cue: 'run-start' });
  assert.equal(engine.isDucked, true);
  handleSoundMessage(engine, { kind: 'cue', cue: 'verify' });
  assert.equal(engine.isDucked, false, 'a verify must never leave the bed ducked');
  handleSoundMessage(engine, { kind: 'scene', scene: 'focus' });
  assert.equal(engine.debug().scene, 'focus');
  assert.ok(context.nodes.length > 0);
});

await check('the debug snapshot is a copy', async () => {
  const { engine } = engineFor();
  await engine.enable({ on: true, music: 0.6, sfx: 0.8 });
  const snapshot = engine.debug();
  snapshot.cues.push('run-fail');
  assert.deepEqual(engine.debug().cues, ['boot'], 'a test must not be able to edit the engine');
});

// ---- the bus -------------------------------------------------------------------------------

await check('the bus dispatches a cue, and reads only its own messages back', () => {
  const target = new EventTarget();
  const previousWindow = globalThis.window;
  globalThis.window = target;
  try {
    const seen = [];
    target.addEventListener(SOUND_EVENT, (event) => seen.push(event.detail));
    playCue('verify');
    setSoundScene('focus');
    assert.deepEqual(seen, [
      { kind: 'cue', cue: 'verify' },
      { kind: 'scene', scene: 'focus' },
    ]);
    const bogus = new CustomEvent(SOUND_EVENT, { detail: { kind: 'cue' } });
    assert.equal(readSoundMessage(bogus), null);
    const message = new CustomEvent(SOUND_EVENT, { detail: { kind: 'cue', cue: 'run-fail' } });
    assert.deepEqual(readSoundMessage(message), { kind: 'cue', cue: 'run-fail' });
  } finally {
    globalThis.window = previousWindow;
  }
});

if (failures) {
  console.error(`[FAIL] audio: ${passes} passed, ${failures} failed`);
  process.exit(1);
}
console.log(`[PASS] audio: ${passes} checks`);
