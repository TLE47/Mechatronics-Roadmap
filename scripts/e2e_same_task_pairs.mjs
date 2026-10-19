#!/usr/bin/env node
/**
 * Same-Task Control-Pair Sweep — `scripts/e2e_same_task_pairs.mjs`
 *
 * The class of bug this suite exists for: a click handler that reads state captured by its last
 * render, so a second control clicked in the *same task* sees the state from before the first click.
 * It was real three times — `Run` ran the program from the render before `Load Solution`'s
 * `setCode` (`TabPyodideRunner`), the guided tour's `Next Step` stepped from a stale index, and the
 * placement quiz's two jump buttons opened the lesson recommended by the *previous* answer.
 *
 * The oracle is the app itself, not a hand-written expectation: for one ordered pair of controls,
 *
 *   task      — resolve both controls from the pre-click DOM, click A then B with no commit between;
 *   separated — click A, let React commit, re-resolve B, click B (what a person can actually do).
 *
 * Both runs start from the same clean page, and the page is fingerprinted afterwards as its whole
 * visible text plus every input value plus the `mechalab*` storage (learning-log events excluded:
 * their timestamps legitimately differ). If the two fingerprints disagree, the pair read stale
 * state — the sweep reports the pair and the first difference and fails.
 *
 * Which pairs: the audit in `CHANGELOG.md` (Run 96) walks every `useState` in `app/src` and pairs
 * each state with its writers and readers; the list below is that dependency graph, written out.
 * Pairs whose second control only *exists* after the first click (opening a modal and clicking a
 * button inside it) are deliberately out of scope — there is nothing to read stale — and the sweep
 * says so rather than pretending to cover them. Pairs that write absolute values (`setViewMode`,
 * preset buttons) are included as controls: they must come out equal, and they are what proves the
 * sweep is not simply flagging every pair it tries.
 *
 * The runner's own pair (`Load Solution` + `Run`) is pinned in `e2e_browser_workbench.mjs`, which
 * already pays for the Pyodide boot; it is not repeated here.
 *
 * Usage:  node scripts/e2e_same_task_pairs.mjs [--only <substring>]
 *         E2E_BASE_URL=<dev server> when a suite runner already has one (scripts/test_workbench.mjs).
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';

/** Injected into every page load: spec resolution, clicking, fingerprinting. */
const HELPERS = `
window.__pairs = {
  find(spec) {
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const scope = spec.scope ? document.querySelector(spec.scope) : document;
    if (!scope) throw new Error('scope not found: ' + spec.scope);
    if (spec.testid) {
      const el = scope.querySelector('[data-testid="' + spec.testid + '"]');
      if (!el) throw new Error('no element with data-testid=' + spec.testid);
      return el;
    }
    if (spec.css) {
      const list = scope.querySelectorAll(spec.css);
      const el = list[spec.index || 0];
      if (!el) throw new Error('no element for ' + spec.css + ' [' + (spec.index || 0) + ']');
      return el;
    }
    const want = norm(spec.text || spec.textIncludes);
    const matches = Array.from(scope.querySelectorAll('button, a')).filter((b) => {
      const t = norm(b.textContent);
      return spec.text ? t === want : t.includes(want);
    });
    const el = matches[spec.index || 0];
    if (!el) throw new Error('no control matching "' + (spec.text || spec.textIncludes) + '"');
    return el;
  },
  commit() {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
    );
  },
  /** One task: both controls resolved from the pre-click DOM, then clicked with no commit between. */
  clickInOneTask(specs) {
    const els = specs.map((spec) => this.find(spec));
    for (const el of els) el.click();
    return true;
  },
  /** Human pace: resolve, click, let React commit, then resolve the next one (it may have re-rendered). */
  async clickSeparated(specs) {
    for (const spec of specs) {
      this.find(spec).click();
      await this.commit();
    }
    return true;
  },
  digest() {
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const text = norm(document.body.innerText);
    const fields = Array.from(document.querySelectorAll('input, textarea, select'))
      .map((el) => (el.type || el.tagName) + '=' + (el.value || ''))
      .join('|');
    // Every mechalab key except the learning log: its event timestamps differ between two runs of
    // the same clicks by design, and nothing in this sweep is about the log.
    const storage = Object.keys(localStorage)
      .filter((k) => k.startsWith('mechalab') && !/learningLog/i.test(k))
      .sort()
      .map((k) => k + '=' + localStorage.getItem(k))
      .join('|');
    return ['--text--', text, '--fields--', fields, '--storage--', storage].join('\\n');
  },
  /** Wait until the fingerprint stops moving (async effects, derived numbers), bounded. */
  async settle(budgetMs) {
    const started = performance.now();
    let previous = null;
    while (performance.now() - started < budgetMs) {
      await this.commit();
      const now = this.digest();
      if (now === previous) return true;
      previous = now;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    return true;
  },
};
`;

/**
 * Every audited pair, one entry per dependency the audit found. `setup` clicks run at human pace
 * before the pair (a surface the pair needs), `writer` is clicked first, `reader` second.
 */
const CASES = [
  // --- Guided tour (App.tsx): tourIndex is read by Next/Prev and by Apply Demo Preset.
  {
    name: 'tour: Next Step + Next Step steps two steps',
    setup: [],
    pair: [
      { textIncludes: 'Next Step' },
      { textIncludes: 'Next Step' },
    ],
  },
  {
    name: 'tour: Next Step + Prev Step returns to the first step',
    // Net zero on purpose: the pair is a round trip, and `Next` then `Prev` in one task must land
    // back on step 1 rather than on step 8 (which is what a stale index gives).
    netZero: true,
    setup: [],
    pair: [
      { textIncludes: 'Next Step' },
      { textIncludes: 'Prev Step' },
    ],
  },
  {
    name: 'tour: Next Step + Apply Demo Preset applies the step it moved to',
    setup: [],
    pair: [
      { textIncludes: 'Next Step' },
      { textIncludes: 'Apply Demo Preset' },
    ],
  },
  {
    name: 'tour: Apply Demo Preset + Next Step',
    setup: [],
    pair: [
      { textIncludes: 'Apply Demo Preset' },
      { textIncludes: 'Next Step' },
    ],
  },

  // --- Roadmap milestones (TabArchitecture → App.completedMilestones).
  {
    name: 'roadmap: two milestone toggles in one task both land',
    setup: [],
    pair: [
      { testid: 'btn-milestone-t1_tr00' },
      { testid: 'btn-milestone-t1_tr01' },
    ],
  },
  {
    name: 'roadmap: milestone toggle then Export Progress shows the new milestone',
    setup: [],
    pair: [
      { testid: 'btn-milestone-t1_tr00' },
      { testid: 'btn-export-portfolio' },
    ],
  },
  {
    name: 'roadmap: one milestone toggle twice in one task nets out',
    setup: [],
    pair: [{ testid: 'btn-milestone-t1_tr02' }, { testid: 'btn-milestone-t1_tr02' }],
  },

  // --- Workspace mode (App.viewMode): absolute writes, must come out equal.
  {
    name: 'mode: Beginner + All 10 Engineering Labs (control)',
    setup: [],
    pair: [{ testid: 'btn-mode-beginner' }, { testid: 'btn-mode-advanced' }],
  },

  // --- Tier pass (App.activeTierPass): header links and the in-simulator switcher.
  {
    name: 'tier: header Pass 3 + in-simulator Tier 2 (control)',
    setup: [{ testid: 'tab-btn-tab-foc' }],
    pair: [
      { text: 'Pass 3: Production' },
      { text: 'Tier 2 Pass: Applied' },
    ],
  },

  // --- Simulator tabs: absolute preset writes and a functional toggle.
  {
    name: 'FOC: decoupling toggle + Surgical Cobot preset (control)',
    setup: [{ testid: 'tab-btn-tab-foc' }],
    pair: [
      { text: 'Toggle Decoupling Feedforward' },
      { text: 'Surgical Cobot (1200 RPM)' },
    ],
  },
  {
    name: 'FOC: 5500 RPM Drone + decoupling toggle (control)',
    setup: [{ testid: 'tab-btn-tab-foc' }],
    pair: [
      { text: '5500 RPM Drone' },
      { text: 'Toggle Decoupling Feedforward' },
    ],
  },

  // --- Placement quiz: answers feed the recommendation, submit, and the two jump buttons.
  {
    name: 'quiz: two answers in one task both land',
    setup: [{ testid: 'tab-btn-tab-placement' }],
    pair: [
      { textIncludes: 'clamped = 12.0 V' },
      { textIncludes: '0.015 A, 4700' },
    ],
  },
  {
    name: 'quiz: answer + Compute Final Placement Recommendation (control)',
    setup: [{ testid: 'tab-btn-tab-placement' }],
    pair: [
      { textIncludes: 'clamped = 12.0 V' },
      { textIncludes: 'Compute Final Placement Recommendation' },
    ],
  },
  {
    name: 'quiz: answer + Open Lesson jump opens the new recommendation',
    setup: [
      { testid: 'tab-btn-tab-placement' },
      // One answer already in, so the recommendation card and its jump button exist before the pair.
      { textIncludes: 'clamped = 12.0 V' },
      { textIncludes: 'Compute Final Placement Recommendation' },
    ],
    pair: [
      { textIncludes: '0.015 A, 4700' },
      { testid: 'btn-open-recommended-lesson' },
    ],
  },
  {
    name: 'quiz: answer + Open Matched Simulator Tab opens the new recommendation',
    setup: [
      { testid: 'tab-btn-tab-placement' },
      { textIncludes: 'clamped = 12.0 V' },
      { textIncludes: 'Compute Final Placement Recommendation' },
    ],
    pair: [
      { textIncludes: '0.015 A, 4700' },
      { testid: 'btn-open-recommended-simulator' },
    ],
  },

  // --- Header modals: two independent modals, both open in either order.
  {
    name: 'header: Cheat Sheet + Export Progress (control)',
    setup: [],
    pair: [{ testid: 'btn-open-cheatsheet' }, { testid: 'btn-export-portfolio' }],
  },
  {
    name: 'header: Export Progress + Cheat Sheet (control)',
    setup: [],
    pair: [{ testid: 'btn-export-portfolio' }, { testid: 'btn-open-cheatsheet' }],
  },
];

/** The first place two fingerprints differ, with a little context on each side. */
function diffHint(left, right) {
  const limit = Math.min(left.length, right.length);
  let at = 0;
  while (at < limit && left[at] === right[at]) at++;
  const context = (text) => text.slice(Math.max(0, at - 70), at + 70).replace(/\n/g, '\\n');
  return `first difference at char ${at}:\n    task      ...${context(left)}\n    separated ...${context(right)}`;
}

async function runCase(page, baseUrl, testCase) {
  const results = {};
  for (const variant of ['task', 'separated']) {
    // Each step names itself in the error: a case that dies mid-way must say which arm it died in.
    const stage = async (label, work) => {
      try {
        return await work();
      } catch (error) {
        throw new Error(`pair case "${testCase.name}" (${variant}, ${label}): ${error.message}`);
      }
    };
    await stage('load', async () => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button', { timeout: 15000 });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('button', { timeout: 15000 });
    });
    for (const spec of testCase.setup ?? []) {
      await stage(`setup ${JSON.stringify(spec)}`, async () => {
        await page.evaluate((one) => window.__pairs.clickSeparated([one]), spec);
        await page.evaluate(() => window.__pairs.settle(1000));
      });
    }
    const before = await stage('fingerprint before', () =>
      page.evaluate(() => window.__pairs.digest())
    );
    await stage('clicks', () =>
      page.evaluate(
        ([specs, inOneTask]) =>
          inOneTask
            ? window.__pairs.clickInOneTask(specs)
            : window.__pairs.clickSeparated(specs),
        [testCase.pair, variant === 'task']
      )
    );
    await stage('settle', () => page.evaluate(() => window.__pairs.settle(2500)));
    const after = await stage('fingerprint after', () => page.evaluate(() => window.__pairs.digest()));
    results[variant] = { before, after };
  }
  return results;
}

export async function runSameTaskPairSweep({ baseUrl: externalBaseUrl, only = process.env.PAIRS_ONLY } = {}) {
  const own = externalBaseUrl ? null : await startDevServer(process.cwd());
  const baseUrl = (externalBaseUrl ?? own.baseUrl).replace(/\/*$/, '/');
  // Same browser resolution as the other browser suites: playwright-core alone may not find one.
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  const cases = only ? CASES.filter((c) => c.name.includes(only)) : CASES;
  assert.ok(cases.length > 0, `no pair case matches ${only}`);

  const failures = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ content: HELPERS });
    let index = 0;
    for (const testCase of cases) {
      index += 1;
      const { task, separated } = await runCase(page, baseUrl, testCase);
      const inert = task.after === task.before && separated.after === separated.before;
      if (task.after === separated.after && (testCase.netZero || !inert)) {
        console.log(`  ok ${index}/${cases.length} ${testCase.name}`);
        continue;
      }
      const why = inert
        ? 'neither click changed the page - the case is not driving the app any more'
        : diffHint(task.after, separated.after);
      console.log(`  FAIL ${index}/${cases.length} ${testCase.name}\n    ${why}`);
      failures.push({ name: testCase.name, why });
    }
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }

  assert.equal(
    failures.length,
    0,
    `${failures.length} of ${cases.length} control pair(s) read stale render state:\n` +
      failures.map((f) => `  - ${f.name}\n    ${f.why}`).join('\n')
  );
  console.log(
    `  ok ${cases.length} control pairs behave identically when clicked in one task and at human pace`
  );
  return cases.length;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('e2e_same_task_pairs.mjs');
if (invokedDirectly) {
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : process.env.PAIRS_ONLY;
  runSameTaskPairSweep({ baseUrl: process.env.E2E_BASE_URL, only })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`[FAIL] Same-task control-pair sweep failed: ${error?.message ?? error}`);
      process.exit(1);
    });
}
