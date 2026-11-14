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
