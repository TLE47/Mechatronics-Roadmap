#!/usr/bin/env node
/**
 * The spine, checked as one claim: a learner sees the same step number everywhere.
 *
 * `app/src/spine.ts` joins two registries that used to number the course separately - the ten
 * steps `scripts/route_model.py` declares for the pages, and the three depth passes (eight track
 * positions each) the roadmap rendered - plus the workbench entries. `spineData.ts` is generated
 * from the model by `scripts/generate_spine_data.py --check`, so the data side is already guarded.
 * What this file guards is the join and the spellings:
 *
 *   1. **Ten steps, numbered 1..10 once.** Any gap, repeat or reorder makes a breadcrumb lie.
 *   2. **Every entry belongs to exactly one step, or to the pre-step ramp.** Orphans are practice a
 *      learner can reach but never see on the map; doubles are a step claiming work that is not
 *      its own. The ramp is remedial, so it is owned by `PRE_STEP_RAMP`, not by Step 1's list.
 *   3. **Each depth owns one position per step, in spine order.** Step 3 is position 1 of every
 *      depth, step 10 position 8, or the matrix and the cards disagree again.
 *   4. **The breadcrumb prints the spine number and the depth**, never the old "Step 6 / 8".
 *   5. **No file in `app/src` spells a second step numbering.** A reintroduced `Step n / 8` or
 *      `stepNumber` field fails here rather than after a learner has read both numbers.
 *
 * Run: `node --experimental-strip-types scripts/test_spine.mjs` (also a suite in test_workbench)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import {
  PRE_STEP_RAMP,
  SPINE,
  SPINE_STEP_COUNT,
  columnHours,
  costLabel,
  entriesAtDepth,
  hoursRange,
  layerLabel,
  spineStepForEntry,
  stepAtDepth,
  stepBreadcrumb,
  stepCompleteAtDepth,
  stepCostLabel,
  stepForMilestone,
  stepLabel,
  sumHours,
} from '../app/src/spine.ts';
import { ALL_PASS_STEPS } from '../app/src/practiceLinks.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEPTHS = ['tier1', 'tier2', 'tier3'];
const ONRAMP_STEPS = 2;

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

check('ten steps, numbered 1..10 in order, each with a unique slug and title', () => {
  assert.equal(SPINE_STEP_COUNT, 10, 'the spine must be the ten steps the pages print');
  assert.deepEqual(
    SPINE.map((step) => step.number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    'step numbers must be contiguous and in route order; a gap or a repeat makes a breadcrumb lie'
  );
  const slugs = new Set(SPINE.map((step) => step.slug));
  const titles = new Set(SPINE.map((step) => step.title));
  assert.equal(slugs.size, 10, 'every step needs its own slug');
  assert.equal(titles.size, 10, 'every step needs its own title, or two cards read the same');
  for (const step of SPINE) {
    assert.ok(step.title.length > 3, `step ${step.number} has no title`);
    assert.ok(step.outcome.length > 10, `step ${step.number} has no outcome to promise`);
    assert.ok(step.start.endsWith('.md'), `step ${step.number} must start on a page`);
  }
});

check('every workbench entry belongs to exactly one step', () => {
  const seen = new Map();
  for (const step of SPINE) {
    for (const entry of step.entries) {
      const first = seen.get(entry.id);
      assert.equal(
        first,
        undefined,
        `${entry.id} is claimed by step ${first} and step ${step.number}; one entry, one step`
      );
      seen.set(entry.id, step.number);
    }
  }
  // The ramp sits before Step 1 and is remedial, so it is claimed by the pre-step list rather
  // than by a step's completion requirements - but it must still be claimed exactly once.
  for (const entry of PRE_STEP_RAMP) {
    assert.equal(entry.track, 'ramp', `${entry.id} is in the pre-step list but is not a ramp entry`);
    assert.equal(seen.get(entry.id), undefined, `${entry.id} is both a step entry and a ramp entry`);
  }
  const claimed = new Set([...seen.keys(), ...PRE_STEP_RAMP.map((entry) => entry.id)]);
  assert.equal(claimed.size, seen.size + PRE_STEP_RAMP.length, 'a ramp entry is listed twice');
  const orphans = PYTHON_LESSONS.filter((entry) => !claimed.has(entry.id)).map((entry) => entry.id);
  assert.deepEqual(orphans, [], 'these entries are runnable but neither a step nor the ramp lists them');
  assert.equal(seen.size + PRE_STEP_RAMP.length, PYTHON_LESSONS.length, 'every entry needs one owner');
  for (const entry of PYTHON_LESSONS) {
    if (PRE_STEP_RAMP.some((ramp) => ramp.id === entry.id)) continue;
    assert.equal(spineStepForEntry(entry.id)?.number, seen.get(entry.id));
  }
});

check('each depth owns one position per step 3-10, in spine order', () => {
  for (const step of SPINE.slice(0, ONRAMP_STEPS)) {
    assert.equal(stepAtDepth(step, 'tier1'), null, `step ${step.number} is the on-ramp: no depth`);
    assert.ok(step.entries.length > 0, `on-ramp step ${step.number} must still carry entries`);
  }
  for (const depth of DEPTHS) {
    const positions = ALL_PASS_STEPS.filter((candidate) => candidate.pass === depth);
    assert.equal(positions.length, 8, `depth ${depth} must have eight positions for steps 3-10`);
    SPINE.slice(ONRAMP_STEPS).forEach((step, index) => {
      const at = stepAtDepth(step, depth);
      assert.ok(at, `step ${step.number} has no position at depth ${depth}`);
      assert.equal(at.pass, depth);
      assert.equal(
        at.step.milestoneId,
        positions[index].step.milestoneId,
        `step ${step.number} must be position ${index + 1} of ${depth}`
      );
      assert.equal(stepAtDepth(step.number, depth)?.step.milestoneId, at.step.milestoneId);
      assert.equal(stepForMilestone(at.step.milestoneId)?.number, step.number);
    });
  }
});

check('the breadcrumb prints the spine number and the depth, never "of 8"', () => {
  const at = ALL_PASS_STEPS.find((candidate) => candidate.step.milestoneId === 't2_tr05');
  assert.ok(at, 'the depth position t2_tr05 must exist');
  assert.equal(
    stepBreadcrumb(at),
    'Step 8 of 10 · Depth 2',
    'the runner and the step card must print the same label for the same position'
  );
  for (const step of SPINE) {
    for (const depth of DEPTHS) {
      const found = stepAtDepth(step, depth);
      if (!found) continue;
      const crumb = stepBreadcrumb(found);
      assert.ok(
        crumb.startsWith(`Step ${step.number} of ${SPINE_STEP_COUNT} · Depth `),
        `breadcrumb "${crumb}" must name step ${step.number} of ${SPINE_STEP_COUNT}`
      );
      assert.ok(!/\d\s*\/\s*8/.test(crumb), `breadcrumb "${crumb}" still spells the old eight`);
    }
    assert.ok(
      stepLabel(step).startsWith(`Step ${step.number} of ${SPINE_STEP_COUNT} · ${step.title}`),
      `stepLabel for step ${step.number} must lead with its number`
    );
  }
});

check('every step prints its focused hours, and arm + depth is the total', () => {
  for (const step of SPINE) {
    const { arm, depth, total } = step.hours;
    assert.ok(
      total.high > 0,
      `step ${step.number} must cost more than zero focused hours; a zero is a missing sum`
    );
    assert.ok(
      Math.abs(arm.low + depth.low - total.low) < 1e-9 &&
        Math.abs(arm.high + depth.high - total.high) < 1e-9,
      `step ${step.number}: the arm and depth layers must add up to the step total`
    );
    assert.ok(
      arm.low <= arm.high && depth.low <= depth.high && total.low <= total.high,
      `step ${step.number}: an hour range must not run backwards`
    );
  }
  assert.equal(
    SPINE[0].hours.depth.high,
    0,
    'step 1 is the Python on-ramp and has no depth layer to cost'
  );
  assert.equal(
    SPINE[1].hours.depth.high,
    0,
    'step 2 is the circuits on-ramp and has no depth layer to cost'
  );
  assert.equal(
    stepCostLabel(SPINE[7]),
    '17–21 h · arm 6.5–10.5 h · depth 10.5 h',
    'the card and the runner must print the same cost line for the same step'
  );
  assert.ok(
    stepCostLabel(SPINE[0]).includes('on-ramp'),
    'the on-ramp must say it has one layer instead of printing a depth of zero hours'
  );
  assert.equal(
    stepCostLabel(SPINE[9]),
    '6.5–9 h · arm 6.5–9 h',
    'Step 10 is all arm work, but it is the capstone, not an on-ramp: a zero depth sum is not the test'
  );
  for (const step of SPINE.slice(ONRAMP_STEPS)) {
    assert.ok(
      !stepCostLabel(step).includes('on-ramp'),
      `step ${step.number} must not be labelled the on-ramp just because it has no depth hours`
    );
  }
});

check('each matrix column prices its own layer, and the footer adds up each column', () => {
  for (const step of SPINE) {
    const { arm, depth2, depth3, depth, total } = step.hours;
    for (const end of ['low', 'high']) {
      assert.ok(
        Math.abs(depth2[end] + depth3[end] - depth[end]) < 1e-9,
        `step ${step.number}: the Depth 2 and Depth 3 columns must add up to the depth pass`
      );
      assert.ok(
        Math.abs(arm[end] + depth[end] - total[end]) < 1e-9,
        `step ${step.number}: the arm column plus the two depth columns must add up to the total`
      );
      assert.ok(
        depth2[end] >= 0 && depth3[end] >= 0,
        `step ${step.number}: a column cannot cost negative hours`
      );
    }
  }
  // Step 8 is the control: 2 h + 2 h + 2 h of Tier 3 under one 4.5 h Tier 2 module.
  assert.equal(columnHours(SPINE[7].hours.arm), '6.5–10.5 h');
  assert.equal(columnHours(SPINE[7].hours.depth2), '4.5 h');
  assert.equal(columnHours(SPINE[7].hours.depth3), '6 h');
  assert.equal(
    columnHours(SPINE[9].hours.depth2),
    '—',
    'Step 10 has no Tier 2 modules, so its Depth 2 column is empty, not a free 0 h'
  );
  assert.equal(columnHours(SPINE[9].hours.depth3), '—', 'Step 10\'s only module is arm work');
  // The narrow matrix cell prints the total and its split on separate lines, from one spelling.
  assert.equal(layerLabel(SPINE[7].hours), 'arm 6.5–10.5 h · depth 10.5 h');
  assert.equal(
    layerLabel(SPINE[9].hours),
    'arm 6.5–9 h',
    'Step 10 must not claim a depth pass it does not have'
  );
  assert.equal(
    stepCostLabel(SPINE[7]),
    `${hoursRange(SPINE[7].hours.total)} · ${layerLabel(SPINE[7].hours)}`,
    'the card and the matrix must not spell the same cost two ways'
  );

  const rows = SPINE.filter((step) => step.number > 2);
  const totals = sumHours(rows);
  for (const layer of ['arm', 'depth2', 'depth3']) {
    for (const end of ['low', 'high']) {
      const fromRows = rows.reduce((sum, step) => sum + step.hours[layer][end], 0);
      assert.ok(
        Math.abs(totals[layer][end] - fromRows) < 1e-9,
        `the ${layer} footer must be the ${layer} cells above it added up`
      );
    }
  }
  assert.equal(
    Math.abs(totals.depth2.high + totals.depth3.high - totals.depth.high) < 1e-9,
    true,
    'the Depth 2 and Depth 3 footers must add up to the depth footer'
  );
});

check('the matrix footer totals the rows it prints, not a second hand-typed number', () => {
  const rows = SPINE.filter((step) => step.number > 2);
  assert.equal(rows.length, 8, 'the matrix compares Steps 3-10: the on-ramp has no depth columns');
  const sums = sumHours(rows);
  // Steps 1-2 are the on-ramp, so the footer is the ten-step total minus those two rows.
  const ten = sumHours(SPINE);
  for (const layer of ['arm', 'depth', 'total']) {
    for (const end of ['low', 'high']) {
      const onramp = SPINE[0].hours[layer][end] + SPINE[1].hours[layer][end];
      assert.ok(
        Math.abs(sums[layer][end] + onramp - ten[layer][end]) < 1e-9,
        `matrix footer ${layer}.${end} must be the ten-step total minus Steps 1-2`
      );
    }
  }
  assert.equal(
    costLabel(sums),
    '169.85–214.5 h · arm 89.85–134.5 h · depth 80 h',
    'the matrix footer must print the same spelled-out layers as the step cards'
  );
  assert.ok(
    !/\d\.\d{3,}/.test(costLabel(sums)),
    'the footer must print rounded hours (two decimals), not a float artifact like 169.84999999999997'
  );
});

check('a step is complete only when every entry it lists has been verified', () => {
  const step = SPINE[5];
  const entries = entriesAtDepth(step, 'tier1');
  assert.ok(entries.length > 1, 'step 6 must list more than one entry at depth 1');
  const all = Object.fromEntries(entries.map((entry) => [entry.id, true]));
  assert.equal(stepCompleteAtDepth(step, 'tier1', all), true);
  const missing = { ...all };
  delete missing[entries[0].id];
  assert.equal(
    stepCompleteAtDepth(step, 'tier1', missing),
    false,
    'one unverified entry must keep the step open'
  );
});

check('no file in app/src spells a second step numbering', () => {
  const banned = [
    [/Step\s+\d+\s*\/\s*8\b/, 'a "Step n / 8" label; print the spine number instead'],
    [/STEP\s+\{[^}]*\}\s+OF\s+8\b/, 'an "OF 8" lattice column; steps are 1..10'],
    [/\bstepNumber\b/, 'a per-step number field; the spine owns the number'],
  ];
  // Comments are allowed to describe the numbering they replaced; only code may not print it.
  const stripComments = (text) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        const text = stripComments(fs.readFileSync(full, 'utf8'));
        for (const [pattern, why] of banned) {
          const hit = pattern.exec(text);
          if (hit) offenders.push(`${path.relative(ROOT, full)}: ${why}`);
        }
      }
    }
  };
  walk(path.join(ROOT, 'app', 'src'));
  assert.deepEqual(offenders, [], offenders.join('\n       '));
});

if (failed) {
  console.error(`\n${failed} of ${passed + failed} spine checks failed`);
  process.exitCode = 1;
} else {
  console.log(`\nall ${passed} spine checks passed`);
}
