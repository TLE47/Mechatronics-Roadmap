#!/usr/bin/env node
/**
 * Every micro-focus scene at both placement widths, as a structural snapshot
 * (`scripts/check_micro_visuals.mjs`, `npm run check:micro-visuals`).
 *
 * The micro tab has 46 authored scenes and three placements. The browser suite proves each one
 * paints; this gate asks the harder visual question: at the 477 px side width **and** the 966 px
 * bottom width, does every scene still fit its card, keep every label inside its clip, and keep the
 * same text, boxes, resolved visual styles and vector markup it had when the snapshot was recorded?
 *
 * The scene that started this gate was not missing; it was there with a toolbar showing through its
 * translucent sticky frame. A structural snapshot catches that class of drift without a screenshot:
 * the frame's background fingerprint moves, a label box leaves the card, or text disappears from the
 * measured run. It is deliberately **not a pixel diff**, for the same reason as
 * `scripts/snapshot_surfaces.mjs`: antialiasing recorded on one machine does not survive the trip to
 * the Linux runner. The portable evidence is text, geometry, computed styles and SVG markup.
 *
 * A scene is measured twice, not once in whichever placement its catalogue index happens to choose:
 * the figure is cloned into an offscreen 477 px stage, measured, then cloned into a 966 px stage.
 * That is how a bottom-only scene can be caught breaking when the cycle or a reader puts it at a
 * side width. A clone has no handlers and no sticky positioning; it is the same DOM and CSS.
 *
 * Usage
 *     node --experimental-strip-types scripts/check_micro_visuals.mjs
 *     node --experimental-strip-types scripts/check_micro_visuals.mjs --record
 *     node --experimental-strip-types scripts/check_micro_visuals.mjs --only variables
 *
 * `--record` refuses to write while any scene has an issue: a baseline cannot bless clipped text.
 * `--only` narrows a run while fixing one scene; a narrowed run does not call the other scenes stale.
 *
 * Exit-code family: typed
 *     0  every scene matches the snapshot
 *     1  a scene moved, lost text, overflowed, clipped text, or is missing/stale
 *     2  the sweep could not run (no build, no Chromium, no baseline, a bad flag)
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { BASE, ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { MICRO_CONCEPTS } from '../app/src/micro/catalog.ts';
import { compareMicroVisuals } from './micro_visual_compare.mjs';

const ROOT = process.cwd();
const SNAPSHOT_FILE = path.join(ROOT, 'docs', 'micro-visual-snapshot.json');
/** The side and bottom widths the micro stage produces at 1280 px. */
const WIDTHS = [477, 966];
/** A box edge may differ by two pixels; one is subpixel rounding, two is the same layout. */
const TOLERANCE = 2;
/** Text may touch an ancestor's clip edge by a subpixel before it is actually cut. */
const CLIP_TOLERANCE = 1.5;
const VIEWPORT = { width: 1280, height: 900 };
/** The catalogue is the coverage contract: one measured scene per concept. */
const EXPECTED_SCENE_COUNT = 46;
/** The authored cycle, repeated independently of the renderer's helper so a reorder cannot hide. */
const PLACEMENT_CYCLE = ['right', 'left', 'bottom'];

const argv = process.argv.slice(2);
const RECORD = argv.includes('--record');
const onlyAt = argv.indexOf('--only');
const ONLY = onlyAt >= 0 ? argv[onlyAt + 1] : null;
const targets = ONLY ? MICRO_CONCEPTS.filter((concept) => concept.id === ONLY) : MICRO_CONCEPTS;

if (ONLY && targets.length === 0) {
  console.error(`[FAIL] no micro concept is named ${ONLY}`);
  process.exit(2);
}
if (!ONLY && targets.length !== EXPECTED_SCENE_COUNT) {
  console.error(
    `[FAIL] expected ${EXPECTED_SCENE_COUNT} micro scenes, found ${targets.length}; the visual sweep must cover every concept`
  );
  process.exit(2);
}
if (new Set(targets.map((concept) => concept.id)).size !== targets.length) {
  console.error('[FAIL] the micro scene sweep contains duplicate concept ids');
  process.exit(2);
}

function log(...args) {
  console.log(...args);
}

function fail(message, code = 1) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = code;
}

function readSnapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return null;
  return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
}

function relativeFile(file) {
  return path.relative(ROOT, file);
}

/**
 * The in-page measurement. It runs twice per scene, once at each stage width, and returns only
 * portable evidence: no screenshot and no window coordinates.
 *
 * The clone is placed in a fixed offscreen stage so its width is the only variable. It is the same
 * DOM and classes as the live figure; `position: static` removes the stage's sticky behaviour while
 * leaving every visual class intact. A measurement issue is an array entry rather than a throw, so
 * one clipped label cannot hide the rest of the scene's drift.
 */
const measureScenes = async ({ selector, widths, tolerance, clipTolerance, expectedPlacement }) => {
  const original = document.querySelector(selector);
  if (!original) throw new Error(`no figure matched ${selector}`);

  const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const round = (value) => Math.round(value);
  const unique = (list) => [...new Set(list)];

  const hash = (value) => {
    let first = 2166136261;
    let second = 2166136263;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first ^= code;
      first = Math.imul(first, 16777619);
      second ^= code;
      second = Math.imul(second, 16777619);
    }
    return (
      (first >>> 0).toString(16).padStart(8, '0') +
      (second >>> 0).toString(16).padStart(8, '0')
    );
  };

  const styleKeys = [
    'backgroundColor',
    'backgroundImage',
    'color',
    'opacity',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'borderTopStyle',
    'borderRightStyle',
    'borderBottomStyle',
    'borderLeftStyle',
    'borderRadius',
    'boxShadow',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'textAlign',
    'textTransform',
    'textDecorationLine',
    'transform',
    'filter',
    'mixBlendMode',
    'fill',
    'fillOpacity',
    'stroke',
    'strokeWidth',
    'strokeOpacity',
    'strokeDasharray',
    'strokeLinecap',
  ];

  const styleFingerprint = (style) =>
    hash(styleKeys.map((key) => `${key}:${style[key] ?? ''}`).join('|'));

  const visible = (element) => {
    let node = element;
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        Number(style.opacity) === 0
      ) {
        return false;
      }
      node = node.parentElement;
    }
    return true;
  };

  const relativeBox = (rect, frame) => [
    round(rect.left - frame.left),
    round(rect.top - frame.top),
    round(rect.width),
    round(rect.height),
  ];

  const auditFigure = (figure, width) => {
    const frame = figure.getBoundingClientRect();
    const issues = [];
    const textRuns = [];
    const elements = [];
    const scene = figure.querySelector('[data-visual]');

    if (!scene) issues.push('missing-scene');
    if (Math.abs(frame.width - width) > 1) {
      issues.push(`figure-width:${round(frame.width)}px instead of ${width}px`);
    }
    const caption = figure.querySelector('figcaption');
    if (!caption?.textContent?.trim()) issues.push('missing-caption-text');
    const placement = figure.getAttribute('data-placement');
    if (expectedPlacement && placement !== expectedPlacement) {
      issues.push(`placement:${placement ?? 'missing'} instead of ${expectedPlacement}`);
    }

    if (scene) {
      const overflowX = scene.scrollWidth - scene.clientWidth;
      const overflowY = scene.scrollHeight - scene.clientHeight;
      if (overflowX > 1) issues.push(`scene-overflow-x:${overflowX}`);
      if (overflowY > 1) issues.push(`scene-overflow-y:${overflowY}`);
    }
    const frameOverflowX = figure.scrollWidth - figure.clientWidth;
    const frameOverflowY = figure.scrollHeight - figure.clientHeight;
    if (frameOverflowX > 1) issues.push(`frame-overflow-x:${frameOverflowX}`);
    if (frameOverflowY > 1) issues.push(`frame-overflow-y:${frameOverflowY}`);

    const clippingAncestor = (element, rect) => {
      let node = element;
      while (node && node !== figure) {
        const style = getComputedStyle(node);
        const container = node.getBoundingClientRect();
        const clippedX =
          style.overflowX !== 'visible' &&
          (rect.left < container.left - clipTolerance || rect.right > container.right + clipTolerance);
        const clippedY =
          style.overflowY !== 'visible' &&
          (rect.top < container.top - clipTolerance || rect.bottom > container.bottom + clipTolerance);
        if (clippedX || clippedY) return node;
        node = node.parentElement;
      }
      return null;
    };

    const walker = document.createTreeWalker(figure, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
      const parent = node.parentElement;
      if (text && parent && visible(parent)) {
        const range = document.createRange();
        range.selectNodeContents(node);
        let rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
        // SVG text can report a range without client rects in a headless shell. Its own <text>
        // element still has the painted box, so use that rather than treating the label as missing.
        if (rects.length === 0 && parent instanceof SVGElement) {
          const box = parent.getBoundingClientRect();
          if (box.width > 0 && box.height > 0) rects = [box];
        }
        if (rects.length === 0) {
          issues.push(`text-no-box:${text}`);
        } else {
          const left = Math.min(...rects.map((rect) => rect.left));
          const top = Math.min(...rects.map((rect) => rect.top));
          const right = Math.max(...rects.map((rect) => rect.right));
          const bottom = Math.max(...rects.map((rect) => rect.bottom));
          const box = { left, top, right, bottom };
          if (
            left < frame.left - clipTolerance ||
            right > frame.right + clipTolerance ||
            top < frame.top - clipTolerance ||
            bottom > frame.bottom + clipTolerance
          ) {
            issues.push(`text-outside:${text}`);
          }
          const clip = clippingAncestor(parent, box);
          if (clip) issues.push(`text-clipped:${text}:${clip.tagName.toLowerCase()}`);
          textRuns.push([text, relativeBox({ left, top, width: right - left, height: bottom - top }, frame)]);
        }
      }
      node = walker.nextNode();
    }

    for (const element of figure.querySelectorAll('*')) {
      const box = element.getBoundingClientRect();
      if (box.width < 0.5 || box.height < 0.5) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        continue;
      }
      const tag = element.tagName.toLowerCase();
      if (
        box.left < frame.left - tolerance ||
        box.right > frame.right + tolerance ||
        box.top < frame.top - tolerance ||
        box.bottom > frame.bottom + tolerance
      ) {
        issues.push(`element-outside:${tag}`);
      }
      elements.push([tag, relativeBox(box, frame), styleFingerprint(style)]);
    }

    const svgs = [...figure.querySelectorAll('svg')].map((svg) => hash(svg.outerHTML));
    if (textRuns.length === 0) issues.push('no-visible-text');

    return {
      width: round(frame.width),
      height: round(frame.height),
      frameStyle: styleFingerprint(getComputedStyle(figure)),
      text: (figure.innerText ?? textRuns.map(([text]) => text).join(' ')).replace(/\s+/g, ' ').trim(),
      textRuns,
      elements,
      svgs,
      issues: unique(issues),
    };
  };

  const measured = {};
  for (const width of widths) {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:auto;pointer-events:none;z-index:-1;`;
    const clone = original.cloneNode(true);
    clone.style.position = 'static';
    clone.style.top = 'auto';
    clone.style.width = '100%';
    clone.style.margin = '0';
    clone.removeAttribute('id');
    host.append(clone);
    document.body.append(host);
    try {
      await nextFrame();
      // A cloned node asks for its font faces only once it is laid out; `swap` would measure the
      // fallback if we stopped at that first frame. Wait for the faces the clone just requested.
      await document.fonts.ready;
      await nextFrame();
      measured[width] = auditFigure(clone, width);
    } finally {
      host.remove();
    }
  }
  return measured;
};

/**
 * The gate must be able to fail. A synthetic card with one overflowing label and one overflowing
 * shape goes through the same `measureScenes` function; if the detector stops naming either, the
 * real sweep would pass a broken scene silently.
 */
async function proveDetector(page) {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'micro-gate-selftest';
    host.style.cssText = 'position:fixed;left:-20000px;top:0;width:300px;';
    host.innerHTML = `
      <figure data-testid="micro-visual-selftest" data-placement="left" style="box-sizing:border-box;width:300px;padding:14px;border:1px solid #000;font:12px monospace">
        <figcaption>Fixture card</figcaption>
        <div data-visual>
          <div style="width:80px;overflow:hidden;white-space:nowrap">
            <span>THIS LABEL IS LONGER THAN ITS CLIP BOX</span>
          </div>
          <div style="width:600px;height:12px">a shape wider than the card</div>
        </div>
      </figure>`;
    document.body.append(host);
  });
  try {
    const measured = await page.evaluate(measureScenes, {
      selector: '[data-testid="micro-visual-selftest"]',
      widths: [300],
      tolerance: TOLERANCE,
      clipTolerance: CLIP_TOLERANCE,
      expectedPlacement: 'right',
    });
    const issues = measured['300']?.issues ?? [];
    if (!issues.some((issue) => issue.startsWith('text-clipped:'))) {
      throw new Error(`the clipping detector did not name the synthetic clipped label: ${issues.join(' | ')}`);
    }
    if (!issues.some((issue) => issue.startsWith('placement:'))) {
      throw new Error(`the placement detector did not name the synthetic side swap: ${issues.join(' | ')}`);
    }
    if (
      !issues.some(
        (issue) => issue.startsWith('element-outside:') || issue.startsWith('scene-overflow-x:')
      )
    ) {
      throw new Error(`the overflow detector did not name the synthetic wide shape: ${issues.join(' | ')}`);
    }
  } finally {
    await page.evaluate(() => document.getElementById('micro-gate-selftest')?.remove());
  }
}

function reportRows(rows, stale) {
  for (const row of rows.slice(0, 80)) {
    const where = `${row.scene}@${row.width}`;
    const expected = JSON.stringify(row.expected);
    const actual = JSON.stringify(row.actual);
    console.error(`  ${where} ${row.part}.${row.field}: expected ${expected}, got ${actual}`);
  }
  if (rows.length > 80) console.error(`  … ${rows.length - 80} more row(s)`);
  for (const name of stale.slice(0, 40)) console.error(`  ${name}: recorded but not measured`);
  if (stale.length > 40) console.error(`  … ${stale.length - 40} more stale entr(ies)`);
}

async function main() {
  if (!process.env.PAGES_SERVER_URL) ensureBuilt();
  const server = process.env.PAGES_SERVER_URL ? null : await startStaticServer();
  const base = (process.env.PAGES_SERVER_URL ?? `http://127.0.0.1:${server.port}${BASE}`).replace(
    /\/?$/,
    '/'
  );
  let browser = null;
  try {
    browser = await chromium.launch({
      ...(resolveChromiumExecutable() ? { executablePath: resolveChromiumExecutable() } : {}),
      // Text advances are rounded to whole pixels with subpixel positioning off. Headless runners
      // differ on that default, which made the same Geist Mono label 40 px here and 42 px in CI;
      // pinning it makes the snapshot's text boxes portable without loosening the 2 px tolerance.
      args: ['--disable-font-subpixel-positioning', '--font-render-hinting=none'],
      headless: true,
    });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'en-US',
    });
    // The two primitive-value scenes draw a fresh sample per visit. A constant random source makes
    // that sample the same on every run; the measured text is the scene's authored paint, not the
    // day's dice.
    await context.addInitScript(() => {
      Math.random = () => 0.424242;
    });
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    const fontResponses = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (/\.woff2?($|\?)/.test(response.url())) {
        fontResponses.push(`${response.status()} ${response.url().split('/').pop()}`);
      }
    });
    page.on('requestfailed', (request) => {
      if (/\.woff2?($|\?)/.test(request.url())) {
        fontResponses.push(`failed ${request.url().split('/').pop()}: ${request.failure()?.errorText}`);
      }
    });

    await page.goto(`${base}?view=home`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-micro').waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await proveDetector(page);

    await page.getByTestId('home-micro-open').click();
    await page.getByTestId('tab-micro').waitFor({ timeout: 30000 });
    // The overview does not use every face a scene does. Load the scene faces up front, so the first
    // measured scene cannot be the one that pays the font request under `font-display: swap`.
    await page.evaluate(async () => {
      const faces = [
        '400 12px "Geist Mono Variable"',
        '400 14px "Geist Mono Variable"',
        '500 12px "Geist Mono Variable"',
        '700 12px "Geist Mono Variable"',
        '700 14px "Geist Mono Variable"',
        '400 13px "Geist Variable"',
        '500 13px "Geist Variable"',
        '600 13px "Geist Variable"',
        '650 16px "Space Grotesk"',
      ];
      await Promise.all(faces.map((font) => document.fonts.load(font).catch(() => [])));
      await document.fonts.ready;
    });
    const fontReport = await page.evaluate(() => ({
      status: document.fonts.status,
      loaded: [...new Set([...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family))],
      mono: document.fonts.check('700 14px "Geist Mono Variable"'),
      sans: document.fonts.check('400 13px "Geist Variable"'),
      display: document.fonts.check('650 16px "Space Grotesk"'),
    }));
    log(`[font] ${JSON.stringify({ ...fontReport, responses: fontResponses })}`);

    const scenes = {};
    for (const [index, concept] of targets.entries()) {
      const back = page.getByTestId('micro-back');
      if ((await back.count()) > 0) await back.click();
      await page.getByTestId(`micro-learn-${concept.id}`).click();
      await page.getByTestId(`micro-visual-${concept.id}`).waitFor({ timeout: 5000 });
      await page.evaluate(() => document.fonts.ready);
      const catalogueIndex = MICRO_CONCEPTS.findIndex((entry) => entry.id === concept.id);
      scenes[concept.id] = await page.evaluate(measureScenes, {
        selector: `[data-testid="micro-visual-${concept.id}"]`,
        widths: WIDTHS,
        tolerance: TOLERANCE,
        clipTolerance: CLIP_TOLERANCE,
        expectedPlacement: PLACEMENT_CYCLE[catalogueIndex % PLACEMENT_CYCLE.length],
      });
      if ((index + 1) % 10 === 0) log(`  measured ${index + 1}/${targets.length} scenes`);
    }

    if (pageErrors.length > 0) {
      fail(`the micro tab threw while measuring: ${pageErrors.join(' | ')}`, 2);
      return;
    }

    const issues = [];
    for (const [scene, widths] of Object.entries(scenes)) {
      for (const [width, render] of Object.entries(widths)) {
        for (const issue of render.issues) issues.push(`${scene}@${width} ${issue}`);
      }
    }
    if (issues.length > 0) {
      console.error(`[FAIL] ${issues.length} scene issue(s); refusing to record:`);
      for (const issue of issues.slice(0, 80)) console.error(`  ${issue}`);
      if (issues.length > 80) console.error(`  … ${issues.length - 80} more`);
      process.exitCode = 1;
      return;
    }

    const previous = readSnapshot();
    if (RECORD) {
      const merged = { ...(previous?.scenes ?? {}), ...scenes };
      const next = {
        _why:
          'The structural visual snapshot of all 46 micro-focus scenes at both placement widths, read by `npm run check:micro-visuals` (`scripts/check_micro_visuals.mjs`). Each scene is measured in a 477 px side stage and a 966 px bottom stage. Text, text-run boxes, element tags, element boxes, resolved visual-style fingerprints and SVG markup are recorded; a box is compared with a 2 px tolerance, text and fingerprints exactly. It is not a pixel diff: the Linux runner and the author’s machine do not rasterise type identically, while this structure is portable. A measurement issue — overflow, clipped text, an element outside the card — is never recorded and always fails. Re-record with `npm run check:micro-visuals -- --record` when a visual change is intended, and read the diff: it is the list of what moved.',
        version: 1,
        viewport: VIEWPORT,
        widths: WIDTHS,
        tolerance_px: TOLERANCE,
        scenes: merged,
      };
      fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
      fs.writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(next, null, 2)}\n`);
      const result = compareMicroVisuals(next.scenes, scenes, {
        tolerance: TOLERANCE,
        checkStale: false,
      });
      if (result.rows.length > 0) {
        console.error('[FAIL] the recording does not match the measured sweep');
        reportRows(result.rows, result.stale);
        process.exitCode = 1;
        return;
      }
      log(
        `[PASS] recorded ${Object.keys(scenes).length} scene(s) at ${WIDTHS.join(' and ')} px into ${relativeFile(SNAPSHOT_FILE)}`
      );
      return;
    }

    if (!previous) {
      fail(
        `no snapshot at ${relativeFile(SNAPSHOT_FILE)}; record it with \`npm run check:micro-visuals -- --record\``,
        2
      );
      return;
    }
    const result = compareMicroVisuals(previous.scenes, scenes, {
      tolerance: TOLERANCE,
      checkStale: !ONLY,
    });
    if (result.rows.length > 0 || result.stale.length > 0) {
      console.error(
        `[FAIL] micro visual snapshot: ${result.rows.length} drift row(s), ${result.stale.length} stale entr(ies)`
      );
      reportRows(result.rows, result.stale);
      process.exitCode = 1;
      return;
    }
    log(
      `[PASS] micro visuals: ${Object.keys(scenes).length} scene(s) × ${WIDTHS.length} widths, no overflow, clipped text or missing labels`
    );
  } finally {
    await browser?.close();
    if (server) server.server.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
