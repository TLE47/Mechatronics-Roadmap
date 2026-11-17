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
import { nextMarkState } from '../app/src/bridges/markArmed.ts';
import {
  PART_A_OHM,
  PART_B_OHM,
  SUPPLY_V,
  dividerRight,
  dividerWrong,
  orderOfOperationsLab,
} from '../app/src/bridges/orderOfOperations.ts';
import {
  LEGACY_MARK_KEY,
  MARK_KEY,
  advanceMark,
  clearMark,
  onMark,
  readMark,
  stepAt,
  targetAt,
  toleranceAt,
  writeMark,
} from '../app/src/bridges/bridgeMark.ts';
import { LEFT, RIGHT, stringSumLab, summed, typed } from '../app/src/bridges/stringSum.ts';
import { KILO_EXAMPLE, PREFIXES, prefixShiftLab, toBase } from '../app/src/bridges/prefixShift.ts';
import { freqBitsLab, periodMs, states, topOf } from '../app/src/bridges/freqBits.ts';
import {
  cosRight,
  cosWrong,
  radianConvertLab,
  rpmToRadPerSecond,
  toRadians,
} from '../app/src/bridges/radianConvert.ts';
import { gravityTorque, leverArm, leverCosLab } from '../app/src/bridges/leverCos.ts';
import { gearSquaredLab, inertiaFactor, outputSpeed, reflectedFraction } from '../app/src/bridges/gearSquared.ts';
import { formatTorque, holdTorque, signFlipLab, sinBug } from '../app/src/bridges/signFlip.ts';
import { clampCommand as clampFn, clampFunctionLab } from '../app/src/bridges/clampFunction.ts';
import { assertGuardLab, distance2d, rounded, FLOAT_TAIL } from '../app/src/bridges/assertGuard.ts';
import { answerCheckLab, ohmsCurrent, withinLimit } from '../app/src/bridges/answerCheck.ts';
import { DRIVERS, datasheetLimitsLab, headroom, inRecommended } from '../app/src/bridges/datasheetLimits.ts';
import { buckHeat, buckInputCurrent, ldoHeat, regulatorBudgetLab } from '../app/src/bridges/regulatorBudget.ts';
import { timerWrapLab, velocity, wrap16 } from '../app/src/bridges/timerWrap.ts';
import { countsToRadians, pointerBoxLab } from '../app/src/bridges/pointerBox.ts';
import { lagPowerLab, power as lagPower, stepFraction } from '../app/src/bridges/lagPower.ts';
import { flowAmps, powerWatts, waterAnalogueLab } from '../app/src/bridges/waterAnalogue.ts';
import { countRateLab, radiansPerCount, rateRadPerSecond } from '../app/src/bridges/countRate.ts';
import { accumulateLab, leftSum, rightSum, trapezoidSum } from '../app/src/bridges/accumulate.ts';
import { slotOne, slotTwo, stateSlotsLab, swappedRow } from '../app/src/bridges/stateSlots.ts';
import { bakedDelta, deltaQ, deltaQd, matrixTickLab } from '../app/src/bridges/matrixTick.ts';
import { arrowMultiplyLab, imaginaryPart, mixedCosine, realPart } from '../app/src/bridges/arrowMultiply.ts';
import { bHat, bringupLab, railMargin } from '../app/src/bridges/bringup.ts';
import { beltForce, beltGeometryLab, pitchRadiusMm, ratio as beltRatio } from '../app/src/bridges/beltGeometry.ts';
import {
  criticalDamping,
  dampingRatio,
  massSpringLab,
  naturalFrequency,
  ratioWithoutTwo,
  regimeOf,
} from '../app/src/bridges/massSpring.ts';
import { cutoffHz, cutoffNoTwoPi, gainAt, rcFilterLab, tauSeconds } from '../app/src/bridges/rcFilter.ts';
import {
  electricalAngle,
  electricalAngleLab,
  leadMechanicalDeg,
  torqueFraction,
  wrapDegrees,
} from '../app/src/bridges/electricalAngle.ts';
import {
  overshootClamped,
  overshootUnclamped,
  pidWindupLab,
  sagRad,
  windupRatio,
} from '../app/src/bridges/pidWindup.ts';
import {
  biasErrorDeg,
  complementaryImuLab,
  crossoverSeconds,
  gyroDriftDeg,
} from '../app/src/bridges/complementaryImu.ts';
import {
  cubicFraction,
  cubicTrajectoryLab,
  peakVelocityRadPerSecond,
  positionRad,
  velocityRadPerSecond,
} from '../app/src/bridges/cubicTrajectory.ts';
import {
  capstoneFrameLab,
  droppedFrames,
  requiredBitsPerSecond,
} from '../app/src/bridges/capstoneFrame.ts';
import {
  clampVoltage,
  conductionLoss,
  flybackSpikeLab,
  inductiveKickbackVoltage,
} from '../app/src/bridges/flybackSpike.ts';
import {
  capacitorVolts,
  chargeFraction,
  linearEstimate,
  rcChargeLab,
  timeConstant,
} from '../app/src/bridges/rcCharge.ts';

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

// The shared ladder: the same five-mark chase P.9 proved, now declared by every card.
check('the mark ladder follows the page and tightens to a fifth', () => {
  const ladder = [17, 0, 5];
  assert.equal(targetAt(ladder, 0), 17);
  assert.equal(targetAt(ladder, 1), 0);
  assert.equal(targetAt(ladder, 3), 17, 'the ladder repeats after its last number');
  assert.equal(stepAt(ladder, 2), 2);
  assert.equal(toleranceAt(1, 0), 1);
  assert.ok(Math.abs(toleranceAt(1, 4) - 0.2) < 1e-12);
  assert.ok(toleranceAt(1, 2) < toleranceAt(1, 1), 'each rung is tighter than the last');
  assert.ok(toleranceAt(1, 9) === toleranceAt(1, 4), 'the fifth is as tight as it gets');
  assert.ok(onMark(17.5, 17, 0.5), 'the edge counts');
  assert.ok(!onMark(17.6, 17, 0.5));
  assert.ok(!onMark(Number.NaN, 17, 0.5), 'a broken reading is not a landing');
});

// The bug the latch closes: P.9's answer dial is already on its first mark when the card paints, so a
// rule that only compared numbers counted the first paint as a landing and announced it.
check('a card that opens on its mark scores nothing until the value moves', () => {
  assert.deepEqual(nextMarkState(false, 63.2, 63.2, 0.5), { armed: false, land: false }, 'the first paint is not a landing');
  assert.deepEqual(nextMarkState(false, 63.7, 63.2, 0.5), { armed: false, land: false }, 'a value inside the window does not arm');
  assert.deepEqual(nextMarkState(false, 64.0, 63.2, 0.5), { armed: false, land: false }, 'nor does one just outside it');
  assert.deepEqual(nextMarkState(false, 64.5, 63.2, 0.5), { armed: true, land: false }, 'leaving the window arms it');
  assert.deepEqual(nextMarkState(true, 63.0, 63.2, 0.5), { armed: false, land: true }, 'arriving inside it scores');
  assert.deepEqual(nextMarkState(false, 63.2, 63.2, 0.5), { armed: false, land: false }, 'and a landing disarms it again');
});

check('a value that rests on the mark cannot score twice', () => {
  // After a landing the latch is disarmed; the same value on the next frame is not a second landing.
  let state = nextMarkState(true, 17, 17, 0.2);
  assert.deepEqual(state, { armed: false, land: true });
  for (let frame = 0; frame < 5; frame += 1) {
    state = nextMarkState(state.armed, 17, 17, 0.2);
    assert.equal(state.land, false, `frame ${frame} scored again while resting on the mark`);
  }
});

check('a broken reading neither lands nor arms', () => {
  assert.deepEqual(nextMarkState(true, Number.NaN, 17, 0.5), { armed: false, land: false });
  assert.deepEqual(nextMarkState(true, 17, Number.NaN, 0.5), { armed: false, land: false });
  assert.deepEqual(nextMarkState(true, 17, 17, 0), { armed: false, land: false }, 'a zero window is not a landing');
});

check('a landing survives a store, and reads P.9\'s old key once', () => {
  const fake = (seed = {}) => {
    const data = new Map(Object.entries(seed));
    return {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key),
    };
  };

  const fresh = fake();
  assert.deepEqual(readMark(fresh), { marks: 0, best: 0 });
  writeMark(advanceMark(advanceMark({ marks: 0, best: 0 })), fresh);
  assert.equal(readMark(fresh).marks, 2);
  assert.equal(readMark(fresh).best, 2);
  assert.equal(JSON.parse(fresh.getItem(MARK_KEY)).marks, 2);

  const legacy = fake({ [LEGACY_MARK_KEY]: JSON.stringify({ marks: 3, best: 4 }) });
  assert.deepEqual(readMark(legacy), { marks: 3, best: 4 }, 'P.9 progress is not lost');

  clearMark(legacy);
  assert.equal(legacy.getItem(LEGACY_MARK_KEY), null);
  assert.deepEqual(readMark(legacy), { marks: 0, best: 0 });

  const corrupt = fake({ [MARK_KEY]: 'not json' });
  assert.deepEqual(readMark(corrupt), { marks: 0, best: 0 }, 'a corrupt record reads as zeros');
  assert.deepEqual(readMark(null), { marks: 0, best: 0 }, 'a blocked store reads as zeros');
  writeMark({ marks: 1, best: 1 }, null);
  clearMark(null);
});

check('P.1: 12 + 5 is 17, "12" + "5" is "125"', () => {
  assert.equal(typed(LEFT, RIGHT), '125');
  assert.equal(summed(LEFT, RIGHT), 17);
  assert.equal(stringSumLab.mark.ladder[0], 17);
  assert.equal(stringSumLab.pair.wrong, 'typed');
  assert.equal(stringSumLab.pair.right, 'sum');
});

check('P.7: milli is 1e-3 and micro is 1e-6 in base units', () => {
  assert.equal(PREFIXES.milli.factor, 1e-3);
  assert.equal(PREFIXES.micro.factor, 1e-6);
  assert.equal(toBase(15, 'milli'), 0.015);
  assert.equal(toBase(500, 'micro'), 0.0005);
  assert.equal(toBase(4_700, 'milli'), 4.7, 'the page\'s 4,700 mV is 4.7 V');
  assert.equal(KILO_EXAMPLE, 4_700, '4.7 kΩ is 4,700 Ω');
  assert.equal(prefixShiftLab.mark.ladder[0], 0.015);
});

check('P.8: 50 Hz is 20 ms, and 10 bits counts 0 to 1023', () => {
  assert.equal(periodMs(50), 20);
  assert.equal(periodMs(1000), 1);
  assert.equal(states(8), 256);
  assert.equal(topOf(8), 255);
  assert.equal(states(10), 1024);
  assert.equal(topOf(10), 1023);
  assert.equal(states(12), 4096);
  assert.equal(topOf(12), 4095);
  assert.equal(Number(freqBitsLab.controls[1].start), 10);
});

check('P.10: cos wants radians, so cos(90) is not zero', () => {
  assert.ok(Math.abs(toRadians(180) - Math.PI) < 1e-12);
  assert.ok(Math.abs(cosRight(90)) < 1e-12);
  assert.equal(cosWrong(90).toFixed(4), '-0.4481');
  assert.equal(cosRight(90).toFixed(4), '0.0000');
  assert.ok(Math.abs(rpmToRadPerSecond(30) - Math.PI) < 1e-12);
  assert.equal(radianConvertLab.pair.wrong, 'cos_wrong');
});

check('P.12: m g L cos θ is 0.981 N·m at horizontal and 0 at vertical', () => {
  assert.ok(Math.abs(leverArm(0.25, 0) - 0.25) < 1e-12);
  assert.ok(Math.abs(gravityTorque(0.4, 0.25, 0) - 0.981) < 1e-9);
  assert.ok(Math.abs(gravityTorque(0.4, 0.25, 90)) < 1e-12);
  assert.equal(leverCosLab.mark.ladder[0], 0.981);
});

check('02.4: a 50:1 box makes reflected inertia 2,500 times smaller', () => {
  assert.equal(inertiaFactor(50), 2500);
  assert.equal(reflectedFraction(50), 0.0004);
  assert.equal(outputSpeed(50, 50), 1);
  assert.equal(outputSpeed(100, 50), 2);
  assert.equal(gearSquaredLab.mark.ladder[0], 2500);
});

check('00.3: +1.962 at horizontal, +0.981 at 60°, +0.000 at vertical', () => {
  assert.ok(Math.abs(holdTorque(0) - 1.962) < 1e-9);
  assert.ok(Math.abs(holdTorque(60) - 0.981) < 1e-9);
  assert.ok(Math.abs(holdTorque(90)) < 1e-12);
  assert.equal(sinBug(0), 0);
  assert.equal(formatTorque(0.981), '+0.981');
  assert.equal(formatTorque(-1), '-1.000');
  assert.equal(signFlipLab.mark.ladder[0], 1.962);
});

check('P.5: return hands back 255, print hands back None', () => {
  assert.equal(clampFn(310), 255);
  assert.equal(clampFn(-40), 0);
  assert.equal(clampFn(17), 17);
  assert.equal(clampFunctionLab.pair.wrong, 'via_print');
  assert.equal(clampFunctionLab.pair.right, 'via_return');
  const values = startValues(clampFunctionLab.controls);
  assert.equal(clampFunctionLab.readouts.find((r) => r.id === 'via_print').text(values), 'None');
  assert.match(
    clampFunctionLab.readouts.find((r) => r.id === 'after_math').text({ ...values, returns: false }),
    /TypeError/
  );
});

check('P.6: 3–4–5 is 5.0, and 0.1 + 0.2 is the long tail', () => {
  assert.equal(distance2d(3, 4), 5);
  assert.equal(FLOAT_TAIL.toFixed(17), '0.30000000000000004');
  assert.equal(rounded(FLOAT_TAIL), 0.3);
  assert.equal(FLOAT_TAIL === 0.3, false);
  assert.equal(assertGuardLab.pair.wrong, 'strict');
  assert.equal(assertGuardLab.pair.right, 'tolerant');
});

check('P.14: 5.0 A computed, 3.2 A commanded', () => {
  assert.equal(ohmsCurrent(12, 2.4), 5);
  assert.equal(withinLimit(5, 3.2), 3.2);
  assert.equal(answerCheckLab.pair.wrong, 'computed');
  assert.equal(answerCheckLab.pair.right, 'commanded');
});

check('P.13: 12.0 V is over the DRV8833 on both limits and inside the TB6612', () => {
  assert.equal(DRIVERS.drv8833.recommended, 10.8);
  assert.equal(DRIVERS.drv8833.absolute, 11.8);
  assert.equal(DRIVERS.tb6612.recommended, 13.5);
  assert.equal(DRIVERS.tb6612.absolute, 15);
  assert.equal(headroom(12, 10.8).toFixed(1), '-1.2');
  assert.equal(inRecommended(12, 'tb6612'), true);
  assert.equal(inRecommended(12, 'drv8833'), false);
  assert.equal(datasheetLimitsLab.pair.wrong, 'recommended_gap');
  assert.equal(datasheetLimitsLab.pair.right, 'absolute_gap');
});

check('01.3: the LDO burns 3.50 W where the buck loses 0.28 W', () => {
  assert.equal(ldoHeat(12, 5, 0.5), 3.5);
  assert.equal(buckInputCurrent(12, 5, 0.5).toFixed(3), '0.231');
  assert.equal(buckHeat(12, 5, 0.5).toFixed(2), '0.28');
  assert.equal(regulatorBudgetLab.pair.wrong, 'ldo_w');
  assert.equal(regulatorBudgetLab.pair.right, 'buck_w');
});

check('04.1: 0.020 rad in 1 ms is 20.0 rad/s, and one count back is 65,535', () => {
  assert.equal(velocity(0.02, 0.001), 20);
  assert.equal(wrap16(-1), 65535);
  assert.equal(wrap16(65536), 0);
  assert.equal(timerWrapLab.pair.wrong, 'speed_stalled');
  assert.equal(timerWrapLab.pair.right, 'speed_honest');
});

check('04.3: 1024 counts is 1.5708 rad, and the photocopy stays 0.0', () => {
  assert.ok(Math.abs(countsToRadians(1024) - 1.5708) < 1e-4);
  assert.equal(countsToRadians(0), 0);
  assert.equal(pointerBoxLab.pair.wrong, 'caller_value');
  assert.equal(pointerBoxLab.pair.right, 'caller_pointer');
  const values = startValues(pointerBoxLab.controls);
  assert.equal(pointerBoxLab.readouts.find((r) => r.id === 'caller_value').text(values), '0.0000');
});

check('00.1: 1τ is 63.2 %, 5τ is 99.3 %, and 9 V × 0 A is 0 W', () => {
  assert.equal((stepFraction(1) * 100).toFixed(1), '63.2');
  assert.equal((stepFraction(5) * 100).toFixed(1), '99.3');
  assert.equal(lagPower(9, 0), 0);
  assert.equal(lagPowerLab.pair.wrong, 'at_one');
  assert.equal(lagPowerLab.pair.right, 'fraction');
});

check('S0.0: 9 V across 100 Ω is 0.09 A, and an open pipe is 0 A', () => {
  assert.equal(flowAmps(9, 100, false), 0.09);
  assert.equal(flowAmps(9, 100, true), 0);
  assert.equal(powerWatts(9, 0), 0);
  assert.equal(waterAnalogueLab.pair.wrong, 'power_no_flow');
  assert.equal(waterAnalogueLab.pair.right, 'power_w');
});

check('R.1: one count is 0.00153 rad, and 1 ms makes it 1.53 rad/s', () => {
  assert.equal(radiansPerCount().toFixed(6), '0.001534');
  assert.equal(rateRadPerSecond(1, 0.001).toFixed(3), '1.534');
  assert.ok(Math.abs(rateRadPerSecond(1, 0.001) / rateRadPerSecond(1, 1) - 1000) < 1e-9);
  assert.equal(countRateLab.pair.wrong, 'per_ms');
  assert.equal(countRateLab.pair.right, 'rate');
});

check('R.2: left and right bracket the area, the trapezoid is their midpoint', () => {
  assert.equal(leftSum(1, 0.01), 0.01);
  assert.ok(Math.abs(rightSum(1, 0.01) - 0.0101) < 1e-12);
  assert.ok(Math.abs(trapezoidSum(1, 0.01) - 0.01005) < 1e-12);
  assert.ok(
    Math.abs(
      trapezoidSum(1, 0.01) - (leftSum(1, 0.01) + rightSum(1, 0.01)) / 2
    ) < 1e-12,
    'the trapezoid is exactly the midpoint of the bracket'
  );
  assert.equal(accumulateLab.pair.wrong, 'left');
  assert.equal(accumulateLab.pair.right, 'trapezoid');
});

check('R.3: slot one reads qd, slot two is (τ − B·qd)/J', () => {
  assert.equal(slotOne(1), 1);
  assert.ok(Math.abs(slotTwo(0.6, 0.1, 0.05, 1) - 10) < 1e-12);
  assert.ok(Math.abs(swappedRow(0.6, 0.1, 0.05, 1) - 5.5) < 1e-12);
  assert.equal(stateSlotsLab.pair.wrong, 'swapped');
  assert.equal(stateSlotsLab.pair.right, 'qddot');
});

check('R.4: the clean tick scales with dt and the baked one does not', () => {
  assert.equal(deltaQ(1, 0.001), 0.001);
  assert.equal(deltaQ(1, 0.01), 0.01);
  assert.equal(bakedDelta(1), 0.001);
  assert.equal(deltaQd(1, 0.001, 2), -0.002);
  assert.equal(matrixTickLab.pair.wrong, 'baked');
  assert.equal(matrixTickLab.pair.right, 'dq');
});

check('R.5: 2.0 at 90° is 0.000 + 2.000j, not −0.896', () => {
  assert.ok(Math.abs(realPart(2, 90)) < 1e-12);
  assert.ok(Math.abs(imaginaryPart(2, 90) - 2) < 1e-12);
  assert.equal(mixedCosine(2, 90).toFixed(3), '-0.896');
  assert.equal(arrowMultiplyLab.pair.wrong, 'mixed');
  assert.equal(arrowMultiplyLab.pair.right, 'real');
});

check('07.1: 100 Ω is the floor, not a pass', () => {
  assert.equal(railMargin(120), 20);
  assert.equal(railMargin(100), 0);
  assert.equal(bHat(0.5, 1).toFixed(4), '0.0796');
  assert.equal(
    bringupLab.readouts.find((r) => r.id === 'rail_gate').text({ r_rail: 100, i_limit: 0.15, sign_ok: true }),
    'fail'
  );
});

check('02.5: 60 teeth on 2.0 mm pitch is 19.10 mm and 78.5 N', () => {
  assert.equal(pitchRadiusMm(60).toFixed(2), '19.10');
  assert.equal(beltForce(1.5, pitchRadiusMm(60)).toFixed(1), '78.5');
  assert.equal(beltRatio(60), 3);
  assert.equal(beltGeometryLab.pair.wrong, 'outside_force');
  assert.equal(beltGeometryLab.pair.right, 'force');
});

check('00.2: ζ = b / (2√(mk)) classifies 4 / 20 / 40 as ring / stop / crawl', () => {
  assert.equal(naturalFrequency(1, 100), 10);
  assert.equal(criticalDamping(1, 100), 20);
  assert.ok(Math.abs(dampingRatio(1, 100, 4) - 0.2) < 1e-12);
  assert.equal(dampingRatio(1, 100, 20), 1);
  assert.equal(dampingRatio(1, 100, 40), 2);
  assert.equal(regimeOf(0.2), 'underdamped');
  assert.equal(regimeOf(1), 'critically_damped');
  assert.equal(regimeOf(2), 'overdamped');
  assert.equal(ratioWithoutTwo(1, 100, 20), 2, 'the missing 2 doubles the same damper');
  assert.equal(massSpringLab.mark.ladder[0], 1);
  assert.equal(massSpringLab.pair.wrong, 'zeta_no_two');
  assert.equal(massSpringLab.pair.right, 'zeta');
});

check('01.4: fc = 1/(2πRC) is 159.15 Hz and keeps 0.00796 at 20 kHz, not 0.0499', () => {
  assert.ok(Math.abs(tauSeconds(1000, 1) - 0.001) < 1e-15);
  assert.equal(cutoffHz(1000, 1).toFixed(2), '159.15');
  assert.equal(cutoffNoTwoPi(1000, 1), 1000);
  assert.equal(gainAt(20000, cutoffHz(1000, 1)).toFixed(4), '0.0080');
  assert.equal(gainAt(20000, cutoffNoTwoPi(1000, 1)).toFixed(4), '0.0499');
  assert.equal(gainAt(2, cutoffHz(1000, 1)).toFixed(4), '0.9999');
  assert.equal(rcFilterLab.pair.wrong, 'gain_no_2pi');
  assert.equal(rcFilterLab.pair.right, 'gain');
});

check('03.2: 4 pole pairs turn 30° into 120°, and the mechanical drive leaves 0° of lead', () => {
  assert.equal(electricalAngle(30, 4), 120);
  assert.equal(wrapDegrees(400), 40);
  assert.equal(torqueFraction(90), 1);
  assert.ok(Math.abs(torqueFraction(0)) < 1e-12);
  assert.equal(leadMechanicalDeg(30, 4), 0, '90° − (Np − 1)·θm at 30° and 4 pairs');
  assert.ok(Math.abs(torqueFraction(leadMechanicalDeg(30, 4))) < 1e-12);
  assert.ok(Math.abs(torqueFraction(90) * 100 - 100) < 1e-12);
  assert.equal(electricalAngleLab.pair.wrong, 'torque_mech');
  assert.equal(electricalAngleLab.pair.right, 'torque');
});

check('05.1: Kp = 4 sags 0.150 rad, overshoots 0.372 unclamped and 0.047 clamped', () => {
  assert.ok(Math.abs(sagRad(4) - 0.15) < 1e-12);
  assert.ok(Math.abs(overshootUnclamped(4) - 0.372) < 1e-12);
  assert.ok(Math.abs(overshootClamped(4) - 0.047) < 1e-12);
  assert.ok(Math.abs(windupRatio(4) - 0.372 / 0.047) < 1e-12);
  assert.ok(windupRatio(4) > 7.9 && windupRatio(4) < 8, 'the page says nearly 8×');
  assert.equal(pidWindupLab.mark.ladder[0], 0.15);
  assert.equal(pidWindupLab.pair.wrong, 'overshoot_unclamped');
  assert.equal(pidWindupLab.pair.right, 'overshoot_clamped');
});

check('05.2: α = 0.98 at 100 Hz is τc = 0.490 s, and a 1 °/s bias stops at 0.49°', () => {
  assert.ok(Math.abs(crossoverSeconds(0.98, 0.01) - 0.49) < 1e-12);
  assert.ok(Math.abs(biasErrorDeg(0.98, 0.01, 1) - 0.49) < 1e-12);
  assert.equal(gyroDriftDeg(1), 60);
  assert.ok(crossoverSeconds(0.9, 0.01) < crossoverSeconds(0.98, 0.01), 'a smaller α trusts the accelerometer more');
  assert.equal(complementaryImuLab.mark.ladder[0], 0.49);
  assert.equal(complementaryImuLab.pair.wrong, 'drift');
  assert.equal(complementaryImuLab.pair.right, 'bias_error');
});

check('06.1: the cubic covers 0.156 at a quarter of the move where the line has 0.250', () => {
  assert.ok(Math.abs(cubicFraction(0.25) - 0.15625) < 1e-12);
  assert.equal(cubicFraction(0.5), 0.5);
  assert.ok(Math.abs(cubicFraction(0.75) - 0.84375) < 1e-12);
  assert.ok(Math.abs(positionRad(0.25, 1) - 0.15625) < 1e-12);
  assert.ok(Math.abs(velocityRadPerSecond(0.25, 1, 0.5) - 2.25) < 1e-12);
  assert.ok(Math.abs(peakVelocityRadPerSecond(1, 0.5) - 3) < 1e-12);
  assert.equal(cubicTrajectoryLab.pair.wrong, 'linear');
  assert.equal(cubicTrajectoryLab.pair.right, 'cubic');
});

check('01.1: 0.5 mH at 2 A off in 2 µs is 512.0 V, clamped to 12.7 V, 80.0 mW on', () => {
  assert.equal(inductiveKickbackVoltage(12, 0.5e-3, 2, 2e-6), 512);
  assert.equal(inductiveKickbackVoltage(12, 0.5e-3, 2, 0), 0, 'a zero switch time refuses to answer');
  assert.ok(Math.abs(clampVoltage(12) - 12.7) < 1e-12);
  assert.ok(Math.abs(conductionLoss(2, 0.02) - 0.08) < 1e-12);
  assert.equal(conductionLoss(0, 0.02), 0);
  assert.equal(flybackSpikeLab.pair.wrong, 'spike');
  assert.equal(flybackSpikeLab.pair.right, 'clamp');
});

check('S0.6: 10 kΩ and 100 µF is τ = 1.00 s — 63.2 % / 86.5 % / 99.3 %', () => {
  assert.ok(Math.abs(timeConstant(10_000, 100) - 1) < 1e-12);
  assert.equal(chargeFraction(1, 1).toFixed(4), '0.6321');
  assert.equal(chargeFraction(2, 1).toFixed(4), '0.8647');
  assert.equal(chargeFraction(5, 1).toFixed(4), '0.9933');
  assert.equal(chargeFraction(0, 1), 0);
  assert.equal(linearEstimate(1, 1), 1, 'the straight line claims 100 % at one τ');
  assert.ok(Math.abs(capacitorVolts(5, 1, 5) - 4.9663) < 1e-4);
  assert.equal(rcChargeLab.pair.wrong, 'linear');
  assert.equal(rcChargeLab.pair.right, 'curve');
});

check('08.1: 20 B at 1 kHz needs 200 kbit/s and drops 412 frames at 115.2 kbaud', () => {
  assert.equal(requiredBitsPerSecond(20, 1000), 200000);
  assert.equal(droppedFrames(115200), 412);
  assert.equal(droppedFrames(230400), 0);
  assert.equal(droppedFrames(500000), 0);
  assert.equal(capstoneFrameLab.pair.wrong, 'dropped_slow');
  assert.equal(capstoneFrameLab.pair.right, 'dropped_fast');
});

check('every card\'s readings stay finite across its own controls', () => {
  const cards = {
    'string-sum': stringSumLab,
    'prefix-shift': prefixShiftLab,
    'freq-bits': freqBitsLab,
    'radian-convert': radianConvertLab,
    'lever-cos': leverCosLab,
    'gear-squared': gearSquaredLab,
    'sign-flip': signFlipLab,
    'order-of-operations': orderOfOperationsLab,
    'clamp-command': clampCommandLab,
    'clamp-function': clampFunctionLab,
    'assert-guard': assertGuardLab,
    'answer-check': answerCheckLab,
    'datasheet-limits': datasheetLimitsLab,
    'regulator-budget': regulatorBudgetLab,
    'timer-wrap': timerWrapLab,
    'pointer-box': pointerBoxLab,
    'lag-power': lagPowerLab,
    'water-analogue': waterAnalogueLab,
    'count-rate': countRateLab,
    accumulate: accumulateLab,
    'state-slots': stateSlotsLab,
    'matrix-tick': matrixTickLab,
    'arrow-multiply': arrowMultiplyLab,
    bringup: bringupLab,
    'belt-geometry': beltGeometryLab,
    'mass-spring': massSpringLab,
    'rc-filter': rcFilterLab,
    'electrical-angle': electricalAngleLab,
    'pid-windup': pidWindupLab,
    'complementary-imu': complementaryImuLab,
    'cubic-trajectory': cubicTrajectoryLab,
    'capstone-frame': capstoneFrameLab,
    'flyback-spike': flybackSpikeLab,
    'rc-charge': rcChargeLab,
  };

  const points = (control) => {
    if (control.kind === 'range') return [control.min, control.start, control.max];
    if (control.kind === 'toggle') return [false, true];
    return control.options.map((option) => option.value);
  };

  const combos = (controls, index = 0, values = {}) => {
    if (index === controls.length) return [{ ...values }];
    const control = controls[index];
    return points(control).flatMap((point) =>
      combos(controls, index + 1, { ...values, [control.id]: point })
    );
  };

  for (const [name, spec] of Object.entries(cards)) {
    const ids = new Set(spec.readouts.map((readout) => readout.id));
    if (spec.pair) {
      const wrong = spec.readouts.find((readout) => readout.id === spec.pair.wrong);
      const right = spec.readouts.find((readout) => readout.id === spec.pair.right);
      assert.ok(
        combos(spec.controls).some((values) => wrong.text(values) !== right.text(values)),
        `${name}: the pair prints the same number on both sides at every setting`
      );
    }
    if (spec.mark) {
      assert.ok(ids.has(spec.mark.readout), `${name}: the mark names no readout`);
      assert.ok(spec.mark.ladder.length > 0, `${name}: an empty ladder is not a chase`);
      assert.ok(spec.mark.tolerance > 0, `${name}: a zero tolerance cannot be hit`);
    }
    if (spec.pair) {
      assert.ok(
        spec.readouts.some((readout) => readout.id === spec.pair.wrong),
        `${name}: the pair names a missing wrong readout`
      );
      assert.ok(
        spec.readouts.some((readout) => readout.id === spec.pair.right),
        `${name}: the pair names a missing right readout`
      );
    }
    for (const values of combos(spec.controls)) {
      for (const readout of spec.readouts) {
        const text = readout.text(values);
        assert.equal(typeof text, 'string', `${name}/${readout.id} did not print a string`);
        assert.ok(!/NaN|Infinity|undefined/.test(text), `${name}/${readout.id} printed ${text}`);
      }
      if (spec.mark) {
        assert.ok(Number.isFinite(spec.mark.value(values)), `${name}: the mark read a broken value`);
      }
      if (spec.verdict) {
        assert.equal(typeof spec.verdict(values), 'string', `${name}: the verdict is not a line`);
      }
    }
  }
});

check('the new pages still say the numbers their cards print', () => {
  const read = (page) => fs.readFileSync(path.join(root, page), 'utf8');
  const section = (page) => {
    const text = read(page);
    return text.slice(text.indexOf('### Bridge Notes'));
  };

  const p1 = section('track-p/P.1-variables-and-data-types.md');
  for (const token of ['12', '5', '17', '125']) assert.ok(p1.includes(token), `P.1 lost ${token}`);

  const p7 = section('track-p/P.7-si-units-and-metric-prefixes.md');
  for (const token of ['15', '500', '1{,}000', '1{,}000{,}000', '4{,}700']) {
    assert.ok(p7.includes(token), `P.7 lost ${token}`);
  }

  const p8 = section('track-p/P.8-frequency-and-binary-bits.md');
  for (const token of ['50', '20', '255', '1023', '4095']) {
    assert.ok(p8.includes(token), `P.8 lost ${token}`);
  }

  const p10 = section('track-p/P.10-radians-and-right-triangle-trig.md');
  for (const token of ['3.1416', '6.2832', 'math.radians']) {
    assert.ok(p10.includes(token), `P.10 lost ${token}`);
  }

  const p12 = section('track-p/P.12-forces-and-lever-torque.md');
  for (const token of ['9.81', 'm \\cdot g \\cdot L', 'L\\cos\\theta', '0.0']) {
    assert.ok(p12.includes(token), `P.12 lost ${token}`);
  }

  const p24 = section('02-mechanics-kinematics-dynamics/02.4-rotational-inertia-and-gear-ratios.md');
  for (const token of ['N^2', 'I_{\\text{load}}', 'N_{\\text{out}}']) {
    assert.ok(p24.includes(token), `02.4 lost ${token}`);
  }

  const p003 = section('00-foundations/00.3-modeling-discipline-and-sanity-checks.md');
  for (const token of ['\\cos(0)', '\\sin(0)', '+m', '0.0']) {
    assert.ok(p003.includes(token), `00.3 lost ${token}`);
  }
});

check('the batch-2 pages still say the numbers their cards print', () => {
  const section = (page) => {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    return text.slice(text.indexOf('### Bridge Notes'));
  };
  const pins = {
    'track-p/P.5-functions-and-while-loops.md': ['255', 'None', 'TypeError', '20'],
    'track-p/P.6-modules-and-automated-asserts.md': ['3.0', '4.0', '5.0', '0.30000000000000004'],
    'track-p/P.14-analysis-workflow-given-unknown-model-check-answer.md': ['12', '2.4', '5.0', '3.2'],
    'track-p/P.13-reading-a-datasheet-table.md': ['2.7', '10.8', '11.8', '4.5', '13.5', '15.0'],
    '01-electronics-and-power/01.3-power-regulators-and-power-budget.md': [
      '12.0',
      '5.0',
      '0.50',
      '3.50',
      '0.231',
      '0.28',
    ],
    '04-embedded-and-realtime/04.1-c-types-and-hardware-timer-isr.md': [
      '0.020',
      '0.0010',
      '20.0',
      '100.0',
      '0xFFFF',
    ],
    '04-embedded-and-realtime/04.3-structs-and-pointers-labeled-boxes.md': [
      '4096.0f',
      '6.2831853f',
      '0.0',
      '4',
    ],
    '00-foundations/00.1-effort-flow-and-first-order-lag.md': ['63.2', '99.3'],
    'stage-0/S0.0-why-electricity-is-like-flow.md': ['0 Pa', '0 V', 'Effort', 'Flow'],
    'ramp/R.1-rate-of-change.md': ['4096'],
    'ramp/R.2-accumulation.md': ['Tustin', 'v * dt', 'dt'],
    'ramp/R.3-state-vectors.md': ['qd', 'Ax + Bu'],
    'ramp/R.4-matrix-updates.md': ['2 × 2', '2 × 1', '1 kHz', '100 Hz'],
    'ramp/R.5-phasors.md': ['abs', 'cmath.phase', 'radians'],
    '07-systems-hil-and-production/07.1-safe-bringup-and-sine-sweep-sysid.md': ['100', '0.15', 'sign'],
    '02-mechanics-kinematics-dynamics/02.5-bearings-belts-and-3d-printing.md': ['2.0', 'r_p'],
  };
  for (const [page, tokens] of Object.entries(pins)) {
    const text = section(page);
    for (const token of tokens) {
      assert.ok(text.includes(token), `${page} lost ${token}`);
    }
  }
});

check('the batch-3 pages still say the numbers their cards print', () => {
  const section = (page) => {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    return text.slice(text.indexOf('### Bridge Notes'));
  };
  const pins = {
    '00-foundations/00.2-mass-spring-damper-oscillations.md': [
      '2\\sqrt{m k}',
      'zeta=0.20',
      'zeta=1.00',
      'zeta=2.00',
      'underdamped',
      'critically_damped',
      'overdamped',
    ],
    '01-electronics-and-power/01.4-grounding-and-rc-lowpass-filters.md': [
      '159.15',
      '1.0\\text{ ms}',
      '20{,}000',
      '0.008',
    ],
    '03-sensors-and-actuators/03.2-three-phase-bldc-and-electrical-angle.md': [
      'N_p',
      '90',
      '100\\%',
      '0\\%',
    ],
    '05-control-and-estimation/05.1-pid-virtual-spring-damper-and-anti-windup.md': [
      '0.60',
      '1.20',
      '0.150',
      '0.372',
      '0.047',
    ],
    '05-control-and-estimation/05.2-complementary-imu-sensor-fusion.md': [
      '0.010',
      '0.98',
      '0.490',
    ],
    '06-robotics-and-autonomy/06.1-cubic-trajectories-and-compliant-joints.md': [
      '3s^2 - 2s^3',
      '2.0',
      '0.000',
    ],
    '08-capstone-projects/08.1-tier1-2dof-compliant-arm-capstone.md': [
      '412',
      '500',
      '200',
      '0.91',
      '2.5',
    ],
    '01-electronics-and-power/01.1-mosfet-inductor-flyback.md': [
      '512.0',
      '12.7',
      '80.0',
      '0.02',
    ],
    'stage-0/S0.6-capacitors-and-decoupling.md': [
      '1.00',
      '3.16',
      '4.32',
      '4.97',
      '63.2',
    ],
  };
  for (const [page, tokens] of Object.entries(pins)) {
    const text = section(page);
    for (const token of tokens) {
      assert.ok(text.includes(token), `${page} lost ${token}`);
    }
  }
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
