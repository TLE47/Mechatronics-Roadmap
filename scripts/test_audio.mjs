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
import fs from 'node:fs';
import {
  CLICK_PEAK,
  BED_TRIM,
  CLICK_SPECS,
  CUE_GAP_MS,
  CUE_TONES,
  DUCK_GAIN,
  FOCUS_GAIN,
  GUST_GAIN,
  MAX_TAPE_NODES,
  MAX_VOICES,
  SoundEngine,
  UI_GAP_MS,
  clickLength,
  handleSoundMessage,
} from '../app/src/audio/engine.ts';
import { ROOM_LAYERS, ROOM_TRIM, RUN_IN_FOCUS, loudestLayer, roomMix } from '../app/src/audio/ambience.ts';
import {
  DRONE_ID,
  MUSIC_CATEGORIES,
  MUSIC_TAPES,
  categoryOf,
  isTapeId,
  tapesIn,
  tapeById,
  tapeCredit,
} from '../app/src/audio/musicCatalogue.ts';
import { panFromX, roleForControl } from '../app/src/audio/clickMap.ts';
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
  UI_PAN_LIMIT,
  UI_ROLES,
  playCue,
  playUi,
  previewUi,
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
    this.pan = new FakeParam(0);
    // A compressor's five parameters, so the limiter can be asserted rather than assumed.
    this.threshold = new FakeParam(0);
    this.knee = new FakeParam(0);
    this.ratio = new FakeParam(1);
    this.attack = new FakeParam(0);
    this.release = new FakeParam(0);
    this.type = 'sine';
    this.buffer = null;
    this.loop = false;
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
  createBufferSource() {
    return this.track(new FakeNode('buffer-source'));
  }
  createStereoPanner() {
    return this.track(new FakeNode('panner'));
  }
  createDynamicsCompressor() {
    return this.track(new FakeNode('compressor'));
  }
  createBuffer(channels, length, sampleRate) {
    const data = [new Float32Array(length)];
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: (channel = 0) => data[channel] ?? data[0],
    };
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

function engineFor(startAt = 0, options = {}) {
  const context = new FakeContext();
  let clock = startAt;
  const engine = new SoundEngine({
    createContext: () => context,
    now: () => clock,
    // The recorded loop is injected, never fetched: these checks are about the graph, and a Node
    // test must never reach the network. `null` is the file that could not be had.
    loadRain: options.loadRain ?? (async () => null),
    // The tapes are injected too: `null` is the fallback the drone already covers.
    loadTape: options.loadTape ?? (async () => null),
  });
  return {
    context,
    engine,
    advance: (ms) => {
      clock += ms;
    },
  };
}

/**
 * The mixer's nodes, found by how they are wired rather than by the order they were built.
 *
 * `master → limiter → destination` is the whole reason the old `master = gain into destination`
 * lookup is gone: the last thing before the speakers is the limiter, and everything else hangs off
 * the master.
 */
function graph(context) {
  const gains = context.nodes.filter((node) => node.kind === 'gain');
  const limiter = context.nodes.find((node) => node.kind === 'compressor');
  const master = gains.find((node) => limiter && node.targets.includes(limiter));
  const duck = gains.find((node) => master && node.targets.includes(master));
  const underDuck = gains.filter((node) => duck && node.targets.includes(duck));
  const sfx = gains.find((node) => master && node !== duck && node.targets.includes(master));
  return { limiter, master, duck, music: underDuck[0], room: underDuck[1], sfx, gains };
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
  assert.deepEqual(parsed, {
    on: true,
    music: 1,
    room: DEFAULT_SOUND_PREFS.room,
    sfx: 0,
    clicks: true,
    tape: DEFAULT_SOUND_PREFS.tape,
  });
  // A record written before the Room fader existed keeps its choice and gains the default.
  const old = parseSoundPrefs('{"on":true,"music":0.3,"sfx":0.5}');
  assert.equal(old.room, DEFAULT_SOUND_PREFS.room, 'an old record must not lose sound over a new fader');
  assert.equal(old.clicks, true, 'an old record keeps the interface clicks it always had');
  assert.equal(old.tape, 'lab-night', 'and gets today\'s first tape');
  // The pre-tape field migrates both ways it could have been written: the drone stays the drone, and
  // "lo-fi" was the recording this catalogue still opens with.
  assert.equal(parseSoundPrefs('{"beds":"synth"}').tape, 'drone');
  assert.equal(parseSoundPrefs('{"beds":"lofi"}').tape, 'lab-night');
  assert.equal(parseSoundPrefs('{"tape":"winter-blues"}').tape, 'winter-blues');
  // A hostile or stale id falls back rather than reaching the engine as an unknown string.
  assert.equal(parseSoundPrefs('{"beds":"kazoo"}').tape, 'lab-night');
  assert.equal(parseSoundPrefs('{"tape":"kazoo"}').tape, 'lab-night');
  assert.equal(parseSoundPrefs('{"tape":"removed-in-a-later-release"}').tape, 'lab-night');
  assert.equal(parseSoundPrefs('{"clicks":"no"}').clicks, true, 'only the literal false switches clicks off');
  assert.equal(parseSoundPrefs('{"clicks":false}').clicks, false);
});

await check('the choice round-trips and every control hears it', () => {
  storage.removeItem(SOUND_STORAGE_KEY);
  const seen = [];
  const unsubscribe = subscribeSoundPrefs((prefs) => seen.push(prefs));
  const written = writeSoundPrefs({ on: true, music: 0.4 });
  unsubscribe();
  assert.deepEqual(written, {
    on: true,
    music: 0.4,
    room: DEFAULT_SOUND_PREFS.room,
    sfx: DEFAULT_SOUND_PREFS.sfx,
    clicks: true,
    tape: DEFAULT_SOUND_PREFS.tape,
  });
  assert.deepEqual(readSoundPrefs(), written, 'the store must hold what the control returned');
  assert.equal(seen.length, 1);
  assert.notEqual(seen[0], written, 'a listener must receive a copy, not the live record');
  const after = writeSoundPrefs({ sfx: 0.1 });
  assert.equal(seen.length, 1, 'an unsubscribed listener must not be called again');
  assert.deepEqual(after, {
    on: true,
    music: 0.4,
    room: DEFAULT_SOUND_PREFS.room,
    sfx: 0.1,
    clicks: true,
    tape: DEFAULT_SOUND_PREFS.tape,
  });
  // The switch and the tape are part of the choice, and are never clamped or coerced by a level patch.
  const switched = writeSoundPrefs({ clicks: false, tape: 'neon-stage', music: 0.2 });
  assert.equal(switched.clicks, false);
  assert.equal(switched.tape, 'neon-stage');
  assert.equal(switched.music, 0.2);
  assert.equal(writeSoundPrefs({ tape: 'not-a-tape' }).tape, 'neon-stage', 'an unknown id must not replace a real one');
  // Back to the record the next assertion is about, so the switches are the only thing that moved.
  writeSoundPrefs({ clicks: true, tape: DEFAULT_SOUND_PREFS.tape, music: 0.4 });
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
  const { master } = graph(context);
  assert.ok(master, 'the master gain must reach the limiter');
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
  const { duck } = graph(context);
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
  const { music } = graph(context);
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

// ---- the interface's own sound ---------------------------------------------------------------

await check('seven kinds of control, one sound each, all of them furniture', () => {
  assert.deepEqual([...UI_ROLES].sort(), [
    'chip',
    'close',
    'nav',
    'primary',
    'row',
    'slider',
    'toggle',
  ]);
  const peaks = [];
  for (const role of UI_ROLES) {
    const spec = CLICK_SPECS[role];
    assert.ok(spec, `${role} must have a spec`);
    assert.ok(spec.tones.length > 0, `${role} needs a body`);
    assert.ok(spec.noise, `${role} needs an edge, or it is a beep`);
    assert.ok(clickLength(spec) <= 0.12, `${role} lasts ${clickLength(spec)}s; a click is not a phrase`);
    for (const tone of spec.tones) {
      peaks.push(tone.peak);
      assert.ok(tone.peak <= CLICK_PEAK, `${role} peaks at ${tone.peak}, over the ${CLICK_PEAK} ceiling`);
      assert.ok(tone.freq >= 100 && tone.freq <= 3000, `${role} sits outside the interface's range`);
    }
  }
  const cuePeaks = Object.values(CUE_TONES).flatMap((tones) => tones.map((tone) => tone.peak));
  assert.ok(
    Math.max(...peaks) < Math.min(...cuePeaks.filter((peak) => peak >= 0.1)),
    'no click may be as loud as a verdict'
  );
  // No two controls share a shape: the point of the vocabulary is that it is learned.
  const shapes = new Set(UI_ROLES.map((role) => JSON.stringify(CLICK_SPECS[role].tones[0])));
  assert.equal(shapes.size, UI_ROLES.length, 'each role must sound like itself');
});

await check('the map knows what a control is, and a disabled one says nothing', () => {
  assert.equal(roleForControl({ tag: 'button', role: 'tab' }), 'nav');
  assert.equal(roleForControl({ tag: 'input', inputType: 'range' }), 'slider');
  assert.equal(roleForControl({ tag: 'input', inputType: 'checkbox' }), 'toggle');
  assert.equal(roleForControl({ tag: 'input', inputType: 'text' }), null, 'typing is not a sound');
  assert.equal(roleForControl({ tag: 'a' }), 'nav');
  assert.equal(roleForControl({ tag: 'summary' }), 'row');
  assert.equal(roleForControl({ tag: 'button', ariaPressed: false }), 'toggle');
  assert.equal(roleForControl({ tag: 'button', ariaExpanded: false }), 'toggle');
  assert.equal(roleForControl({ tag: 'button', label: 'Run & Check' }), 'primary');
  assert.equal(roleForControl({ tag: 'button', label: 'Close panel' }), 'close');
  // The page's own answer beats every guess, in both directions.
  assert.equal(roleForControl({ tag: 'button', label: 'Close', sound: 'chip' }), 'chip');
  assert.equal(roleForControl({ tag: 'button', sound: 'none' }), null);
  assert.equal(roleForControl({ tag: 'button', disabled: true }), null, 'a control that did nothing is silent');
  assert.equal(roleForControl({ tag: 'button', ariaDisabled: true }), null);
  assert.equal(roleForControl({ tag: 'div' }), null);
  for (const call of [
    { tag: 'button', role: 'tab' },
    { tag: 'input', inputType: 'range' },
    { tag: 'button', label: 'Close' },
    { tag: 'summary' },
  ]) {
    assert.ok(UI_ROLES.includes(roleForControl(call)), 'the map may only ever return a known role');
  }

  assert.equal(panFromX(0, 1000), -UI_PAN_LIMIT);
  assert.equal(panFromX(1000, 1000), UI_PAN_LIMIT);
  assert.equal(panFromX(500, 1000), 0);
  assert.equal(panFromX(Number.NaN, 1000), 0);
  assert.equal(panFromX(10, 0), 0, 'a zero-width viewport must not divide by zero');
});

await check('a click is panned, and the cue and click budgets never eat each other', async () => {
  const { context, engine, advance } = engineFor(1000);
  await engine.enable({ on: true, music: 0.6, room: 0.5, sfx: 0.8 });
  advance(200);
  engine.cue('run-start');
  assert.equal(engine.isDucked, false, 'only the bus decides to duck; a bare cue is just a sound');
  // The same millisecond as the cue, and the click still sounds: the two gaps are separate clocks.
  const clicked = tonesAfter(context, () => engine.playUi('nav', 5));
  assert.equal(clicked, CLICK_SPECS.nav.tones.length);
  const panner = context.nodes.filter((node) => node.kind === 'panner').at(-1);
  assert.equal(panner.pan.value, UI_PAN_LIMIT, 'a click at the right edge leans right');
  assert.ok(panner.targets.length > 0, 'and it must reach the mix');

  advance(UI_GAP_MS + 1);
  engine.playUi('nav', -9);
  assert.equal(context.nodes.filter((node) => node.kind === 'panner').at(-1).pan.value, -UI_PAN_LIMIT);

  const rattled = tonesAfter(context, () => engine.playUi('primary', 0));
  assert.equal(rattled, 0, `a second click within ${UI_GAP_MS}ms is a rattle, not a click`);
  assert.deepEqual(engine.debug().uiCues, ['nav', 'nav']);
});

await check('a fast interface cannot pile clicks past the voice cap', async () => {
  const { engine, advance } = engineFor(1000);
  await engine.enable({ on: true, music: 0.6, room: 0.5, sfx: 0.8 });
  for (let index = 0; index < MAX_VOICES; index += 1) {
    advance(UI_GAP_MS + 1);
    engine.playUi('nav', 0);
  }
  assert.equal(engine.debug().uiCues.length, MAX_VOICES);
  advance(UI_GAP_MS + 1);
  engine.playUi('nav', 0);
  assert.equal(engine.debug().uiCues.length, MAX_VOICES, 'the next click waits rather than clipping');
  // The cap is a window over sounding voices, not a budget for the session.
  advance(600);
  engine.playUi('nav', 0);
  assert.equal(engine.debug().uiCues.length, MAX_VOICES + 1);
});

// ---- the room ---------------------------------------------------------------------------------

await check('the room mix is a table about what you are doing', () => {
  const home = roomMix('home', false);
  const focus = roomMix('focus', false);
  const run = roomMix('home', true);
  const runInFocus = roomMix('focus', true);
  assert.deepEqual([...ROOM_LAYERS], ['rain', 'floor', 'city', 'bench']);
  assert.equal(loudestLayer(home), 'rain', 'the window is the loudest thing in the room');
  assert.equal(home.bench, 0, 'the bench is silent until a run turns it on');
  assert.ok(run.bench > home.bench, 'a run is when you hear the machine');
  assert.ok(focus.rain < home.rain && focus.city === 0, 'focus looks inward');
  assert.equal(runInFocus.rain, run.rain * RUN_IN_FOCUS);
  assert.equal(runInFocus.bench, run.bench, 'focus must not mute the machine the run is about');
  for (const layer of ROOM_LAYERS) {
    assert.ok(ROOM_TRIM[layer] > 0 && ROOM_TRIM[layer] <= 0.5, `${layer} must be trimmed far under the cues`);
  }
  assert.ok(ROOM_TRIM.bench > 0, 'the bench layer is only quiet because its mix says zero');
});

await check('the Room fader reaches its own bus, and focus scales it', async () => {
  const { context, engine } = engineFor();
  await engine.enable({ on: true, music: 0.6, room: 0.5, sfx: 0.8 });
  const { room, music, sfx } = graph(context);
  assert.ok(room && music && sfx, 'three buses under the duck and the master');
  assert.notEqual(room, music, 'the room is not the bed');
  assert.equal(room.gain.value, 0.5);
  assert.equal(engine.debug().room, 0.5);
  engine.setScene('focus');
  assert.equal(room.gain.value, 0.5 * FOCUS_GAIN);
  assert.equal(music.gain.value, 0.6 * FOCUS_GAIN * 0.9, 'and the bed scales by the same factor');
  assert.equal(sfx.gain.value, 0.8, 'the effects never shrink in focus: a click is still an answer');
  engine.setScene('home');
  assert.equal(room.gain.value, 0.5);
});

await check('a limiter is the last thing before the speakers', async () => {
  const { context, engine } = engineFor();
  await engine.enable({ on: true, music: 0.6, room: 0.5, sfx: 0.8 });
  const { limiter, master } = graph(context);
  assert.ok(limiter, 'a compressor must exist');
  assert.ok(limiter.targets.includes(context.destination), 'the limiter is what the speakers hear');
  assert.ok(master.targets.includes(limiter), 'and the master feeds it');
  assert.ok(limiter.threshold.value < 0 && limiter.ratio.value > 1, 'it has to actually limit');
  const straight = context.nodes.filter(
    (node) => node.targets.includes(context.destination) && node.kind !== 'compressor'
  );
  assert.equal(straight.length, 0, 'nothing may bypass the limiter');
});

await check('the room is the recorded loop, and the synth only when the file cannot be had', async () => {
  const buffer = {
    numberOfChannels: 1,
    length: 48000,
    sampleRate: 48000,
    getChannelData: () => new Float32Array(48000),
  };
  let fetches = 0;
  const recorded = engineFor(0, {
    loadRain: async () => {
      fetches += 1;
      return buffer;
    },
  });
  await Promise.resolve();
  assert.equal(fetches, 0, 'a learner who never turns sound on never fetches a byte of audio');
  await recorded.engine.enable({ on: true, music: 0.6, room: 0.5, sfx: 0.8 });
  await recorded.engine.whenRoomReady();
  assert.equal(fetches, 1, 'the room is fetched once, after the gesture');
  assert.equal(recorded.engine.debug().rain, 'file');
  const sources = recorded.context.nodes.filter((node) => node.kind === 'buffer-source');
  const rain = sources.find((node) => node.buffer === buffer);
  assert.ok(rain, 'the decoded loop must be playing');
  assert.equal(rain.loop, true, 'rain has to loop');
  assert.ok(rain.startedAt !== null);
  assert.equal(sources.length, 2, 'the city layer and the rain, nothing else');

  const fallback = engineFor(0, { loadRain: async () => null });
  await fallback.engine.enable({ on: true, music: 0.6, room: 0.5, sfx: 0.8 });
  await fallback.engine.whenRoomReady();
  assert.equal(fallback.engine.debug().rain, 'synth', 'a missing file is a different texture, not silence');
  assert.equal(
    fallback.context.nodes.filter((node) => node.kind === 'buffer-source').length,
    2,
    'the fallback is one more looping noise source'
  );
});

await check('a failed run pulls one breath of rain into the room', async () => {
  const { context, engine } = engineFor(1000);
  await engine.enable({ on: true, music: 0.6, room: 0.5, sfx: 0.8 });
  const { gains } = graph(context);
  const gusted = () => gains.filter((node) => node.gain.calls.some((call) => call.value === GUST_GAIN));
  assert.equal(gusted().length, 0);
  handleSoundMessage(engine, { kind: 'cue', cue: 'run-fail' });
  assert.equal(gusted().length, 1, 'exactly one node — the gust — is scheduled');
  const gust = gusted()[0];
  assert.ok(
    gust.gain.calls.some((call) => call.kind === 'ramp' && call.value === 1),
    'and it decays on its own'
  );
  handleSoundMessage(engine, { kind: 'cue', cue: 'run-pass' });
  assert.equal(gusted().length, 1, 'a passing run does not swell the room');
});

await check('the bus carries a click with its position, and clamps what it is given', () => {
  const target = new EventTarget();
  const previousWindow = globalThis.window;
  globalThis.window = target;
  try {
    const seen = [];
    target.addEventListener(SOUND_EVENT, (event) => seen.push(event.detail));
    playUi('nav', 9);
    assert.deepEqual(seen, [{ kind: 'ui', role: 'nav', pan: UI_PAN_LIMIT }]);
    const message = new CustomEvent(SOUND_EVENT, { detail: { kind: 'ui', role: 'slider', pan: -4 } });
    assert.deepEqual(readSoundMessage(message), { kind: 'ui', role: 'slider', pan: -UI_PAN_LIMIT });
    const unknown = new CustomEvent(SOUND_EVENT, { detail: { kind: 'ui', role: 'kazoo', pan: 0 } });
    assert.equal(readSoundMessage(unknown), null, 'a role the engine does not know must not reach it');
  } finally {
    globalThis.window = previousWindow;
  }
});

// ---- the music ------------------------------------------------------------------------------

const MUSIC_DIR = new URL('../app/src/audio/assets/music/', import.meta.url);

await check('the catalogue names eight tapes in six categories, each with a file and a licence', () => {
  assert.equal(MUSIC_TAPES.length, 8);
  const ids = new Set();
  for (const tape of MUSIC_TAPES) {
    assert.ok(!ids.has(tape.id), `${tape.id} must be unique`);
    ids.add(tape.id);
    assert.ok(
      MUSIC_CATEGORIES.some((entry) => entry.id === tape.category),
      `${tape.id} is in a category the panel draws`
    );
    assert.ok(tape.seconds > 0 && tape.seconds <= 60, `${tape.id} must be a loop a learner can sit through`);
    assert.match(tape.page, /^https:\/\//, `${tape.id} must point at its page or its generator`);
    assert.ok(tape.title && tape.artist, `${tape.id} must be creditable`);
    if (tape.composed) {
      // Calling a synth loop a licensed song would be a lie the learner cannot check.
      assert.match(tape.licence, /this repository/i, `${tape.id} must say it was written here`);
      assert.equal(tape.artist, 'composed by this repository');
    } else {
      assert.match(tape.licence, /CC0 1\.0|public domain/i, `${tape.id} must be usable without permission`);
    }
  }
  // Every category is reachable: the panel iterates the category list, so a tape in an unlisted one
  // would be in the catalogue and unpickable.
  for (const category of MUSIC_CATEGORIES) {
    assert.ok(tapesIn(category.id).length >= 1, `${category.id} must hold a tape`);
  }
  assert.equal(new Set(MUSIC_TAPES.map((tape) => tape.category)).size, MUSIC_CATEGORIES.length);
  // The catalogue and the files are one fact, checked both ways: a missing file is a drone the learner
  // did not ask for, and an orphan file is bytes in every build with no way to hear them.
  const files = fs
    .readdirSync(MUSIC_DIR)
    .filter((name) => name.endsWith('.m4a'))
    .map((name) => name.replace(/\.m4a$/, ''))
    .sort();
  assert.deepEqual([...ids].sort(), files, 'every tape has its file and every file its tape');
  assert.equal(isTapeId(DRONE_ID), true);
  assert.equal(isTapeId('lab-night'), true);
  assert.equal(categoryOf(DRONE_ID), null);
  assert.equal(categoryOf('winter-blues'), 'jazz');
  const credit = tapeCredit(tapeById('lab-night'));
  assert.match(credit, /Snow Drift/);
  assert.match(credit, /HoliznaCC0/);
  assert.match(credit, /CC0/);
  assert.match(tapeCredit(tapeById('neon-stage')), /composed by this repository/);
});

const BED_BUFFER = {
  numberOfChannels: 1,
  length: 48000,
  sampleRate: 48000,
  getChannelData: () => new Float32Array(48000),
};

/** A preference record with one tape, so each engine test says only what it is about. */
function prefsWith(tape, extra = {}) {
  return { on: true, music: 0.6, room: 0.5, sfx: 0.8, clicks: true, tape, ...extra };
}

await check('the chosen tape replaces the drone once it decodes, and a scene change stays on it', async () => {
  const { context, engine } = engineFor(0, { loadTape: async () => BED_BUFFER });
  await engine.enable(prefsWith('winter-blues'));
  await engine.whenMusicReady();
  assert.equal(engine.debug().musicSource, 'file');
  const { music, gains } = graph(context);
  // The two drone beds are built with the graph, the tape after it; all three hang off the music bus.
  const underMusic = gains.filter((node) => node.targets.includes(music));
  assert.equal(underMusic.length, 3, 'two drone beds and the one chosen tape');
  const [droneHome, droneFocus, tape] = underMusic;
  assert.equal(droneHome.gain.value, 0, 'the drone is silent once a tape is playing');
  assert.equal(droneFocus.gain.value, 0);
  assert.equal(tape.gain.value, BED_TRIM, 'and the tape is at its trim');
  engine.setScene('focus');
  assert.equal(tape.gain.value, BED_TRIM, 'focus quiets the music through the bus, not by switching tape');
  const loops = context.nodes.filter((node) => node.kind === 'buffer-source' && node.buffer === BED_BUFFER);
  assert.equal(loops.length, 1, 'one file, one loop');
  assert.ok(loops[0].loop, 'a loop that stopped would be a minute of silence');
});

await check('a tape that cannot be had leaves the drone playing', async () => {
  const { context, engine } = engineFor();
  await engine.enable(prefsWith('winter-blues'));
  await engine.whenMusicReady();
  assert.equal(engine.debug().musicSource, 'synth');
  const { music, gains } = graph(context);
  const [droneHome] = gains.filter((node) => node.targets.includes(music));
  assert.equal(droneHome.gain.value, 1, 'the drone is what plays when the file cannot be had');
  engine.setScene('focus');
  assert.equal(droneHome.gain.value, 0);
});

await check('choosing the drone never fetches a tape, and switching back is one fetch', async () => {
  let fetches = 0;
  const { engine } = engineFor(0, {
    loadTape: async () => {
      fetches += 1;
      return BED_BUFFER;
    },
  });
  await engine.enable(prefsWith(DRONE_ID));
  await engine.whenMusicReady();
  assert.equal(fetches, 0, 'a learner who chose the drone downloads no music');
  assert.equal(engine.debug().musicSource, 'synth');
  assert.equal(engine.debug().tape, DRONE_ID);
  // Switching is when the fetch happens — not a page load earlier.
  engine.apply(prefsWith('winter-blues'));
  await engine.whenMusicReady();
  assert.equal(fetches, 1, 'choosing a tape fetches that one tape');
  assert.equal(engine.debug().musicSource, 'file');
  // And back again: the tape is retained at zero gain, so a second visit is not a second download.
  engine.apply(prefsWith(DRONE_ID));
  engine.apply(prefsWith('winter-blues'));
  await engine.whenMusicReady();
  assert.equal(fetches, 1, 'a tape already decoded is never fetched twice');
});

await check('music at zero downloads nothing until it is raised', async () => {
  let fetches = 0;
  const { engine } = engineFor(0, {
    loadTape: async () => {
      fetches += 1;
      return BED_BUFFER;
    },
  });
  await engine.enable(prefsWith('winter-blues', { music: 0 }));
  await engine.whenMusicReady();
  assert.equal(fetches, 0, 'silence is not a reason to ask the network for a file');
  engine.apply(prefsWith('winter-blues', { music: 0.4 }));
  await engine.whenMusicReady();
  assert.equal(fetches, 1, 'the first audible moment is when it loads');
  assert.equal(engine.debug().musicSource, 'file');
});

await check('the engine retains a few tapes and never more than its cap', async () => {
  const { context, engine } = engineFor(0, { loadTape: async () => BED_BUFFER });
  await engine.enable(prefsWith('lab-night'));
  await engine.whenMusicReady();
  for (const id of ['winter-blues', 'city-lights', 'neon-stage']) {
    engine.apply(prefsWith(id));
    await engine.whenMusicReady();
  }
  const loops = context.nodes.filter((node) => node.kind === 'buffer-source' && node.buffer === BED_BUFFER);
  assert.equal(loops.length, MAX_TAPE_NODES + 1, 'four tapes were started in all');
  assert.equal(loops.filter((node) => node.stoppedAt !== null).length, 1, 'the oldest gave its node up');
  assert.equal(engine.debug().musicSource, 'file');
});

await check('an abandoned tape failing late does not blank the one playing', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { engine } = engineFor(0, {
    loadTape: async (id) => (id === 'lab-night' ? gate : BED_BUFFER),
  });
  await engine.enable(prefsWith('lab-night'));
  engine.apply(prefsWith('paper-lanterns'));
  await engine.whenMusicReady();
  assert.equal(engine.debug().musicSource, 'file');
  release(null);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(engine.debug().musicSource, 'file', 'the 404 for the last choice is not a verdict on this one');
});

await check('the click switch silences the interface, and a preview still plays', async () => {
  const { context, engine, advance } = engineFor(1000);
  await engine.enable({ on: true, music: 0.6, room: 0.5, sfx: 0.8, clicks: false, beds: 'lofi' });
  assert.equal(engine.debug().clicks, false);
  const shown = tonesAfter(context, () => engine.playUi('nav', 0));
  assert.equal(shown, 0, 'with clicks off, nothing is scheduled for a press');
  const previewed = tonesAfter(context, () => engine.playUi('nav', 0, true));
  assert.equal(previewed, CLICK_SPECS.nav.tones.length, 'but asking to hear one is not a press');
  // A preview must not be swallowed by the press that opened the panel: it is exempt from the gap.
  engine.apply({ on: true, music: 0.6, room: 0.5, sfx: 0.8, clicks: true, beds: 'lofi' });
  advance(UI_GAP_MS + 1);
  assert.ok(tonesAfter(context, () => engine.playUi('primary', 0)) > 0, 'the press itself sounds');
  assert.ok(
    tonesAfter(context, () => engine.playUi('nav', 0, true)) > 0,
    'and the preview right after it still plays'
  );
  // The verdict is not the interface: a run still makes its sound with the clicks switched off.
  const cue = tonesAfter(context, () => engine.cue('run-fail'));
  assert.equal(cue, CUE_TONES['run-fail'].length);
  // And the bus carries the preview the same way it carries a press.
  const seen = [];
  const target = new EventTarget();
  const previousWindow = globalThis.window;
  globalThis.window = target;
  try {
    target.addEventListener(SOUND_EVENT, (event) => seen.push(event.detail));
    previewUi('primary');
    assert.deepEqual(seen, [{ kind: 'preview', role: 'primary' }]);
    const message = new CustomEvent(SOUND_EVENT, { detail: { kind: 'preview', role: 'primary' } });
    assert.deepEqual(readSoundMessage(message), { kind: 'preview', role: 'primary' });
  } finally {
    globalThis.window = previousWindow;
  }
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
