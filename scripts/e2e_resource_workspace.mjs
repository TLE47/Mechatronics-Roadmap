#!/usr/bin/env node
/**
 * The split resource workspace in a real browser
 * (`scripts/e2e_resource_workspace.mjs`, `npm run test:e2e:resources`).
 *
 * The Node suite pins the registry, the resolver and the split arithmetic. This suite proves the
 * contract the plan actually asked for:
 *
 *   - P.1's Resources panel still lists every occurrence, and "Study here" opens the reader's split;
 *   - the approved futurecoder frame carries the `credentialless` content attribute **before** its
 *     `src` is assigned, so a COEP page does not reduce it to `chrome-error://`;
 *   - Expand, the divider and the phone pane toggle are layout changes: the same frame element
 *     survives all three (a marker attribute set by the test is still there afterwards);
 *   - a licence-cleared card has a direct Reader action (and still keeps its external link), while a
 *     card without a snapshot does not;
 *   - a licence-cleared source can switch to its text snapshot and back without losing the guide;
 *   - a source without reuse permission is an external card with no snapshot and no frame, and the
 *     original stays one click away;
 *   - closing the workspace unmounts it and "Guides" brings the authored list back.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';

async function openResourcePanel(page, baseUrl, lessonId = 'P.1') {
  await page.goto(`${baseUrl}?lesson=${lessonId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByTestId('btn-resources').waitFor({ timeout: 60000 });
  await page.getByTestId('btn-resources').click();
  await page.getByTestId('btn-resource-workspace').first().waitFor({ timeout: 20000 });
}

async function openWorkspace(page, baseUrl, lessonId = 'P.1') {
  await openResourcePanel(page, baseUrl, lessonId);
  await page.getByTestId('btn-resource-workspace').first().click();
  await page.getByTestId('resource-workspace').waitFor({ timeout: 20000 });
}

/** The direct reader must keep its title, footer and body inside the sheet at phone width. */
async function readerFitsPhone(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="resource-reader-sheet"]');
    const reader = sheet?.querySelector('[data-testid="resource-reader"]');
    const footer = reader?.querySelector('footer');
    const source = footer?.querySelector('a');
    const body = reader?.querySelector('[data-testid="reader-snapshot-body"]');
    const title = sheet?.querySelector('h2');
    if (!sheet || !reader || !footer || !source || !body || !title) return null;
    const sheetRect = sheet.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      footerOverflow: footer.scrollWidth > footer.clientWidth + 1,
      sourceOutside: sourceRect.right > sheetRect.right + 1,
      bodyOverflow: body.scrollWidth > body.clientWidth + 1,
      titleLines: Math.round(title.getBoundingClientRect().height / 20),
    };
  });
}

async function main() {
  const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = (process.env.E2E_BASE_URL ?? own.baseUrl).replace(/\/*$/, '/');
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await openResourcePanel(page, baseUrl);
    assert.match(
      await page.getByTestId('resource-open').first().getAttribute('href'),
      /^https:\/\/futurecoder\.io\//,
      'the card must keep its external link beside the Reader action'
    );
    assert.equal(
      await page.getByTestId('btn-resource-reader').count(),
      4,
      'all four P.1 occurrences have licence-cleared snapshots'
    );
    await page.getByTestId('btn-resource-reader').first().click();
    await page.getByTestId('resource-reader-sheet').waitFor({ timeout: 10000 });
    await page.getByTestId('resource-reader').waitFor({ timeout: 10000 });
    assert.equal(await page.getByTestId('resource-reader').count(), 1);
    assert.equal(
      await page.getByTestId('resource-workspace').count(),
      0,
      'direct Reader must not open the split workspace'
    );
    assert.equal(
      await page.getByTestId('resource-open').first().count(),
      1,
      'the card keeps its external link while the Reader sheet is open'
    );
    assert.match(await page.getByTestId('reader-snapshot-license').innerText(), /MIT/);
    assert.match(await page.getByTestId('reader-snapshot-body').innerText(), /futurecoder|Python/i);
    assert.match(await page.getByTestId('reader-snapshot-source').getAttribute('href'), /^https:\/\/futurecoder\.io\//);
    await page.getByTestId('resource-reader-sheet-close').click();
    assert.equal(await page.getByTestId('resource-reader-sheet').count(), 0);
    await page.getByTestId('btn-resources-close').click();
    console.log('  ok a card opens Reader directly without the workspace and keeps its external link');

    await page.setViewportSize({ width: 390, height: 844 });
    await openResourcePanel(page, baseUrl, '05.1');
    await page.getByTestId('btn-resource-reader').first().click();
    await page.getByTestId('resource-reader').waitFor({ timeout: 10000 });
    const longUrlFit = await readerFitsPhone(page);
    assert.deepEqual(
      longUrlFit,
      { pageOverflow: false, footerOverflow: false, sourceOutside: false, bodyOverflow: false, titleLines: 2 },
      'a phone reader must wrap a long source URL and a two-line title without leaving the sheet'
    );
    await page.getByTestId('resource-reader-sheet-close').click();
    console.log('  ok the phone reader wraps its long source URL and title inside the sheet');

    await openResourcePanel(page, baseUrl, '06.1');
    await page.getByTestId('btn-resource-reader').first().click();
    await page.getByTestId('resource-reader').waitFor({ timeout: 10000 });
    const bodyFit = await readerFitsPhone(page);
    assert.equal(bodyFit?.bodyOverflow, false, 'a long unbroken formula must wrap inside the reader body');
    await page.getByTestId('resource-reader-sheet-close').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log('  ok a long unbroken snapshot formula wraps inside the phone reader');

    await openWorkspace(page, baseUrl);
    assert.equal(
      await page.getByTestId('reader-resource-split').getAttribute('data-workspace'),
      'true',
      'the reader must switch to its split layout when the workspace opens'
    );
    assert.equal(await page.getByTestId('reading-guide').count(), 1, 'the authored guide travels with the resource');
    assert.equal(await page.getByTestId('btn-resources').getAttribute('aria-expanded'), 'true');

    const frame = page.getByTestId('resource-frame');
    assert.equal(await frame.count(), 1, 'the approved futurecoder provider gets a frame');
    assert.equal(await frame.getAttribute('data-credentialless'), 'true');
    assert.equal(await frame.getAttribute('credentialless'), '', 'the boolean content attribute must be set');
    assert.match(await frame.getAttribute('src'), /^https:\/\/futurecoder\.io\/course\//);
    assert.match(await frame.getAttribute('sandbox'), /allow-scripts/);
    await frame.evaluate((element) => element.setAttribute('data-probe', 'kept'));
    console.log('  ok futurecoder is framed credentialless and the guide is beside it');

    await page.getByTestId('btn-workspace-expand').click();
    assert.equal(await page.getByTestId('reader-resource-split').getAttribute('data-expanded'), 'true');
    assert.equal(await frame.getAttribute('data-probe'), 'kept', 'Expand must not remount the provider');
    await page.getByTestId('btn-workspace-expand').click();
    assert.equal(await page.getByTestId('reader-resource-split').getAttribute('data-expanded'), 'false');
    console.log('  ok Expand hides the lesson column without reloading the frame');

    const divider = page.getByTestId('workspace-divider');
    const before = Number(await divider.getAttribute('aria-valuenow'));
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(Number(await divider.getAttribute('aria-valuenow')), before + 2);
    assert.match(
      await page.evaluate(() => localStorage.getItem('mechalab_resource_workspace_v1') ?? ''),
      /"ratio":0\.5[23]/,
      'the divider share must persist'
    );
    await page.keyboard.press('End');
    assert.equal(Number(await divider.getAttribute('aria-valuenow')), 70);
    await page.keyboard.press('Home');
    assert.equal(Number(await divider.getAttribute('aria-valuenow')), 30);
    assert.equal(await frame.getAttribute('data-probe'), 'kept', 'a divider drag must not remount the frame');
    console.log('  ok the divider is keyboard-resizable, clamped and persisted');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('workspace-pane-lesson').click();
    assert.equal(await page.getByTestId('resource-workspace').isVisible(), false, 'the lesson pane hides the resource');
    assert.equal(await page.getByTestId('reader-scroll').isVisible(), true);
    await page.getByTestId('workspace-pane-resource').click();
    assert.equal(await page.getByTestId('resource-workspace').isVisible(), true);
    assert.equal(await frame.getAttribute('data-probe'), 'kept', 'switching panes must not remount the frame');
    console.log('  ok a phone switches panes and keeps the same frame');

    await page.setViewportSize({ width: 1440, height: 1000 });
    const readerButton = page.getByTestId('btn-workspace-reader');
    assert.equal(await readerButton.count(), 1, 'a permitted provider offers its text snapshot');
    await readerButton.click();
    await page.getByTestId('resource-reader').waitFor({ timeout: 10000 });
    assert.equal(await page.getByTestId('resource-frame').count(), 0, 'Reader Mode must not leave the frame mounted');
    assert.match(await page.getByTestId('reader-snapshot-license').innerText(), /MIT/);
    assert.match(await page.getByTestId('reader-snapshot-body').innerText(), /futurecoder|Python/i);
    assert.match(await page.getByTestId('reader-snapshot-source').getAttribute('href'), /^https:\/\/futurecoder\.io\//);
    await page.getByTestId('btn-workspace-interactive').click();
    await page.getByTestId('resource-frame').waitFor({ timeout: 10000 });
    console.log('  ok Reader Mode renders the permitted snapshot and returns to the interactive page');

    await page.getByTestId('workspace-resource-select').selectOption({ index: 1 });
    await page.getByTestId('resource-reader').waitFor({ timeout: 10000 });
    assert.equal(
      await page.getByTestId('resource-workspace').getAttribute('data-presentation'),
      'reader',
      'CS50P denies framing and has a licence-cleared snapshot, so Reader Mode is the fallback'
    );
    assert.equal(await page.getByTestId('resource-frame').count(), 0, 'a blocked provider must get no frame');
    assert.match(await page.getByTestId('reader-snapshot-license').innerText(), /CC-BY-NC-SA/);
    assert.match(await page.getByTestId('reader-snapshot-body').innerText(), /Python|Variables|Functions/i);
    assert.match(await page.getByTestId('resource-open-original').getAttribute('href'), /^https:\/\/cs50\.harvard\.edu\//);
    console.log('  ok CS50P opens its attributed non-commercial snapshot, not an empty frame');

    await openWorkspace(page, baseUrl, '00.1');
    assert.equal(
      await page.getByTestId('resource-workspace').getAttribute('data-presentation'),
      'external',
      'Physics Classroom has no reuse permission and must stay a link'
    );
    assert.equal(await page.getByTestId('resource-reader').count(), 0, 'no snapshot may appear for a non-permitted source');
    assert.equal(await page.getByTestId('resource-external-card').count(), 1);
    assert.match(
      await page.getByTestId('resource-open-original').getAttribute('href'),
      /^https:\/\/www\.physicsclassroom\.com\//
    );
    console.log('  ok a source without reuse permission stays an external link');

    await page.getByTestId('btn-workspace-guides').click();
    assert.equal(await page.getByTestId('resource-workspace').count(), 0, 'Guides closes the workspace');
    await page.getByTestId('btn-resources-close').waitFor({ timeout: 10000 });
    assert.equal(await page.getByTestId('btn-resource-workspace').count(), 4);
    assert.equal(
      await page.getByTestId('btn-resource-reader').count(),
      1,
      'only the SparkFun card on 00.1 has a snapshot; the other three stay links'
    );
    console.log('  ok Guides returns the authored list; direct Reader appears only where a snapshot exists');

    assert.deepEqual(pageErrors, [], `the page must not throw: ${pageErrors.join('; ')}`);
    console.log('\nresource workspace: every browser check passed');
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
