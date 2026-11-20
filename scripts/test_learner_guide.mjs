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
import {
  FEATURE_WALKTHROUGH,
  FEATURE_WALKTHROUGH_COUNT,
  FEATURE_WALKTHROUGH_STORAGE_KEY,
  FEATURE_WALKTHROUGH_VERSION,
  WALKTHROUGH_ACTIONS,
  completeWalkthroughStop,
  dismissWalkthroughState,
  initialWalkthroughState,
  nextWalkthroughState,
  previousWalkthroughState,
  readWalkthroughState,
  resetWalkthroughState,
  resumeWalkthroughState,
  walkthroughAction,
  walkthroughAnnouncement,
  walkthroughCheckedCount,
  writeWalkthroughState,
} from '../app/src/featureWalkthrough.ts';
import {
  GUIDE_REOPEN_STORAGE_KEY,
  readGuideReopen,
  writeGuideReopen,
} from '../app/src/learnerGuideDoor.ts';

const tabsDoc = JSON.parse(
  fs.readFileSync(new URL('../app/src/data/workbenchTabs.json', import.meta.url), 'utf8')
);
const TAB_IDS = Object.keys(tabsDoc.tabs);
const SETTINGS_SOURCE = fs.readFileSync(
  new URL('../app/src/components/GeneralSettingsPanel.tsx', import.meta.url),
  'utf8'
);
const GUIDE_SOURCE = fs.readFileSync(
  new URL('../app/src/components/LearnerGuide.tsx', import.meta.url),
  'utf8'
);
const WALKTHROUGH_SOURCE = fs.readFileSync(
  new URL('../app/src/components/FeatureWalkthrough.tsx', import.meta.url),
  'utf8'
);

/** Every TypeScript source under `app/src`, so an anchor can be checked against the real markup. */
function appSources(directory = new URL('../app/src/', import.meta.url)) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) files.push(...appSources(child));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(fs.readFileSync(child, 'utf8'));
  }
  return files;
}

const APP_TEST_IDS = new Set();
for (const text of appSources()) {
  for (const match of text.matchAll(/data-testid="([^"]+)"/g)) APP_TEST_IDS.add(match[1]);
  // A widget that builds its id from a base plus an optional page suffix is still declaring the
  // base id: the sound control does this in `AudioPlayerWidget.tsx`, so read its `tid(...)` calls.
  for (const call of text.matchAll(/\btid\(([^)]*)\)/g)) {
    for (const id of call[1].matchAll(/'([^']+)'/g)) APP_TEST_IDS.add(id[1]);
  }
}

/** Test ids built from a map rather than written literally in the markup. */
const DYNAMIC_TEST_IDS = [
  /^tab-btn-tab-/,
  /^btn-pass-/,
  /^layout-(study|read|write|debug)$/,
  /^editor-tab-/,
  /^calculator-mode-/,
];
const isKnownTestId = (id) =>
  APP_TEST_IDS.has(id) || DYNAMIC_TEST_IDS.some((pattern) => pattern.test(id));

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

check('the guide reopens by default, and both doors can turn that off', () => {
  assert.equal(readGuideReopen(memoryStore()), true, 'a device with no record is a new learner');
  const store = memoryStore();
  writeGuideReopen(false, store);
  assert.equal(store.getItem(GUIDE_REOPEN_STORAGE_KEY), '0');
  assert.equal(readGuideReopen(store), false);
  writeGuideReopen(true, store);
  assert.equal(readGuideReopen(store), true);
  assert.equal(
    readGuideReopen({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    }),
    true,
    'a blocked store keeps the default rather than hiding the guide'
  );
  assert.match(SETTINGS_SOURCE, /data-testid="btn-guide-reopen"/);
  assert.match(SETTINGS_SOURCE, /writeGuideReopen/);
  assert.match(GUIDE_SOURCE, /data-testid="guide-reopen-checklist"/);
  assert.match(GUIDE_SOURCE, /readGuideReopen/);
});

console.log('\nThe tooltip walkthrough covers the workbench');

check('the walkthrough is a real catalogue, not a second slideshow', () => {
  assert.ok(FEATURE_WALKTHROUGH_COUNT >= 30, `expected at least 30 features, found ${FEATURE_WALKTHROUGH_COUNT}`);
  assert.equal(FEATURE_WALKTHROUGH_COUNT, FEATURE_WALKTHROUGH.length);
  assert.match(walkthroughAnnouncement(0), /^Feature 1 of/);
});

check('every workbench tab has a walkthrough stop', () => {
  const covered = new Set(FEATURE_WALKTHROUGH.flatMap((stop) => (stop.tab ? [stop.tab] : [])));
  for (const tab of TAB_IDS) {
    assert.ok(
      covered.has(tab),
      `The feature walkthrough has no stop for "${tab}". Add one with \`tab: '${tab}'\` in app/src/featureWalkthrough.ts.`
    );
  }
  for (const stop of FEATURE_WALKTHROUGH) {
    if (!stop.tab) continue;
    assert.ok(TAB_IDS.includes(stop.tab), `stop "${stop.id}" opens unknown tab "${stop.tab}"`);
  }
});

check('walkthrough ids, copy, features and anchors are complete', () => {
  const ids = new Set();
  for (const stop of FEATURE_WALKTHROUGH) {
    assert.ok(!ids.has(stop.id), `duplicate walkthrough id "${stop.id}"`);
    ids.add(stop.id);
    assert.match(stop.id, /^[a-z][a-z0-9-]+$/, `walkthrough id "${stop.id}" should be a slug`);
    assert.ok(stop.section.trim().length > 0, `"${stop.id}" needs a section`);
    assert.ok(stop.title.trim().length > 8, `"${stop.id}" needs a real title`);
    assert.ok(stop.body.trim().length > 60, `"${stop.id}" needs a real explanation`);
    assert.ok(
      stop.features.length >= 2 && stop.features.length <= 6,
      `"${stop.id}" needs 2–6 feature lines`
    );
    for (const feature of stop.features) {
      assert.ok(feature.trim().length > 20, `"${stop.id}" has a feature line that is too thin`);
    }
    assert.ok(stop.anchors.length >= 1, `"${stop.id}" needs at least one anchor`);
  }
});

check('every walkthrough anchor names a control that exists in the app', () => {
  for (const stop of FEATURE_WALKTHROUGH) {
    for (const anchor of stop.anchors) {
      const match = /^\[data-testid="([^"]+)"\]$/.exec(anchor);
      assert.ok(match, `"${stop.id}" has an anchor that is not a test-id selector: ${anchor}`);
      assert.ok(
        isKnownTestId(match[1]),
        `"${stop.id}" points at "${match[1]}", which no source file declares. Fix the test id or the anchor.`
      );
    }
  }
});

check('a stop with no target still reads, and no anchor is empty', () => {
  for (const stop of FEATURE_WALKTHROUGH) {
    assert.ok(stop.anchors.every((anchor) => anchor.trim().length > 0));
  }
});

check('every stop names one exact control that performs its task', () => {
  assert.equal(
    Object.keys(WALKTHROUGH_ACTIONS).length,
    FEATURE_WALKTHROUGH_COUNT,
    'the action list and the catalogue must have the same number of stops'
  );
  const signatures = new Set();
  const broadPanel = /\b(runner-toolbar|editor-panes|editor-panel|results-column|lesson-reader|calculator-pane|graphing-pane)\b/;
  for (const stop of FEATURE_WALKTHROUGH) {
    const action = walkthroughAction(stop.id);
    assert.ok(action, `"${stop.id}" has no action; the checklist needs an exact control`);
    assert.ok(action.label.trim().length > 12, `"${stop.id}" needs a real task sentence`);
    assert.match(action.label, /\.$/, `"${stop.id}" task should be a sentence`);
    assert.ok(action.selectors.length > 0, `"${stop.id}" needs a real control`);
    const signature = action.selectors.join(' | ');
    assert.ok(!signatures.has(signature), `"${stop.id}" reuses another stop's action`);
    signatures.add(signature);
    const assertControls = (selectors, role) => {
      for (const selector of selectors) {
        assert.ok(selector.trim().startsWith('['), `"${stop.id}" ${role} should be a selector`);
        assert.ok(!broadPanel.test(selector), `"${stop.id}" must not score from a whole panel: ${selector}`);
        for (const match of selector.matchAll(/data-testid="([^"]+)"/g)) {
          assert.ok(
            isKnownTestId(match[1]),
            `"${stop.id}" asks for "${match[1]}", which no source file declares`
          );
        }
      }
    };
    assertControls(action.selectors, 'action');
    if (action.reveal) {
      assert.ok(action.reveal.length > 0, `"${stop.id}" reveal needs a control`);
      assert.notDeepEqual(action.reveal, action.selectors, `"${stop.id}" reveal cannot be the action`);
      assertControls(action.reveal, 'reveal');
    }
    if (action.opensTab) {
      assert.ok(stop.tab, `"${stop.id}" can only open a tab when it names one`);
      assert.ok(
        action.selectors.includes(`[data-testid="tab-btn-${stop.tab}"]`),
        `"${stop.id}" opens a tab, so its action must be that tab`
      );
    }
  }
});

check('the feature copy does not pin a release number that will age', () => {
  const copy = FEATURE_WALKTHROUGH.flatMap((stop) => stop.features).join('\n');
  assert.doesNotMatch(copy, /\b\d+\.\d+\.\d+ today\b/);
});

check('stopping midway resumes the same feature; finishing starts over', () => {
  let state = resumeWalkthroughState(initialWalkthroughState(0), 0);
  state = nextWalkthroughState(state, 1);
  state = nextWalkthroughState(state, 2);
  assert.equal(state.index, 2);
  state = previousWalkthroughState(state, 3);
  assert.equal(state.index, 1);
  state = previousWalkthroughState(state, 4);
  state = previousWalkthroughState(state, 5);
  assert.equal(state.index, 0, 'Back at the first feature stays put');

  const off = dismissWalkthroughState(nextWalkthroughState(state, 6), 7);
  assert.equal(off.status, 'dismissed');
  assert.equal(off.index, 1);
  assert.equal(resumeWalkthroughState(off, 8).index, 1, 'turning it off keeps the place');

  let last = off;
  while (last.index < FEATURE_WALKTHROUGH_COUNT - 1) last = nextWalkthroughState(last, 9);
  const finished = nextWalkthroughState(last, 10);
  assert.equal(finished.status, 'completed');
  assert.equal(resumeWalkthroughState(finished, 11).index, 0, 'a finished tour starts from the top');
  assert.deepEqual(
    resumeWalkthroughState(finished, 11).completed,
    [],
    'a finished tour starts with a fresh checklist'
  );
});

check('the checklist records each stop once and remembers the ticks', () => {
  let state = resumeWalkthroughState(initialWalkthroughState(0), 0);
  assert.equal(walkthroughCheckedCount(state), 0);
  assert.equal(walkthroughCheckedCount(completeWalkthroughStop(state, 'brand', 1)), 1);
  state = completeWalkthroughStop(state, 'brand', 1);
  const again = completeWalkthroughStop(state, 'brand', 2);
  assert.equal(again, state, 'a second click must not score twice');
  assert.equal(again.completed.length, 1);
  state = completeWalkthroughStop(again, 'settings', 3);
  assert.deepEqual(state.completed, ['brand', 'settings']);
  const store = memoryStore();
  writeWalkthroughState(state, store);
  assert.deepEqual(readWalkthroughState(store).completed, ['brand', 'settings']);
  assert.equal(walkthroughCheckedCount(readWalkthroughState(store)), 2);
});

check('a checklist saved under the old action rules is not trusted', () => {
  const store = memoryStore({
    [FEATURE_WALKTHROUGH_STORAGE_KEY]: JSON.stringify({
      ...initialWalkthroughState(0),
      version: 2,
      index: 5,
      completed: ['brand', 'settings'],
    }),
  });
  const loaded = readWalkthroughState(store);
  assert.equal(loaded.version, FEATURE_WALKTHROUGH_VERSION);
  assert.equal(loaded.index, 5, 'the learner still resumes where they were');
  assert.deepEqual(loaded.completed, [], 'ticks earned by the old free-pass card are not carried over');
});

check('the walkthrough state round-trips and survives a broken store', () => {
  const store = memoryStore();
  writeWalkthroughState(dismissWalkthroughState(nextWalkthroughState(resumeWalkthroughState(initialWalkthroughState(0), 0), 1), 2), store);
  const loaded = readWalkthroughState(store);
  assert.equal(loaded.status, 'dismissed');
  assert.equal(loaded.index, 1);

  const broken = memoryStore({ [FEATURE_WALKTHROUGH_STORAGE_KEY]: '{nope' });
  assert.equal(readWalkthroughState(broken).index, 0);
  assert.doesNotThrow(() =>
    writeWalkthroughState(initialWalkthroughState(0), {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    })
  );
});

check('Reset points clears the checklist and returns to the first stop', () => {
  let state = resumeWalkthroughState(initialWalkthroughState(0), 0);
  state = completeWalkthroughStop(state, 'brand', 1);
  state = completeWalkthroughStop(state, 'settings', 2);
  state = nextWalkthroughState(state, 3);
  assert.equal(walkthroughCheckedCount(state), 2);
  const reset = resetWalkthroughState(4);
  assert.equal(reset.index, 0);
  assert.equal(reset.status, 'active');
  assert.deepEqual(reset.completed, []);
  assert.equal(walkthroughCheckedCount(reset), 0);
  const store = memoryStore();
  writeWalkthroughState(reset, store);
  assert.deepEqual(readWalkthroughState(store).completed, []);
  assert.equal(readWalkthroughState(store).index, 0);
});

check('the walkthrough points instead of pressing, and stays until its own close', () => {
  assert.match(WALKTHROUGH_SOURCE, /data-testid="walkthrough-reset"/);
  assert.doesNotMatch(WALKTHROUGH_SOURCE, /walkthrough-do-it/);
  assert.match(WALKTHROUGH_SOURCE, /data-testid="walkthrough-close"/);
  // No scrim and no scroll lock: a misclick belongs to the page, not to the tour.
  assert.doesNotMatch(WALKTHROUGH_SOURCE, /bg-\[rgba\(4,8,11/);
  assert.doesNotMatch(WALKTHROUGH_SOURCE, /document\.body\.style\.overflow/);
  // The window a stop opens is cleared again before the next stop needs the stage.
  assert.match(WALKTHROUGH_SOURCE, /clearDialogsOpenedSince/);
  assert.match(WALKTHROUGH_SOURCE, /SURFACE_CLEAR_DELAY/);
});

check('the guide offers both modes and the walkthrough callback', () => {
  assert.match(GUIDE_SOURCE, /data-testid="guide-mode-steps"/);
  assert.match(GUIDE_SOURCE, /data-testid="guide-mode-walkthrough"/);
  assert.match(GUIDE_SOURCE, /onWalkthrough/);
  assert.match(GUIDE_SOURCE, /FEATURE_WALKTHROUGH_COUNT/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
