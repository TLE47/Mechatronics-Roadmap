#!/usr/bin/env node
/** Search defaults to lessons, and the action area carries no Sound control (`scripts/e2e_mission_checks.mjs`). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const executablePath = resolveChromiumExecutable();
if (!executablePath) { console.error('[FAIL] no Chromium'); process.exit(2); }
ensureBuilt();
const { server, port } = await startStaticServer();
const baseUrl = `http://127.0.0.1:${port}/Mechatronics-Roadmap/`;
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  await seedTourSeen(context);
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.getByTestId('btn-theme-toggle').waitFor({ timeout: 30000 });

  // 1. No sound control anywhere in the header action trays.
  const soundInTrays = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.action-tray [data-testid*="sound"]')).map((n) => n.getAttribute('data-testid'))
  );
  if (soundInTrays.length) failures.push(`sound controls still in the action trays: ${soundInTrays.join(', ')}`);

  // 2. The same settings are reachable and live in General settings.
  await page.getByTestId('btn-general-settings').click();
  const panel = page.getByTestId('sound-settings');
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  const master = page.getByTestId('btn-sound-master');
  const before = await master.getAttribute('aria-pressed');
  await master.click();
  const after = await master.getAttribute('aria-pressed');
  if (before === after) failures.push(`sound master did not toggle in General settings (${before})`);
  await panel.getByRole('group').first().waitFor();
  await page.keyboard.press('Escape');

  // 3. The More panel's debugger div exposes the IDE toolset as enabled/disabled buttons.
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-more').click();
  await page.getByTestId('toolbar-more').waitFor({ state: 'visible', timeout: 5000 });
  const debug = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="debugger-menu"] button')).map((n) => ({
      id: n.getAttribute('data-testid'),
      disabled: n.disabled,
    }))
  );
  const ids = debug.map((entry) => entry.id);
  for (const required of ['btn-debug-continue','btn-debug-step-over','btn-debug-step-into','btn-debug-step-out','btn-debug-pause','btn-debug-stop','btn-debug-restart','btn-debugger','btn-trace','btn-breakpoints']) {
    if (!ids.includes(required)) failures.push(`debugger div is missing ${required}`);
  }
  const disabled = debug.filter((entry) => entry.disabled).map((entry) => entry.id);
  console.log(`  ok debugger div: ${ids.length} tools (${ids.join(', ')}); disabled while idle: ${disabled.join(', ')}`);
  await page.getByTestId('btn-more').click();

  // 3. A fresh search lists lessons before a query is typed.
  await page.getByTestId('btn-open-palette').click();
  const palette = page.getByTestId('command-palette');
  await palette.waitFor({ state: 'visible', timeout: 5000 });
  const mode = await palette.getAttribute('data-palette-mode');
  if (mode !== 'search') failures.push(`Search opened in mode ${mode}`);
  const options = await page.evaluate(() => Array.from(document.querySelectorAll('[id^="palette-option-"]')).map((n) => n.textContent.trim()));
  if (options.length < 10) failures.push(`a fresh search listed ${options.length} rows, not the lessons`);
  if (options.length && !options.some((text) => /P\.\d|M\.\d|X\.\d|lesson/i.test(text))) failures.push(`fresh search rows are not lessons: ${options.slice(0, 4).join(' | ')}`);
  console.log(`  ok action trays: no sound control; General settings toggled ${before}→${after}`);
  console.log(`  ok fresh search: mode=${mode}, ${options.length} rows, first="${options[0] ?? ''}"`);
} catch (error) {
  console.error(error.message);
  failures.push(error.message);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) { console.error('[FAIL]'); for (const f of failures) console.error('  - ' + f); process.exit(1); }
console.log('[PASS] mission checks');
