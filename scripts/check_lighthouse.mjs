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
 * Exemptions live in `docs/lighthouse-allowlist.json` and are a ratchet in both directions, like
 * `docs/a11y-allowlist.json`: a failing audit that is not listed fails the gate, an entry that fires on
 * more items than it recorded fails, and an entry that fires on nothing fails as stale. Every entry
 * carries a `reason` in prose, because the next reader has to be able to decide whether it is still
 * true.
 *
 * Usage
 *     npm run check:lighthouse                  # the run; exit 1 on a new or widened finding
 *     npm run check:lighthouse -- --json        # machine-readable, stdout only
 *     npm run check:lighthouse -- --verbose     # every failing item, listed
 *
 * Exit-code family: typed
 *     0  every failing audit is explained by the allowlist, and no entry is stale
 *     1  a new finding, an entry that fires more than it recorded, or an entry nothing fires on
 *     2  the run could not happen (no build, no Chrome, a bad flag)
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

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const VERBOSE = argv.includes('--verbose');

function log(...args) {
  (JSON_OUT ? console.error : console.log)(...args);
}

/** `{audit, category}` — one allowlist entry's identity. */
const entryKey = (entry) => `${entry.category}\u0000${entry.audit}`;

function readAllowlist() {
  if (!fs.existsSync(ALLOWLIST_FILE)) return { entries: [] };
  const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error(`${ALLOWLIST_FILE} must be {"entries": [...]}`);
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
function failingAudits(lhr) {
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
  let chrome = null;
  try {
    chrome = await chromeLauncher.launch({
      chromePath: executablePath,
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
    const result = await lighthouse(
      url,
      {
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
      }
    );
    if (!result?.lhr) {
      console.error('[FAIL] Lighthouse returned no report');
      process.exit(2);
    }
    const { lhr } = result;

    const findings = failingAudits(lhr);
    const allowed = new Map(allowlist.entries.map((entry) => [entryKey(entry), entry]));
    const matched = new Set();
    const unexpected = [];
    const widened = [];
    for (const finding of findings) {
      const entry = allowed.get(entryKey(finding));
      if (!entry) {
        unexpected.push(finding);
        continue;
      }
      matched.add(entryKey(entry));
      if (finding.items.length > entry.max_items) widened.push({ finding, entry });
    }
    const stale = [...allowed.values()].filter((entry) => !matched.has(entryKey(entry)));

    const scores = Object.fromEntries(
      CATEGORIES.map((id) => [id, Math.round((lhr.categories?.[id]?.score ?? 0) * 100)])
    );

    if (JSON_OUT) {
      console.log(
        JSON.stringify(
          {
            url,
            scores,
            findings: findings.map(({ category, audit, title, score, items }) => ({
              category,
              audit,
              title,
              score,
              items,
            })),
            unexpected: unexpected.map(({ category, audit, items }) => ({ category, audit, items })),
            widened: widened.map(({ finding, entry }) => ({
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
      log(`Lighthouse ${lhr.lighthouseVersion ?? ''} on ${url}`.trim());
      for (const [category, score] of Object.entries(scores)) log(`  ${category.padEnd(16)} ${score}`);
      for (const finding of findings) {
        const bad = unexpected.includes(finding) || widened.some((row) => row.finding === finding);
        log(`  ${bad ? 'FAIL' : 'ok  '} ${finding.category}/${finding.audit} — ${finding.title}`);
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
        for (const finding of unexpected) console.error(`  ${finding.category}/${finding.audit}`);
      }
    }
    if (widened.length) {
      failed = true;
      if (!JSON_OUT) {
        console.error('\n[FAIL] an allowlisted audit fires on more items than it recorded:');
        for (const { finding, entry } of widened) {
          console.error(`  ${finding.category}/${finding.audit}: ${finding.items.length} > ${entry.max_items}`);
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
      log(
        `[PASS] Lighthouse: ${CATEGORIES.map((id) => `${id} ${scores[id]}`).join(', ')}; ` +
          `${findings.length} explained finding(s), none stale. Performance is not run: ` +
          'a score that moves with the runner is not a gate this repository keeps.'
      );
    }
  } finally {
    await chrome?.kill();
    server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[FAIL] Lighthouse could not run:', error?.stack ?? error);
    process.exit(2);
  });
}
