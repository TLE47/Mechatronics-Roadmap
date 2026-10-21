#!/usr/bin/env node
/**
 * Light/dark contract + legibility sweep in a real browser
 * (`scripts/e2e_theme.mjs`, `npm run test:theme:e2e`)
 *
 * Two questions, neither of which a unit test can answer:
 *
 * 1. Does the toggle own the page? `data-theme` on <html>, the stored key, the
 *    OS default on a first visit, and an explicit pick surviving both a reload
 *    and an OS flip.
 * 2. Is every one of the eleven tabs readable in both modes? The audit walks
 *    every visible text node, composites its colour over the stack of ancestor
 *    backgrounds it actually sits on, and computes WCAG contrast. Text below
 *    3:1 fails at any size; text between 3:1 and its size's minimum is listed as
 *    a warning, because the ratio is the fact and the threshold is a judgement.
 * 3. Does `?view=theme` describe the palette it is looking at? The page parses
 *    index.css, so the browser check is the one that proves the parsed values
 *    reach painted pixels: the swatch for `--panel` must be the colour in the
 *    file, both palettes must draw, and the page must survive the same contrast
 *    audit in both modes as every tab does.
 *
 * `E2E_BASE_URL` points it at a running dev server (the combined runner passes
 * one); alone, it boots its own. `--screenshots` also writes one PNG per tab per
 * theme to `.fb-scratch/theme/` for a human review that the numbers cannot do.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startDevServer } from './e2e_browser_workbench.mjs';

// The tab ids come from the one file that names them, so a new tab is swept without
// touching this script.
const tabNames = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'app/src/data/workbenchTabs.json'), 'utf8')
);
const TAB_IDS = Object.keys(tabNames.tabs);

const SHOTS = process.argv.includes('--screenshots');
const SHOT_DIR = path.join(process.cwd(), '.fb-scratch', 'theme');

/** The in-page audit. Kept inside a string-free function so it runs where it is defined. */
function auditContrast() {
  const parse = (css) => {
    const match = css && css.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] };
  };
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
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
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      base = {
        r: layer.r * layer.a + base.r * (1 - layer.a),
        g: layer.g * layer.a + base.g * (1 - layer.a),
        b: layer.b * layer.a + base.b * (1 - layer.a),
        a: 1,
      };
    }
    return base;
  };
  const findings = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = (node.textContent || '').trim();
    if (!text) continue;
    const element = node.parentElement;
    if (!element || element.closest('svg')) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number.parseFloat(style.opacity) < 0.2) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    // A scrolled-out row is not on screen to be read; its contrast is checked when it is.
    const offscreen = box.bottom < 0 || box.top > window.innerHeight;
    const color = parse(style.color);
    if (!color) continue;
    const background = backdrop(element);
    const fg = {
      r: color.r * color.a + background.r * (1 - color.a),
      g: color.g * color.a + background.g * (1 - color.a),
      b: color.b * color.a + background.b * (1 - color.a),
    };
    const size = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10) || 400;
    const large = size >= 24 || (weight >= 600 && size >= 18.66);
    const value = ratio(fg, background);
    findings.push({
      text: text.slice(0, 70),
      tag: element.tagName.toLowerCase(),
      className: String(element.className || '').slice(0, 90),
      ratio: Number(value.toFixed(2)),
      required: large ? 3 : 4.5,
      size,
      offscreen,
      color: style.color,
      background: `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`,
    });
  }
  const onScreen = findings.filter((finding) => !finding.offscreen);
  return {
    checked: onScreen.length,
    failures: onScreen.filter((finding) => finding.ratio < 3),
    warnings: onScreen.filter((finding) => finding.ratio >= 3 && finding.ratio < finding.required),
    worst: onScreen.sort((a, b) => a.ratio - b.ratio).slice(0, 6),
  };
}

const THEME_ATTRIBUTE = 'data-theme';

/** A token's value in one palette, read from the stylesheet the page parses. */
function stylesheetValue(token, palette) {
  const css = fs.readFileSync(path.join(process.cwd(), 'app/src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const opener = palette === 'light' ? '[data-theme="light"]' : ':root';
  const start = css.search(new RegExp(`^${opener.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm'));
  assert.ok(start >= 0, `index.css has no ${opener} block`);
  const body = css.slice(css.indexOf('{', start), css.indexOf('}', css.indexOf('{', start)));
  const match = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(body);
  assert.ok(match, `index.css has no ${token} in ${opener}`);
  return match[1].trim();
}

/** `#0e1624` -> `rgb(14, 22, 36)`, the form getComputedStyle reports. */
function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

async function firstVisit(page, url, colorScheme) {
  await page.emulateMedia({ colorScheme });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="btn-theme-toggle"]');
}

async function main() {
  const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? own.baseUrl;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const rows = [];
  let failures = 0;
  const notes = [];

  try {
    // 1. First visit follows the OS, with nothing stored.
    const lightContext = await browser.newContext({ colorScheme: 'light' });
    const lightPage = await lightContext.newPage();
    await firstVisit(lightPage, baseUrl, 'light');
    assert.equal(
      await lightPage.evaluate((attr) => document.documentElement.getAttribute(attr), THEME_ATTRIBUTE),
      'light',
      'a light OS and no stored choice must paint the light theme'
    );
    const storageKey = await lightPage.evaluate(() => {
      const keys = Object.keys(localStorage);
      return keys.find((key) => key.includes('theme')) ?? null;
    });
    assert.equal(storageKey, null, 'a first visit must not write a choice it did not make');
    console.log('  ok first visit with a light OS paints light and stores nothing');

    // 2. The toggle flips, labels itself honestly and persists.
    await lightPage.click('[data-testid="btn-theme-toggle"]');
    assert.equal(
      await lightPage.evaluate((attr) => document.documentElement.getAttribute(attr), THEME_ATTRIBUTE),
      'dark',
      'the toggle must set data-theme'
    );
    assert.equal(
      await lightPage.evaluate(
        () => document.querySelector('[data-testid="btn-theme-toggle"]').getAttribute('aria-label')
      ),
      'Switch to light theme',
      'the button must offer the other theme once it is dark'
    );
    const stored = await lightPage.evaluate(() => {
      const key = Object.keys(localStorage).find((name) => name.includes('theme'));
      return key ? [key, localStorage.getItem(key)] : null;
    });
    assert.ok(stored, 'the pick must be written to localStorage');
    assert.equal(stored[1], 'dark', 'the stored pick must be the theme that is on screen');
    console.log(`  ok the toggle writes ${stored[0]}=${stored[1]} and flips data-theme`);

    // 3. The pick survives a reload and an OS flip.
    await lightPage.reload({ waitUntil: 'domcontentloaded' });
    await lightPage.waitForSelector('[data-testid="btn-theme-toggle"]');
    assert.equal(
      await lightPage.evaluate((attr) => document.documentElement.getAttribute(attr), THEME_ATTRIBUTE),
      'dark',
      'a reload must restore the stored pick, not the OS default'
    );
    await lightPage.emulateMedia({ colorScheme: 'light' });
    await lightPage.waitForTimeout(120);
    assert.equal(
      await lightPage.evaluate((attr) => document.documentElement.getAttribute(attr), THEME_ATTRIBUTE),
      'dark',
      'once picked, an OS flip must not override the learner'
    );
    console.log('  ok the pick survives a reload and an OS flip');

    // 4. color-scheme is set too, so native scrollbars and form controls match.
    const schemes = await lightPage.evaluate(() => ({
      inline: document.documentElement.style.colorScheme,
      computed: getComputedStyle(document.documentElement).colorScheme,
      meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
    }));
    assert.equal(schemes.computed, 'dark', 'the root must declare color-scheme: dark');
    assert.equal(schemes.meta, '#070b12', 'the browser chrome colour must follow the theme');
    console.log('  ok color-scheme and the theme-color meta follow the theme');

    // 5. Every tab, both themes. The sweep uses the same browser and a clean slate.
    await lightContext.close();
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({ colorScheme: theme === 'dark' ? 'dark' : 'light' });
      const page = await context.newPage();
      await firstVisit(page, baseUrl, theme);
      assert.equal(
        await page.evaluate((attr) => document.documentElement.getAttribute(attr), THEME_ATTRIBUTE),
        theme,
        `a ${theme} OS must paint the ${theme} theme`
      );
      await page.waitForTimeout(400);
      // Beginner mode hides the deeper labs; the sweep needs all eleven.
      const advanced = page.locator('[data-testid="btn-mode-advanced"]');
      if (await advanced.count()) await advanced.click();
      for (const tabId of TAB_IDS) {
        await page.click(`[data-testid="tab-btn-${tabId}"]`);
        await page.waitForTimeout(260);
        const report = await page.evaluate(auditContrast);
        // A canvas or chart is drawn against literal plot colours, so the inset has to stay
        // dark in both themes — a white plot would wash out every trace on it.
        const plot = await page.evaluate(() => {
          const surface = document.querySelector('.plot');
          return surface ? getComputedStyle(surface).backgroundColor : null;
        });
        if (plot) assert.equal(plot, 'rgb(7, 10, 18)', `[${theme}/${tabId}] plot surfaces must stay dark`);
        rows.push({ theme, tab: tabId, ...report });
        if (SHOTS) {
          fs.mkdirSync(SHOT_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(SHOT_DIR, `${theme}-${tabId.replace('tab-', '')}.png`),
            fullPage: false,
          });
        }
        if (report.failures.length) {
          failures += report.failures.length;
          const sample = report.failures
            .slice(0, 3)
            .map((f) => `"${f.text}" ${f.ratio}:1 (${f.size}px, ${f.color} on ${f.background}) ${f.className}`)
            .join('\n           ');
          notes.push(`[${theme}/${tabId}] ${report.failures.length} text run(s) below 3:1:\n           ${sample}`);
        }
      }
      await context.close();
    }

    // 6. The palette reference (`?view=theme`): a page of its own, reading the stylesheet.
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({ colorScheme: theme === 'dark' ? 'dark' : 'light' });
      const page = await context.newPage();
      await page.goto(`${baseUrl}?view=theme`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="theme-tokens-page"]');
      await page.waitForTimeout(250);

      assert.equal(
        await page.locator('[data-testid^="tab-btn-"]').count(),
        0,
        'the token page is a route, not a workbench tab: the learner-facing rail must not render on it'
      );
      assert.equal(
        await page.locator('[data-testid="btn-theme-toggle"]').count(),
        1,
        'the header toggle must be on the token page, so both palettes can be compared in place'
      );
      const footerHref = await page.evaluate(() =>
        document.querySelector('[data-testid="link-theme-tokens"]')?.getAttribute('href') ?? null
      );
      assert.ok(
        footerHref && footerHref.includes('view=theme'),
        `the footer must link the token page (got ${footerHref}); a page nobody can find is a page nobody checks`
      );

      const rowsOnPage = await page.locator('[data-testid="theme-token-row"]').count();
      assert.ok(
        rowsOnPage >= 20,
        `expected a row per colour token on ?view=theme, got ${rowsOnPage}; the ?raw import or the parser stopped matching`
      );
      // Painted pixels, not printed text: every swatch must carry the colour it claims.
      const swatches = await page.evaluate(() => {
        const all = [...document.querySelectorAll('[data-testid="swatch"]')];
        return all.map((element) => ({
          token: element.getAttribute('data-token'),
          palette: element.getAttribute('data-palette'),
          colour: getComputedStyle(element).backgroundColor,
        }));
      });
      assert.equal(
        swatches.length,
        rowsOnPage * 2,
        `expected two swatches per row (${rowsOnPage * 2}), got ${swatches.length}`
      );
      const transparent = swatches.filter((swatch) => /rgba\(0, 0, 0, 0\)|transparent/.test(swatch.colour));
      assert.equal(
        transparent.length,
        0,
        `expected every swatch to be painted; ${transparent.length} resolved to transparent (first: ${transparent[0]?.token} ${transparent[0]?.palette}) — a value the browser rejected`
      );
      for (const palette of ['dark', 'light']) {
        const swatch = swatches.find((candidate) => candidate.token === '--panel' && candidate.palette === palette);
        assert.ok(swatch, `expected a --panel swatch for the ${palette} palette`);
        assert.equal(
          swatch.colour,
          hexToRgb(stylesheetValue('--panel', palette)),
          `the ${palette} --panel swatch must be the value in index.css, not a painted default`
        );
      }

      // The page's own toggle flips the page it documents, and the marker follows.
      const before = await page.evaluate((attr) => document.documentElement.getAttribute(attr), THEME_ATTRIBUTE);
      await page.click('[data-testid="btn-theme-route-toggle"]');
      await page.waitForTimeout(200);
      const after = await page.evaluate((attr) => document.documentElement.getAttribute(attr), THEME_ATTRIBUTE);
      assert.notEqual(after, before, 'the token page\'s toggle must flip data-theme on <html>');
      const marker = await page.evaluate(
        () => document.querySelector('[data-testid="theme-active-palette"]')?.getAttribute('data-theme-now') ?? null
      );
      assert.equal(
        marker,
        after,
        `the "This page" marker must name the palette that is on screen (marker ${marker}, attribute ${after})`
      );

      // The page documents contrast, so it gets the same audit as every tab — once per palette,
      // in the context that starts there. Flip back first: the check above left it on the other side.
      await page.click('[data-testid="btn-theme-route-toggle"]');
      await page.waitForTimeout(200);
      const shown = await page.evaluate((attr) => document.documentElement.getAttribute(attr), THEME_ATTRIBUTE);
      assert.equal(shown, theme, `expected the token page to return to ${theme} for its audit (found ${shown})`);
      const report = await page.evaluate(auditContrast);
      rows.push({ theme, tab: 'view=theme', ...report });
      if (SHOTS) {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(SHOT_DIR, `${theme}-view-theme.png`), fullPage: false });
      }
      if (report.failures.length) {
        failures += report.failures.length;
        const sample = report.failures
          .slice(0, 3)
          .map((f) => `"${f.text}" ${f.ratio}:1 (${f.size}px, ${f.color} on ${f.background}) ${f.className}`)
          .join('\n           ');
        notes.push(`[${theme}/view=theme] ${report.failures.length} text run(s) below 3:1:\n           ${sample}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }

  for (const row of rows) {
    const lowest = row.worst[0];
    console.log(
      `  ${row.theme.padEnd(5)} ${row.tab.padEnd(14)} ${String(row.checked).padStart(4)} runs  ` +
        `min ${String(lowest?.ratio ?? '-').padStart(5)}:1  warnings ${String(row.warnings.length).padStart(2)}  ` +
        `failures ${row.failures.length}`
    );
  }

  const warned = rows.reduce((sum, row) => sum + row.warnings.length, 0);
  if (warned) {
    console.log(`\n${warned} text run(s) between 3:1 and their size minimum (reported, not failing).`);
  }
  // `--warnings` names the offenders once each, so a token can be nudged rather than guessed at.
  if (process.argv.includes('--warnings')) {
    const seen = new Set();
    for (const row of rows) {
      for (const warning of row.warnings) {
        const key = `${row.theme}|${warning.className}|${warning.color}|${warning.ratio}`;
        if (seen.has(key)) continue;
        seen.add(key);
        console.log(
          `  warn ${row.theme.padEnd(5)} ${warning.ratio}:1 need ${warning.required} ${warning.size}px ` +
            `${warning.color} on ${warning.background} | ${warning.className || warning.tag} | "${warning.text}"`
        );
      }
    }
  }
  if (failures || notes.length) {
    console.error(`\n[FAIL] ${failures} text run(s) below 3:1 across ${rows.length} tab/theme pairs:`);
    for (const note of notes) console.error(`  ${note}`);
    process.exitCode = 1;
    return;
  }
  const lowest = rows.reduce((min, row) => Math.min(min, row.worst[0]?.ratio ?? 99), 99);
  console.log(
    `\n[PASS] Theme contract holds; across ${rows.length} tab/theme pairs every on-screen text run clears 3:1 (lowest measured ${lowest}:1).`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[FAIL] Theme E2E failed:', error?.stack ?? error);
    process.exit(1);
  });
}
