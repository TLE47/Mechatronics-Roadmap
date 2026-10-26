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
  CLICK_PEAK,
  CLICK_SPECS,
  CUE_GAP_MS,
  CUE_TONES,
  DUCK_GAIN,
  FOCUS_GAIN,
  GUST_GAIN,
  MAX_VOICES,
  SoundEngine,
  UI_GAP_MS,
  clickLength,
  handleSoundMessage,
} from '../app/src/audio/engine.ts';
import { ROOM_LAYERS, ROOM_TRIM, RUN_IN_FOCUS, loudestLayer, roomMix } from '../app/src/audio/ambience.ts';
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
  assert.deepEqual(parsed, { on: true, music: 1, room: DEFAULT_SOUND_PREFS.room, sfx: 0 });
  // A record written before the Room fader existed keeps its choice and gains the default.
  const old = parseSoundPrefs('{"on":true,"music":0.3,"sfx":0.5}');
  assert.equal(old.room, DEFAULT_SOUND_PREFS.room, 'an old record must not lose sound over a new fader');
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
  });
  assert.deepEqual(readSoundPrefs(), written, 'the store must hold what the control returned');
  assert.equal(seen.length, 1);
  assert.notEqual(seen[0], written, 'a listener must receive a copy, not the live record');
  const after = writeSoundPrefs({ sfx: 0.1 });
  assert.equal(seen.length, 1, 'an unsubscribed listener must not be called again');
  assert.deepEqual(after, { on: true, music: 0.4, room: DEFAULT_SOUND_PREFS.room, sfx: 0.1 });
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
