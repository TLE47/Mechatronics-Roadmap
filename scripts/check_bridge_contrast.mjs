#!/usr/bin/env node
/**
 * Every Bridge Notes card, in every palette, at both widths (`scripts/check_bridge_contrast.mjs`).
 *
 * P.9's card had a ten-case audit of its own — dark, light, paper, high contrast, and dark under
 * reduced motion, each at 1280 and 380 px — because that card is the one the chase mechanic was
 * proved on. The other thirty-four cards had none of it: they were reviewed at desktop widths in the
 * palette that happened to be open, which is how a 10 px label survived on the string-sum card until
 * a size audit that only looked at the workbench found it.
 *
 * This gate generalises the P.9 measurement to every card the reader can mount:
 *
 *   - **text** inside a card is sampled with its computed colour, composited over the card's real
 *     backdrop, and must clear 4.5:1;
 *   - **strokes** on the card's drawings must clear 3:1 (WCAG's non-text floor);
 *   - the card must not scroll sideways, and neither may the page;
 *   - the case must actually paint the palette and motion it asked for, or the measurement is void.
 *
 * It samples what is there rather than a hand-picked list of elements, so a new readout cannot be
 * added outside the audit. It does not drive the controls: P.9's own audit proves the dials take the
 * keyboard, and `e2e_reader_route.mjs` proves every card mounts and opens at rest.
 *
 * Usage
 *   node --experimental-strip-types scripts/check_bridge_contrast.mjs
 *   node --experimental-strip-types scripts/check_bridge_contrast.mjs --only scaling-dials
 *
 * Exit-code family: typed
 *   0  every case passed
 *   1  at least one finding, each named with the card, palette, width and ratio
 *   2  nothing to measure (no build, no Chromium, an unreadable map)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { BASE, ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const ROOT = process.cwd();
const MAP = path.join(ROOT, 'resources', 'bridge-visuals.json');

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? new RegExp(argv[argv.indexOf('--only') + 1]) : null;
const workersAt = argv.indexOf('--workers');
const WORKERS = workersAt === -1 ? Number(process.env.CONTRAST_WORKERS ?? 4) : Number(argv[workersAt + 1]);

/** The palettes the app ships, the OS scheme each is reached under, and the motion preference. */
const CASES = [
  { theme: 'dark', scheme: 'dark', motion: 'no-preference', width: 1280, label: 'desktop' },
  { theme: 'light', scheme: 'light', motion: 'no-preference', width: 1280, label: 'desktop' },
  { theme: 'paper', scheme: 'light', motion: 'no-preference', width: 1280, label: 'desktop' },
  { theme: 'contrast', scheme: 'dark', motion: 'no-preference', width: 1280, label: 'desktop' },
  { theme: 'dark', scheme: 'dark', motion: 'reduce', width: 1280, label: 'desktop' },
  { theme: 'dark', scheme: 'dark', motion: 'no-preference', width: 380, label: 'phone' },
];

const TEXT_MIN = 4.5;
const STROKE_MIN = 3;

if (!fs.existsSync(MAP)) {
  console.error(`[FAIL] no visual map at ${path.relative(ROOT, MAP)}`);
  process.exit(2);
}
const pages = JSON.parse(fs.readFileSync(MAP, 'utf8')).pages;
const byReaderPath = new Map(PYTHON_LESSONS.map((lesson) => [lesson.readerPath, lesson]));
const targets = Object.entries(pages)
  .map(([page, name]) => ({ page, name, lesson: byReaderPath.get(page) }))
  .filter((entry) => entry.lesson && (!only || only.test(entry.name) || only.test(entry.lesson.id)));
if (targets.length === 0) {
  console.error(`[FAIL] no card matches ${only}`);
  process.exit(2);
}

if (!process.env.PAGES_SERVER_URL) ensureBuilt();
const server = process.env.PAGES_SERVER_URL ? null : await startStaticServer();
const base = (process.env.PAGES_SERVER_URL ?? `http://127.0.0.1:${server.port}${BASE}`).replace(/\/?$/, '/');
const browser = await chromium.launch({
  ...(resolveChromiumExecutable() ? { executablePath: resolveChromiumExecutable() } : {}),
  headless: true,
});

/** The measurement itself, run in the page: sample text and strokes, composite each over its real backdrop. */
const measure = (name) => {
  // Inside the page: the module's constants are not in scope here, so the floors travel with the code.
  const TEXT_MIN = 4.5;
  const STROKE_MIN = 3;
  const card = document.querySelector(`[data-testid="bridge-visual-${name}"]`);
  if (!card) return { missing: true };
  const parse = (css) => {
    const match = css && css.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] };
  };
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const backdrop = (element) => {
    const layers = [];
    let node = element;
    while (node && node.nodeType === 1) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color && color.a > 0) layers.push(color);
      if (color && color.a >= 1) break;
      node = node.parentElement;
    }
    let baseColor = { r: 255, g: 255, b: 255 };
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      baseColor = {
        r: layer.r * layer.a + baseColor.r * (1 - layer.a),
        g: layer.g * layer.a + baseColor.g * (1 - layer.a),
        b: layer.b * layer.a + baseColor.b * (1 - layer.a),
      };
    }
    return baseColor;
  };
  const show = (color) => `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
  const background = backdrop(card);
  const findings = [];
  const sample = (what, color, alpha, floor) => {
    if (!color) return;
    const painted = {
      r: color.r * alpha + background.r * (1 - alpha),
      g: color.g * alpha + background.g * (1 - alpha),
      b: color.b * alpha + background.b * (1 - alpha),
    };
    const value = ratio(painted, background);
    if (value + 0.005 < floor) {
      findings.push({
        what,
        ratio: Number(value.toFixed(2)),
        floor,
        color: show(painted),
        background: show(background),
      });
    }
  };
  const opacityOf = (style, kind) =>
    (Number.parseFloat(style.opacity || '1') || 1) *
    (kind === 'stroke' ? Number.parseFloat(style.strokeOpacity || '1') || 1 : 1) *
    (kind === 'fill' ? Number.parseFloat(style.fillOpacity || '1') || 1 : 1);

  // Text: every element with its own visible text, capped so a huge card cannot make one case slow.
  let textSamples = 0;
  for (const element of card.querySelectorAll('*')) {
    const own = [...element.childNodes].some(
      (node) => node.nodeType === 3 && String(node.textContent ?? '').trim().length > 0
    );
    if (!own) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    const kind = element instanceof SVGElement ? 'fill' : 'color';
    const painted = kind === 'fill' ? parse(style.fill) : parse(style.color);
    if (!painted) continue;
    sample(`${element.tagName.toLowerCase()}: ${String(element.textContent).trim().slice(0, 28)}`, painted, painted.a * opacityOf(style, kind), TEXT_MIN);
    textSamples += 1;
    if (textSamples >= 80) break;
  }

  // Drawings: a stroke is a gauge, a tick or a needle, and WCAG's non-text floor is 3:1.
  let strokeSamples = 0;
  for (const element of card.querySelectorAll('svg path, svg line, svg circle, svg rect, svg polyline')) {
    const style = getComputedStyle(element);
    if (style.stroke === 'none' || !style.stroke) continue;
    if ((Number.parseFloat(style.strokeWidth || '0') || 0) <= 0) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 1 && box.height < 1) continue;
    const painted = parse(style.stroke);
    if (!painted) continue;
    sample(`${element.tagName.toLowerCase()} stroke`, painted, painted.a * opacityOf(style, 'stroke'), STROKE_MIN);
    strokeSamples += 1;
    if (strokeSamples >= 60) break;
  }

  return {
    theme: document.documentElement.getAttribute('data-theme'),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    background: show(background),
    findings,
    textSamples,
    strokeSamples,
    cardOverflowX: card.scrollWidth - card.clientWidth,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};

const failures = [];
let measured = 0;

async function auditOne(target, testCase) {
  const where = `${target.name} · ${target.lesson.id} · ${testCase.theme}${
    testCase.motion === 'reduce' ? ' (reduced motion)' : ''
  } at ${testCase.label} (${testCase.width}px)`;
  const context = await browser.newContext({
    viewport: { width: testCase.width, height: testCase.width < 500 ? 844 : 900 },
    colorScheme: testCase.scheme,
    reducedMotion: testCase.motion,
  });
  await seedTourSeen(context);
  await context.addInitScript((pick) => {
    try {
      localStorage.setItem('mechalab_theme_v1', pick);
    } catch {
      // A blocked store is the theme suite's case; here the painted attribute is asserted instead.
    }
  }, testCase.theme);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  try {
    await page.goto(`${base}?lesson=${encodeURIComponent(target.lesson.id)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
      timeout: 25000,
    });
    await page.keyboard.press('Alt+1');
    await page.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-layout') === 'study',
      undefined,
      { timeout: 15000 }
    );
    await page.getByRole('heading', { name: 'Bridge Notes', exact: true }).scrollIntoViewIfNeeded();
    await page.getByTestId(`bridge-visual-${target.name}`).waitFor({ state: 'visible', timeout: 25000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid="lazy-pending"]'), {
      timeout: 25000,
    });
    await page.waitForTimeout(120);
    const painted = await page.evaluate(measure, target.name);
    assert.ok(!painted.missing, `${where}: the card did not mount`);
    assert.equal(painted.theme, testCase.theme, `${where}: the ${testCase.theme} palette is not the one painted`);
    assert.equal(
      painted.reducedMotion,
      testCase.motion === 'reduce',
      `${where}: the page does not see the motion preference it was opened with`
    );
    assert.equal(painted.cardOverflowX, 0, `${where}: the card scrolls sideways by ${painted.cardOverflowX}px`);
    assert.equal(painted.docOverflow, 0, `${where}: the page scrolls sideways by ${painted.docOverflow}px`);
    assert.equal(pageErrors.length, 0, `${where}: page errors: ${pageErrors.join(' | ')}`);
    assert.ok(painted.textSamples >= 3, `${where}: only ${painted.textSamples} text sample(s) were measured`);
    assert.equal(
      painted.findings.length,
      0,
      `${where}: ${painted.findings
        .map((finding) => `${finding.what} at ${finding.ratio}:1 (min ${finding.floor}, ${finding.color} on ${finding.background})`)
        .join('; ')}`
    );
    measured += 1;
  } finally {
    await context.close();
  }
}

try {
  const jobs = [];
  for (const target of targets) for (const testCase of CASES) jobs.push({ target, testCase });
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      try {
        await auditOne(job.target, job.testCase);
      } catch (error) {
        failures.push(String(error.message ?? error).slice(0, 500));
        console.log(`  FAIL ${String(error.message ?? error).slice(0, 300)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(WORKERS, jobs.length) }, worker));
} finally {
  await browser.close();
  server?.server?.close();
}

console.log(`\n  ${targets.length} card(s), ${CASES.length} case(s) each, ${measured} measured`);
if (failures.length) {
  console.log(`\n[FAIL] bridge contrast: ${failures.length} case(s) failed`);
  process.exit(1);
}
console.log(
  `[PASS] bridge contrast: ${measured} case(s) across ${targets.length} card(s) — text at 4.5:1, ` +
    `strokes at 3:1, no sideways scroll, the palette and motion each case asked for`
);
