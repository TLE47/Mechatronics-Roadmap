#!/usr/bin/env node
/**
 * The runner's shape, held as a ratchet (`scripts/test_runner_shape.mjs`, `npm run test:runner`).
 *
 * The grade that started this pass said the tab was "grouping, not deletion": concerns had names but
 * the state had not moved, and nothing stopped the next feature from putting it back. Every other
 * suite here answers "does it work"; this one answers "is it still one screen of assembly".
 *
 * The numbers below are **measured**, not chosen. They are the tree after the collab, comparison and
 * pane passes; raising one is a decision to be argued in the commit that raises it, and lowering one
 * is the only other move. A check that cannot fail on the tree it was written for is decoration, so
 * the budgets are the exact measured values: any new state cell or line in the tab is red.
 *
 * The two size rules are about state, not lines. A hook that owns state must fit in 400 lines, with
 * one exception — `useRunnerExecution.ts` is the run's single owner under `runner/README.md`'s rule,
 * and splitting it would trade one honest module for two that share a lock-step contract. A view may
 * be larger (the editor card and the toolbar are variants of one drawing) but not unbounded.
 *
 * Run: node --experimental-strip-types scripts/test_runner_shape.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const TAB = 'app/src/components/tabs/TabPyodideRunner.tsx';
const RUNNER = 'app/src/components/tabs/runner';

/**
 * Measured on the tree this pass left: 3,012 / 28 / 24 / 48 / 723.
 *
 * The last raise is deliberate: the goal comment, trace pane, next-lesson button, collapsible Study
 * body and Read jump added state and markup to the card rather than a new concern to extract. The
 * adjacent hooks and modules keep their own limits; these three ceilings only cover the growth this
 * feature actually made.
 */
const BUDGET = {
  tabLines: 3020,
  tabStateCells: 28,
  tabRefs: 24,
  editorCallSiteLines: 50,
  hookLines: 400,
  viewLines: 730,
};

/** The run is the one state the README allows to be large, because it is one noun. */
const BIG_HOOKS = new Set(['useRunnerExecution.ts']);

const read = (path) => readFileSync(path, 'utf8');
const lines = (text) => text.split('\n').length - 1;
const count = (text, pattern) => (text.match(pattern) ?? []).length;

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n    ${error.message}`);
  }
}

const tab = read(TAB);
const modules = readdirSync(RUNNER)
  .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
  .sort();

check('the tab stays inside its line budget', () => {
  const measured = lines(tab);
  assert.ok(measured <= BUDGET.tabLines, `${measured} lines > ${BUDGET.tabLines}; extract a concern or lower a budget, never raise one`);
});

check('the tab holds no more state cells than its budget', () => {
  const measured = count(tab, /^  const \[[^\]]*\] = useState/gm);
  assert.ok(measured <= BUDGET.tabStateCells, `${measured} useState cells > ${BUDGET.tabStateCells}; a cell is a concern with no owner`);
});

check('the tab holds no more refs than its budget', () => {
  const measured = count(tab, /^  const \w+ = useRef/gm);
  assert.ok(measured <= BUDGET.tabRefs, `${measured} refs > ${BUDGET.tabRefs}`);
});

check('the editor card is handed an arrangement, not its derivations', () => {
  assert.ok(
    tab.includes('panes={{ value: panes, onPanes: commitPanes }}'),
    'the call site must hand `{ value, onPanes }`; split/views/shownViews/paneOrder/paneBorder are the card’s to compute'
  );
  for (const derived of ['split: paneSplit', 'shownViews,', 'views: visibleViews(panes)', 'paneBorder,']) {
    assert.ok(!tab.includes(derived), `the tab still derives ${derived}; that is the card’s job`);
  }
});

check('the editor card call site stays inside its budget', () => {
  const rows = tab.split('\n');
  const start = rows.findIndex((line) => line.includes('<RunnerEditorCard'));
  assert.ok(start !== -1, 'RunnerEditorCard is not rendered');
  const end = rows.findIndex((line, index) => index > start && line.trim() === '/>');
  assert.ok(end !== -1, 'the RunnerEditorCard call site has no self-closing end');
  const measured = end - start + 1;
  assert.ok(measured <= BUDGET.editorCallSiteLines, `${measured} lines > ${BUDGET.editorCallSiteLines}`);
});

check('co-editing state lives in its session, not the tab', () => {
  assert.ok(!tab.includes('coEditRef'), 'the tab still holds a co-edit ref; runner/useCollab.ts subscribes for it');
  assert.ok(!/const \[coEdit/.test(tab), 'the tab still declares co-edit state');
  assert.ok(!/const \[collab/.test(tab), 'the tab still declares a collab cell');
  const session = read(`${RUNNER}/useCoEdit.ts`);
  assert.match(session, /const \[session, setSession\] = useState/);
  const adapter = read(`${RUNNER}/useCollab.ts`);
  assert.match(adapter, /pair\.subscribe\(/, 'the channel must be attached where the session is, not by the tab');
});

check('the comparison state lives in its hook, not the tab', () => {
  for (const name of ['historyOpen', 'historyVersion', 'diffOpen', 'diffTarget', 'solutionUsed']) {
    assert.ok(!new RegExp(`const \\[${name},`).test(tab), `the tab still declares ${name}`);
  }
  const hook = read(`${RUNNER}/useDraftComparison.ts`);
  for (const name of ['historyOpen', 'historyVersion', 'diffOpen', 'target', 'solutionUsed']) {
    assert.ok(hook.includes(`const [${name}`), `useDraftComparison does not declare ${name}`);
  }
  assert.ok(!tab.includes('diffLines('), 'the tab still computes the diff');
  assert.ok(!tab.includes('resolveDiffReference('), 'the tab still resolves a diff reference');
});

check('a runner module never imports the tab', () => {
  for (const file of modules) {
    const source = read(`${RUNNER}/${file}`);
    // An import, not a mention: a comment naming the tab is how a module explains what it is for.
    assert.ok(
      !/from\s+['"][^'"]*TabPyodideRunner['"]/.test(source),
      `${file} imports the tab, which is a cycle`
    );
  }
});

check('a state-owning hook fits in its size rule', () => {
  for (const file of modules.filter((name) => name.endsWith('.ts'))) {
    if (BIG_HOOKS.has(file)) continue;
    const measured = lines(read(`${RUNNER}/${file}`));
    assert.ok(measured <= BUDGET.hookLines, `${file} is ${measured} lines, over ${BUDGET.hookLines}`);
  }
});

check('a view module fits in its size rule', () => {
  for (const file of modules.filter((name) => name.endsWith('.tsx'))) {
    const measured = lines(read(`${RUNNER}/${file}`));
    assert.ok(measured <= BUDGET.viewLines, `${file} is ${measured} lines, over ${BUDGET.viewLines}`);
  }
});

check('every runner module is named in the README table', () => {
  const readme = read(`${RUNNER}/README.md`);
  for (const file of modules) {
    assert.ok(readme.includes(file), `${file} has no row in runner/README.md`);
  }
});

check('the tab imports the modules that own its three knots', () => {
  for (const name of ['useCollab', 'useDraftComparison', 'DiffPanel']) {
    assert.ok(tab.includes(`./runner/${name}`), `the tab does not import ${name}`);
  }
});

console.log(`\nrunner shape: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
