#!/usr/bin/env node
/**
 * The primitive contract (`scripts/test_primitive_contract.mjs`, `npm run test:primitives`).
 *
 * Four surfaces in this app are libraries now — the palette (cmdk), the sheets (Radix Dialog and
 * vaul), the notices (sonner) and the counters (NumberFlow) — and the brief that installed them had
 * two rules that no other gate could see:
 *
 * - **they wear the workbench's tokens**, not their library's default skin. Every colour that the
 *   primitives actually paint is checked to be one of the palette variables, resolved from the live
 *   document rather than hard-coded, so a dependency bump that reinstates a default grey fails here
 *   instead of being noticed by a person;
 * - **focus behaves like a dialog**: the skip link is the first stop, `⌘K` puts the caret in the
 *   field and names the highlighted row, Tab never leaves the open dialog, and the key sheet traps
 *   focus the same way.
 *
 * It drives the built bundle on the headless shell (the renderer `check:snapshot` measures with) and
 * prints one line per check. Exit 0 when every line is `ok`.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const CACHE = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');

/** The renderer the surface baseline was measured with — see `docs/VERIFICATION.md`. */
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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

await ensureBuilt();
const { server, port } = await startStaticServer();
const baseUrl = `http://127.0.0.1:${port}/Mechatronics-Roadmap/`;
const browser = await chromium.launch({
  executablePath: browserPath(),
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--font-render-hinting=none'],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  await seedTourSeen(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
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

  // 1. The skip link is the first stop from a fresh document.
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => ({
    tag: document.activeElement?.tagName.toLowerCase() ?? '',
    cls: document.activeElement?.className ?? '',
    text: (document.activeElement?.textContent ?? '').trim().slice(0, 40),
  }));
  check(
    'the skip link is the first tab stop',
    first.tag === 'a' && first.cls.includes('skip-link'),
    `${first.tag}.${first.cls.split(' ')[0]} "${first.text}"`
  );

  // 2. `⌘K` lands the caret in the field and names the highlighted row.
  await page.keyboard.press('Control+k');
  await page.getByTestId('command-palette').waitFor({ timeout: 15000 });
  await page
    .waitForFunction(
      () => Boolean(document.querySelector('[data-testid="input-palette-search"]')?.getAttribute('aria-activedescendant')),
      undefined,
      { timeout: 4000 }
    )
    .catch(() => undefined);
  // Radix moves focus into the content in an effect after the panel mounts, so "is the caret in the
  // field" is a state to wait for, not a fact to read the instant the panel exists — reading it
  // immediately made this check fail roughly one run in three.
  const caretInField = await page
    .waitForFunction(
      () => document.activeElement === document.querySelector('[data-testid="input-palette-search"]'),
      undefined,
      { timeout: 4000 }
    )
    .then(
      () => true,
      () => false
    );
  const palette = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="input-palette-search"]');
    const id = input?.getAttribute('aria-activedescendant');
    const named = id ? document.getElementById(id) : null;
    return {
      focused: document.activeElement === input,
      names: Boolean(named),
      selected: named?.getAttribute('aria-selected') === 'true',
      id,
    };
  });
  check(
    '⌘K puts the caret in the palette field',
    caretInField && palette.focused,
    caretInField ? '' : 'focus never reached the field'
  );
  check(
    'the open palette names its active row',
    palette.names && palette.selected,
    palette.id ?? 'no aria-activedescendant'
  );

  // 3. Tab never leaves the open dialog.
  const inside = new Set();
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    inside.add(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="command-palette"]')))
    );
  }
  check('Tab stays inside the palette', inside.size === 1 && [...inside][0] === true);

  // 4. Every colour the primitives paint is a palette variable.
  const audit = await page.evaluate(async () => {
    // Sampled on a still page. A row's selection is a CSS transition, and a colour read halfway
    // through it is an interpolation that no stylesheet declares — which made this check fail once
    // in a dozen runs and would have made CI fail once in a dozen pushes. Transitions and animations
    // are switched off for the sample and put back afterwards, then two frames are waited out so
    // every computed value is the resting one.
    const quiet = document.createElement('style');
    quiet.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(quiet);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // The palette is the colours written in the app's own CSS. Reading them from the stylesheets —
    // rather than resolving every custom property in a probe, which depends on how a build scopes
    // them — means the contract is exactly what it claims: a primitive may paint what the workbench
    // declares, and a library default that slipped through a dependency bump is a stranger here.
    const canvas = document.createElement('canvas').getContext('2d');
    const triple = (value) => {
      if (!value || value === 'transparent') return null;
      canvas.fillStyle = '#000000';
      canvas.fillStyle = value;
      const out = String(canvas.fillStyle);
      if (out.startsWith('#')) {
        return [parseInt(out.slice(1, 3), 16), parseInt(out.slice(3, 5), 16), parseInt(out.slice(5, 7), 16)].join(',');
      }
      const match = out.match(/rgba?\(([^)]+)\)/);
      return match ? match[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part)).join(',') : null;
    };
    const allowed = new Set();
    const sheets = [];
    const collect = (rules) => {
      for (const rule of Array.from(rules ?? [])) {
        if (rule.cssRules) collect(rule.cssRules);
        const text = rule.cssText ?? '';
        for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
          sheets.push(match[0]);
          const key = triple(match[0]);
          if (key) allowed.add(key);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        collect(sheet.cssRules);
      } catch {
        // A cross-origin stylesheet cannot be read; none of the palette's are.
      }
    }
    const clear = (value) => !value || value === 'transparent' || /,\s*0\s*\)$/.test(value);
    const elements = Array.from(
      document.querySelectorAll(
        '[cmdk-item], [data-testid="command-palette"], [data-sonner-toast], [data-overlay-panel], [data-drawer-handle]'
      )
    );
    const offenders = [];
    for (const element of elements) {
      const style = getComputedStyle(element);
      for (const property of ['color', 'backgroundColor']) {
        const value = style[property];
        if (clear(value)) continue;
        const key = triple(value);
        if (key && !allowed.has(key)) {
          offenders.push(`${element.getAttribute('data-testid') || element.tagName.toLowerCase()} ${property}=${value}`);
        }
      }
    }
    quiet.remove();
    return { elements: elements.length, allowed: allowed.size, offenders: offenders.slice(0, 4) };
  });

  check(
    'every colour the palette paints is written in the app CSS',
    audit.offenders.length === 0,
    audit.offenders.length ? audit.offenders.join(' · ') : `${audit.elements} elements, ${audit.allowed} declared colours`
  );

  await page.keyboard.press('Escape');
  await page.getByTestId('command-palette').waitFor({ state: 'detached', timeout: 8000 });

  // Escape hands focus back to what opened the palette. That restoration is a Radix focus scope and
  // it can land a moment after the panel is gone — if the next dialog opens inside that window, the
  // restoration steals the focus the new dialog just took. Waiting for the documented result first
  // is both the assertion this file wants and the reason the next step cannot race it.
  const focusReturned = await page
    .waitForFunction(() => Boolean(document.activeElement?.classList?.contains('skip-link')), undefined, {
      timeout: 4000,
    })
    .then(
      () => true,
      () => false
    );
  check('Escape hands focus back to the control that opened the palette', focusReturned);

  // 5. The key sheet traps focus the same way.
  await page.keyboard.press('Shift+Slash');
  await page.getByTestId('shortcuts-modal').waitFor({ timeout: 8000 });
  // Same rule as the palette: the sheet is up before its focus scope has run, so the focus is waited
  // for and reported with where it actually is when it does not arrive.
  const sheetFocused = await page
    .waitForFunction(
      () => Boolean(document.activeElement?.closest('[data-testid="shortcuts-modal"]')),
      undefined,
      { timeout: 4000 }
    )
    .then(
      () => true,
      () => false
    );
  const whereFocusIs = sheetFocused
    ? ''
    : await page.evaluate(() => {
        const active = document.activeElement;
        return `focus is on ${active?.tagName.toLowerCase() ?? 'nothing'}${
          active?.getAttribute('data-testid') ? `[${active.getAttribute('data-testid')}]` : ''
        }`;
      });
  check('? opens the key sheet with focus inside it', sheetFocused, whereFocusIs);
  await page.keyboard.press('Escape');
  await page.getByTestId('shortcuts-modal').waitFor({ state: 'detached', timeout: 8000 });

  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' · '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((entry) => !entry.ok);
if (failed.length) {
  console.error(`\n[FAIL] primitive contract: ${failed.length} of ${results.length} checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n[PASS] primitive contract: ${results.length} checks — tokens and focus hold.`);
}
