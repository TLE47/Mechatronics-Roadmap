#!/usr/bin/env node
/**
 * Build the text-only Reader Mode snapshots for licence-cleared resources
 * (`scripts/build_learning_resource_snapshots.mjs`).
 *
 * This is a maintainer tool, not part of the normal build: it is the one place that fetches a
 * provider page, and only after `license.reuse === "allowed"` in the checked-in provider policy.
 * The output is committed so the app itself never fetches a provider for Reader Mode.
 *
 * The extractor keeps headings, paragraphs, lists, code and quotations. Images, tables, forms,
 * navigation, scripts and other assets are deliberately removed: the licence review cleared text,
 * not every asset on the page, and a text-only snapshot is easy to attribute and adapt.
 *
 * Usage:
 *   node --experimental-strip-types scripts/build_learning_resource_snapshots.mjs
 *   node --experimental-strip-types scripts/build_learning_resource_snapshots.mjs --only wikipedia
 *
 * Requires the same Playwright browser and local libraries as the other browser gates:
 *   npx playwright-core install chromium chromium-headless-shell
 *   bash scripts/setup_browser_deps.sh
 *   source "$HOME/.local/share/mechalab-browser-deps/env.sh"
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchHeadlessShell } from './headless_shell.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const REGISTRY = path.join(ROOT, 'app', 'public', 'learning-resources.json');
const OUTPUT_DIR = path.join(ROOT, 'app', 'public', 'learning-resource-snapshots');
const USER_AGENT = 'MechaLab/4.14 (learning-resource reader; +https://github.com/TLE47/Mechatronics-Roadmap)';
const MAX_BLOCKS = 80;
const MAX_CHARS = 32_000;
const MAX_BLOCK_CHARS = 4_000;

// The attribution line a share-alike/attribution licence expects; the generic provider name is a
// poor credit for a wiki or a community course.
const CREDITS = {
  wikipedia: 'Wikipedia contributors',
  sparkfun: 'SparkFun Electronics',
  cs50p: 'Harvard CS50P',
  'python-docs': 'Python Software Foundation',
  futurecoder: 'futurecoder contributors',
  'feedback-systems': 'Feedback Systems (FBSwiki) contributors',
  betterexplained: 'Better Explained (Kalid Azad)',
};

// The provider's article surface, rather than its whole chrome. A fallback is still used when a
// provider restructures its page; the extractor's noise list is the second line of defence.
const ROOT_SELECTORS = {
  wikipedia: '#mw-content-text .mw-parser-output',
  sparkfun: '#sections',
  cs50p: 'main',
  'python-docs': '.body[role="main"]',
  'feedback-systems': '#bodyContent',
  betterexplained: 'article',
  futurecoder: '#root',
};

const NOISE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'iframe',
  'form',
  'nav',
  'header',
  'footer',
  'aside',
  'button',
  'select',
  'textarea',
  'figure',
  'img',
  'picture',
  'video',
  'audio',
  'table',
  '.mw-editsection',
  'sup.reference',
  '.navbox',
  '.vertical-navbox',
  '.sidebar',
  '.metadata',
  '.ambox',
  '.hatnote',
  '.thumb',
  '.gallery',
  '.reflist',
  '.mw-references-wrap',
  '.product-tile',
  '.nav-menu',
  '.sphinxsidebar',
  '.related',
  '.headerlink',
  '.sharedaddy',
  '.jp-relatedposts',
  '.comments',
  '.sr-only',
  '[aria-hidden="true"]',
].join(',');

function clean(value) {
  return String(value ?? '')
    .replace(/\u00b6/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function noticeFor(license, publisher) {
  const notes = [`Text-only snapshot of ${publisher}; images, tables, scripts and navigation are omitted.`];
  const conditions = new Set(license?.conditions ?? []);
  if (conditions.has('notice')) notes.push('The source licence notice is shown below.');
  if (conditions.has('attribution')) notes.push('The publisher and original URL are shown with this snapshot.');
  if (conditions.has('share-alike')) notes.push('This adapted text is shared under the same source licence.');
  if (conditions.has('non-commercial')) notes.push('Non-commercial use only.');
  if (conditions.has('indicate-changes')) notes.push('Changes: text extracted; images, tables, scripts and navigation removed.');
  if (conditions.has('no-trademark')) notes.push('No provider logo or trademark is used.');
  if (conditions.has('per-asset-check')) notes.push('Only text is included; images and other assets were not copied.');
  return notes.join(' ');
}

async function extract(page, selector) {
  return page.evaluate(
    ({ selector, noise, maxBlocks, maxChars, maxBlockChars }) => {
      const root =
        document.querySelector(selector) ||
        document.querySelector('main, article, [role="main"], #content, .content') ||
        document.body;
      if (!root) return null;

      const clone = root.cloneNode(true);
      clone.querySelectorAll(noise).forEach((node) => node.remove());

      const blocks = [];
      let chars = 0;
      let truncated = false;
      const text = (node) =>
        String(node?.textContent ?? '')
          .replace(/\u00b6/g, '')
          .replace(/\s+/g, ' ')
          .replace(/\s+([.,;:!?])/g, '$1')
          .trim();

      function push(block) {
        if (blocks.length >= maxBlocks) {
          truncated = true;
          return false;
        }
        const size =
          block.kind === 'list'
            ? block.items.join(' ').length
            : String(block.text ?? '').length;
        if (chars + size > maxChars) {
          truncated = true;
          return false;
        }
        const previous = blocks.at(-1);
        if (previous && previous.kind === block.kind && previous.text === block.text) return true;
        blocks.push(block);
        chars += size;
        return true;
      }

      function walk(element) {
        if (!element || blocks.length >= maxBlocks) return;
        const tag = element.tagName?.toLowerCase();
        if (!tag) return;
        if (/^h[1-4]$/.test(tag)) {
          const value = text(element).replace(/\s*\[edit\]$/i, '');
          if (value) push({ kind: 'heading', level: Number(tag[1]), text: value });
          return;
        }
        if (tag === 'pre') {
          const value = String(element.textContent ?? '').trim();
          if (value) push({ kind: 'code', text: value.slice(0, maxBlockChars) });
          return;
        }
        if (tag === 'blockquote') {
          const value = text(element);
          if (value) push({ kind: 'quote', text: value.slice(0, maxBlockChars) });
          return;
        }
        if (tag === 'ul' || tag === 'ol') {
          const items = [...element.children]
            .filter((child) => child.tagName?.toLowerCase() === 'li')
            .map((child) => text(child).slice(0, maxBlockChars))
            .filter(Boolean);
          if (items.length) push({ kind: 'list', ordered: tag === 'ol', items });
          return;
        }
        if (tag === 'p') {
          const value = text(element);
          if (value) push({ kind: 'paragraph', text: value.slice(0, maxBlockChars) });
          return;
        }
        for (const child of element.children) walk(child);
      }

      walk(clone);
      return {
        sourceTitle: text(document.title),
        blocks,
        truncated,
        selector,
      };
    },
    { selector, noise: NOISE_SELECTOR, maxBlocks: MAX_BLOCKS, maxChars: MAX_CHARS, maxBlockChars: MAX_BLOCK_CHARS }
  );
}

function candidates(only) {
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const seen = new Set();
  const values = [];
  for (const group of Object.values(registry.lessons ?? {})) {
    for (const resource of group.resources ?? []) {
      if (resource.kind !== 'external' || resource.license?.reuse !== 'allowed') continue;
      if (seen.has(resource.resourceKey)) continue;
      if (only && resource.providerKey !== only) continue;
      seen.add(resource.resourceKey);
      values.push(resource);
    }
  }
  return values;
}

async function capture(browser, resource) {
  const context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    const response = await page.goto(resource.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
    await page.waitForTimeout(resource.providerKey === 'futurecoder' ? 2_000 : 700);
    const result = await extract(page, ROOT_SELECTORS[resource.providerKey] ?? 'main, article, #content');
    if (!result || !result.blocks.length) throw new Error('no readable text blocks found');

    const credit = CREDITS[resource.providerKey] ?? resource.attribution?.publisher ?? resource.provider;
    const output = {
      version: 1,
      title: resource.title || result.sourceTitle,
      sourceTitle: result.sourceTitle,
      sourceUrl: resource.url,
      provider: resource.provider,
      providerKey: resource.providerKey,
      retrievedAt: new Date().toISOString(),
      license: resource.license,
      attribution: {
        publisher: credit,
        originalUrl: resource.attribution?.originalUrl ?? resource.url,
      },
      notice: noticeFor(resource.license, credit),
      truncated: result.truncated,
      blocks: result.blocks,
    };
    const target = path.join(OUTPUT_DIR, `${resource.resourceKey}.json`);
    writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    return { bytes: Buffer.byteLength(JSON.stringify(output)), blocks: result.blocks.length, target: path.relative(ROOT, target) };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function main() {
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : '';
  const resources = candidates(only);
  if (!resources.length) {
    console.error(only ? `No licence-cleared resource matched provider "${only}".` : 'No licence-cleared resources found.');
    process.exit(2);
  }
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Building ${resources.length} text-only snapshot${resources.length === 1 ? '' : 's'}…`);
  const browser = await launchHeadlessShell();
  const failed = [];
  let done = 0;
  const queue = [...resources];
  async function worker() {
    while (queue.length) {
      const resource = queue.shift();
      if (!resource) return;
      try {
        const result = await capture(browser, resource);
        done += 1;
        console.log(
          `  [${String(done).padStart(2)}/${resources.length}] ${resource.providerKey} · ${result.blocks} blocks · ${result.bytes} bytes · ${result.target}`
        );
      } catch (error) {
        failed.push({ resource, error });
        console.error(`  [FAIL] ${resource.providerKey} ${resource.url}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  try {
    // Four pages at a time is enough to make a full rebuild practical without hammering a provider.
    await Promise.all(Array.from({ length: 4 }, () => worker()));
  } finally {
    await browser.close();
  }

  if (failed.length) {
    console.error(`\n${failed.length} snapshot${failed.length === 1 ? '' : 's'} failed:`);
    for (const { resource, error } of failed) {
      console.error(`- ${resource.providerKey} ${resource.url}: ${error instanceof Error ? error.message : error}`);
    }
    process.exit(1);
  }
  console.log(`\nWrote ${done} snapshot${done === 1 ? '' : 's'} to app/public/learning-resource-snapshots/.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
