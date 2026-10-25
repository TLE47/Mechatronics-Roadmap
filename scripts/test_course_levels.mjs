#!/usr/bin/env node
/**
 * The course-level nav is drawn only where it changes something
 * (`scripts/test_course_levels.mjs`, `npm run test:levels`).
 *
 * The header's four links — Start here, Beginner, Applied, Advanced — are a stored preference, and
 * two panes read it: the Start Here roadmap (`TabArchitecture`) and the guide banner on the
 * simulator tabs (`SimulatorTierBanner`, text in `SIMULATOR_TIER_GUIDES`). Everywhere else the links
 * moved a highlight and changed nothing, which reads as a dead button.
 *
 * So the promise this suite pins is narrow and total:
 *
 * 1. **Every workbench tab gets an answer.** The predicate is defined for each id in
 *    `app/src/data/workbenchTabs.json`, so adding a tab cannot leave the nav in an undefined state.
 * 2. **The readers are in.** The roadmap is a reader; every tab with a guide banner is a reader.
 * 3. **The non-readers are out.** The Python runner, the placement quiz, the board and the link
 *    survey have no consumer, so they must not claim one — that was the bug.
 * 4. **A guide that only covers some passes does not count.** A banner written for `tier1` alone
 *    would leave three of the four links doing nothing, so a tab qualifies only when all four are
 *    present.
 *
 * Run: node --experimental-strip-types scripts/test_course_levels.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COURSE_PASSES, passChangesContent, tabsWherePassChangesContent } from '../app/src/courseLevels.ts';
import { SIMULATOR_TIER_GUIDES } from '../app/src/curriculumData.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const tabTable = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'app/src/data/workbenchTabs.json'), 'utf8')
);
const ALL_TABS = Object.keys(tabTable.tabs);

const GUIDES = SIMULATOR_TIER_GUIDES;

/** True when the tab has a banner for all four presses. */
const fullGuide = (tabId) =>
  Boolean(GUIDES[tabId]) && COURSE_PASSES.every((pass) => Boolean(GUIDES[tabId][pass]));

/** The tabs that genuinely read the pass: the roadmap, and every tab with a four-pass banner. */
const READERS = ALL_TABS.filter((tabId) => tabId === 'tab-arch' || fullGuide(tabId));

/** Tabs whose pane has nothing to re-cut, so a press could only move the highlight. */
const NON_READERS = ['tab-pyodide', 'tab-placement', 'tab-board', 'tab-links'];

let failures = 0;
function check(name, run) {
  try {
    run();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message.split('\n').join('\n       ')}`);
  }
}

console.log(`course levels: ${ALL_TABS.length} workbench tabs`);

check('every workbench tab has a defined answer', () => {
  for (const tabId of ALL_TABS) {
    assert.equal(
      typeof passChangesContent(tabId),
      'boolean',
      `${tabId} does not answer passChangesContent`
    );
  }
});

check('the roadmap is a reader', () => {
  assert.equal(passChangesContent('tab-arch'), true, 'tab-arch was excluded');
});

check('every tab with a four-pass guide banner is a reader', () => {
  const guides = ALL_TABS.filter((tabId) => GUIDES[tabId]);
  assert.ok(guides.length > 0, 'no simulator guide banner is wired to any tab');
  for (const tabId of guides) {
    assert.equal(passChangesContent(tabId), true, `${tabId} has a guide banner but no nav`);
  }
});

check('the tabs with no consumer are not readers', () => {
  for (const tabId of NON_READERS) {
    assert.ok(ALL_TABS.includes(tabId), `${tabId} is no longer a workbench tab`);
    assert.equal(passChangesContent(tabId), false, `${tabId} claims to read the pass`);
  }
});

check('a partial guide banner does not qualify', () => {
  // Written as the predicate's own rule rather than against a tab that happens to be partial today:
  // the day one is half-filled, the nav must leave rather than half-work.
  const partial = ALL_TABS.filter((tabId) => GUIDES[tabId] && !fullGuide(tabId));
  for (const tabId of partial) {
    assert.equal(passChangesContent(tabId), false, `${tabId} has a partial guide and kept the nav`);
  }
});

check('the enumerated list is exactly the readers', () => {
  assert.deepEqual(tabsWherePassChangesContent(ALL_TABS).sort(), READERS.sort());
});

if (failures) {
  console.error(`\n${failures} course-level check(s) failed`);
  process.exit(1);
}
console.log('course levels: all checks passed');
