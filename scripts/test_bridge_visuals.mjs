#!/usr/bin/env node
/**
 * The Bridge Notes visuals' arithmetic and their manifest (`scripts/test_bridge_visuals.mjs`).
 *
 * A visual beside a lesson can be wrong in two ways a screenshot will not show: it can disagree with
 * the numbers the page itself works out, and it can be listed for a lesson that has no Bridge Notes
 * section to sit under. Both are graded here, against the lesson's own Markdown, without a browser —
 * the browser half (mounted, dragged, read) is a step in `scripts/e2e_pages_bundle.mjs`.
 *
 * The model is the whole visual's arithmetic: the SVG needle, the three readouts and this file read
 * the same functions, so a check here is a check on what a learner sees.
 *
 * Run: node --experimental-strip-types scripts/test_bridge_visuals.mjs (`npm run test:bridge-visuals`)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMMAND_TOP,
  DIAL_STEP,
  DIAL_TOP,
  NEEDLE_START,
  NEEDLE_SWEEP,
  VOLT_TOP,
  clampReading,
  formatCommand,
  formatFraction,
  formatVolts,
  fractionOf,
  landOn,
  needleAngle,
  reading,
  scaleTo,
} from '../app/src/bridges/scalingDials.ts';
import {
  CHASE_KEY,
  LANDED,
  MARKS,
  SOUND_KEY,
  clearChase,
  isLanded,
  landed,
  markAt,
  readChase,
  readMuted,
  soundAllowed,
  writeChase,
  writeMuted,
} from '../app/src/bridges/bridgeChase.ts';
import {
  COMMAND_MAX,
  COMMAND_MIN,
  clampCommand,
  clampCommandLab,
  motorCommand,
  registerByte,
} from '../app/src/bridges/clampCommand.ts';
import { formatReading, startValues } from '../app/src/bridges/bridgeLab.ts';
import {
  PART_A_OHM,
  PART_B_OHM,
  SUPPLY_V,
  dividerRight,
  dividerWrong,
  orderOfOperationsLab,
} from '../app/src/bridges/orderOfOperations.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

const root = process.cwd();

check('the two dials are the page\'s own: 0…1023 in, 0…5.0 V and 0…255 out', () => {
  assert.equal(DIAL_TOP, 1023);
  assert.equal(VOLT_TOP, 5);
  assert.equal(COMMAND_TOP, 255);
  assert.equal(DIAL_STEP, 0.5, 'half a count is the finest honest step');
});

check('the endpoints the page checks: 0 in gives 0 out, 1023 in gives the top out', () => {
  const bottom = reading(0);
  assert.equal(bottom.fraction, 0);
  assert.equal(bottom.volts, 0);
  assert.equal(bottom.command, 0);
  const top = reading(DIAL_TOP);
  assert.equal(top.fraction, 1);
  assert.equal(top.volts, VOLT_TOP);
  assert.equal(top.command, COMMAND_TOP);
});

check('the worked example: 511.5 is 0.500, and one reading is 2.50 V and 127.5', () => {
  const half = reading(511.5);
  assert.equal(half.fraction, 0.5);
  assert.equal(formatFraction(half.fraction), '0.500');
  assert.equal(formatVolts(half.volts), '2.50');
  assert.equal(formatCommand(half.command), '127.5');
});

check('equal steps stay equal — that is what linear means', () => {
  const tenth = DIAL_TOP / 10;
  for (let step = 0; step <= 10; step += 1) {
    const volts = scaleTo(tenth * step, DIAL_TOP, VOLT_TOP);
    assert.ok(
      Math.abs(volts - (VOLT_TOP * step) / 10) < 1e-12,
      `step ${step} landed on ${volts} V, not ${(VOLT_TOP * step) / 10}`
    );
  }
  // Ten equal readings span the second dial exactly: the two tops, not one shared constant.
  assert.equal(scaleTo(DIAL_TOP, DIAL_TOP, VOLT_TOP), scaleTo(DIAL_TOP, DIAL_TOP, COMMAND_TOP) / 51);
});

check('a dial has stops: a reading past either end is the end', () => {
  assert.equal(clampReading(-5), 0);
  assert.equal(clampReading(4000), DIAL_TOP);
  assert.equal(clampReading(Number.NaN), 0);
  assert.equal(reading(4000).volts, VOLT_TOP);
  assert.equal(reading(-1).volts, 0);
  assert.equal(landOn(2, VOLT_TOP), VOLT_TOP, 'a fraction above 1 is the top');
  assert.equal(landOn(-1, VOLT_TOP), 0);
});

check('the reading dial can be the 8-bit one: 255 counts of 255 is the top', () => {
  assert.equal(scaleTo(COMMAND_TOP, COMMAND_TOP, VOLT_TOP), VOLT_TOP);
  assert.equal(scaleTo(COMMAND_TOP / 2, COMMAND_TOP, VOLT_TOP), 2.5);
  assert.equal(fractionOf(128, 255), 128 / 255);
});

check('the needle sweeps the same fraction the numbers print', () => {
  assert.equal(needleAngle(0), NEEDLE_START);
  assert.equal(needleAngle(1), NEEDLE_START + NEEDLE_SWEEP);
  assert.equal(needleAngle(0.5), 0, 'the middle of travel points straight up');
  assert.ok(needleAngle(0.25) < needleAngle(0.5) && needleAngle(0.5) < needleAngle(0.75));
});

check('a top of zero or less is an error, not an infinity', () => {
  assert.throws(() => fractionOf(10, 0), /positive/);
  assert.throws(() => landOn(0.5, 0), /positive/);
  assert.throws(() => fractionOf(10, Number.NaN), /positive/);
});

check('the round trip: a fraction of one dial is the same fraction of the other', () => {
  for (const raw of [0, 1, 256, 511.5, 700, 1022, 1023]) {
    const fraction = fractionOf(raw);
    assert.equal(scaleTo(raw, DIAL_TOP, VOLT_TOP), landOn(fraction, VOLT_TOP));
    assert.ok(Math.abs(reading(raw).command / COMMAND_TOP - fraction) < 1e-12);
  }
});

// The chase half: progress and the sound choice are remembered per visitor, and a store that is
// missing, blocked or full of someone else's bytes costs the reader nothing but the memory.
function fakeStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    has: (key) => data.has(key),
    read: (key) => data.get(key),
  };
}

check('a fresh visitor starts at the first mark, with no best run and sound off', () => {
  const store = fakeStore();
  assert.deepEqual(readChase(store), { marks: 0, best: 0 });
  assert.equal(markAt(0), MARKS[0]);
  assert.equal(readMuted(store), true, 'a lesson does not make noise unasked');
});

check('landing a mark counts it and survives a reload', () => {
  const store = fakeStore();
  let chase = readChase(store);
  for (let i = 0; i < 3; i += 1) {
    chase = landed(chase);
    writeChase(chase, store);
  }
  assert.deepEqual(chase, { marks: 3, best: 3 });
  assert.deepEqual(readChase(store), { marks: 3, best: 3 }, 'the reload reads the same progress');
  assert.equal(markAt(readChase(store).marks), MARKS[3], 'the fourth mark is the one waiting');
});

check('the chase cycles its five marks and the best run never goes backwards', () => {
  let chase = { marks: 0, best: 0 };
  for (let i = 0; i < 11; i += 1) chase = landed(chase);
  assert.equal(chase.marks, 11);
  assert.equal(markAt(chase.marks), MARKS[1], 'eleven landings is the second mark of a third lap');
  assert.equal(chase.best, 11);
});

check('reset forgets progress and keeps the sound choice', () => {
  const store = fakeStore();
  writeChase({ marks: 4, best: 4 }, store);
  writeMuted(false, store);
  clearChase(store);
  assert.deepEqual(readChase(store), { marks: 0, best: 0 });
  assert.equal(readMuted(store), false, 'a reset of progress is not a reset of the reader');
  assert.equal(store.has(CHASE_KEY), false, 'the key is gone, not zeroed');
});

check('the sound choice is remembered both ways, and only "on" turns it on', () => {
  const store = fakeStore();
  assert.equal(readMuted(store), true);
  writeMuted(false, store);
  assert.equal(readMuted(store), false);
  assert.equal(store.read(SOUND_KEY), 'on');
  writeMuted(true, store);
  assert.equal(readMuted(store), true);
  assert.equal(store.read(SOUND_KEY), 'off');
});

check('a corrupt or blocked store is zeros, not a crash', () => {
  const corrupt = fakeStore({ [CHASE_KEY]: '{not json', [SOUND_KEY]: 'yes' });
  assert.deepEqual(readChase(corrupt), { marks: 0, best: 0 });
  assert.equal(readMuted(corrupt), true, 'only "on" turns sound on');
  const hostile = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(readChase(hostile), { marks: 0, best: 0 });
  assert.equal(readMuted(hostile), true);
  writeChase({ marks: 2, best: 2 }, hostile);
  clearChase(hostile);
  writeMuted(false, hostile);
  assert.deepEqual(readChase(null), { marks: 0, best: 0 }, 'no store at all is zeros');
  assert.equal(readMuted(null), true, 'and sound off');
});

check('nonsense numbers in a store are clamped, not trusted', () => {
  const store = fakeStore({ [CHASE_KEY]: JSON.stringify({ marks: -4, best: 9999 }) });
  assert.deepEqual(readChase(store), { marks: 0, best: MARKS.length * 20 });
  const half = fakeStore({ [CHASE_KEY]: JSON.stringify({ marks: 2.7, best: 'x' }) });
  assert.deepEqual(readChase(half), { marks: 2, best: 0 });
});

check('sound needs the reader to have asked for it and normal motion', () => {
  assert.equal(soundAllowed(true, false), false, 'muted is silent');
  assert.equal(soundAllowed(true, true), false);
  assert.equal(soundAllowed(false, true), false, 'reduced motion is silent even unmuted');
  assert.equal(soundAllowed(false, false), true);
});

check('a landing is a window around the mark, with edges', () => {
  assert.ok(isLanded(MARKS[0], MARKS[0]));
  assert.ok(isLanded(MARKS[0] + LANDED * 0.9, MARKS[0]));
  assert.equal(isLanded(MARKS[0] + LANDED * 1.1, MARKS[0]), false);
});

// ---- P.3's clamp: the section's own numbers, and the wrap it warns about ----
check('P.3: 310 clamps to 255 and wraps to 54 without the clamp', () => {
  assert.equal(COMMAND_MIN, 0);
  assert.equal(COMMAND_MAX, 255);
  assert.equal(clampCommand(310), 255, 'the section high command');
  assert.equal(clampCommand(-45), 0, 'the starter code low command');
  assert.equal(clampCommand(128), 128, 'a command inside the range passes through');
  assert.equal(registerByte(310), 54, 'the section says 310 wraps to 54');
  assert.equal(registerByte(-40), 216, 'and -40 wraps upwards');
  assert.equal(registerByte(-45), 211, 'the starter code uses -45');
  assert.equal(motorCommand(310, true), 0, 'the e-stop forces the output to 0');
  assert.equal(motorCommand(310, false), 255);

});

check('P.3: the card opens on the section high command, with 255 / 54 / 255', () => {
  const values = startValues([
    { kind: 'range', id: 'raw', label: '', unit: '', min: -60, max: 320, step: 1, start: 310, hint: '' },
    { kind: 'toggle', id: 'estop', label: '', start: false },
  ]);
  assert.equal(values.raw, 310);
  assert.equal(values.estop, false);
});

// ---- P.2's fraction bar ----
check('P.2: the divider gives 4.00 V with parentheses and 10006.00 V without', () => {
  assert.equal(dividerRight(SUPPLY_V, PART_A_OHM, PART_B_OHM), 4);
  assert.equal(dividerWrong(SUPPLY_V, PART_A_OHM, PART_B_OHM), 10006);
  assert.equal(formatReading(dividerRight(SUPPLY_V, PART_A_OHM, PART_B_OHM)), '4.00');
  assert.equal(formatReading(dividerWrong(SUPPLY_V, PART_A_OHM, PART_B_OHM)), '10006.00');
  // The fraction is b over the sum, so it is between 0 and 1 for any positive pair.
  for (const [a, b] of [[1, 1], [20000, 10000], [100000, 1000]]) {
    const fraction = b / (a + b);
    assert.ok(fraction > 0 && fraction < 1);
  }
  assert.throws(() => dividerRight(12, 0, 0), /positive/);
  assert.throws(() => dividerWrong(12, 0, 1), /positive/);
});

check('P.3: the drawn register puts the clamp at 255 and the wrap at 54 on the same axis', () => {
  const scale = clampCommandLab.scale;
  assert.ok(scale, 'the clamp card draws its register');
  assert.equal(scale.min, 0);
  assert.equal(scale.max, 255);
  const high = { raw: 310, estop: false };
  assert.equal(scale.marks[0].at(high), 255, 'the clamp lands at the top stop');
  assert.equal(scale.marks[1].at(high), 54, 'the wrap lands at 54');
  assert.equal(scale.marks[0].caption(high), 'clamp: 310 → 255');
  assert.equal(scale.marks[1].caption(high), 'wrap: 310 % 256 = 54');
  const low = { raw: -60, estop: false };
  assert.equal(scale.marks[0].at(low), 0);
  assert.equal(scale.marks[1].at(low), 196);
  assert.equal(scale.marks[0].caption(low), 'clamp: -60 → 0');
  assert.equal(scale.marks[1].caption(low), 'wrap: -60 % 256 = 196');
});

check('P.2: the card prints the expression behind each reading, and draws the fraction', () => {
  const values = { y_in: SUPPLY_V, a: PART_A_OHM, b: PART_B_OHM };
  const byId = (id) => orderOfOperationsLab.readouts.find((readout) => readout.id === id);
  assert.equal(byId('right').note(values), '12 * (10000 / (20000 + 10000))');
  assert.equal(byId('wrong').note(values), '12 * 10000 / 20000 + 10000');
  assert.equal(byId('right').text(values), '4.00');
  assert.equal(byId('wrong').text(values), '10006.00');
  const scale = orderOfOperationsLab.scale;
  assert.ok(scale, 'the divider card draws its fraction');
  assert.equal(scale.marks[0].at(values), 1 / 3);
  assert.equal(scale.marks[0].caption(values), '10000 / (20000 + 10000)');
});

check('the pages still say the numbers their labs print', () => {
  const read = (page) => fs.readFileSync(path.join(root, page), 'utf8');
  const p3 = read('track-p/P.3-decisions-and-clamping.md');
  assert.ok(p3.includes('310'), 'P.3 must still use the 310 command');
  assert.ok(p3.includes('54'), 'P.3 must still work out the wrapped 54');
  assert.ok(p3.includes('-45'), 'P.3 must still use the -45 braking case');
  const p2 = read('track-p/P.2-arithmetic-and-order-of-operations.md');
  assert.ok(p2.includes('20000') && p2.includes('10000'), 'P.2 must keep its two resistors');
  assert.ok(p2.includes('y_in * (b / (a + b))'), 'P.2 must keep the parenthesised form');
});

// The manifest half: every lesson listed for a visual must have a Bridge Notes section to sit under,
// and the page the prototype was written from must still work out the numbers the visual prints.
async function manifestChecks() {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'resources/bridge-visuals.json'), 'utf8'));
  const pages = registry.pages;
  const entries = Object.entries(pages);
  const boundary = fs.readFileSync(path.join(root, 'app/src/bridges/bridgeNotesVisual.tsx'), 'utf8');

  check('the registry is not empty and names P.9', () => {
    assert.ok(entries.length >= 1);
    assert.equal(pages['track-p/P.9-rearranging-formulas-and-scaling.md'], 'scaling-dials');
  });

  check('every registered page has a Bridge Notes section to sit under', () => {
    for (const [page, name] of entries) {
      const text = fs.readFileSync(path.join(root, page), 'utf8');
      assert.match(text, /^### Bridge Notes$/m, `${page} has no Bridge Notes section (${name})`);
    }
  });

  check('every registered page ships a payload that names its visual', () => {
    for (const [page, name] of entries) {
      const payload = path.join(root, 'app/public/lesson-pages', page.replace(/\.md$/, '.json'));
      const text = fs.readFileSync(payload, 'utf8');
      assert.ok(
        text.includes(`"v":"${name}"`),
        `${page} was not regenerated: its payload does not carry "v":"${name}"`
      );
    }
  });

  check('every registered visual has a component in the lazy boundary', () => {
    for (const [page, name] of entries) {
      assert.ok(
        boundary.includes(`'${name}'`),
        `app/src/bridges/bridgeNotesVisual.tsx has no entry for ${name} (${page})`
      );
    }
  });

  check('P.9\'s Bridge Notes still works out the numbers the visual prints', () => {
    const text = fs.readFileSync(
      path.join(root, 'track-p/P.9-rearranging-formulas-and-scaling.md'),
      'utf8'
    );
    const section = text.slice(text.indexOf('### Bridge Notes'));
    assert.ok(section.includes('`1023`'), 'the dial top the visual uses must still be on the page');
    assert.ok(section.includes('511.5`'), 'the worked reading the visual opens on');
    // Both halves are written inside one code span on the page (`0.5 * 5.0 = 2.50`), so the check is
    // on the number rather than on the span around it.
    assert.ok(section.includes('2.50'), 'the volts half of the worked example');
    assert.ok(section.includes('127.5'), 'the command half of the worked example');
    const shown = reading(511.5);
    assert.equal(formatVolts(shown.volts), '2.50');
    assert.equal(formatCommand(shown.command), '127.5');
  });
}

await manifestChecks();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
