#!/usr/bin/env node
/**
 * Verify the sweep's `BLOCKED` URLs in a real browser.
 *
 * `scripts/check_links.py` sends a plain HTTP GET with a browser User-Agent, and the hosts that
 * matter most (Wiley, ACM, ScienceDirect, MathWorks, st.com) answer 403/429 to any script while
 * serving the page to a browser that runs their JavaScript challenges. That is why those URLs are
 * triaged as bot walls rather than dead citations — but "it opens in a browser" was an assertion,
 * not evidence. This visits each one in Chromium and records the status, title and final URL, so
 * the triage page can say what was actually seen and on what date.
 *
 * It is evidence gathering, not a second checker: the sweep's verdicts are unchanged, and a page
 * that renders here is still `BLOCKED` to a script. Output goes to `.browser-verdicts.json`
 * (gitignored); paste the summary into `docs/UNVERIFIED_CITATIONS.md`.
 *
 * Usage:
 *   node scripts/verify_bot_walls.mjs                       # every BLOCKED URL in .link_cache.json
 *   node scripts/verify_bot_walls.mjs --limit 5             # smoke-test the harness
 *   node scripts/verify_bot_walls.mjs --cache other.json --out /tmp/verdicts.json
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const cachePath = flag('cache', '.link_cache.json');
const outPath = flag('out', '.browser-verdicts.json');
const timeout = Number(flag('timeout', '20000'));
const limit = Number(flag('limit', '0')) || Infinity;

if (!existsSync(cachePath)) {
  console.error(`No cache at ${cachePath}; run scripts/check_links.py first.`);
  process.exit(2);
}

const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
const walls = Object.entries(cache)
  .filter(([, row]) => row && row.verdict === 'BLOCKED')
  .map(([url]) => url)
  .sort()
  .slice(0, limit);

if (walls.length === 0) {
  console.log('No BLOCKED URLs in the cache; nothing to verify.');
  process.exit(0);
}

const executablePath = resolveChromiumExecutable();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
const context = await browser.newContext({
  // A desktop UA and a viewport, so a site that branches on either serves its real page.
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/124.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 },
  locale: 'en-US',
});

const results = [];
for (const [index, url] of walls.entries()) {
  const page = await context.newPage();
  const started = Date.now();
  let status = null;
  let title = '';
  let error = '';
  let finalUrl = url;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    status = response ? response.status() : null;
    finalUrl = page.url();
    title = (await page.title()).trim().slice(0, 120);
  } catch (exc) {
    error = String(exc.message || exc).slice(0, 160);
  } finally {
    await page.close().catch(() => {});
  }
  const opened = status !== null && status < 400 && title.length > 0;
  results.push({ url, final_url: finalUrl, status, title, opened, error, ms: Date.now() - started });
  console.log(
    `${opened ? 'OPENS' : 'FAILS'}  ${String(status ?? 'ERR').padEnd(4)}  ` +
      `${(title || error || '(no title)').slice(0, 70).padEnd(72)} ${url}`
  );
}

await context.close();
await browser.close();

const opened = results.filter((row) => row.opened).length;
const summary = {
  checked_at: new Date().toISOString(),
  urls: results.length,
  opened,
  walled: results.length - opened,
  results,
};
writeFileSync(outPath, `${JSON.stringify(summary, null, 1)}\n`);
console.log(`\n${opened} of ${results.length} opened in Chromium; ${summary.walled} did not. Wrote ${outPath}.`);
