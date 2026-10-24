#!/usr/bin/env node
/**
 * Lighthouse on the built bundle, for the audits that are facts
 * (`scripts/check_lighthouse.mjs`, `npm run check:lighthouse`)
 *
 * `docs/PLAN-2.0-GAP.md`'s CI row has been **partial** on two words since it was written: this one and
 * the surface snapshot beside it. The row also already says why the obvious version of this gate is
 * wrong — "wall-clock timings are deliberately not gated, because CI variance is larger than any
 * regression this app could ship" — so this run does not gate the **performance** score. A number that
 * moves with a runner's mood is a number people learn to ignore, and ignoring a gate is how the rest of
 * them stop meaning anything.
 *
 * What it does gate is the three categories that are facts about the document and the markup:
 *
 * - **best-practices** — no console errors, no deprecated APIs, a declared charset, a doctype, images
 *   at their intrinsic ratio, no third-party cookies.
 * - **seo** — a title, a meta description, a viewport, crawlable links, `robots.txt`, a legible font
 *   size. A course that nobody can find is a course nobody takes.
 * - **accessibility** — Lighthouse's own axe-core pass. It is not a duplicate of `npm run check:axe`:
 *   that one runs the current axe and this app's allowlist, and this one runs the ruleset Lighthouse
 *   ships, which is how a rule that the two versions disagree about gets caught.
 *
 * It runs against the **built bundle** served at the Pages base path (`startStaticServer`), because the
 * thing that ships is `dist/`, not the dev server — and the audits above read the document, its
 * manifest and its service worker, which only exist there.
 *
 * **Both palettes, pinned.** Lighthouse has no setting for `prefers-color-scheme`, so a run without a
 * pin audits whatever desktop it happens to be on: this Mac reports dark, a Linux runner with no
 * preference reports light, and the same commit graded 100 here and 97 there (Run 223). So each palette
 * the app can open on is asked for explicitly — dark, then light — and the browser is *asked which one
 * it took* before the audit starts, through the DevTools protocol. A Chrome that stops honouring the
 * switch therefore fails the gate (exit 2, naming the flag) instead of quietly going back to following
 * the machine, which is the failure this gate was built to stop. Choosing the palette also makes the
 * light findings fixable locally: every contrast finding in Run 223 was in light or paper.
 *
 * The two extra palettes are not run: high contrast and paper are never a first visit's palette (the app
 * takes `prefers-contrast: more` only when the OS asks for it), and the accessibility audits that care
 * about them already run per palette in `npm run check:axe` and `npm run test:theme:e2e`.
 *
 * Exemptions live in `docs/lighthouse-allowlist.json` and are a ratchet in both directions, like
 * `docs/a11y-allowlist.json`: a failing audit that is not listed fails the gate, an entry that fires on
 * more items than it recorded fails, and an entry that fires on nothing fails as stale. An entry may
 * name a `theme` to cover one palette; without one it covers both, and `max_items` is read per palette,
 * so a regression that adds one more finding in light still fails. Every entry carries a `reason` in
 * prose, because the next reader has to be able to decide whether it is still true.
 *
 * Usage
 *     npm run check:lighthouse                  # the run; exit 1 on a new or widened finding
 *     npm run check:lighthouse -- --json        # machine-readable, stdout only
 *     npm run check:lighthouse -- --verbose     # every failing item, listed
 *
 * Exit-code family: typed
 *     0  every failing audit is explained by the allowlist, and no entry is stale
 *     1  a new finding, an entry that fires more than it recorded, or an entry nothing fires on
 *     2  the run could not happen (no build, no Chrome, a bad flag, or a browser that did not take
 *        the pinned palette)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';

const ROOT = process.cwd();
const ALLOWLIST_FILE = path.join(ROOT, 'docs', 'lighthouse-allowlist.json');

/**
 * The three categories. `performance` is absent on purpose and the header says why: gating it would
 * gate the machine, and printing a score nobody gates is a promise the build does not keep.
 */
const CATEGORIES = ['best-practices', 'seo', 'accessibility'];

/** A desktop visit: the layout this app is measured in everywhere else (1440 px, both panels). */
const SCREEN = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };

const CHROME_FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];

/**
 * The two palettes a first visit can open on, each asked for rather than inherited.
 *
 * Blink's `preferredColorScheme` setting is what `prefers-color-scheme` reads: `0` is dark and `1` is
 * light, measured on Chrome 155 (`--dump-dom` on a page printing both media queries) and checked again
 * here at run time by `readPinnedScheme`, because an internal setting is exactly the kind of thing that
 * can move between Chrome releases.
 */
const SCHEMES = [
  { theme: 'dark', flag: '--blink-settings=preferredColorScheme=0' },
  { theme: 'light', flag: '--blink-settings=preferredColorScheme=1' },
];

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const VERBOSE = argv.includes('--verbose');

function log(...args) {
  (JSON_OUT ? console.error : console.log)(...args);
}

/** One allowlist entry's identity, as this gate matches it against one finding. */
function entryCovers(entry, finding) {
  return (
    entry.category === finding.category &&
    entry.audit === finding.audit &&
    (entry.theme === undefined || entry.theme === finding.theme)
  );
}

function readAllowlist() {
  if (!fs.existsSync(ALLOWLIST_FILE)) return { entries: [] };
  const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error(`${ALLOWLIST_FILE} must be {"entries": [...]}`);
  }
  const themes = new Set(SCHEMES.map((scheme) => scheme.theme));
  for (const entry of parsed.entries) {
    if (entry.theme !== undefined && !themes.has(entry.theme)) {
      throw new Error(
        `${ALLOWLIST_FILE}: ${entry.category}/${entry.audit} names theme "${entry.theme}", ` +
          `but this gate only runs ${[...themes].join(' and ')}`
      );
    }
  }
  return parsed;
}

/** One line per failing item, from whichever detail shape the audit used. */
function describeItem(item) {
  if (!item) return '';
  if (item.node?.selector) {
    return `${item.node.selector}${item.node.snippet ? ` — ${String(item.node.snippet).slice(0, 120)}` : ''}`;
  }
  if (item.url) return item.url;
  if (item.selector) return item.selector;
  const text = item.source ?? item.explanation ?? item.text ?? '';
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 140);
}

/** Every audit below a full score, across the three categories, with what it named. */
function failingAudits(theme, lhr) {
  const out = [];
  for (const categoryId of Object.keys(lhr.categories ?? {})) {
    const category = lhr.categories[categoryId];
    for (const ref of category.auditRefs ?? []) {
      const audit = lhr.audits?.[ref.id];
      if (!audit) continue;
      if (typeof audit.score !== 'number' || audit.score >= 1) continue;
      if (audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'manual') continue;
      const items = audit.details?.items ?? [];
      out.push({
        theme,
        category: categoryId,
        audit: ref.id,
        title: audit.title,
        score: audit.score,
        items: items.map(describeItem).filter(Boolean),
      });
    }
  }
  return out;
}

/** `work`, or a rejection naming what did not happen. The losing timer is cleared, not left to fire. */
function within(work, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${message} within ${ms / 1000} s`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Which palette the browser actually resolved, asked of the browser itself.
 *
 * `/json/list` names the tab `chrome-launcher` opened; one `Runtime.evaluate` over its DevTools socket
 * runs the two media queries the stylesheet keys on. Node's global `WebSocket` is the client, so this
 * needs no dependency: one message out, one back, five seconds each way, then the socket is closed.
 */
async function readPinnedScheme(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((candidate) => candidate.type === 'page');
  if (!target?.webSocketDebuggerUrl) {
    throw new Error('the browser exposed no page to ask which palette it resolved');
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await within(
      new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', () => reject(new Error('could not open its DevTools socket')), {
          once: true,
        });
      }),
      5000,
      'the browser did not open its DevTools socket'
    );
    return await within(
      new Promise((resolve, reject) => {
        socket.addEventListener('message', (event) => {
          const message = JSON.parse(event.data);
          if (message.id !== 1) return;
          const value = message.result?.result?.value;
          if (typeof value === 'string') resolve(value);
          else reject(new Error(message.error?.message ?? 'the media query returned no answer'));
        });
        socket.send(
          JSON.stringify({
            id: 1,
            method: 'Runtime.evaluate',
            params: {
              expression:
                "matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : " +
                "matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'none'",
              returnByValue: true,
            },
          })
        );
      }),
      5000,
      'the browser did not answer the media query'
    );
  } finally {
    socket.close();
  }
}

/** One palette's audit, in its own browser: the pin is a launch flag, so it cannot be changed in place. */
async function auditScheme(executablePath, url, scheme) {
  let chrome = null;
  try {
    chrome = await chromeLauncher.launch({
      chromePath: executablePath,
      chromeFlags: [...CHROME_FLAGS, scheme.flag],
    });
    const seen = await readPinnedScheme(chrome.port);
    if (seen !== scheme.theme) {
      throw new Error(
        `asked the browser for ${scheme.theme} (${scheme.flag}) and it reported "${seen}": ` +
          'the palette is not pinned, so this run would grade the machine instead'
      );
    }
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: CATEGORIES,
      formFactor: 'desktop',
      screenEmulation: SCREEN,
      // No simulated throttling: with the timing categories off there is nothing to normalise, and
      // a throttled run is a slower one that can time the page out on a busy CI box.
      throttlingMethod: 'provided',
      maxWaitForLoad: 60000,
    });
    if (!result?.lhr) throw new Error(`Lighthouse returned no ${scheme.theme} report`);
    return { theme: scheme.theme, lhr: result.lhr };
  } finally {
    await chrome?.kill();
  }
}

function scoresOf(lhr) {
  return Object.fromEntries(
    CATEGORIES.map((id) => [id, Math.round((lhr.categories?.[id]?.score ?? 0) * 100)])
  );
}

async function main() {
  ensureBuilt();
  const allowlist = readAllowlist();
  const executablePath = resolveChromiumExecutable();
  if (!executablePath) {
    console.error('[FAIL] no Chrome to drive: set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or install one');
    process.exit(2);
  }

  const { server, port } = await startStaticServer();
  const url = `http://127.0.0.1:${port}/Mechatronics-Roadmap/`;
  try {
    const runs = [];
    for (const scheme of SCHEMES) runs.push(await auditScheme(executablePath, url, scheme));

    const findings = runs.flatMap(({ theme, lhr }) => failingAudits(theme, lhr));
    const matched = new Set();
    const unexpected = [];
    const widened = [];
    for (const finding of findings) {
      const entry = allowlist.entries.find((candidate) => entryCovers(candidate, finding));
      if (!entry) {
        unexpected.push(finding);
        continue;
      }
      matched.add(entry);
      if (finding.items.length > entry.max_items) widened.push({ finding, entry });
    }
    const stale = allowlist.entries.filter((entry) => !matched.has(entry));
    const scores = runs.map(({ theme, lhr }) => ({ theme, scores: scoresOf(lhr) }));

    if (JSON_OUT) {
      console.log(
        JSON.stringify(
          {
            url,
            schemes: scores,
            findings: findings.map(({ theme, category, audit, title, score, items }) => ({
              theme,
              category,
              audit,
              title,
              score,
              items,
            })),
            unexpected: unexpected.map(({ theme, category, audit, items }) => ({
              theme,
              category,
              audit,
              items,
            })),
            widened: widened.map(({ finding, entry }) => ({
              theme: finding.theme,
              category: finding.category,
              audit: finding.audit,
              items: finding.items.length,
              recorded: entry.max_items,
            })),
            stale: stale.map(({ category, audit }) => ({ category, audit })),
          },
          null,
          2
        )
      );
    } else {
      const version = runs[0].lhr.lighthouseVersion ?? '';
      log(`Lighthouse ${version} on ${url}`.trim());
      for (const { theme, scores: measured } of scores) {
        const line = CATEGORIES.map((id) => `${id} ${measured[id]}`).join(', ');
        log(`  ${theme.padEnd(5)} prefers-color-scheme pinned and verified in the browser: ${line}`);
      }
      for (const finding of findings) {
        const bad = unexpected.includes(finding) || widened.some((row) => row.finding === finding);
        log(
          `  ${bad ? 'FAIL' : 'ok  '} ${finding.theme}/${finding.category}/${finding.audit} — ${finding.title}`
        );
        const shown = VERBOSE ? finding.items : finding.items.slice(0, 3);
        for (const item of shown) log(`         ${item}`);
        if (!VERBOSE && finding.items.length > shown.length) {
          log(`         … ${finding.items.length - shown.length} more (--verbose)`);
        }
      }
    }

    let failed = false;
    if (unexpected.length) {
      failed = true;
      if (!JSON_OUT) {
        console.error(
          `\n[FAIL] ${unexpected.length} audit(s) below a full score and not in ${path.relative(ROOT, ALLOWLIST_FILE)}:`
        );
        for (const finding of unexpected) {
          console.error(`  ${finding.theme}/${finding.category}/${finding.audit}`);
        }
      }
    }
    if (widened.length) {
      failed = true;
      if (!JSON_OUT) {
        console.error('\n[FAIL] an allowlisted audit fires on more items than it recorded:');
        for (const { finding, entry } of widened) {
          console.error(
            `  ${finding.theme}/${finding.category}/${finding.audit}: ` +
              `${finding.items.length} > ${entry.max_items}`
          );
        }
      }
    }
    if (stale.length) {
      failed = true;
      if (!JSON_OUT) {
        console.error('\n[FAIL] an allowlist entry nothing fires on any more (delete it):');
        for (const entry of stale) console.error(`  ${entry.category}/${entry.audit}`);
      }
    }
    if (failed) process.exitCode = 1;
    else if (!JSON_OUT) {
      const summary = scores
        .map(({ theme, scores: measured }) => {
          const line = CATEGORIES.map((id) => `${id} ${measured[id]}`).join(', ');
          return `${theme} (${line})`;
        })
        .join('; ');
      log(
        `[PASS] Lighthouse: ${summary}; ${findings.length} explained finding(s), none stale. ` +
          'Both palettes are pinned, so neither the operator\'s desktop nor a bare runner decides what ' +
          'is graded. Performance is not run: a score that moves with the runner is not a gate this ' +
          'repository keeps.'
      );
    }
  } finally {
    server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[FAIL] Lighthouse could not run:', error?.stack ?? error);
    process.exit(2);
  });
}
