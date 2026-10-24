#!/usr/bin/env node
/**
 * The first screen's type, measured in a browser (`scripts/check_label_sizes.mjs`,
 * `npm run check:labels`)
 *
 * Run 230's review named this twice: the toolbar carries too many actions for one row, and its labels
 * sit at 11–12.5 px "pending the rendered check the review asked for". Source does not answer that
 * question — `text-[10.5px]` in a class list is a claim about a stylesheet, a cascade and a root font
 * size, and the answer changes with all three. So this gate renders the built bundle in a real
 * Chromium at an ordinary laptop's size (1280×800) and reads the computed font size of every control
 * and every piece of metadata on the first screen.
 *
 * The contract is §3 of `docs/PLAN-2.1a.md`, and it has four parts:
 *
 * 1. **The row is quiet.** At rest the runner shows at most seven controls: the four layout presets,
 *    the dock toggle, More and Run. Pause and Stop join only while a program runs, and everything
 *    else lives behind More — asserted by id, so a control cannot be hidden by accident or promoted
 *    back into the row without this file saying so.
 * 2. **Folded is still legible.** Opening More must reveal all thirteen secondary controls, every one
 *    of them at 12 px or larger. `hidden` is a visual fold, never a smaller type size.
 * 3. **Primary actions lead.** Run, Stop, Pause, More, the layout presets and the dock toggle are
 *    13 px or larger.
 * 4. **Reading text is reading size.** The lesson pane's paragraphs measure 17–18 px, and metadata
 *    (the status lines, counters and captions) is never smaller than 11 px.
 *
 * The numbers are a floor, not a style guide: the gate fails a regression in legibility, and says
 * which testid and which computed size so the fix is a CSS change rather than an investigation.
 *
 * Usage
 *     npm run check:labels                 # the measurement; exit 1 on a violation
 *     npm run check:labels -- --json        # machine-readable, stdout only
 *     npm run check:labels -- --verbose     # every measured control and metadata row
 *
 * Exit-code family: typed
 *     0  every control, label and paragraph meets its floor
 *     1  a rendered size is below its floor, or the row/fold contract no longer holds
 *     2  the sweep could not run (no build, no Chromium, a page error)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';

const ROOT = process.cwd();

/** An ordinary laptop, which is the size the review asked about — not the 1440×900 dev display. */
const VIEWPORT = { width: 1280, height: 800 };

/** The four palettes share type, so one is enough; light is where Run 223's small-label findings were. */
const PALETTE = 'light';

/** §3's type scale. A control may be 12.5 px; metadata may be 11 px; nothing on this screen is smaller. */
const CONTROL_MIN_PX = 12;
const PRIMARY_MIN_PX = 13;
const METADATA_MIN_PX = 11;
const READING_MIN_PX = 17;
const READING_MAX_PX = 18;

/** The controls that stay on the row, and the floor each one is held to. */
const PRIMARY = [
  'btn-run-verify',
  'btn-stop-execution',
  'btn-pause-execution',
  'btn-more',
  'layout-study',
  'layout-read',
  'layout-write',
  'layout-debug',
  'btn-dock-toggle',
];

/** Everything behind More: present in the DOM, revealed in one press, and no smaller for it. */
const FOLDED = [
  'btn-toggle-lesson-complete',
  'btn-reset-starter',
  'btn-reset-runtime',
  'btn-load-solution',
  'btn-format',
  'btn-draft-history',
  'btn-breakpoints',
  'btn-diff',
  'btn-share-attempt',
  'btn-pair-open',
  'btn-predict',
  'btn-vim',
  'btn-watch',
];

/** At rest, in Study: four presets, the dock, More and Run. Pause/Stop are conditional, not extra. */
const ROW_MAX_CONTROLS = 7;

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const VERBOSE = argv.includes('--verbose');

function log(...args) {
  // stdout is the report; `--json` keeps it parseable by sending the human lines to stderr.
  (JSON_OUT ? console.error : console.log)(...args);
}

/**
 * Runs in the page: one row per visible control, one per visible piece of metadata text.
 *
 * A control's own computed size is what a learner sees on its label; the children (a `kbd` chip, an
 * icon) are measured separately only if they carry text of their own.
 */
function measure({ primary, folded }) {
  const visible = (element) => {
    if (!element) return false;
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    const style = getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) > 0 &&
      !element.closest('[hidden]')
    );
  };
  const label = (element) =>
    (element.getAttribute('aria-label') ?? element.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  const main = document.querySelector('#main') ?? document.body;
  const CONTROLS = 'button, a[href], input, textarea, select, summary, [role="button"]';
  const controls = [...main.querySelectorAll(CONTROLS)].filter(visible).map((element) => ({
    testid: element.getAttribute('data-testid') ?? '',
    tag: element.tagName.toLowerCase(),
    type: element.getAttribute('type') ?? '',
    size: Number.parseFloat(getComputedStyle(element).fontSize),
    label: label(element),
    primary: primary.includes(element.getAttribute('data-testid')),
  }));

  // Metadata is direct text on an element that is not itself a control: the counters, the status
  // lines, the small print. A wrapper whose text lives entirely in children is not measured twice.
  const metadata = [];
  for (const element of main.querySelectorAll('*')) {
    if (element.closest(CONTROLS) && element.closest(CONTROLS) !== element) {
      // A span inside a button is part of that button's label, measured there.
      if (element.parentElement?.closest(CONTROLS)) continue;
    }
    if (element.matches(CONTROLS)) continue;
    if (['SCRIPT', 'STYLE', 'CODE', 'PRE', 'svg', 'SVG'].includes(element.tagName)) continue;
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();
    if (!own || !visible(element)) continue;
    metadata.push({
      testid: element.getAttribute('data-testid') ?? '',
      tag: element.tagName.toLowerCase(),
      size: Number.parseFloat(getComputedStyle(element).fontSize),
      label: own.replace(/\s+/g, ' ').slice(0, 60),
    });
  }

  const prose = [...document.querySelectorAll('[data-testid="reader-prose"] p')].find(visible);
  const reading = prose
    ? {
        size: Number.parseFloat(getComputedStyle(prose).fontSize),
        label: label(prose).slice(0, 60),
      }
    : null;

  // The row contract is about the toolbar itself, not the other 120-odd controls the first screen
  // legitimately carries (the lesson rail, the guide, the study panel).
  const toolbar = document.querySelector('[data-testid="runner-toolbar"]') ?? main;
  const rowControls = [...toolbar.querySelectorAll(CONTROLS)].filter(visible).map((element) => ({
    testid: element.getAttribute('data-testid') ?? '',
    tag: element.tagName.toLowerCase(),
    size: Number.parseFloat(getComputedStyle(element).fontSize),
    label: label(element),
  }));
  const rowIds = rowControls.map((row) => row.testid).filter(Boolean);
  const foldedVisible = folded.filter((id) => rowIds.includes(id));

  return { controls, metadata, reading, foldedVisible, rowControls };
}

/** A size below its floor, with the id a fix can be looked up by. */
function violations(rows, panelOpen) {
  const found = [];
  for (const row of rows.controls) {
    const floor = row.primary ? PRIMARY_MIN_PX : CONTROL_MIN_PX;
    if (row.size + 0.01 < floor) {
      found.push({
        kind: row.primary ? 'primary control' : 'control',
        testid: row.testid,
        tag: row.tag,
        size: row.size,
        floor,
        label: row.label,
        when: panelOpen ? 'More open' : 'row at rest',
      });
    }
  }
  for (const row of rows.metadata) {
    if (row.size + 0.01 < METADATA_MIN_PX) {
      found.push({
        kind: 'metadata',
        testid: row.testid,
        tag: row.tag,
        size: row.size,
        floor: METADATA_MIN_PX,
        label: row.label,
        when: panelOpen ? 'More open' : 'row at rest',
      });
    }
  }
  return found;
}

async function main() {
  ensureBuilt();
  const executablePath = resolveChromiumExecutable();
  if (!executablePath) {
    console.error('[FAIL] no Chromium to drive: set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or install one');
    process.exit(2);
  }
  const { server, port } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}/Mechatronics-Roadmap/`;

  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--force-device-scale-factor=1'],
  });
  const pageErrors = [];
  const contract = [];
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="btn-theme-toggle"]');
    await page.evaluate(async () => {
      await document.fonts?.ready;
      return true;
    });
    // The runner is the first surface a beginner lands on, and the reader beside it has to have
    // arrived before paragraph type can be read at all.
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="reader-loading"]') &&
        !document.querySelector('[data-editor-ready="false"]'),
      undefined,
      { timeout: 30000 }
    );
    await page.waitForTimeout(400);

    const rest = await page.evaluate(measure, { primary: PRIMARY, folded: FOLDED });
    const atRest = rest.rowControls.map((row) => row.testid || row.tag);
    if (rest.rowControls.length > ROW_MAX_CONTROLS) {
      contract.push(
        `the rest row shows ${rest.rowControls.length} controls, more than the ${ROW_MAX_CONTROLS} §3 allows: ` +
          atRest.join(', ')
      );
    }
    const escaped = rest.foldedVisible.filter(Boolean);
    if (escaped.length) {
      contract.push(`folded controls are visible before More is opened: ${escaped.join(', ')}`);
    }

    await page.getByTestId('btn-more').click();
    await page.getByTestId('toolbar-more').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(150);

    const open = await page.evaluate(measure, { primary: PRIMARY, folded: FOLDED });
    const missing = FOLDED.filter((id) => !open.foldedVisible.includes(id));
    if (missing.length) {
      contract.push(`More does not reveal: ${missing.join(', ')}`);
    }

    if (!open.reading) {
      contract.push('no lesson paragraph is rendered, so reading size could not be measured');
    } else if (open.reading.size + 0.01 < READING_MIN_PX || open.reading.size - 0.01 > READING_MAX_PX) {
      contract.push(
        `lesson text is ${open.reading.size} px; §3 asks for ${READING_MIN_PX}–${READING_MAX_PX} px`
      );
    }

    const findings = [...violations(rest, false), ...violations(open, true)];
    const report = {
      viewport: VIEWPORT,
      palette: PALETTE,
      floors: {
        control: CONTROL_MIN_PX,
        primary: PRIMARY_MIN_PX,
        metadata: METADATA_MIN_PX,
        reading: [READING_MIN_PX, READING_MAX_PX],
      },
      at_rest: { controls: rest.rowControls.length, max: ROW_MAX_CONTROLS },
      folded: { expected: FOLDED.length, revealed: open.foldedVisible.length },
      reading: open.reading,
      violations: findings,
      contract,
    };

    if (JSON_OUT) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      log(
        `  row at rest: ${rest.rowControls.length}/${ROW_MAX_CONTROLS} controls · More reveals ` +
          `${open.foldedVisible.length}/${FOLDED.length}` +
          (open.reading ? ` · lesson text ${open.reading.size} px` : ' · lesson text missing')
      );
      if (VERBOSE) {
        for (const row of [...rest.rowControls, ...open.controls]) {
          log(
            `  ${row.size.toFixed(1).padStart(5)} px  ${(row.primary ? 'primary' : 'control').padEnd(8)}` +
              `  ${row.testid || row.tag}  ${row.label}`
          );
        }
        for (const row of open.metadata) {
          log(`  ${row.size.toFixed(1).padStart(5)} px  metadata  ${row.testid || row.tag}  ${row.label}`);
        }
      }
      for (const finding of findings) {
        log(
          `  FAIL ${finding.when} · ${finding.kind} ${finding.testid || finding.tag} is ${finding.size} px,` +
            ` below ${finding.floor} px — “${finding.label}”`
        );
      }
      for (const line of contract) log(`  FAIL ${line}`);
    }

    await context.close();
    if (pageErrors.length) {
      console.error(`[FAIL] the page threw during the measurement: ${pageErrors.join(' | ')}`);
      process.exitCode = 2;
    } else if (findings.length || contract.length) {
      if (!JSON_OUT) {
        console.error(
          `\n[FAIL] ${findings.length + contract.length} label-size finding(s). §3's scale is in ` +
            'docs/PLAN-2.1a.md; fix the class, not this file.'
        );
      }
      process.exitCode = 1;
    } else if (!JSON_OUT) {
      log(
        `[PASS] Labels: ${rest.rowControls.length} controls at rest, ${open.foldedVisible.length} behind More, ` +
          `${open.metadata.length} metadata rows; every size meets §3's floor at ` +
          `${VIEWPORT.width}×${VIEWPORT.height}.`
      );
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[FAIL] the label measurement could not finish:', error?.stack ?? error);
    process.exit(2);
  });
}
