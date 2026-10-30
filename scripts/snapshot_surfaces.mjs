#!/usr/bin/env node
/**
 * The painted surface of every tab, per palette, as a file
 * (`scripts/snapshot_surfaces.mjs`, `npm run check:snapshot`)
 *
 * The CI row's other missing word. Contrast is measured, accessibility is audited, and every tab has a
 * behavioural suite — but nothing notices that a panel stopped being a panel. A `grid` that became a
 * column, an activity rail that disappeared, a card that lost its buttons, a palette whose background
 * token stopped applying: each of those leaves every test green, because every test asks about a
 * feature and none asks what the screen is shaped like.
 *
 * This gate asks that, for **56 surfaces**: the twelve tabs, Home and the Workflow canvas, in all
 * four palettes. The canvas is measured with its connectors included: a node's box, an arrow's path,
 * the label and the remove button that hang from it, so a curve or a control that drifts is a finding
 * rather than something only a person notices.
 *
 * **It is not a pixel diff, and that is a decision rather than a shortcut.** A screenshot baseline is
 * taken on one machine, and its antialiasing does not exist on the next: the runner that builds this
 * app is Linux, the person developing it is on a Mac, and a gate whose first response is a red build
 * over font rasterisation is a gate people learn to skip. What is portable is the structure — where the
 * header, the rail, the main pane and its first panel are, how many controls are in it, which colours
 * and type resolved — so that is what is recorded. `--png` still writes a picture of each surface to
 * `.fb-scratch/surfaces/` for the review no number replaces; the picture is never compared.
 *
 * Geometry is compared with a **tolerance** of two pixels per number: a line box can differ by one
 * between two builds of the same browser on the same bundle, and one pixel is not a regression. Counts
 * and resolved styles are exact.
 *
 * Usage
 *     node scripts/snapshot_surfaces.mjs              # compare against docs/surface-snapshot.json
 *     node scripts/snapshot_surfaces.mjs --record     # write today's surfaces into that file
 *     node scripts/snapshot_surfaces.mjs --tab tab-bode --palette light   # one surface, while fixing it
 *     node scripts/snapshot_surfaces.mjs --png        # also write a PNG per surface for a human
 *     node scripts/snapshot_surfaces.mjs --json       # machine-readable, stdout only
 *
 * Exit-code family: typed
 *     0  every surface matches the snapshot
 *     1  a surface moved, gained or lost a control, changed a resolved style, or is missing/stale
 *     2  the sweep could not run (no build, no Chromium, a bad flag)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { SETTLE, SURFACE_COUNTS, settleSurface } from './surface_settle.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const ROOT = process.cwd();
const SNAPSHOT_FILE = path.join(ROOT, 'docs', 'surface-snapshot.json');
const PNG_DIR = path.join(ROOT, '.fb-scratch', 'surfaces');

/** The desktop the app is measured at everywhere else: both columns, the activity rail, no scrolling hacks. */
const VIEWPORT = { width: 1440, height: 900 };

/** Pixels a box edge may differ by. One is subpixel rounding; two is the same layout. */
const TOLERANCE_PX = 2;

/** Every palette a reader can be in, and the OS scheme each is reached through. */
const PALETTES = ['dark', 'light', 'paper', 'contrast'];

/**
 * The one live request this sweep answers itself, and why.
 *
 * The Links tab renders the open `link-rise` issues it reads from the GitHub API
 * (`app/src/components/RiseIssuesPanel.tsx`), one link per issue. That number belongs to the queue,
 * not to the page: a weekly sweep files an issue, a later one closes it, and nothing in the app
 * moved. It cost a red `main`: run 40820681859 measured 7 links against the recorded 6 with every
 * box where the snapshot put it, because a dispatched sweep had filed #69 twenty minutes earlier;
 * the `tab-links` surface is the only one that reads the network at all.
 *
 * The panel is still measured in full - the heading, the label link, the row, its link and its age -
 * and the fixture is the issue the baseline was recorded with (#46, still open, same title and
 * date), so the surface's shape does not move when the queue does.
 */
const RISE_ISSUE_FIXTURE = [
  {
    number: 46,
    title: 'Link sweep rise: 5 newly unverified URLs',
    html_url: 'https://github.com/TLE47/Mechatronics-Roadmap/issues/46',
    created_at: '2026-10-26T11:37:35Z',
  },
];
const SCHEME = { dark: 'dark', light: 'light', paper: 'light', contrast: 'dark' };

const tabNames = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/src/data/workbenchTabs.json'), 'utf8'));
const ALL_TABS = Object.keys(tabNames.tabs);
/**
 * Whole pages that are not a tab (`?view=home`). They are measured with the same ruler as the tabs:
 * Home is a destination with its own layout, and a card that collapses there is exactly the drift a
 * feature suite does not see. The admin area is not here: it only renders for a signed-in admin.
 */
const PAGES = ['home'];
/**
 * Views that are not a tab of their own: the Workflow canvas lives inside the editor of the
 * Python tab, but it is a surface a learner draws on, and its arrows are geometry worth guarding.
 * Each is seeded the way a learner reaches it, so the recorded boxes are an authored diagram's.
 */
const EXTRAS = ['workflow'];

const argv = process.argv.slice(2);
const RECORD = argv.includes('--record');
const JSON_OUT = argv.includes('--json');
const PNG = argv.includes('--png');
const only = (flag) => {
  const at = argv.indexOf(flag);
  return at >= 0 ? argv[at + 1] : null;
};
const ONLY_TAB = only('--tab');
const ONLY_PALETTE = only('--palette');
const SURFACE_IDS = ONLY_TAB ? [ONLY_TAB] : [...ALL_TABS, ...PAGES, ...EXTRAS];
const THEMES = ONLY_PALETTE ? [ONLY_PALETTE] : PALETTES;
const FILTERED = Boolean(ONLY_TAB || ONLY_PALETTE);

function log(...args) {
  (JSON_OUT ? console.error : console.log)(...args);
}

/**
 * What is measured on one surface.
 *
 * Runs in the page, so it may only use the DOM, and takes the counts it reports as an argument because
 * the settle gate waits on the same selectors (`scripts/surface_settle.mjs`): a gate watching a
 * different set could hand back a surface whose recorded count was still moving. Every value is rounded
 * to a whole pixel before it leaves: a snapshot is a claim about layout, not about the subpixel.
 */
function measure(selectors) {
  const box = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return [
      Math.round(rect.left),
      Math.round(rect.top),
      Math.round(rect.width),
      Math.round(rect.height),
    ];
  };
  // The platform aliases in the stack are not this app's choice: Chrome on macOS serialises
  // `BlinkMacSystemFont` as `"system-ui"` and Chrome on Linux keeps the name, so a baseline recorded
  // on a Mac failed on the runner with a font stack nobody had changed. What a snapshot can honestly
  // claim is *which typeface the UI asked for* — the named families and the generic tail — so the
  // three platform aliases are dropped before the value leaves the page.
  const fontFamily = (value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => !/^(-apple-system|BlinkMacSystemFont|"system-ui"|system-ui)$/.test(part))
      .join(', ');
  const style = (element) => {
    if (!element) return null;
    const computed = getComputedStyle(element);
    return {
      display: computed.display,
      background: computed.backgroundColor,
      color: computed.color,
      fontFamily: fontFamily(computed.fontFamily),
      fontSize: computed.fontSize,
    };
  };
  const main = document.querySelector('#main') ?? document.querySelector('main');
  const panel = main?.firstElementChild ?? null;
  const root = getComputedStyle(document.documentElement);
  // The Workflow canvas's own geometry: a node, an arrow's path, and the label and remove button
  // that hang from its half-way point. Empty on every other surface, so those record no extra box.
  const workflow = {};
  const edgeAt = (testid) => testid.split('-').pop();
  for (const card of document.querySelectorAll('[data-node-id]')) {
    workflow[`wf-node-${card.getAttribute('data-node-id')}`] = box(card);
  }
  for (const label of document.querySelectorAll('[data-testid^="workflow-edge-label-"]')) {
    workflow[`wf-label-${edgeAt(label.dataset.testid)}`] = box(label);
  }
  for (const control of document.querySelectorAll('[data-testid^="workflow-edge-remove-"]')) {
    workflow[`wf-control-${edgeAt(control.dataset.testid)}`] = box(control);
  }
  for (const group of document.querySelectorAll('svg g[data-testid^="workflow-edge-"]')) {
    if (!/^workflow-edge-\d+$/.test(group.dataset.testid)) continue;
    workflow[`wf-path-${edgeAt(group.dataset.testid)}`] = box(group.querySelector('path'));
  }
  const counts = {};
  for (const [field, selector] of Object.entries(selectors)) {
    counts[field] = document.querySelectorAll(selector).length;
  }

  return {
    // Where the page's four regions are. A rail that moves to the other edge, a header that doubles in
    // height, or a main pane that stops taking the free width all show up here.
    boxes: {
      header: box(document.querySelector('header')),
      rail: box(document.querySelector('[data-testid="tab-rail"]')),
      main: box(main),
      panel: box(panel),
      footer: box(document.querySelector('footer')),
      // A page that grows by a screenful is a layout change even when every region is where it was.
      document: [0, 0, document.documentElement.clientWidth, document.documentElement.scrollHeight],
      ...workflow,
    },
    // What the tab is made of. A card losing its buttons, a lab losing its canvas, or a table losing its
    // rows is the kind of drift no behavioural suite notices, because no suite ever asked.
    counts,
    styles: {
      body: style(document.body),
      main: style(main),
      panel: style(panel),
      shell: {
        display: getComputedStyle(document.querySelector('#root') ?? document.body).display,
      },
      // The palette's own tokens, as the browser resolves them — the shortest possible check that the
      // stylesheet block for this palette is the one in force.
      tokens: {
        bg: root.getPropertyValue('--bg').trim(),
        panel: root.getPropertyValue('--panel').trim(),
        text: root.getPropertyValue('--text').trim(),
        accent: root.getPropertyValue('--accent').trim(),
      },
    },
  };
}

/** Every place two surfaces disagree, as one row each. */
function compareSurfaces(name, expected, actual) {
  const rows = [];
  const add = (part, field, want, got) => rows.push({ surface: name, part, field, expected: want, actual: got });

  for (const [field, want] of Object.entries(expected.boxes ?? {})) {
    const got = actual.boxes?.[field] ?? null;
    if (want === null && got === null) continue;
    if (want === null || got === null) {
      add('boxes', field, want, got);
      continue;
    }
    for (let index = 0; index < want.length; index += 1) {
      if (Math.abs(want[index] - got[index]) > TOLERANCE_PX) {
        add('boxes', field, want, got);
        break;
      }
    }
  }
  for (const field of Object.keys(actual.boxes ?? {})) {
    if (!(field in (expected.boxes ?? {}))) add('boxes', field, null, actual.boxes[field]);
  }

  for (const [field, want] of Object.entries(expected.counts ?? {})) {
    const got = actual.counts?.[field] ?? null;
    if (want !== got) add('counts', field, want, got);
  }

  const flatStyles = (styles, prefix = '') => {
    const out = {};
    for (const [key, value] of Object.entries(styles ?? {})) {
      if (value && typeof value === 'object') Object.assign(out, flatStyles(value, `${prefix}${key}.`));
      else out[`${prefix}${key}`] = value;
    }
    return out;
  };
  const wantStyles = flatStyles(expected.styles);
  const gotStyles = flatStyles(actual.styles);
  for (const [field, want] of Object.entries(wantStyles)) {
    if (gotStyles[field] !== want) add('styles', field, want, gotStyles[field] ?? null);
  }
  return rows;
}

/**
 * The Workflow canvas seeded the way a learner reaches it.
 *
 * A blank analysis card, the palette switched to code, a Branch card carrying a condition, and an
 * arrow dragged from that branch's right dot onto the first card's top dot: the shortest authored
 * diagram with a bowed connector, a label and a remove button for the snapshot to guard. Card 0 is
 * placed by `autoNodePosition`, so every palette records the same boxes.
 */
async function seedWorkflow(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.click('[data-testid="tab-btn-tab-pyodide"]');
  await page.getByTestId('editor-tab-workflow').click();
  await page.getByTestId('panel-workflow').waitFor({ timeout: 30000 });
  const dismiss = page.getByTestId('workflow-howto-dismiss');
  if (await dismiss.count()) await dismiss.click();
  if (await page.getByTestId('workflow-start-blank').count()) {
    await page.getByTestId('workflow-start-blank').click();
  }
  await page.getByTestId('workflow-mode-code').click();
  await page.getByTestId('workflow-add-branch').click();
  await page.getByTestId('workflow-node-condition-1').fill('draw > 3.2 A');
  const from = page.getByTestId('workflow-node-port-right-1');
  const to = page.getByTestId('workflow-node-port-top-0');
  await from.scrollIntoViewIfNeeded();
  const start = await from.boundingBox();
  const end = await to.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function main() {
  if (ONLY_TAB && ![...ALL_TABS, ...PAGES, ...EXTRAS].includes(ONLY_TAB)) {
    console.error(
      `[FAIL] unknown surface ${ONLY_TAB}; use ${[...ALL_TABS, ...PAGES, ...EXTRAS].join(', ')}`
    );
    process.exit(2);
  }
  if (ONLY_PALETTE && !PALETTES.includes(ONLY_PALETTE)) {
    console.error(`[FAIL] unknown palette ${ONLY_PALETTE}; use ${PALETTES.join(', ')}`);
    process.exit(2);
  }

  ensureBuilt();
  const executablePath = resolveChromiumExecutable();
  if (!executablePath) {
    console.error('[FAIL] no Chromium to drive: set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or install one');
    process.exit(2);
  }
  const { server, port } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}/Mechatronics-Roadmap/`;
  if (PNG) fs.mkdirSync(PNG_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--force-device-scale-factor=1'],
  });
  const surfaces = {};
  const errors = [];
  try {
    for (const palette of THEMES) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        colorScheme: SCHEME[palette],
        // The two extra palettes are not something an OS asks for, so they are reached the way a reader
        // reaches them: a stored pick (the same mechanism `axe_tabs.mjs` and the theme suite use).
        reducedMotion: 'reduce',
      });
      if (palette === 'paper' || palette === 'contrast') {
        await context.addInitScript((choice) => {
          try {
            localStorage.setItem('mechalab_theme_v1', choice);
          } catch {
            // A blocked store leaves the OS palette; the assertion below says so.
          }
        }, palette);
      }
      // This sweep measures the workbench, not onboarding: a first-run coach mark over the toolbar
      // would be recorded as the tab's own structure (`scripts/tour_seed.mjs`).
      await seedTourSeen(context);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(`${palette}: ${error.message}`));
      // Answer the one live request the app makes (see RISE_ISSUE_FIXTURE) before anything loads:
      // a route installed after the first navigation would miss the panel's mount.
      await page.route('https://api.github.com/**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(RISE_ISSUE_FIXTURE),
        })
      );
      await page.goto(baseUrl, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid="btn-theme-toggle"]');
      const painted = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (painted !== palette) throw new Error(`expected the ${palette} palette, got ${painted}`);
      // Beginner mode hides the deeper labs; the sweep needs all eleven.
      const advanced = page.locator('[data-testid="btn-mode-advanced"]');
      if (await advanced.count()) await advanced.click();

      for (const surface of SURFACE_IDS) {
        if (surface === 'home') {
          // Home is the whole page the landing rule opens (`homeLanding.ts`); the query makes the
          // visit deterministic instead of depending on a stored last visit.
          await page.goto(`${baseUrl}?view=home`, { waitUntil: 'load' });
          await page.getByTestId('home-dashboard').waitFor({ timeout: 30000 });
        } else if (surface === 'workflow') {
          await seedWorkflow(page, baseUrl);
        } else {
          await page.click(`[data-testid="tab-btn-${surface}"]`);
        }
        // Eleven of the twelve tabs are lazy chunks, and the editor is a lazy boundary of its own: a
        // measurement taken during either placeholder would describe a panel that says "Loading".
        // The lesson pane fetches its page too (Run 229): a surface measured while it says "Loading the
        // lesson text" is 71 px shorter and has a heading count of 3 instead of 17, which is a baseline
        // of the spinner rather than of the lesson.
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-testid="tab-loading"]') &&
            !document.querySelector('[data-editor-ready="false"]') &&
            !document.querySelector('[data-testid="reader-loading"]'),
          undefined,
          { timeout: 30000 }
        );
        // Fonts first, then a beat: a line measured while Inter is still swapping is a line box of a
        // different height, and the first run of this sweep is the one that would record that height.
        // The 400 ms is the same settle the theme and axe sweeps use, for the same reason.
        await page.evaluate(async () => {
          await document.fonts?.ready;
          return true;
        });
        await page.waitForTimeout(400);
        // And then wait until the surface has stopped changing what it *counts*, not only how big it is
        // (`scripts/surface_settle.mjs`). Silence was the whole guard here and silence is not the same
        // as finished: a late font swap or a chart's first paint moves the page by a few pixels after
        // the beat above (`tab-links` read 2411 or 2414 px depending on which side of a 3 px reflow the
        // sweep landed), and a node can mount inside a line whose height it does not change at all —
        // which is what made `paper/tab-links` read 5 links on one run and 4 on the next. The worst case
        // is not a movement at all: a request still in flight changes nothing, so a pane can be perfectly
        // quiet while the count it is about to be measured by has not arrived. The gate therefore holds
        // the counts still for a beat and treats a `*-loading` panel as unfinished.
        const settled = await page.evaluate(settleSurface, { selectors: SURFACE_COUNTS, ...SETTLE });
        if (!settled.settled) {
          log(
            `  note ${palette}/${surface} still loading after ${settled.waitedMs} ms (counts ${settled.counts})`
          );
        }
        const name = `${palette}/${surface}`;
        surfaces[name] = await page.evaluate(measure, SURFACE_COUNTS);
        if (PNG) {
          await page.screenshot({ path: path.join(PNG_DIR, `${palette}--${surface}.png`) });
        }
        log(`  ${palette.padEnd(8)} ${surface}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (errors.length) {
    console.error(`[FAIL] the page threw during the sweep: ${errors.join(' | ')}`);
    process.exit(2);
  }

  if (RECORD) {
    const previous = fs.existsSync(SNAPSHOT_FILE)
      ? JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'))
      : null;
    const merged = FILTERED ? { ...(previous?.surfaces ?? {}), ...surfaces } : surfaces;
    const document = {
      _why:
        'The painted surface of all 56 surfaces — the twelve tabs, Home and the Workflow canvas, in ' +
        'four palettes — read by ' +
        '`npm run check:snapshot` (`scripts/snapshot_surfaces.mjs`). Each entry records where the header, ' +
        'activity rail, main pane and its first panel sit, how many buttons, inputs, links, headings, ' +
        'canvases and tables the surface has, and the resolved colours, type and palette tokens. It is **not a pixel diff**: the runner is ' +
        'Linux and the person writing this is on a Mac, and a baseline whose antialiasing does not survive ' +
        'the trip is a gate people learn to skip. Box numbers are compared with a 2 px tolerance, so ' +
        'subpixel rounding is not a finding; counts and resolved styles are exact. The Links tab draws ' +
        'its tables from `app/src/data/linkHistoryData.ts`, which the weekly sweep regenerates: a data ' +
        'refresh that changes a host or run count moves that surface and is a re-record too ' +
        '(`--record --tab tab-links` records all four palettes). The Workflow surface records each ' +
        'card’s box, each arrow’s path and the label and remove button that hang from its half-way ' +
        'point, seeded through the panel’s own blank/code/branch/condition path so every palette ' +
        'records the same authored diagram. Re-record with ' +
        '`npm run check:snapshot -- --record` when a change to the screen is intended, and read the diff: ' +
        'it is a list of what moved.',
      version: 1,
      viewport: VIEWPORT,
      tolerance_px: TOLERANCE_PX,
      surfaces: merged,
    };
    fs.writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(document, null, 2)}\n`);
    log(`recorded ${Object.keys(surfaces).length} surface(s) into ${path.relative(ROOT, SNAPSHOT_FILE)}`);
    return;
  }

  if (!fs.existsSync(SNAPSHOT_FILE)) {
    console.error(
      `[FAIL] no snapshot at ${path.relative(ROOT, SNAPSHOT_FILE)}; write one with --record and read the diff`
    );
    process.exit(2);
  }
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  const expected = snapshot.surfaces ?? {};
  const rows = [];
  for (const [name, actual] of Object.entries(surfaces)) {
    const want = expected[name];
    if (!want) {
      rows.push({ surface: name, part: 'surface', field: 'new', expected: null, actual: 'not in the snapshot' });
      continue;
    }
    rows.push(...compareSurfaces(name, want, actual));
  }
  // A surface the snapshot still lists but the sweep could not produce: a tab that was removed or
  // renamed, which is exactly the drift a snapshot exists to make someone acknowledge.
  const stale = FILTERED
    ? []
    : Object.keys(expected).filter((name) => !(name in surfaces));

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          viewport: VIEWPORT,
          tolerance_px: TOLERANCE_PX,
          surfaces: Object.keys(surfaces).length,
          drift: rows,
          stale,
        },
        null,
        2
      )
    );
  } else {
    for (const row of rows) {
      if (row.part === 'surface') {
        log(`  FAIL ${row.surface} — ${row.actual}`);
        continue;
      }
      log(
        `  FAIL ${row.surface} · ${row.part}.${row.field} — expected ${JSON.stringify(
          row.expected
        )}, got ${JSON.stringify(row.actual)}`
      );
    }
    for (const name of stale) log(`  FAIL ${name} — in the snapshot, not produced by the sweep`);
  }

  if (rows.length || stale.length) {
    if (!JSON_OUT) {
      console.error(
        `\n[FAIL] ${rows.length + stale.length} difference(s) from ${path.relative(
          ROOT,
          SNAPSHOT_FILE
        )}. If the change is intended, re-record and read the diff.`
      );
    }
    process.exitCode = 1;
    return;
  }
  if (!JSON_OUT) {
    log(
      `[PASS] Surfaces: ${Object.keys(surfaces).length} measured at ${VIEWPORT.width}×${VIEWPORT.height}, ` +
        `${TOLERANCE_PX} px tolerance; the painted structure of every tab in every palette matches.`
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[FAIL] the surface sweep could not finish:', error?.stack ?? error);
    process.exit(2);
  });
}
