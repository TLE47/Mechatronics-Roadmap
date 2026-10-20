#!/usr/bin/env node
/**
 * The spine, checked as one claim: a learner sees the same step number everywhere.
 *
 * `app/src/spine.ts` joins two registries that used to number the course separately - the ten
 * steps `scripts/route_model.py` declares for the pages, and the three depth passes (eight track
 * positions each) the roadmap rendered - plus the 86 workbench entries. `spineData.ts` is generated
 * from the model by `scripts/generate_spine_data.py --check`, so the data side is already guarded.
 * What this file guards is the join and the spellings:
 *
 *   1. **Ten steps, numbered 1..10 once.** Any gap, repeat or reorder makes a breadcrumb lie.
 *   2. **Every entry belongs to exactly one step.** Orphans are practice a learner can reach but
 *      never see on the map; doubles are a step claiming work that is not its own.
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
  SPINE,
  SPINE_STEP_COUNT,
  entriesAtDepth,
  spineStepForEntry,
  stepAtDepth,
  stepBreadcrumb,
  stepCompleteAtDepth,
  stepCostLabel,
  stepForMilestone,
  stepLabel,
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
  const orphans = PYTHON_LESSONS.filter((entry) => !seen.has(entry.id)).map((entry) => entry.id);
  assert.deepEqual(orphans, [], 'these entries are runnable but no step lists them');
  assert.equal(seen.size, PYTHON_LESSONS.length, 'the spine must claim all 86 entries once');
  for (const entry of PYTHON_LESSONS) {
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
