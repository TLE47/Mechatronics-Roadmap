#!/usr/bin/env node
/**
 * The visit, timed: six moments on a laptop and on a throttled phone
 * (`scripts/perf_walk.mjs`, `npm run test:perf`)
 *
 * Every other gate here measures a **fact** — a bundle's weight, a document's audits, a surface's
 * pixels — and none of them measures time. `check:lighthouse` says why it will not, and is right:
 * "a score that moves with the runner is not a gate this repository keeps". That argument is sound
 * for a gate and useless for a claim, because *"it feels slow to open"* is the first sentence a
 * beginner says, and until this script there was nothing here that could answer it with a number.
 *
 * So this walk measures, in the order a first visit happens (`docs/PLAN-2.1a.md` §4):
 *
 * | Moment | What it means |
 * | --- | --- |
 * | Navigation → lesson text | the first paint that matters: the page's own prose, not a spinner |
 * | Lesson text → first keystroke | CodeMirror is ready, proved by a character coming back |
 * | First Run → first output | Pyodide warming, or the cost of having warmed it late |
 * | Warm run → first output | the number a learner repeats all evening |
 * | Lesson switch → usable editor | the new lesson's code in an editor that takes a keystroke |
 * | Reload → draft restored | the storage promise, timed rather than asserted |
 *
 * **Two profiles, because an average of them describes neither.** `laptop` is 1440×900 at DPR 1 with
 * no throttling — the machine this repository is developed on. `phone` is 390×844 at DPR 3, mobile
 * layout, **4× CPU slowdown and Lighthouse's own mobile "Slow 4G"** (1.6 Mbit down, 750 kbit up,
 * 150 ms RTT). The phone numbers are the honest ones for "can a beginner study on the train": at
 * that bandwidth the first run downloads a 10 MB interpreter and says so.
 *
 * Both profiles pin the light palette and ask for reduced motion. That is not cosmetic: the walk is
 * about how long the work takes, and a fade's duration or a stored dark palette would be a second
 * variable in a measurement that already has a machine in it.
 *
 * **It grades regressions, never a score** — a generous ceiling per moment, kept in
 * [`docs/perf-budget.json`](../docs/perf-budget.json), because a walk that fails on a busy machine
 * teaches people to re-run it until it passes. The ceilings are set at roughly two to three times
 * the recorded number, so what fails here is a doubling, not a busy afternoon. Measured numbers are
 * stored in [`docs/PERF.md`](../docs/PERF.md) with the machine and the date, through `--record`:
 * **a number without both is not a measurement**, and a table of them is what makes a regression
 * argument possible in a pull request.
 *
 * **Why this is not a CI step.** CI's runner is a shared, noisy virtual machine, and the six moments
 * would be a function of its contention more than of this app — `check_lighthouse.mjs` already
 * learned that on the performance category. The walk runs where a person is: before a release, and
 * after a change that touches the first paint. What CI does run is `npm run test:perf:unit`, which
 * proves the doc and the budget still describe the same six moments (cheap, no browser).
 *
 * Usage
 *     npm run test:perf                        # both profiles, gates the six ceilings
 *     npm run test:perf -- --profile laptop    # one profile (the quick loop)
 *     npm run test:perf -- --record            # also write the rows into docs/PERF.md
 *     npm run test:perf -- --json              # machine-readable, stdout only
 *     npm run test:perf -- --verbose           # per-moment notes: keystroke echo, restored lesson
 *
 * Exit-code family: typed
 *     0  every moment was measured and is under its ceiling
 *     1  a moment over its ceiling, or one that could not be measured at all
 *     2  the walk could not happen (no `dist/`, no Chromium, a bad flag, a missing budget)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { getEditorCode, setEditorCode, waitForEditor } from './editor-code.mjs';

const ROOT = process.cwd();
const BUDGET_FILE = path.join(ROOT, 'docs', 'perf-budget.json');
const DOC_FILE = path.join(ROOT, 'docs', 'PERF.md');
/** `startStaticServer` serves the built bundle where GitHub Pages does, so the walk measures it. */
const BASE_PATH = '/Mechatronics-Roadmap/';

const EDITOR = '[data-editor="editor-main"] .cm-content';
const RUN = '[data-testid="btn-run-verify"]';
const OUTPUT = '[data-testid="pre-actual-stdout"]';
const LESSON_META = '[data-testid="lesson-meta"]';
const READER_PROSE = '[data-testid="reader-prose"]';

/** A page load, however slow: the phone at 1.6 Mbit still has to fetch the bundle. */
const NAVIGATION_TIMEOUT = 180_000;
/** A run: the first one on the phone downloads Pyodide through a throttled link. */
const RUN_TIMEOUT = 300_000;
/** The draft writer debounces at 400 ms (`TabPyodideRunner.tsx`); this is that, plus the write. */
const DRAFT_SETTLE_MS = 1_500;

/**
 * The six moments, in visit order.
 *
 * `header` is the column name in `docs/PERF.md`; `label` is what the terminal prints. They are kept
 * apart deliberately — the column has to be short enough to read across a table, and the terminal
 * line has room to be a sentence. The unit test pins both against the doc, so renaming a moment
 * without regenerating the table fails instead of quietly describing the old one.
 */
export const MOMENTS = [
  {
    id: 'nav_to_lesson',
    header: 'Navigation → lesson text',
    label: 'navigation → lesson text visible',
    describes: 'from the document request to the lesson pane carrying its own prose',
  },
  {
    id: 'lesson_to_editor',
    header: 'Lesson text → first keystroke',
    label: 'lesson text → a keystroke is echoed',
    describes: 'the reading pane is painted; CodeMirror is ready to take input',
  },
  {
    id: 'first_run',
    header: 'First run → first output',
    label: 'first Run → first output',
    describes: 'Pyodide warming, or the cost of having warmed it late',
  },
  {
    id: 'warm_run',
    header: 'Warm run → first output',
    label: 'warm Run → first output',
    describes: 'the number a learner repeats',
  },
  {
    id: 'lesson_switch',
    header: 'Lesson switch → usable editor',
    label: 'lesson switch → usable editor',
    describes: 'a new lesson selected, its code in an editor that takes a keystroke',
  },
  {
    id: 'reload_restore',
    header: 'Reload → draft restored',
    label: 'reload → draft is back',
    describes: 'the storage promise, timed',
  },
];

/**
 * The two profiles.
 *
 * `network` is in bytes per second, from Lighthouse's mobile preset (1.6 Mbit / 750 kbit / 150 ms).
 * `cpuSlowdown` is CDP's `Emulation.setCPUThrottlingRate`, the same 4× Lighthouse uses for mobile.
 */
export const PROFILES = {
  laptop: {
    id: 'laptop',
    description: '1440x900, DPR 1, no CPU or network throttling',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
    cpuSlowdown: 1,
    network: null,
  },
  phone: {
    id: 'phone',
    description: '390x844, DPR 3, 4x CPU slowdown, Slow 4G (1.6 Mbit down, 150 ms RTT)',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    mobile: true,
    touch: true,
    cpuSlowdown: 4,
    network: {
      latencyMs: 150,
      downloadBytesPerSecond: Math.round((1.6 * 1e6) / 8),
      uploadBytesPerSecond: Math.round((750 * 1e3) / 8),
    },
  },
};

/**
 * The two programs the run moments execute.
 *
 * They are not the lesson's starter: a starter is an exercise, and half of them fail on purpose. The
 * cost of a first run is the interpreter's, not the program's, so a three-line program that prints
 * something identifiable is the measurement. The second says something different on purpose — the
 * warm moment may not be satisfied by the previous run's output still sitting on screen.
 */
const PROGRAMS = [
  { code: 'def greet(name):\n    return f"Hello, {name}"\n\n\nprint(greet("ada"))\n', needle: 'Hello, ada' },
  { code: 'print("warm " + "run")\n', needle: 'warm run' },
];

const MARKER = '# perf-walk: the draft this walk typed';

// --------------------------------------------------------------------------------------------
// Pure helpers: the doc, the budget, and what "over budget" means. Exported for the unit test.
// --------------------------------------------------------------------------------------------

/** The table's header line, built from `MOMENTS` so a renamed moment cannot leave a stale column. */
export function headerRow() {
  return `| Date | Machine | Profile | ${MOMENTS.map((moment) => moment.header).join(' | ')} |`;
}

/** The `:---` line under it: dates and names left, numbers right, so a column of ms lines up. */
export function separatorRow() {
  return `| :--- | :--- | :--- | ${MOMENTS.map(() => '---:').join(' | ')} |`;
}

/**
 * The machine, named the way a measurement has to be named.
 *
 * CPU model, platform and release, RAM, and the Node that built the bundle: two rows with the same
 * date and different machines are two different measurements, and a row that cannot say which
 * machine it came from is a rumour.
 */
export function machineDescription() {
  const cpu = (os.cpus()?.[0]?.model ?? 'unknown CPU').replace(/\s+/g, ' ').trim();
  const gb = Math.round(os.totalmem() / 1024 ** 3);
  return `${cpu} · ${os.platform()} ${os.release()} · ${gb} GB · Node ${process.version}`;
}

/** A run's identity in the table: one row per date, machine and profile. */
export function rowKey(run) {
  return `${run.date}|${run.machine}|${run.profile}`;
}

/** One table row: the six numbers, rounded, in `MOMENTS` order. */
export function formatRow(run) {
  const cells = MOMENTS.map((moment) => {
    const measured = run.moments?.[moment.id];
    return Number.isFinite(measured) ? String(Math.round(measured)) : '—';
  });
  return `| ${run.date} | ${run.machine} | ${run.profile} | ${cells.join(' | ')} |`;
}

/** Split a `|`-delimited table line into its trimmed cells, or `null` if it is not one. */
export function splitRow(line) {
  const trimmed = (line ?? '').trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/** Read one data row back into the shape `formatRow` wrote. `null` for a header or a malformed row. */
export function parseRow(line) {
  const cells = splitRow(line);
  if (!cells || cells.length !== MOMENTS.length + 3) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) return null;
  const moments = {};
  MOMENTS.forEach((moment, index) => {
    const cell = cells[3 + index];
    moments[moment.id] = /^\d+$/.test(cell) ? Number(cell) : null;
  });
  return { date: cells[0], machine: cells[1], profile: cells[2], moments };
}

/** Every data row in the doc, in file order. */
export function parseRows(markdown) {
  return String(markdown ?? '')
    .split('\n')
    .map(parseRow)
    .filter(Boolean);
}

/**
 * Write or replace one row.
 *
 * A re-run on the same machine and day replaces its own row instead of adding a second one that
 * contradicts it, and a new row is appended after the last recorded one: the table reads as a
 * history, oldest first, which is what makes "it got slower in March" visible.
 */
export function upsertRow(markdown, run) {
  const row = formatRow(run);
  const lines = String(markdown ?? '').split('\n');
  const at = lines.findIndex((line) => {
    const parsed = parseRow(line);
    return parsed && rowKey(parsed) === rowKey(run);
  });
  if (at >= 0) {
    lines[at] = row;
    return lines.join('\n');
  }
  let last = -1;
  for (let index = 0; index < lines.length; index += 1) if (parseRow(lines[index])) last = index;
  if (last >= 0) {
    lines.splice(last + 1, 0, row);
    return lines.join('\n');
  }
  const header = lines.findIndex((line) => line.trim() === headerRow());
  if (header < 0 || lines[header + 1]?.trim() !== separatorRow()) {
    throw new Error(`${DOC_FILE} has no table to add a row to: expected the header and its ':---' line`);
  }
  lines.splice(header + 2, 0, row);
  return lines.join('\n');
}

/**
 * Compare one run with the budget.
 *
 * `overruns` is what fails the walk; `missing` is what it could not judge — a moment that was not
 * measured, or a budget that does not name it. A budget that silently skipped a moment would turn
 * "we gate six numbers" into "we gate the ones that passed", so both lists are failures.
 */
export function compareToBudget(run, budget) {
  const ceilings = budget?.profiles?.[run.profile]?.ceiling_ms ?? {};
  const overruns = [];
  const missing = [];
  for (const moment of MOMENTS) {
    const measured = run.moments?.[moment.id];
    const ceiling = ceilings[moment.id];
    if (!Number.isFinite(measured) || !Number.isFinite(ceiling)) {
      missing.push(moment.id);
      continue;
    }
    if (measured > ceiling) overruns.push({ id: moment.id, measured, ceiling });
  }
  return { overruns, missing };
}

/**
 * The lesson to switch to: the next one in the chooser's own order, wrapping.
 *
 * "Next" rather than "any other" because that is the move a learner makes, and because a page that
 * has just been read is exactly the one whose payload is not freshly cached.
 */
export function nextLessonId(ids, current) {
  const list = (ids ?? []).filter(Boolean);
  if (list.length < 2) throw new Error('the chooser lists fewer than two lessons');
  const at = list.indexOf(current);
  return at < 0 ? list[0] : list[(at + 1) % list.length];
}

// --------------------------------------------------------------------------------------------
// The walk.
// --------------------------------------------------------------------------------------------

function readBudget() {
  if (!fs.existsSync(BUDGET_FILE)) {
    throw new Error(`no ${path.relative(ROOT, BUDGET_FILE)}: the walk has nothing to grade against`);
  }
  const parsed = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  if (!parsed || typeof parsed.profiles !== 'object') {
    throw new Error(`${path.relative(ROOT, BUDGET_FILE)} must be {"profiles": {...}}`);
  }
  for (const profile of Object.keys(PROFILES)) {
    if (!parsed.profiles[profile]) throw new Error(`the budget has no ${profile} block`);
  }
  return parsed;
}

/** The lesson the runner says it is on, read from the header it prints. */
function readLessonId(page) {
  return page.evaluate(() => {
    const row = document.querySelector('[data-testid="lesson-meta"]');
    const first = row?.querySelector('span')?.textContent ?? '';
    return first.replace(/^Lesson\s+/, '').trim();
  });
}

/** The Run button is disabled exactly while a run is in flight, so this is the end of one. */
function waitForRunIdle(page) {
  return page.waitForFunction(
    () => {
      const button = document.querySelector('[data-testid="btn-run-verify"]');
      return Boolean(button) && !button.disabled;
    },
    undefined,
    { timeout: RUN_TIMEOUT }
  );
}

/** Wait for `needle` to appear in the program's stdout. The output element appears with the run. */
function waitForOutput(page, needle) {
  return page.waitForFunction(
    (wanted) => {
      const output = document.querySelector('[data-testid="pre-actual-stdout"]');
      return Boolean(output) && (output.textContent ?? '').includes(wanted);
    },
    needle,
    { timeout: RUN_TIMEOUT }
  );
}

/**
 * One profile's six moments, in a fresh context.
 *
 * A context per profile, never a reused page: the reload moment and the lesson switch both depend on
 * what the previous moment left in storage, and the phone's service worker must not be inherited from
 * the laptop's run.
 */
async function measureProfile(browser, baseUrl, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.mobile,
    hasTouch: profile.touch,
    // Pinned, so the palette is not a second variable in a timing: `snapshot_surfaces` measures colour.
    colorScheme: 'light',
    // And the same for motion: a fade is a duration in every number below.
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    // The predict-first gate is an opt-in setting with its own suite (`test:e2e:predict`); a run that
    // waited behind a predicted answer would measure this walk's typing rather than the runtime.
    window.__mechalabPredictFirst = false;
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (profile.network) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.network.latencyMs,
      downloadThroughput: profile.network.downloadBytesPerSecond,
      uploadThroughput: profile.network.uploadBytesPerSecond,
    });
  }
  if (profile.cpuSlowdown > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
  }

  const now = () => page.evaluate(() => performance.now());
  const moments = {};
  const notes = {};

  try {
    // 1. Navigation → the lesson's own prose on screen.
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    await page.waitForFunction(
      (selector) => {
        const prose = document.querySelector(selector);
        return Boolean(prose) && (prose.textContent ?? '').trim().length > 200;
      },
      READER_PROSE,
      { timeout: NAVIGATION_TIMEOUT }
    );
    moments.nav_to_lesson = await now();

    // 2. Lesson text painted → CodeMirror echoes a character. The starter's last character is known
    // (`getEditorCode`), so the echo is a change to that text, not a `#` that was already there.
    const starter = await getEditorCode(page);
    await waitForEditor(page);
    await page.evaluate(() => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.setCursor(editor.get().length);
      editor.focus();
    });
    const typingStarted = await now();
    await page.keyboard.type('#');
    await page.waitForFunction(
      (before) => window.__mechalabEditors['editor-main'].get() === `${before}#`,
      starter,
      { timeout: 30_000 }
    );
    const echoedAt = await now();
    moments.lesson_to_editor = echoedAt - moments.nav_to_lesson;
    notes.keystroke_echo_ms = Math.round(echoedAt - typingStarted);
    await setEditorCode(page, starter);

    // 3. First run → first output, warming included.
    await setEditorCode(page, PROGRAMS[0].code);
    const firstStarted = await now();
    await page.locator(RUN).click({ timeout: NAVIGATION_TIMEOUT });
    await waitForOutput(page, PROGRAMS[0].needle);
    moments.first_run = (await now()) - firstStarted;
    await waitForRunIdle(page);

    // 4. Warm run → first output. A different sentence, so the previous run's stdout cannot satisfy it.
    await setEditorCode(page, PROGRAMS[1].code);
    const warmStarted = await now();
    await page.locator(RUN).click({ timeout: NAVIGATION_TIMEOUT });
    await waitForOutput(page, PROGRAMS[1].needle);
    moments.warm_run = (await now()) - warmStarted;
    await waitForRunIdle(page);

    // 5. Lesson switch → usable editor. The clock stops when the new lesson's title and its code are
    // both on screen; whether it *accepts* input is asserted separately, so a slow echo cannot hide
    // behind a number that only counted a paint.
    const currentLesson = await readLessonId(page);
    const chooserIds = await page.$$eval('[data-testid^="lesson-item-"]', (nodes) =>
      nodes.map((node) => (node.getAttribute('data-testid') ?? '').replace('lesson-item-', ''))
    );
    const targetLesson = nextLessonId(chooserIds, currentLesson);
    const card = page.locator(`[data-testid="lesson-item-${targetLesson}"]`);
    await card.scrollIntoViewIfNeeded({ timeout: NAVIGATION_TIMEOUT });
    const switchStarted = await now();
    await card.click({ timeout: NAVIGATION_TIMEOUT });
    await page.waitForFunction(
      ({ id, meta, editorSelector }) => {
        const row = document.querySelector(meta);
        const editor = document.querySelector(editorSelector);
        return Boolean(
          row &&
            (row.textContent ?? '').includes(`Lesson ${id}`) &&
            editor &&
            (editor.textContent ?? '').trim().length > 0
        );
      },
      { id: targetLesson, meta: LESSON_META, editorSelector: EDITOR },
      { timeout: NAVIGATION_TIMEOUT }
    );
    moments.lesson_switch = (await now()) - switchStarted;
    const switched = await getEditorCode(page);
    await page.evaluate(() => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.setCursor(editor.get().length);
      editor.focus();
    });
    await page.keyboard.type('#');
    await page.waitForFunction(
      (before) => window.__mechalabEditors['editor-main'].get() === `${before}#`,
      switched,
      { timeout: 30_000 }
    );
    await setEditorCode(page, switched);

    // 6. Reload → the draft comes back. Typed, not written through the bridge, because the debounced
    // writer listens to the editor's own updates and this is the path a learner takes.
    await page.evaluate(() => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.setCursor(0);
      editor.focus();
    });
    await page.keyboard.type(`${MARKER}\n`);
    await page.waitForFunction(
      (marker) => window.__mechalabEditors['editor-main'].get().includes(marker),
      MARKER,
      { timeout: 30_000 }
    );
    await page.waitForTimeout(DRAFT_SETTLE_MS);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    await page.waitForFunction(
      (marker) => Boolean(window.__mechalabEditors?.['editor-main']) &&
        window.__mechalabEditors['editor-main'].get().includes(marker),
      MARKER,
      { timeout: NAVIGATION_TIMEOUT }
    );
    // The new document's own navigation start (`performance.timeOrigin`), so the moment includes the
    // reload and not this driver's round trip before it.
    moments.reload_restore = await page.evaluate(() => Date.now() - performance.timeOrigin);
    notes.restored_lesson = await readLessonId(page);
    if (notes.restored_lesson !== targetLesson) {
      notes.restored_lesson_note = `reloaded onto ${notes.restored_lesson} instead of ${targetLesson}`;
    }
  } finally {
    await context.close();
  }

  const unmeasured = MOMENTS.filter((moment) => !Number.isFinite(moments[moment.id])).map(
    (moment) => moment.id
  );
  return {
    profile: profile.id,
    description: profile.description,
    moments,
    notes,
    unmeasured,
    pageErrors,
  };
}

function usage() {
  return [
    'Usage: node scripts/perf_walk.mjs [--profile laptop|phone|both] [--record] [--json] [--verbose]',
    '',
    `Moments: ${MOMENTS.map((moment) => moment.id).join(', ')}`,
    'Exit codes: 0 under every ceiling, 1 over a ceiling or unmeasured, 2 could not run.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { profile: 'both', record: false, json: false, verbose: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--json') args.json = true;
    else if (flag === '--record') args.record = true;
    else if (flag === '--verbose') args.verbose = true;
    else if (flag === '--help' || flag === '-h') args.help = true;
    else if (flag === '--profile') {
      const value = argv[index + 1];
      index += 1;
      if (value !== 'laptop' && value !== 'phone' && value !== 'both') {
        throw new Error(`--profile expects laptop, phone or both, got "${value ?? ''}"`);
      }
      args.profile = value;
    } else throw new Error(`unknown flag "${flag}"`);
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n\n${usage()}`);
    return 2;
  }
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const log = (...parts) => (args.json ? console.error : console.log)(...parts);

  let budget;
  try {
    budget = readBudget();
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    return 2;
  }

  ensureBuilt();
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const { server, port } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}${BASE_PATH}`;
  const date = new Date().toISOString().slice(0, 10);
  const machine = machineDescription();
  const chromeVersion = browser.version();
  const wanted = args.profile === 'both' ? Object.keys(PROFILES) : [args.profile];

  let runs = [];
  try {
    log(`Perf walk — ${machine}`);
    log(`  Chrome ${chromeVersion}, built bundle at ${baseUrl}`);
    for (const id of wanted) {
      const profile = PROFILES[id];
      log(`\n  ${id}: ${profile.description}`);
      const run = await measureProfile(browser, baseUrl, profile);
      const { overruns, missing } = compareToBudget(run, budget);
      for (const moment of MOMENTS) {
        const measured = run.moments[moment.id];
        const ceiling = budget.profiles[id]?.ceiling_ms?.[moment.id];
        const bad = overruns.some((overrun) => overrun.id === moment.id) || !Number.isFinite(measured);
        log(
          `    ${bad ? 'FAIL' : 'ok  '} ${moment.label.padEnd(38)} ` +
            `${Number.isFinite(measured) ? `${Math.round(measured)} ms`.padStart(9) : 'unmeasured'.padStart(9)}` +
            `  (ceiling ${Number.isFinite(ceiling) ? `${ceiling} ms` : 'missing'})`
        );
        if (args.verbose && moment.id === 'lesson_to_editor' && run.notes.keystroke_echo_ms !== undefined) {
          log(`         the keystroke itself came back in ${run.notes.keystroke_echo_ms} ms`);
        }
      }
      if (args.verbose && run.notes.restored_lesson_note) log(`         ${run.notes.restored_lesson_note}`);
      if (run.pageErrors.length) {
        log(`         ${run.pageErrors.length} page error(s): ${run.pageErrors[0]}`);
      }
      runs.push({ ...run, date, machine, chrome: chromeVersion, overruns, missing });
    }
  } finally {
    await browser.close();
    server.close();
  }

  const overBudget = runs.flatMap((run) =>
    run.overruns.map((overrun) => ({ profile: run.profile, ...overrun }))
  );
  const unmeasured = runs.flatMap((run) => run.unmeasured.map((id) => ({ profile: run.profile, id })));

  if (args.record) {
    let markdown = fs.readFileSync(DOC_FILE, 'utf8');
    for (const run of runs) markdown = upsertRow(markdown, run);
    fs.writeFileSync(DOC_FILE, markdown);
    log(`\n  recorded ${runs.length} row(s) in ${path.relative(ROOT, DOC_FILE)}`);
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          date,
          machine,
          chrome: chromeVersion,
          url: baseUrl,
          profiles: runs.map((run) => ({
            profile: run.profile,
            description: run.description,
            moments: run.moments,
            ceilings: budget.profiles[run.profile]?.ceiling_ms ?? {},
            notes: run.notes,
          })),
          overruns: overBudget,
          unmeasured,
          ok: overBudget.length === 0 && unmeasured.length === 0,
        },
        null,
        2
      )
    );
  } else if (overBudget.length || unmeasured.length) {
    for (const overrun of overBudget) {
      console.error(
        `[FAIL] ${overrun.profile}/${overrun.id}: ${Math.round(overrun.measured)} ms over its ` +
          `${overrun.ceiling} ms ceiling`
      );
    }
    for (const gap of unmeasured) console.error(`[FAIL] ${gap.profile}/${gap.id}: not measured`);
    console.error(
      '\nA number that doubled is a regression; a number near its ceiling on a quiet machine is a ' +
        'ceiling that wants re-recording (`--record`, then update docs/perf-budget.json and say why ' +
        'in docs/PERF.md).'
    );
  } else {
    const summary = runs
      .map((run) => `${run.profile} ${Math.round(run.moments.warm_run)} ms warm`)
      .join('; ');
    log(
      `\n[PASS] Perf walk: six moments on ${runs.length} profile(s), all under their ceilings (${summary}). ` +
        'Run with --record to add these numbers to docs/PERF.md.'
    );
  }

  return overBudget.length || unmeasured.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error('[FAIL] the perf walk could not run:', error?.stack ?? error);
      process.exitCode = 2;
    });
}
