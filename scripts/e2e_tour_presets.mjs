#!/usr/bin/env node
/**
 * Preset Suite — `scripts/e2e_tour_presets.mjs`
 *
 * Checks that every Apply Demo Preset a learner can reach changes its simulator's readouts. Two groups:
 *
 *   1. the guided tour, steps 2–8, clicked through with Next Step and Apply Demo Preset;
 *   2. the architecture-card presets (the "Open …" buttons on the roadmap), one per curriculum step.
 *      A card on a tier pass other than 1 is reached by selecting its pass first.
 *
 * Each case perturbs or primes the simulator where its default already equals the preset, asserts the
 * readout is NOT yet the preset's value, applies the preset, and asserts the readout IS the value.
 * Tour 1 (the roadmap) has no simulator, so its Apply is a deliberate no-op and is not asserted.
 *
 * The expected readouts are the ones each preset writes in `app/src/components/tabs/*`, measured in the
 * browser: the notch at 547 Hz and 172 Hz, the 5500 RPM drone with decoupling off, the 0.45 m wall, the
 * 42 A short tripping the STO, the 1.6 nH layout, the 2-layer 4.5 nH layout (V_DS 62.4 V), the 30 A
 * solver (99.11% -> 98.55%, T_j 90.9 -> 206.1 °C), Schroeder crest factor 1.71, the SeqLock with zero
 * torn reads, and the hopper knee at -100°.
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

/**
 * Architecture-card presets. `depth` selects the depth that shows the card (Depth 1 is the default).
 * The depth bar in the roadmap prints `DEPTH n OF 3`; it used to print `PASS n OF 3`, which named
 * the same lens a second time.
 * `prime` is set when the card's own simulator already defaults to the preset's value: another card
 * on the same tab is applied first, its readout is checked to differ, and the roadmap is re-entered.
 */
const ARCH_CASES = [
  {
    preset: 'surgical_cable',
    depth: /DEPTH 1 OF 3/,
    card: 'Open Two-Mass Resonance Sim',
    name: 'Bode: low-stiffness cable drive, notch at 172 Hz',
    shows: () => document.getElementById('sl-fn')?.value === '172',
  },
  {
    preset: 'robot_hopper_crouch',
    depth: /DEPTH 1 OF 3/,
    card: 'Open Kinematic Chain Inspector',
    name: 'Models: hopper knee bent to -100°',
    shows: () => document.getElementById('sl-rq2')?.value === '-100',
  },
  {
    preset: 'robot_arm_polish',
    depth: /DEPTH 1 OF 3/,
    card: 'Launch Capstone Inspector',
    name: 'Models: 6-DOF serial arm selected',
    shows: () => document.body.innerText.split('\n').some((s) => s.trim() === '6-DOF Serial Arm'),
  },
  {
    preset: 'robot_furuta_bal',
    depth: /DEPTH 2 OF 3/,
    card: 'Inspect URDF/MuJoCo Models',
    name: 'Models: Furuta pendulum selected',
    shows: () => document.body.innerText.split('\n').some((s) => s.trim() === 'Furuta Pendulum'),
  },
  {
    preset: 'sto_enc_crc',
    depth: /DEPTH 2 OF 3/,
    card: 'Test HIL Fault Injection',
    name: 'Models: encoder CRC break trips the STO',
    shows: () => document.body.innerText.includes('FAULT: ENC CRC'),
  },
  {
    preset: 'pcb_2layer_bad',
    depth: /DEPTH 2 OF 3/,
    card: 'Inspect 2-Layer vs 6-Layer PCB',
    name: '2-layer 4.5 nH layout: turn-off V_DS 62.4 V breaches 60 V',
    shows: () =>
      [...document.querySelectorAll('div')].some(
        (d) =>
          d.children.length === 2 &&
          d.children[0].textContent.trim().startsWith('Turn-Off') &&
          d.children[1].textContent.trim() === '62.4 V'
      ),
  },
  {
    // Measured: 30 A held continuous moves efficiency 99.11% -> 98.55% and T_j 90.9 -> 206.1 °C. The
    // T_j < 110 °C gate belongs to the 15 A continuous design point (see the generator's thermal_and_voltage_ok);
    // this preset is the 30 A peak case, so the readout above 110 °C is expected and the test pins it.
    preset: 'pcb_peak_30a',
    depth: /DEPTH 3 OF 3/,
    card: 'Run 30A Electro-Thermal Solver',
    name: '30 A solver: efficiency 98.55%, MOSFET T_j 206.1 °C, 1 s pulse peak T_j 100.8 °C',
    shows: () => {
      const valueOf = (label) => {
        const row = [...document.querySelectorAll('div')].find(
          (d) => d.children.length === 2 && d.children[0].textContent.trim().startsWith(label)
        );
        return row ? row.children[1].textContent.trim() : null;
      };
      return (
        valueOf('Inverter Efficiency') === '98.55%' &&
        valueOf('MOSFET') === '206.1 °C' &&
        valueOf('Pulse') === '100.8 °C'
      );
    },
  },
  {
    preset: 'cad_flexure_stage',
    depth: /DEPTH 3 OF 3/,
    card: 'Inspect Ti-6Al-4V Flexure CAD',
    prime: { depth: /DEPTH 2 OF 3/, card: 'Inspect QDD Actuator Design' },
    name: 'CAD: notch flexure part selected',
    shows: () => {
      const button = [...document.querySelectorAll('button')].find((b) => /Ti Notch Flexure/.test(b.innerText));
      // The selection is state, not a colour: aria-pressed is what a screen reader hears and
      // what the token migration cannot rename out from under this check.
      return Boolean(button && button.getAttribute('aria-pressed') === 'true');
    },
  },
  {
    preset: 'cad_qdd_carrier',
    depth: /DEPTH 2 OF 3/,
    card: 'Inspect QDD Actuator Design',
    name: 'CAD: 8:1 QDD carrier part selected',
    shows: () => {
      const button = [...document.querySelectorAll('button')].find((b) => /QDD Carrier/.test(b.innerText));
      // The selection is state, not a colour: aria-pressed is what a screen reader hears and
      // what the token migration cannot rename out from under this check.
      return Boolean(button && button.getAttribute('aria-pressed') === 'true');
    },
  },
];

async function setSlider(page, id, value) {
  // Eleven of the twelve tabs are lazy chunks (`React.lazy` in App.tsx), so a preset that drives a
  // slider on one can arrive before that chunk has rendered. Waiting for the control is waiting for
  // the state being changed; without it the native setter is called with `null` and throws
  // "Illegal invocation" from inside the page, which reads like a bug in the app rather than a race.
  await page.waitForSelector(`#${id}`, { timeout: 20000 });
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

/** Let two frames pass: readouts are derived in useEffect, which runs after React commits. */
function settle(page) {
  return page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))))
  );
}

async function freshPage(context, baseUrl, pageErrors) {
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) pageErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button', { timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('button', { timeout: 15000 });
  return page;
}

async function runTour(page, baseUrl, log) {
  // The tour is hidden on the Python runner (the newcomer's first screen), so open the roadmap the
  // same way a learner does before touching the tour controls.
  await page.getByRole('button', { name: /^Start Here: Roadmap/ }).first().click({ timeout: 8000 });
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
    await page.waitForFunction((n) => document.body.innerText.includes(`Tour ${n} / 8`), testCase.step, {
      timeout: 5000,
    });

    if (testCase.perturb?.slider) {
      await setSlider(page, ...testCase.perturb.slider);
    }
    if (testCase.perturb?.button) {
      await page.getByRole('button', { name: testCase.perturb.button }).first().click();
    }
    await settle(page);

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

/** Open a card on the roadmap: select its depth, then press the card's preset button. */
async function openCard(page, { depth, card }) {
  // A fresh context now opens on the Python runner (the beginner's first screen), so the roadmap
  // has to be selected before its cards exist in the DOM.
  await page.getByRole('button', { name: /^Start Here: Roadmap/ }).first().click({ timeout: 8000 });
  await page.getByRole('button', { name: depth }).first().click({ timeout: 8000 });
  await page.getByRole('button', { name: card, exact: true }).first().click({ timeout: 8000 });
}

async function runArchitecture(browser, baseUrl, pageErrors, log) {
  for (const testCase of ARCH_CASES) {
    const context = await browser.newContext();
    try {
      const page = await freshPage(context, baseUrl, pageErrors);
      if (testCase.prime) {
        // The default already matches the preset: show the tab on another card first, and prove it differs.
        await openCard(page, testCase.prime);
        await settle(page);
        const primed = await page.evaluate(testCase.shows);
        assert.equal(primed, false, `${testCase.preset}: the readout already matches before its own card is applied`);
        await page.getByRole('button', { name: /^Start Here: Roadmap/ }).first().click({ timeout: 8000 });
      }
      await openCard(page, testCase)
        .catch((error) => {
          throw new Error(`${testCase.preset}: could not open the card "${testCase.card}": ${error.message.split('\n')[0]}`);
        });
      await page.waitForFunction(testCase.shows, null, { timeout: 5000 }).catch(() => {
        throw new Error(`${testCase.preset}: applying the card did not change the readout (${testCase.name})`);
      });
      await settle(page);
      assert.equal(await page.evaluate(testCase.shows), true, `${testCase.preset}: readout not in its preset state`);
      log(`  ok ${testCase.preset} ${testCase.name}`);
    } finally {
      await context.close();
    }
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
    const tourContext = await browser.newContext();
    try {
      const page = await freshPage(tourContext, baseUrl, pageErrors);
      await runTour(page, baseUrl, (line) => console.log(line));
    } finally {
      await tourContext.close();
    }
    await runArchitecture(browser, baseUrl, pageErrors, (line) => console.log(line));
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }

  assert.deepEqual(pageErrors, [], `the presets logged errors while they ran:\n  ${pageErrors.join('\n  ')}`);
  const total = TOUR_CASES.length + ARCH_CASES.length;
  console.log(`  ok ${total} presets change their simulator's readouts (${TOUR_CASES.length} tour, ${ARCH_CASES.length} architecture cards)`);
  return total;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('e2e_tour_presets.mjs');
if (invokedDirectly) {
  runTourPresetTests({ baseUrl: process.env.E2E_BASE_URL })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`[FAIL] Preset suite failed: ${error?.message ?? error}`);
      process.exit(1);
    });
}
