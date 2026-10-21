#!/usr/bin/env node
/**
 * `⌘K`'s catalogue and search, checked without a browser (`npm run test:palette`).
 *
 * The palette is the one surface that promises *everything* is reachable, so the claims worth
 * testing are the catalogue's completeness and the search's predictability:
 *
 *   1. **Every lesson and tab is in it, once.** The catalogue is built from the runner's registry
 *      and the rail's metadata; a duplicate id is how two entries silently become one.
 *   2. **Ids are the contract.** `lesson-P.1`, `tab-tab-pyodide`, `action-run-lesson`: selecting an
 *      item is a switch on these, so a collision or a stray prefix routes a click to the wrong place.
 *   3. **Prefix beats word-start beats substring beats subsequence**, and the order inside a score
 *      band is catalogue order (stable), so typing `p` lists P.1 before countdowns that contain it.
 *   4. **Keywords are searchable.** "damping ratio" finds the lesson whose ideas say it, even when
 *      its title does not.
 *
 * Run: `node --experimental-strip-types scripts/test_palette.mjs` (also a suite in test_workbench)
 */

import assert from 'node:assert/strict';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import { rankPalette, groupPalette, lessonIdOf } from '../app/src/palette.ts';
import { PALETTE_ACTIONS, paletteCatalog, lessonPaletteItems } from '../app/src/paletteCatalog.ts';

const TABS = [
  { id: 'tab-arch', beginnerLabel: 'Roadmap', beginnerSubtitle: 'The ten steps', technicalLabel: 'Linear Tier Roadmap', technicalSubtitle: 'Tracks' },
  { id: 'tab-pyodide', beginnerLabel: 'Python runner', beginnerSubtitle: 'Write code', technicalLabel: 'In-Browser Python Runner', technicalSubtitle: 'Pyodide WASM' },
];

const catalog = paletteCatalog(TABS);
const ids = catalog.map((item) => item.id);

assert.equal(new Set(ids).size, ids.length, 'catalogue ids must be unique: two entries sharing an id means one is unreachable');
console.log(`  ok ${catalog.length} catalogue entries, ${new Set(ids).size} unique ids`);

for (const lesson of PYTHON_LESSONS) {
  assert(ids.includes(`lesson-${lesson.id}`), `every registry lesson must be in the palette; ${lesson.id} is missing`);
}
assert.equal(catalog.filter((item) => item.kind === 'lesson').length, PYTHON_LESSONS.length, 'the palette must list each lesson exactly once');
for (const tab of TABS) {
  assert(ids.includes(`tab-${tab.id}`), `every rail tab must be in the palette; ${tab.id} is missing`);
}
assert.equal(catalog.filter((item) => item.kind === 'action').length, PALETTE_ACTIONS.length, 'every fixed command must be in the palette');
console.log(`  ok all ${PYTHON_LESSONS.length} lessons, ${TABS.length} tabs and ${PALETTE_ACTIONS.length} commands are present exactly once`);

for (const item of catalog) {
  assert(item.label.trim().length > 0, `${item.id} must have a label a learner can read`);
  if (item.kind === 'lesson') {
    assert(item.id.startsWith('lesson-'), `${item.id} must carry the lesson- prefix the selector reads`);
    assert(lessonIdOf(item) === item.id.slice('lesson-'.length), `${item.id} must round-trip through lessonIdOf`);
  }
}
assert.equal(lessonIdOf({ id: 'tab-tab-pyodide', kind: 'tab', label: 'x' }), null, 'a tab is not a lesson');
console.log('  ok every id carries the prefix its selector switches on');

// --- ranking --------------------------------------------------------------------------------

const fixture = (id, label, extra = {}) => ({ id, kind: 'action', label, ...extra });
const ranking = rankPalette(
  [
    fixture('a', 'Compare the responses'),
    fixture('b', 'Response curve'),
    fixture('c', 'Step response of a spring'),
    fixture('d', 'Ridge estimator'),
    fixture('e', 'Signal response'),
  ],
  'resp'
);
assert.deepEqual(
  ranking.map((match) => match.item.id),
  ['b', 'c', 'e', 'a'],
  `prefix first, then word-start, then substring, each in catalogue order; got ${ranking.map((m) => m.item.id).join(', ')}`
);
const tokenPrefix = rankPalette([fixture('ten', 'P.10 · Loops'), fixture('one', 'P.1 · Variables')], 'P.1');
assert.equal(tokenPrefix[0]?.item.id, 'one', 'a numbered prefix must prefer the entry that ends the token (P.1 over P.10)');
console.log('  ok P.1 ranks above P.10 for the query P.1');
console.log('  ok prefix > word-start > substring, and ties keep catalogue order');

assert.deepEqual(rankPalette([fixture('x', 'PID loop')], '  pid  ').length, 1, 'surrounding spaces must not defeat a match');
assert.equal(rankPalette([fixture('x', 'PID loop')], 'PID')[0].item.id, 'x', 'queries are case-insensitive');
console.log('  ok leading/trailing spaces and case are normalised');

const sub = rankPalette([fixture('s', 'Python runner'), fixture('o', 'Progress report')], 'pyrun');
assert.equal(sub[0]?.item.id, 's', `an in-order subsequence must find a spaced label (pyrun -> Python runner); got ${sub.map((m) => m.item.id).join(', ')}`);
assert.equal(rankPalette([fixture('n', 'Progress report')], 'pyrun').length, 0, 'out-of-order letters must not match');
console.log('  ok subsequence search finds skipped letters, strictly in order');

assert.equal(rankPalette(catalog, 'zzzzqqq').length, 0, 'a query nothing contains must return nothing');
assert.equal(rankPalette(catalog, '').length, catalog.length, 'an empty query is the whole catalogue, not an empty list');
assert.equal(rankPalette(catalog, '', 5).length, 5, 'the limit must bound the list');
console.log('  ok empty, unmatched and limited queries behave');

// --- real catalogue -------------------------------------------------------------------------

const pidHits = rankPalette(catalog, 'P.1');
assert(pidHits.some((match) => match.item.id === 'lesson-P.1'), 'typing a lesson id must find that lesson');
assert.equal(pidHits[0]?.item.id, 'lesson-P.1', `an exact id must rank first; got ${pidHits[0]?.item.id}`);
console.log('  ok an exact lesson id ranks that lesson first');

const ideaHit = rankPalette(catalog, 'damping ratio');
const damping = PYTHON_LESSONS.find((lesson) => lesson.ideas.some((idea) => /damping ratio/i.test(idea)));
assert(damping, 'the curriculum still teaches damping ratio (the keyword test needs a real idea)');
assert(
  ideaHit.some((match) => match.item.id === `lesson-${damping.id}`),
  `a lesson's own ideas must be searchable; "${damping.id}" says "damping ratio" but was not found`
);
console.log(`  ok an idea in the text ("damping ratio") finds ${damping.id}`);

const themeHit = rankPalette(catalog, 'theme');
assert(
  themeHit.slice(0, 2).some((match) => match.item.id === 'action-toggle-theme'),
  `"theme" must offer the theme toggle in its first two rows; got ${themeHit.slice(0, 2).map((m) => m.item.id).join(', ')}`
);
console.log('  ok "theme" offers the theme commands first');

// --- grouping -------------------------------------------------------------------------------

const groups = groupPalette(rankPalette(catalog, ''));
assert.deepEqual(groups.map((group) => group.kind), ['lesson', 'tab', 'action'], 'groups must follow the catalogue order, empty groups dropped');
assert(groups.every((group) => group.matches.length > 0), 'an empty group must not be drawn');
const limitedGroups = groupPalette(rankPalette(catalog, '', 3));
assert.deepEqual(limitedGroups.map((group) => group.kind), ['lesson'], 'a lesson-only page must draw one group, not three headings');
console.log('  ok groups keep catalogue order and drop empty sections');

// Every label must find itself; a learner who types what they see cannot be told "nothing matches".
const misses = catalog.filter((item) => !rankPalette(catalog, item.label).some((match) => match.item.id === item.id));
assert.deepEqual(misses.map((item) => item.id), [], 'every catalogue label must find its own entry');
console.log('  ok every label finds itself when typed whole');

assert.equal(lessonPaletteItems().length, PYTHON_LESSONS.length, 'the lesson list helper must not drop entries');

console.log('[PASS] Palette catalogue and search: complete, unique, and predictable.');
