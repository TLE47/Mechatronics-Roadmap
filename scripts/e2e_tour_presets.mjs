#!/usr/bin/env node
/**
 * Guided-Tour Preset Suite — `scripts/e2e_tour_presets.mjs`
 *
 * Walks the guided tour from step 2 to step 8 in a real browser. At each step it:
 *   1. perturbs the simulator wherever the default state already equals the preset, so the
 *      preset has something to change (the tour's own copy describes the same drag);
 *   2. asserts the readout is NOT yet the preset's value (proves the perturbation took);
 *   3. clicks Apply Demo Preset and asserts the readout IS now the preset's value.
 * Step 1 (the roadmap) has no simulator, so its Apply is a deliberate no-op and is not asserted.
 *
 * The expected readouts are the ones each preset writes in `app/src/components/tabs/*`, and they
 * were measured in the browser when the presets were written: the notch at 547 Hz, the 5500 RPM
 * drone with decoupling off, the 0.45 m wall, the 42 A short tripping the STO, the 1.6 nH layout,
 * Schroeder crest factor 1.71, and the SeqLock with zero torn reads.
 *
 * Usage:  node scripts/e2e_tour_presets.mjs
 *         E2E_BASE_URL=<dev server> when a suite runner already has one (scripts/test_workbench.mjs).
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';

/** Tour steps 2–8, in tour order. `perturb` runs before the precondition; `shows` is the readout. */
const TOUR_CASES = [
  {
    step: 2,
    name: 'Bode: notch centred on the resonance (547 Hz)',
    perturb: { slider: ['sl-fn', '300'] },
    shows: () => document.getElementById('sl-fn')?.value === '547',
  },
  {
    step: 3,
    name: 'FOC: 5500 RPM drone with decoupling off',
    // Decoupling defaults to ENABLED, so DISABLED (COUPLED) only appears after the preset.
    // The third range input in <main> is the speed slider (fbw, iq, rpm).
    shows: () =>
      document.body.innerText.includes('DISABLED (COUPLED)') &&
      document.querySelectorAll('main input[type=range]')[2]?.value === '5500',
  },
  {
    step: 4,
    name: 'Pendulum: 0.45 m safety wall, and the CBF engages',
    shows: () => document.getElementById('sl-xmax')?.value === '0.45',
    // The wall alone is not the claim: the filter must brake the cart. Sampled after the wall reads 0.45.
    afterShows: async (page) => {
      const minMargin = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const read = () => {
              const m = document.body.innerText.match(/CBF Margin h\(x\)\n([-+\d.]+) m/);
              return m ? Number(m[1]) : null;
            };
            const seen = [];
            const timer = setInterval(() => {
              const v = read();
              if (v !== null) seen.push(v);
            }, 100);
            setTimeout(() => {
              clearInterval(timer);
              resolve(seen.length ? Math.min(...seen) : null);
            }, 3000);
          })
      );
      assert.ok(minMargin !== null, 'the CBF margin readout never appeared');
      assert.ok(
        minMargin < 0.1,
        `with the 0.45 m wall the CBF margin should be pinned near 0, lowest sampled was ${minMargin} m`
      );
    },
  },
  {
    step: 5,
    name: 'Models: 42 A short trips the STO',
    shows: () => document.body.innerText.includes('FAULT: OC DESAT'),
  },
  {
    step: 6,
    name: 'CAD/PCB: 6-layer layout at 1.6 nH loop inductance',
    perturb: { slider: ['sl-pcbl', '4.5'] },
    shows: () => document.getElementById('sl-pcbl')?.value === '1.6',
  },
  {
    step: 7,
    name: 'SysID: Schroeder phasing, crest factor 1.71',
    // Default is Schroeder, so switch to zero-phase first; the preset must switch back.
    perturb: { button: /Toggle Schroeder/ },
    shows: () => /Crest Factor \(CF\)\s+1\.71/.test(document.body.innerText),
  },
  {
    step: 8,
    name: 'ESKF: WaitFreeSeqLock on, zero torn reads',
    perturb: { button: /Toggle WaitFreeSeqLock/ },
    shows: () =>
      document.body.innerText.includes('SEQLOCK ENABLED') &&
      /Torn Reads Detected\s+0 \/ 250k/.test(document.body.innerText),
  },
];

async function setSlider(page, id, value) {
  await page.evaluate(
    ([sliderId, v]) => {
      const el = document.getElementById(sliderId);
      // React tracks the value itself, so write through the native setter and dispatch `input`.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    [id, value]
  );
}

async function runTour(page, baseUrl, log) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button', { timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('button', { timeout: 15000 });

  // Real clicks on the tour's own controls: the same path a learner takes.
  const next = page.getByRole('button', { name: /^Next Step/ });
  const apply = page.getByRole('button', { name: 'Apply Demo Preset', exact: true });

  let stepNumber = 1;
  for (const testCase of TOUR_CASES) {
    const label = `step ${testCase.step} (${testCase.name})`;
    while (stepNumber < testCase.step) {
      await next.click();
      stepNumber += 1;
    }
    await page.waitForFunction((n) => document.body.innerText.includes(`Step ${n} / 8`), testCase.step, {
      timeout: 5000,
    });

    if (testCase.perturb?.slider) {
      await setSlider(page, ...testCase.perturb.slider);
    }
    if (testCase.perturb?.button) {
      await page.getByRole('button', { name: testCase.perturb.button }).click();
    }
    // Readouts are derived in useEffect, which runs after React commits, not inside the click.
    // Let two frames pass (the same commit wait the pairs sweep uses) before reading anything.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))))
    );

    const before = await page.evaluate(testCase.shows);
    if (before !== false) {
      const observed = await page.evaluate(() => {
        const lines = document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
        const i = lines.findIndex((s) => s.includes('Crest Factor (CF)') || s.includes('DISABLED') || s.includes('ENABLED'));
        return i < 0 ? '(no readout line found)' : lines.slice(i, i + 3).join(' | ');
      });
      assert.fail(`${label}: the readout already shows the preset before Apply (observed: ${observed}), so the test proves nothing`);
    }

    await apply.click();
    await page.waitForFunction(testCase.shows, null, { timeout: 5000 }).catch(() => {
      throw new Error(`${label}: Apply Demo Preset did not change the readout`);
    });
    if (testCase.afterShows) await testCase.afterShows(page);
    log(`  ok ${testCase.step}/8 ${testCase.name}`);
  }
}

export async function runTourPresetTests({ baseUrl: externalBaseUrl } = {}) {
  const own = externalBaseUrl ? null : await startDevServer(process.cwd());
  const baseUrl = (externalBaseUrl ?? own.baseUrl).replace(/\/*$/, '/');
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });

  const pageErrors = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) pageErrors.push(`HTTP ${response.status()} ${response.url()}`);
    });

    await runTour(page, baseUrl, (line) => console.log(line));
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }

  assert.deepEqual(pageErrors, [], `the tour logged errors while it ran:\n  ${pageErrors.join('\n  ')}`);
  console.log(`  ok ${TOUR_CASES.length} tour presets change their simulator's readouts`);
  return TOUR_CASES.length;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('e2e_tour_presets.mjs');
if (invokedDirectly) {
  runTourPresetTests({ baseUrl: process.env.E2E_BASE_URL })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`[FAIL] Guided-tour preset suite failed: ${error?.message ?? error}`);
      process.exit(1);
    });
}
