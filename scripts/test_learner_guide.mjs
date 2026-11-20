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
  FEATURE_WALKTHROUGH_SECTIONS,
  FEATURE_WALKTHROUGH_STORAGE_KEY,
  FEATURE_WALKTHROUGH_VERSION,
  WALKTHROUGH_ACTIONS,
  completeWalkthroughStop,
  dismissWalkthroughState,
  entryWalkthroughState,
  initialWalkthroughState,
  nextWalkthroughState,
  previousWalkthroughState,
  readWalkthroughState,
  resetWalkthroughState,
  resumeWalkthroughState,
  walkthroughAction,
  walkthroughAnnouncement,
  walkthroughCheckedCount,
  walkthroughIndicesForTab,
  walkthroughOpenerStep,
  walkthroughSectionAt,
  writeWalkthroughState,
} from '../app/src/featureWalkthrough.ts';
import { WALKTHROUGH_TAB_COUNTS } from '../app/src/walkthroughTabs.ts';
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
const HEADER_SOURCE = fs.readFileSync(
  new URL('../app/src/components/Header.tsx', import.meta.url),
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
  /^tab-picker-item-/,
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

check('the walkthrough is split into contiguous chapters that cover every stop', () => {
  assert.ok(
    FEATURE_WALKTHROUGH_SECTIONS.length >= 3,
    'the catalogue needs at least three chapters so a beginner is not handed the whole tour at once'
  );
  let nextFirst = 0;
  for (const section of FEATURE_WALKTHROUGH_SECTIONS) {
    assert.equal(section.first, nextFirst, `chapter "${section.name}" must start where the last one ended`);
    assert.ok(section.count > 0, `chapter "${section.name}" has no stops`);
    assert.ok(section.short.trim().length > 0, `chapter "${section.name}" needs a short name`);
    for (let index = section.first; index < section.first + section.count; index += 1) {
      assert.equal(FEATURE_WALKTHROUGH[index].section, section.name);
      assert.equal(walkthroughSectionAt(index).name, section.name);
    }
    nextFirst += section.count;
  }
  assert.equal(
    nextFirst,
    FEATURE_WALKTHROUGH_COUNT,
    'every stop must belong to one chapter; a gap would hide stops from the section rail'
  );
});

check('the header page-tour map is derived from the same catalogue', () => {
  const derived = {};
  for (const stop of FEATURE_WALKTHROUGH) {
    if (!stop.tab) continue;
    derived[stop.tab] = (derived[stop.tab] ?? 0) + 1;
  }
  assert.deepEqual(
    { ...WALKTHROUGH_TAB_COUNTS },
    derived,
    'app/src/walkthroughTabs.ts drifted from the catalogue; update both or derive the map'
  );
  for (const [tab, count] of Object.entries(WALKTHROUGH_TAB_COUNTS)) {
    assert.equal(
      walkthroughIndicesForTab(tab).length,
      count,
      `the page tour for "${tab}" would walk a different number of stops`
    );
  }
  // Every workbench tab is a page a learner can open, so every one must have a page tour. The map
  // is partial only so an added tab does not grant the header an empty door by accident: this
  // assertion makes that addition fail loudly instead.
  assert.deepEqual(
    Object.keys(WALKTHROUGH_TAB_COUNTS).sort(),
    [...TAB_IDS].sort(),
    'every workbench tab needs page-tour stops; add stops and the count together'
  );
  for (const tab of TAB_IDS) {
    assert.ok(
      walkthroughIndicesForTab(tab).length > 0,
      `the page tour for "${tab}" has no stops`
    );
  }
});

check('the workflow surface is a page stop in the Python tab', () => {
  const index = FEATURE_WALKTHROUGH.findIndex((stop) => stop.id === 'workflow');
  assert.ok(index >= 0, 'the Workflow canvas is a page, so it needs a stop');
  assert.equal(FEATURE_WALKTHROUGH[index].tab, 'tab-pyodide');
  assert.ok(walkthroughIndicesForTab('tab-pyodide').includes(index));
  assert.deepEqual(
    walkthroughAction('workflow')?.selectors,
    ['[data-testid="editor-tab-workflow"]'],
    'the workflow stop must open the editor tab that owns the canvas'
  );
});

check('the graphing stop opens the calculator before it asks for the mode', () => {
  const action = walkthroughAction('graphing');
  assert.ok(action, 'the graphing stop needs an action');
  assert.deepEqual(
    action.open,
    [
      '[data-testid="btn-reader-back"]',
      '[data-testid="editor-tab-calculator"]',
      '[data-testid="phone-surface-code"]',
      '[data-testid="layout-study"]',
    ],
    'the Graphing pill lives inside the Calculator view, and Read hides the editor entirely'
  );
  assert.ok(
    !action.open.includes(action.selectors[0]),
    'opening the surface must not press the action the learner is asked for'
  );
  // The card must decide which door to open before it measures, not outline a folded panel.
  assert.match(
    WALKTHROUGH_SOURCE,
    /walkthroughOpenerStep\(stopAction/,
    'the walkthrough must open the surface a folded action lives in before it points at it'
  );
  // The previous stop's cleanup folds the surfaces it opened on the next tick. The next stop must
  // wait for that fold before pressing a door, or the door's body would be collapsed again.
  const cleanupWait = WALKTHROUGH_SOURCE.indexOf('pendingCleanups.current > 0');
  const openerPress = WALKTHROUGH_SOURCE.indexOf('walkthroughOpenerStep(stopAction');
  assert.ok(
    cleanupWait >= 0 && openerPress >= 0 && cleanupWait < openerPress,
    'the surface cleanup must finish before the next stop presses an opener'
  );
  assert.match(
    WALKTHROUGH_SOURCE,
    /collapseSurfacesSince\(baseline, \(\) =>/,
    'the cleanup must report when its delayed fold has run'
  );
  assert.doesNotMatch(
    WALKTHROUGH_SOURCE,
    /isWorkspaceFold/,
    'the runner editor fold must not be exempt from the normal cleanup'
  );
});

check('the calculator stops leave Read before they point inside the editor', () => {
  for (const id of ['calculator', 'graphing']) {
    const action = walkthroughAction(id);
    assert.ok(action, `the ${id} stop needs an action`);
    assert.deepEqual(
      action.open?.[0],
      '[data-testid="btn-reader-back"]',
      '"' + id + '" must leave Read first: its target is an editor view a phone cannot see there'
    );
    assert.ok(
      !action.open.includes(action.selectors[0]),
      '"' + id + '" must not press the control it asks the learner for'
    );
  }
  assert.ok(
    walkthroughAction('calculator')?.open.includes('[data-testid="phone-surface-code"]'),
    'the Calculator stop needs the phone Code surface, not only the desktop tab strip'
  );
});

check('the collaboration stop opens More before it asks for Share', () => {
  const action = walkthroughAction('collaboration');
  assert.ok(action, 'the collaboration stop needs an action');
  assert.deepEqual(action.selectors, ['[data-testid="btn-share-attempt"]']);
  assert.deepEqual(action.open, ['[data-testid="btn-more"]']);
  assert.ok(
    !action.open.includes(action.selectors[0]),
    'opening More must not press Share for the learner'
  );
});

check('the Links stop reaches the phone tab picker', () => {
  const action = walkthroughAction('links');
  assert.ok(action, 'the Links stop needs an action');
  assert.deepEqual(
    action.open,
    ['[data-testid="btn-tab-picker"]'],
    'a phone picker sheet must be opened before its Link Health row can be pressed'
  );
  assert.ok(
    action.selectors.includes('[data-testid="tab-picker-item-tab-links"]'),
    'the phone picker row is the Link Health tab on a phone'
  );
});

check('the hidden phone controls have visible equivalents', () => {
  const expectations = {
    levels: '[data-testid="btn-pass-card-tier1"]',
    rail: '[data-testid="btn-tab-picker"]',
    'lesson-reader': '[data-testid="layout-select"]',
    'studio-layout': '[data-testid="layout-select"]',
  };
  for (const [id, selector] of Object.entries(expectations)) {
    assert.ok(
      walkthroughAction(id)?.selectors.includes(selector),
      `"${id}" needs ${selector} on a phone, where its desktop control is not mounted`
    );
  }
});

check('late targets and filtered tabs are kept in reach', () => {
  // A lazy tab can mount after `locate` has given up; the follow pass must scroll the new target
  // once and measure it again, rather than place a spotlight off-screen.
  assert.match(WALKTHROUGH_SOURCE, /followScrolls/, 'the follow pass must scroll a late target once');
  assert.match(
    WALKTHROUGH_SOURCE,
    /behavior: 'instant'/,
    'the tour must measure after an instant scroll, not mid-animation'
  );
  // Beginner View filters non-core tabs; the walkthrough lends its own tab back while it asks for
  // it, so the learner's press, not a programmatic navigation, is what opens Link Health.
  const appSource = fs.readFileSync(new URL('../app/src/App.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /t\.id === walkthroughPeekTab/);
  assert.match(WALKTHROUGH_SOURCE, /onPeekTab\?\.\(action\?\.opensTab/);
  // If the rail is not mounted at all (the tour resumed on Home), the stop opens the workbench
  // after the peek has had time to render, so the tab is never permanently unreachable.
  assert.match(WALKTHROUGH_SOURCE, /stopAction\?\.opensTab && stop\.tab && tries === 6/);
});

check('a folded action opens its surface once before falling back', () => {
  const action = walkthroughAction('graphing');
  const folded = { getAttribute: () => null };
  const expanded = { getAttribute: () => 'true' };
  const findFrom = (nodes) => (selector) => nodes[selector] ?? null;
  // The action is already on screen: no door is pressed.
  assert.deepEqual(
    walkthroughOpenerStep(action, new Set(), findFrom({ [action.selectors[0]]: folded })),
    { kind: 'visible' }
  );
  // The tab is on screen but the body is folded: press it, then look again.
  const doors = Object.fromEntries(action.open.map((selector) => [selector, folded]));
  const both = findFrom(doors);
  assert.deepEqual(walkthroughOpenerStep(action, new Set(), both), {
    kind: 'press',
    selector: action.open[0],
  });
  // A phone's Lesson surface hides the editor's tab; its Code switch is the door that reveals it.
  assert.deepEqual(walkthroughOpenerStep(action, new Set([action.open[0]]), both), {
    kind: 'press',
    selector: action.open[1],
  });
  assert.deepEqual(walkthroughOpenerStep(action, new Set(action.open.slice(0, 2)), both), {
    kind: 'press',
    selector: action.open[2],
  });
  // A door already open is not toggled shut, and a door that is gone is skipped.
  assert.deepEqual(
    walkthroughOpenerStep(
      { selectors: action.selectors, open: ['[data-testid="btn-more"]'] },
      new Set(),
      findFrom({ '[data-testid="btn-more"]': expanded })
    ),
    { kind: 'exhausted' }
  );
  // The last door is the desktop Study preset; with the three phone doors already taken it is the
  // one pressed, and a preset already pressed is not toggled shut.
  assert.deepEqual(walkthroughOpenerStep(action, new Set(action.open.slice(0, 3)), both), {
    kind: 'press',
    selector: action.open[3],
  });
  const pressed = { getAttribute: (name) => (name === 'aria-pressed' ? 'true' : null) };
  assert.deepEqual(
    walkthroughOpenerStep(
      action,
      new Set(action.open.slice(0, 3)),
      findFrom({ ...doors, [action.open[3]]: pressed })
    ),
    { kind: 'exhausted' }
  );
  assert.deepEqual(walkthroughOpenerStep(action, new Set(), () => null), { kind: 'exhausted' });
});

check('a version-3 position migrates across the inserted Workflow stop', () => {
  const legacy = FEATURE_WALKTHROUGH.filter((stop) => stop.id !== 'workflow');
  assert.equal(legacy.length, FEATURE_WALKTHROUGH_COUNT - 1);
  assert.equal(legacy[20].id, 'studio-layout', 'the stop before the insertion must not move');
  assert.equal(legacy[21].id, 'roadmap', 'the old roadmap position is the first one after it');
  assert.equal(FEATURE_WALKTHROUGH[21].id, 'workflow');
  assert.equal(FEATURE_WALKTHROUGH[22].id, 'roadmap');

  for (let oldIndex = 0; oldIndex < legacy.length; oldIndex += 1) {
    const store = memoryStore({
      [FEATURE_WALKTHROUGH_STORAGE_KEY]: JSON.stringify({
        version: 3,
        status: 'active',
        index: oldIndex,
        completed: ['brand', 'studio-layout'],
        updatedAt: 1,
      }),
    });
    const loaded = readWalkthroughState(store);
    const expected = FEATURE_WALKTHROUGH.findIndex((stop) => stop.id === legacy[oldIndex].id);
    assert.equal(
      loaded.index,
      expected,
      `a version-3 position at ${oldIndex} should resume at "${legacy[oldIndex].id}"`
    );
    assert.deepEqual(
      loaded.completed,
      ['brand', 'studio-layout'],
      'version-3 checklist ticks survive the schema bump'
    );
  }

  const resumeStore = memoryStore({
    [FEATURE_WALKTHROUGH_STORAGE_KEY]: JSON.stringify({
      version: 3,
      status: 'active',
      index: 21,
      completed: [],
      updatedAt: 1,
    }),
  });
  assert.equal(
    entryWalkthroughState(false, resumeStore).index,
    FEATURE_WALKTHROUGH.findIndex((stop) => stop.id === 'roadmap'),
    'a full tour saved on the old Roadmap position resumes at Roadmap, not Workflow'
  );
});

check('a saved stop id keeps its place when the catalogue moves', () => {
  const workflowIndex = FEATURE_WALKTHROUGH.findIndex((stop) => stop.id === 'workflow');
  const store = memoryStore({
    [FEATURE_WALKTHROUGH_STORAGE_KEY]: JSON.stringify({
      version: FEATURE_WALKTHROUGH_VERSION,
      status: 'active',
      // A deliberately stale number: the stable id is the authority for a version-4 record.
      index: 2,
      stopId: 'workflow',
      completed: [],
      updatedAt: 1,
    }),
  });
  const loaded = readWalkthroughState(store);
  assert.equal(loaded.index, workflowIndex, 'the saved id, not the stale index, names the stop');

  writeWalkthroughState({ ...loaded, index: workflowIndex + 1 }, store);
  const raw = JSON.parse(store.getItem(FEATURE_WALKTHROUGH_STORAGE_KEY));
  assert.equal(raw.index, workflowIndex + 1);
  assert.equal(raw.stopId, 'roadmap', 'every write records the stable id of its current stop');
  assert.equal(readWalkthroughState(store).index, workflowIndex + 1);
});

check('a page tour reads the saved full-tour place without resetting it', () => {
  const saved = {
    ...initialWalkthroughState(0),
    status: 'completed',
    index: FEATURE_WALKTHROUGH_COUNT - 1,
    completed: [],
  };
  const store = memoryStore({
    [FEATURE_WALKTHROUGH_STORAGE_KEY]: JSON.stringify({
      ...saved,
      stopId: FEATURE_WALKTHROUGH[FEATURE_WALKTHROUGH_COUNT - 1].id,
    }),
  });
  const pageState = entryWalkthroughState(true, store);
  assert.equal(pageState.index, FEATURE_WALKTHROUGH_COUNT - 1, 'a page tour must read the saved index');
  assert.equal(pageState.status, 'completed', 'a page tour must not resume the full walk');
  assert.equal(
    entryWalkthroughState(false, store).index,
    0,
    'only the full walk restarts after a completed tour'
  );
  const checked = completeWalkthroughStop(pageState, 'workflow', 1);
  assert.equal(checked.index, FEATURE_WALKTHROUGH_COUNT - 1, 'checking a page stop must keep the index');
  writeWalkthroughState(checked, store);
  const raw = JSON.parse(store.getItem(FEATURE_WALKTHROUGH_STORAGE_KEY));
  assert.equal(raw.index, FEATURE_WALKTHROUGH_COUNT - 1);
  assert.equal(
    raw.stopId,
    FEATURE_WALKTHROUGH[FEATURE_WALKTHROUGH_COUNT - 1].id,
    'checking a page stop must keep the full tour on the same stop'
  );
  assert.equal(readWalkthroughState(store).index, FEATURE_WALKTHROUGH_COUNT - 1);
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
    if (action.open) {
      assert.ok(action.open.length > 0, `"${stop.id}" open needs a control`);
      assert.notDeepEqual(action.open, action.selectors, `"${stop.id}" open cannot be the action`);
      assertControls(action.open, 'open');
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
  // The dim is the spotlight's own shadow, not an interactive scrim, and there is no scroll lock:
  // a misclick still belongs to the page, not to the tour.
  assert.match(WALKTHROUGH_SOURCE, /walkthrough-spot/);
  assert.doesNotMatch(WALKTHROUGH_SOURCE, /document\.body\.style\.overflow/);
  // The surface a stop opened is cleared on the click timer and again when the tour moves on, so
  // the next stop is never buried under it.
  assert.match(WALKTHROUGH_SOURCE, /clearDialogsOpenedSince/);
  assert.match(WALKTHROUGH_SOURCE, /collapseOpenedSurfaces/);
  assert.match(WALKTHROUGH_SOURCE, /SURFACE_CLEAR_DELAY/);
  // The header's page tour is the same engine with a tab scope, and the card keeps its own scroll
  // bar out of the page.
  assert.match(WALKTHROUGH_SOURCE, /scopeTab/);
  assert.match(WALKTHROUGH_SOURCE, /data-testid="walkthrough-sections"/);
  assert.match(HEADER_SOURCE, /data-testid="btn-page-walkthrough"/);
  assert.match(WALKTHROUGH_SOURCE, /overflow-x-hidden/);
});

check('the guide offers both modes and the walkthrough callback', () => {
  assert.match(GUIDE_SOURCE, /data-testid="guide-mode-steps"/);
  assert.match(GUIDE_SOURCE, /data-testid="guide-mode-walkthrough"/);
  assert.match(GUIDE_SOURCE, /onWalkthrough/);
  assert.match(GUIDE_SOURCE, /FEATURE_WALKTHROUGH_COUNT/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
