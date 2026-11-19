#!/usr/bin/env node
/**
 * The new-learner guide's coverage contract (`scripts/test_learner_guide.mjs`, `npm run test:guide`).
 *
 * The guide is only useful if it stays complete. This suite makes completeness a build gate:
 * every tab in `app/src/data/workbenchTabs.json` must appear in a step's `tabs` list, or be named
 * in `GUIDE_TAB_EXEMPTIONS` with a reason. Add a tab without thinking about the guide and this
 * suite fails with the tab's name and both ways to fix it.
 *
 * It also pins the state machine a learner feels: stop midway and resume at the same step, finish
 * and start over, never resume past the last step, and survive a malformed or blocked store.
 *
 * Run: node --experimental-strip-types scripts/test_learner_guide.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GUIDE_STEP_COUNT,
  GUIDE_TAB_EXEMPTIONS,
  GUIDE_VISUALS,
  LEARNER_GUIDE,
  dismissGuideState,
  guideAnnouncement,
  initialGuideState,
  jumpToGuideStep,
  nextGuideState,
  previousGuideState,
  readGuideState,
  restartGuideState,
  resumeGuideState,
  writeGuideState,
} from '../app/src/learnerGuide.ts';

const tabsDoc = JSON.parse(
  fs.readFileSync(new URL('../app/src/data/workbenchTabs.json', import.meta.url), 'utf8')
);
const TAB_IDS = Object.keys(tabsDoc.tabs);
const SETTINGS_SOURCE = fs.readFileSync(
  new URL('../app/src/components/GeneralSettingsPanel.tsx', import.meta.url),
  'utf8'
);

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

function memoryStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

console.log('\nEvery tab is considered');

check('the tab registry is the guide’s source of truth', () => {
  assert.ok(TAB_IDS.length >= 16, 'the registry should still carry the whole workbench');
  assert.ok(!TAB_IDS.includes('undefined'));
});

check('every workbench tab is covered by a step or an explained exemption', () => {
  const covered = new Set(LEARNER_GUIDE.flatMap((step) => step.tabs));
  for (const tab of TAB_IDS) {
    if (covered.has(tab)) continue;
    const exemption = GUIDE_TAB_EXEMPTIONS[tab];
    assert.ok(
      typeof exemption === 'string' && exemption.trim().length >= 12,
      `The workbench tab "${tab}" is not in the new-learner guide. Add it to a step's \`tabs\` in app/src/learnerGuide.ts, or add it to GUIDE_TAB_EXEMPTIONS with a reason.`
    );
  }
});

check('an exemption cannot also claim a step, and cannot name a missing tab', () => {
  const covered = new Set(LEARNER_GUIDE.flatMap((step) => step.tabs));
  for (const [tab, reason] of Object.entries(GUIDE_TAB_EXEMPTIONS)) {
    assert.ok(TAB_IDS.includes(tab), `the exemption "${tab}" is not a workbench tab any more`);
    assert.ok(!covered.has(tab), `"${tab}" is both covered and exempt; pick one`);
    assert.ok(reason.trim().length >= 12, `the exemption for "${tab}" needs a real reason`);
  }
});

check('a step cannot point at a tab that does not exist', () => {
  for (const step of LEARNER_GUIDE) {
    for (const tab of step.tabs) {
      assert.ok(TAB_IDS.includes(tab), `step "${step.id}" names unknown tab "${tab}"`);
    }
    if (step.action) {
      assert.ok(TAB_IDS.includes(step.action.tab), `step "${step.id}" action names "${step.action.tab}"`);
    }
  }
});

console.log('\nEvery step is complete');

check('the guide is a real tour, not a placeholder', () => {
  assert.ok(GUIDE_STEP_COUNT >= 10, `expected at least 10 steps, found ${GUIDE_STEP_COUNT}`);
  assert.equal(GUIDE_STEP_COUNT, LEARNER_GUIDE.length);
  assert.ok(guideAnnouncement(0).includes('1 of'));
});

check('ids, copy, points, visuals and labels are all present and unique', () => {
  const ids = new Set();
  for (const step of LEARNER_GUIDE) {
    assert.ok(!ids.has(step.id), `duplicate step id "${step.id}"`);
    ids.add(step.id);
    assert.match(step.id, /^[a-z][a-z0-9-]+$/, `step id "${step.id}" should be a slug`);
    assert.ok(step.short.trim().length > 0, `"${step.id}" needs a rail label`);
    assert.ok(step.short.length <= 12, `"${step.id}" rail label is too long`);
    assert.ok(step.eyebrow.trim().length > 0, `"${step.id}" needs an eyebrow`);
    assert.ok(step.title.trim().length > 8, `"${step.id}" needs a real title`);
    assert.ok(step.body.trim().length > 80, `"${step.id}" needs a real explanation`);
    assert.ok(step.points.length >= 2 && step.points.length <= 4, `"${step.id}" needs 2–4 points`);
    assert.ok(GUIDE_VISUALS.includes(step.visual), `"${step.id}" has unknown visual "${step.visual}"`);
  }
});

check('the guide includes the native math it now teaches', () => {
  const calculator = LEARNER_GUIDE.find((step) => step.visual === 'calculator');
  assert.ok(calculator, 'the guide needs the calculator/instruments step');
  assert.match(calculator.body, /fraction/i);
  assert.match(calculator.body, /graph/i);
  assert.match(calculator.points.join(' '), /sin\(x\)/);
});

console.log('\nStopping and resuming');

check('a first open starts at step one', () => {
  const state = initialGuideState(100);
  assert.equal(state.status, 'not-started');
  assert.equal(state.stepIndex, 0);
  assert.equal(resumeGuideState(state, 200).status, 'active');
  assert.equal(resumeGuideState(state, 200).stepIndex, 0);
});

check('Next advances, Previous clamps, and the last Next completes', () => {
  let state = resumeGuideState(initialGuideState(0), 0);
  state = nextGuideState(state, 1);
  assert.equal(state.stepIndex, 1);
  state = previousGuideState(state, 2);
  assert.equal(state.stepIndex, 0);
  state = previousGuideState(state, 3);
  assert.equal(state.stepIndex, 0, 'Previous at the first step stays put');

  const almostDone = jumpToGuideStep(state, GUIDE_STEP_COUNT - 1, 4);
  const finished = nextGuideState(almostDone, 5);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.stepIndex, GUIDE_STEP_COUNT - 1);
});

check('turning off midway resumes on the same step, while finishing restarts', () => {
  const midway = jumpToGuideStep(resumeGuideState(initialGuideState(0), 0), 6, 1);
  const off = dismissGuideState(midway, 2);
  assert.equal(off.status, 'dismissed');
  assert.equal(off.stepIndex, 6);
  assert.equal(resumeGuideState(off, 3).stepIndex, 6);

  const done = nextGuideState(jumpToGuideStep(off, GUIDE_STEP_COUNT - 1, 4), 5);
  assert.equal(done.status, 'completed');
  assert.equal(resumeGuideState(done, 6).stepIndex, 0, 'a finished guide starts from the top');
});

check('a jump cannot leave the list', () => {
  const state = initialGuideState(0);
  assert.equal(jumpToGuideStep(state, -4).stepIndex, 0);
  assert.equal(jumpToGuideStep(state, 999).stepIndex, GUIDE_STEP_COUNT - 1);
  assert.equal(restartGuideState(state).stepIndex, 0);
});

check('the saved state round-trips through a store', () => {
  const store = memoryStore();
  const state = dismissGuideState(jumpToGuideStep(resumeGuideState(initialGuideState(0), 0), 4, 1), 2);
  writeGuideState(state, store);
  const loaded = readGuideState(store);
  assert.equal(loaded.status, 'dismissed');
  assert.equal(loaded.stepIndex, 4);
});

check('a malformed or blocked store never breaks the guide', () => {
  const broken = memoryStore({ mechalab_new_learner_guide_v1: '{nope' });
  assert.equal(readGuideState(broken).status, 'not-started');
  const nonsense = memoryStore({ mechalab_new_learner_guide_v1: JSON.stringify({ status: 'x', stepIndex: 9e9 }) });
  const normalized = readGuideState(nonsense);
  assert.equal(normalized.status, 'not-started');
  assert.equal(normalized.stepIndex, GUIDE_STEP_COUNT - 1);
  assert.doesNotThrow(() =>
    writeGuideState(initialGuideState(0), {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    })
  );
});

console.log('\nThe door stays wired');

check('General settings has the guide button and opens the event', () => {
  assert.match(SETTINGS_SOURCE, /data-testid="btn-open-new-learner-guide"/);
  assert.match(SETTINGS_SOURCE, /openLearnerGuide\(\)/);
  assert.match(SETTINGS_SOURCE, /learnerGuideDoor/);
  assert.match(SETTINGS_SOURCE, /onClose\(\);/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
