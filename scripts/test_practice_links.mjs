#!/usr/bin/env node
/**
 * The roadmap <-> workbench join, checked without a browser.
 *
 * `practiceLinks.ts` derives a step's practice from the two registries the app already renders
 * (curriculumData for the roadmap, pythonLessonsData for the runner). The failures that matter:
 *
 * 1. **An orphan entry** - a workbench lesson no roadmap step or on-ramp claims, so the runner
 *    cannot say where it belongs and the roadmap silently omits work the route requires.
 * 2. **A double claim** - one entry listed under two steps, so a learner's pass count would move
 *    two progress bars at once.
 * 3. **A wrong step** - the breadcrumb naming a different pass from the one the entry's own
 *    `EX.<track>.T<tier>` id encodes.
 * 4. **A count that is not evidence** - `verifiedForStep` counting anything but executed passes.
 *
 *   node --experimental-strip-types scripts/test_practice_links.mjs
 */

import assert from 'node:assert/strict';
import {
  ALL_PASS_STEPS,
  ONRAMP_ENTRIES,
  entriesForStep,
  firstUnverifiedEntry,
  onrampVerified,
  roadmapStepForLesson,
  verifiedForStep,
} from '../app/src/practiceLinks.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

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

const stepById = (milestoneId) => {
  const found = ALL_PASS_STEPS.find(({ step }) => step.milestoneId === milestoneId);
  assert.ok(found, `no roadmap step named ${milestoneId}`);
  return found;
};

check('every workbench entry belongs to exactly one step or the on-ramp', () => {
  const claims = new Map();
  for (const entry of ONRAMP_ENTRIES) claims.set(entry.id, 'on-ramp');
  // The school-maths ramp runs before Step 1 and is remedial - the Tier 1 exit check sends a miss
  // here - so it is runnable in the runner without being a rung on the roadmap or a requirement
  // of the Python on-ramp. It is still claimed, once, so an orphan stays a failure.
  for (const entry of PYTHON_LESSONS.filter((candidate) => candidate.track === 'ramp')) {
    assert.ok(!claims.has(entry.id), `${entry.id} is claimed twice`);
    claims.set(entry.id, 'school-maths ramp');
  }
  for (const { step } of ALL_PASS_STEPS) {
    for (const entry of entriesForStep(step)) {
      assert.ok(
        !claims.has(entry.id),
        `${entry.id} is claimed by both ${claims.get(entry.id)} and ${step.milestoneId}`
      );
      claims.set(entry.id, step.milestoneId);
    }
  }
  const orphans = PYTHON_LESSONS.filter((entry) => !claims.has(entry.id)).map((entry) => entry.id);
  assert.deepEqual(orphans, [], `entries no roadmap step claims: ${orphans.join(', ')}`);
  assert.equal(claims.size, PYTHON_LESSONS.length, 'every entry must be claimed once');
});

check('a Level 0 step gets the one Stage 0 entry, and the rest say there is none', () => {
  assert.deepEqual(
    entriesForStep(stepById('l0_m1').step).map((entry) => entry.id),
    ['S0.0'],
    'the bench on-ramp starts with the Stage 0 entry'
  );
  assert.deepEqual(
    entriesForStep(stepById('l0_m2').step),
    [],
    'a bench step with no entry must return an empty list, not a neighbour\'s entry'
  );
});

check('Tier 1 Track 00 lists its three readings and five Tier 1 modules', () => {
  assert.deepEqual(entriesForStep(stepById('t1_tr00').step).map((entry) => entry.id), [
    '00.1',
    '00.2',
    '00.3',
    'EX.00-foundations.T1.00a',
    'EX.00-foundations.T1.00b',
    'EX.00-foundations.T1.00c',
    'EX.00-foundations.T1.00d',
    'EX.00-foundations.T1.00e',
  ]);
});

check('Tier 2 and Tier 3 steps take their own pass only', () => {
  const tier2 = entriesForStep(stepById('t2_tr00').step).map((entry) => entry.id);
  assert.equal(tier2.length, 10, 'Track 00 Tier 2 has ten modules');
  assert.ok(tier2.every((id) => /\.T2\./.test(id)), 'a Tier 2 step must not list Tier 1 or 3 work');
  const tier3 = entriesForStep(stepById('t3_tr00').step).map((entry) => entry.id);
  assert.deepEqual(tier3, ['EX.00-foundations.T3.00a']);
});

check('the step written as "Track 06 & 07" claims both tracks, and the capstone claims 08', () => {
  const combined = entriesForStep(stepById('t1_tr06').step).map((entry) => entry.id);
  assert.ok(combined.includes('06.1'), 'Track 06 reading belongs to the combined step');
  assert.ok(combined.includes('07.1'), 'Track 07 reading belongs to the combined step');
  assert.equal(roadmapStepForLesson('EX.07-systems.T1.07a').step.milestoneId, 't1_tr06');
  const capstone = entriesForStep(stepById('t1_tr08').step).map((entry) => entry.id);
  assert.deepEqual(capstone, ['08.1'], 'the eighth step is Track 08, not Track 07');
});

check('the entry id names the depth position that serves it', () => {
  const found = roadmapStepForLesson('EX.05-control.T2.05a');
  assert.ok(found, 'a graded module must name its roadmap step');
  assert.equal(found.pass, 'tier2');
  assert.equal(found.step.milestoneId, 't2_tr05');
  // The label it prints is the spine's job now: `scripts/test_spine.mjs` owns that check, so this
  // suite does not keep a second copy of the same string.
  assert.equal(roadmapStepForLesson('P.1'), null, 'the Python on-ramp is not a pass step');
});

check('the running count is verified passes, not ticks', () => {
  const { step } = stepById('t1_tr00');
  assert.equal(verifiedForStep(step, {}), 0);
  assert.equal(verifiedForStep(step, { '00.1': true, 'EX.00-foundations.T1.00c': true }), 2);
  assert.equal(
    verifiedForStep(step, { '00.1': true, 'not-an-entry': true }),
    1,
    'an id outside the step must not move its count'
  );
  assert.equal(onrampVerified({ 'P.1': true }), 1);
});

check('"open the next one" skips what is already passed and never returns null for a step with work', () => {
  const { step } = stepById('t1_tr00');
  const next = firstUnverifiedEntry(step, { '00.1': true, '00.2': true });
  assert.equal(next.id, '00.3');
  assert.ok(firstUnverifiedEntry(stepById('l0_m1').step, {}), 'a step with one entry still has one');
  assert.equal(firstUnverifiedEntry(stepById('l0_m2').step, {}), null);
});

check('all 27 pass steps exist, with unique milestone ids', () => {
  assert.equal(ALL_PASS_STEPS.length, 27, '3 bench steps + 8 tracks across three passes');
  assert.equal(
    new Set(ALL_PASS_STEPS.map(({ step }) => step.milestoneId)).size,
    ALL_PASS_STEPS.length,
    'two steps share a milestone id, so one tick would complete both'
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
