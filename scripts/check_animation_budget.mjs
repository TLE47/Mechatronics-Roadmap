#!/usr/bin/env node
/**
 * The one-standout-animation rule, as a ratchet (`scripts/check_animation_budget.mjs`).
 *
 * The brief that rebuilt these surfaces allowed **one standout animated element per page**, with the
 * arm and the hero counting as theirs. Nothing enforced it: a second looping animation is invisible
 * in a diff and only shows up as a page that feels busy. So this gate counts what actually loops —
 * `document.getAnimations()` entries with `iterations: Infinity` on the visible surface — and
 * compares each tab with the number recorded in `docs/animation-budget.json`.
 *
 * It is a ratchet rather than a hard `<= 1`: a couple of the tabs keep a small status pulse that
 * predates the rule, and pretending otherwise would either fail today or force a redesign nobody
 * asked for. A surface may never *gain* one, which is what the rule needed; every surface above one
 * is printed so the debt stays visible. `--record` writes today's counts.
 *
 * The count is taken on the built bundle in the headless shell, in the dark palette, after each tab
 * has painted (`data-testid="tab-loading"` gone), so a lazily-mounted tab is not measured as empty.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const ROOT = process.cwd();
const BUDGET = path.join(ROOT, 'docs', 'animation-budget.json');
const RECORD = process.argv.includes('--record');
const CACHE = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');

function browserPath() {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override && fs.existsSync(override)) return override;
  if (fs.existsSync(CACHE)) {
    const builds = fs
      .readdirSync(CACHE)
      .filter((name) => name.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse();
    for (const build of builds) {
      for (const inner of fs.readdirSync(path.join(CACHE, build))) {
        const candidate = path.join(CACHE, build, inner, 'chrome-headless-shell');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return chromium.executablePath();
}

await ensureBuilt();
const { server, port } = await startStaticServer();
const baseUrl = `http://127.0.0.1:${port}/Mechatronics-Roadmap/`;
const browser = await chromium.launch({
  executablePath: browserPath(),
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--font-render-hinting=none'],
});

const counts = {};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  await seedTourSeen(context);
  const page = await context.newPage();
  await page.route('https://api.github.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: '{}',
    })
  );
  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="btn-theme-toggle"]');
  // The ruler measures itself first: a counter that can only ever answer zero is not a gate.
  const ruler = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.animation = 'spin 1s linear infinite';
    document.body.appendChild(probe);
    const saw = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getTiming?.() ?? {};
      return (timing.iterations ?? 1) === Infinity && animation.effect?.target === probe;
    }).length;
    probe.remove();
    return saw;
  });
  if (ruler !== 1) {
    console.error(`[FAIL] the animation counter cannot see a known infinite animation (saw ${ruler})`);
    process.exit(2);
  }

  const advanced = page.locator('[data-testid="btn-mode-advanced"]');
  if (await advanced.count()) await advanced.click();
  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="tab-btn-"]')).map((button) =>
      button.getAttribute('data-testid').replace('tab-btn-', '')
    )
  );
  for (const tab of tabs) {
    await page.click(`[data-testid="tab-btn-${tab}"]`);
    await page
      .waitForFunction(
        () =>
          !document.querySelector('[data-testid="tab-loading"]') &&
          !document.querySelector('[data-editor-ready="false"]'),
        undefined,
        { timeout: 30000 }
      )
      .catch(() => undefined);
    await page.waitForTimeout(500);
    counts[tab] = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => {
          const timing = animation.effect?.getTiming?.() ?? {};
          const iterations = typeof timing.iterations === 'number' ? timing.iterations : 1;
          const target = animation.effect?.target;
          if (!target || !target.isConnected) return false;
          // The notices and the toaster are transient and not part of a page's look.
          if (target.closest?.('[data-sonner-toaster]')) return false;
          return iterations === Infinity;
        }).length
    );
  }
} finally {
  await browser.close();
  server.close();
}

const surfaces = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));

if (RECORD) {
  const file = {
    _why:
      'Looping animations per surface, for `npm run check:animations` (`scripts/check_animation_budget.mjs`). The brief that rebuilt these surfaces allows one standout animated element per page; this file is the ratchet that keeps a surface from gaining a second. A number may only go up with a deliberate re-record and a sentence saying which element and why, and the printed list of surfaces above one is the debt to pay down.',
    counts: surfaces,
  };
  fs.writeFileSync(BUDGET, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`[recorded] ${Object.keys(surfaces).length} surfaces → docs/animation-budget.json`);
  for (const [tab, count] of Object.entries(surfaces)) console.log(`  ${String(count).padStart(2)}  ${tab}`);
  process.exit(0);
}

if (!fs.existsSync(BUDGET)) {
  console.error('[FAIL] docs/animation-budget.json is missing — run `node scripts/check_animation_budget.mjs --record`');
  process.exit(2);
}
const budget = JSON.parse(fs.readFileSync(BUDGET, 'utf8')).counts ?? {};
const failures = [];
for (const [tab, count] of Object.entries(surfaces)) {
  const allowed = budget[tab];
  if (typeof allowed !== 'number') failures.push(`${tab}: ${count} loops, no recorded ceiling — record it deliberately`);
  else if (count > allowed) failures.push(`${tab}: ${count} looping animations, was ${allowed} — a page may not gain a second standout`);
}
for (const tab of Object.keys(budget)) {
  if (!(tab in surfaces)) failures.push(`${tab}: recorded but no longer measured — a surface was renamed or lost`);
}
const loud = Object.entries(surfaces).filter(([, count]) => count > 1);

if (failures.length) {
  for (const line of failures) console.error(`  FAIL ${line}`);
  console.error(`\n[FAIL] animation budget: ${failures.length} problem(s).`);
  process.exitCode = 1;
} else {
  console.log(
    `[PASS] animation budget: ${Object.keys(surfaces).length} surfaces, none gained a looping animation` +
      (loud.length ? ` (over one: ${loud.map(([tab, count]) => `${tab} ${count}`).join(', ')})` : '')
  );
}
