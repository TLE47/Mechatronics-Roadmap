#!/usr/bin/env node
/**
 * Accessibility sweep: axe-core over every tab, in every palette (`scripts/axe_tabs.mjs`,
 * `npm run check:axe`).
 *
 * The theme suite measures contrast pixel by pixel and the smoke suite catches a render that
 * throws; neither asks what axe asks — does this control have a name, is that `aria-pressed` true of
 * what is drawn, is a widget reachable by keyboard at all, is a role nested somewhere it may not be.
 * Those are the failures a screenshot cannot show and a human reviewer stops noticing.
 *
 * The sweep walks the same tab list the theme suite uses (`app/src/data/workbenchTabs.json`), so a
 * new tab is swept without touching this file, and it runs each tab in every palette (dark, light,
 * paper, high contrast) because a violation can be theme-specific — an invisible focus ring, a disabled
 * colour that disappears.
 *
 * Two deliberate choices about the ruleset:
 *
 * - **`color-contrast` is left to `e2e_theme.mjs`.** axe samples the rendered pixels with an
 *   approximation; that suite composites the actual ancestor stack and fails below 3:1 across 44
 *   tab/palette pairs. Two contrast gates that disagree would make the stricter one look wrong, and
 *   the colour one is the more accurate measurement.
 * - **`serious` and `critical` fail; `minor` and `moderate` are reported.** A gate that fails on a
 *   `landmark-one-main` suggestion is a gate people switch off.
 *
 * The allowlist is `docs/a11y-allowlist.json`, and it is a ratchet in both directions: a finding that
 * is not listed fails, an entry that fires on more nodes than it recorded fails, and an entry that
 * fires on none fails as stale — an exception nobody deleted is how a gate quietly stops covering
 * anything. Every entry carries a `reason` in prose, because the next reader has to be able to decide
 * whether it is still true.
 *
 * Usage
 *     node scripts/axe_tabs.mjs                 # the sweep; exit 1 on a new or widened violation
 *     node scripts/axe_tabs.mjs --json          # machine-readable, stdout only
 *     node scripts/axe_tabs.mjs --verbose       # every node of every violation, listed
 *     node scripts/axe_tabs.mjs --tab tab-arch   # one tab, while fixing it
 *
 * Exit-code family: typed
 *     0  no unlisted violation, and no allowlisted entry is stale or wider than recorded
 *     1  an accessibility violation, or an allowlist that no longer describes the app
 *     2  the sweep could not run (no Chromium, no build, a bad flag)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';

const ROOT = process.cwd();
const ALLOWLIST_FILE = path.join(ROOT, 'docs', 'a11y-allowlist.json');
const AXE_SOURCE = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');

/** The WCAG A/AA tags; `best-practice` is reported but never fails (`IMPACT_FAILS` decides). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
/** Impacts that fail the gate. */
const FAILING = new Set(['serious', 'critical']);
/** Every palette a signed-out reader can be in; the sweep audits each in turn. */
const THEMES = ['dark', 'light', 'paper', 'contrast'];
/** The OS colour scheme each palette is browsed under; the two extras are reached by a stored pick. */
const SCHEME = { dark: 'dark', light: 'light', paper: 'light', contrast: 'dark' };

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const VERBOSE = argv.includes('--verbose');
const ONLY = (() => {
  const at = argv.indexOf('--tab');
  return at >= 0 ? argv[at + 1] : null;
})();

function log(...args) {
  // stdout is the report; `--json` keeps it parseable by sending the human lines to stderr.
  (JSON_OUT ? console.error : console.log)(...args);
}

/** `{rule, tab, theme, nodes}` — one allowlist entry's identity. Theme `*` covers both palettes. */
function entryKey(entry) {
  return `${entry.rule}\u0000${entry.tab}\u0000${entry.theme}`;
}

function findingKey(finding) {
  return `${finding.rule}\u0000${finding.tab}\u0000${finding.theme}`;
}

function readAllowlist() {
  if (!fs.existsSync(ALLOWLIST_FILE)) return { entries: [] };
  const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error(`${ALLOWLIST_FILE} must be {"entries": [...]}`);
  }
  return parsed;
}

const tabNames = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/src/data/workbenchTabs.json'), 'utf8'));
const TAB_IDS = ONLY ? [ONLY] : Object.keys(tabNames.tabs);

async function runAxe(page) {
  return page.evaluate(async () => {
    // `axe` is injected by the caller; the ruleset is fixed here so a run is reproducible.
    // eslint-disable-next-line no-undef
    const results = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    });
    return results.violations.map((violation) => ({
      rule: violation.id,
      impact: violation.impact ?? 'minor',
      help: violation.help,
      description: violation.description,
      nodes: violation.nodes.map((node) => ({
        target: node.target.join(' '),
        // axe's own one-line summary: which attribute, which value, why it fails.
        summary: (node.failureSummary ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
      })),
    }));
  });
}

async function main() {
  if (!fs.existsSync(AXE_SOURCE)) {
    console.error(`axe-core is not installed (${AXE_SOURCE} missing); run npm ci`);
    process.exit(2);
  }
  const axeSource = fs.readFileSync(AXE_SOURCE, 'utf8');
  const allowlist = readAllowlist();
  const own = process.env.E2E_BASE_URL ? null : await startDevServer(ROOT);
  const baseUrl = process.env.E2E_BASE_URL ?? own.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });

  /** Every finding, one row per (rule, tab, theme) with a node count. */
  const findings = [];
  const errors = [];

  try {
    for (const theme of THEMES) {
      const context = await browser.newContext({ colorScheme: SCHEME[theme] });
      // Neither extra palette is something a browser's `colorScheme` can ask for, so both are
      // reached the way a reader reaches them: a stored pick.
      if (theme === 'contrast' || theme === 'paper') {
        await context.addInitScript((choice) => {
          try {
            localStorage.setItem('mechalab_theme_v1', choice);
          } catch {
            // A blocked store leaves the OS palette, and the assertion below says so.
          }
        }, theme);
      }
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(`${theme}: ${error.message}`));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="btn-theme-toggle"]');
      if (
        (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== theme
      ) {
        throw new Error(`expected the ${theme} palette (stored pick or ${SCHEME[theme]} OS)`);
      }
      // Beginner mode hides the deeper labs; the sweep needs all eleven tabs.
      const advanced = page.locator('[data-testid="btn-mode-advanced"]');
      if (await advanced.count()) await advanced.click();
      await page.addScriptTag({ content: axeSource });

      for (const tabId of TAB_IDS) {
        await page.click(`[data-testid="tab-btn-${tabId}"]`);
        // Ten of the eleven tabs are lazy chunks (`React.lazy` in App.tsx): a click can land on the
        // Suspense panel, and auditing a panel that says "Loading this tab…" would pass every rule.
        // The editor is lazy for the same reason and shows its code as a placeholder
        // (`data-editor-ready="false"`) while CodeMirror arrives, so it is waited out too. Wait for
        // both to go — the tab's own markup — then let it settle.
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-testid="tab-loading"]') &&
            !document.querySelector('[data-editor-ready="false"]'),
          undefined,
          { timeout: 20000 }
        );
        await page.waitForTimeout(300);
        for (const violation of await runAxe(page)) {
          findings.push({
            rule: violation.rule,
            impact: violation.impact,
            help: violation.help,
            tab: tabId,
            theme,
            nodes: violation.nodes,
          });
        }
        const count = findings.filter((finding) => finding.tab === tabId && finding.theme === theme).length;
        log(`  ${theme.padEnd(5)} ${tabId.padEnd(24)} ${count ? `${count} rule(s)` : 'clean'}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }

  if (errors.length) {
    console.error(`[FAIL] the page threw during the sweep: ${errors.join(' | ')}`);
    process.exitCode = 2;
    return;
  }

  const failing = findings.filter((finding) => FAILING.has(finding.impact));
  const reported = findings.filter((finding) => !FAILING.has(finding.impact));
  const allowed = new Map(allowlist.entries.map((entry) => [entryKey(entry), entry]));
  const matched = new Set();
  const unexpected = [];
  const widened = [];

  for (const finding of failing) {
    const key = findingKey(finding);
    const direct = allowed.get(key);
    const wildcard = allowed.get(`${finding.rule}\u0000${finding.tab}\u0000*`);
    const entry = direct ?? wildcard;
    if (!entry) {
      unexpected.push(finding);
      continue;
    }
    matched.add(entryKey(entry));
    if (finding.nodes.length > entry.max_nodes) {
      widened.push({ finding, entry });
    }
  }

  const stale = [...allowed.values()].filter((entry) => !matched.has(entryKey(entry)));

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          tabs: TAB_IDS.length,
          themes: THEMES.length,
          findings: findings.map(({ rule, impact, tab, theme, nodes, help }) => ({
            rule,
            impact,
            tab,
            theme,
            help,
            nodes: nodes.map((node) => node.target),
          })),
          unexpected: unexpected.map(({ rule, tab, theme, nodes }) => ({ rule, tab, theme, nodes })),
          widened: widened.map(({ finding, entry }) => ({
            rule: finding.rule,
            tab: finding.tab,
            theme: finding.theme,
            nodes: finding.nodes.length,
            max_nodes: entry.max_nodes,
          })),
          stale: stale.map(({ rule, tab, theme }) => ({ rule, tab, theme })),
        },
        null,
        2
      )
    );
  } else if (VERBOSE) {
    for (const finding of findings) {
      log(`\n[${finding.theme}/${finding.tab}] ${finding.rule} (${finding.impact}) — ${finding.help}`);
      for (const node of finding.nodes) log(`    ${node.target}\n      ${node.summary}`);
    }
  }

  if (!JSON_OUT && reported.length) {
    log(
      `\n${reported.length} minor/moderate rule(s) reported, not failing: ` +
        [...new Set(reported.map((finding) => finding.rule))].join(', ')
    );
  }

  const problems = [];
  for (const finding of unexpected) {
    problems.push(
      `new violation ${finding.rule} (${finding.impact}) on ${finding.tab} in ${finding.theme}: ` +
        `${finding.nodes.length} node(s)\n       ${finding.nodes
          .slice(0, 3)
          .map((node) => `${node.target} — ${node.summary}`)
          .join('\n       ')}`
    );
  }
  for (const { finding, entry } of widened) {
    problems.push(
      `${finding.rule} on ${finding.tab} (${finding.theme}) now fires on ${finding.nodes.length} node(s), ` +
        `allowlisted for ${entry.max_nodes}: either fix the new one or widen the entry and say why`
    );
  }
  for (const entry of stale) {
    problems.push(
      `stale allowlist entry: ${entry.rule} on ${entry.tab} (${entry.theme}) no longer fires — ` +
        `delete it from docs/a11y-allowlist.json, or the gate is not covering what it claims`
    );
  }

  if (problems.length) {
    console.error(`\n[FAIL] axe: ${problems.length} problem(s) across ${findings.length} finding(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }

  log(
    `\n[PASS] axe: ${TAB_IDS.length} tabs × ${THEMES.length} themes clear every serious/critical rule ` +
      `(${allowlist.entries.length} documented exception(s), none stale).`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[FAIL] axe sweep failed:', error?.stack ?? error);
    process.exit(2);
  });
}
