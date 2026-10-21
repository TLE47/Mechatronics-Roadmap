#!/usr/bin/env node
/**
 * The "take this step offline" button's rules (`scripts/test_offline_takealong.mjs`).
 *
 * `app/src/offlineTakeAlong.ts` decides three things a browser suite would take minutes to reach and a
 * person cannot see: which URLs a page asks the worker to cache, how a cache size is written, and
 * whether "offline ready" is an honest claim. The browser suite proves the whole flow once
 * (`npm run test:offline`); these are the edges it would otherwise only cover by luck.
 *
 * Run: node --experimental-strip-types scripts/test_offline_takealong.mjs
 */

import assert from 'node:assert/strict';
import {
  assetUrlsFromDocument,
  cacheInventory,
  formatTakeAlongSize,
  offlineReportLine,
  offlineWarmSupported,
} from '../app/src/offlineTakeAlong.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

/** The smallest thing that answers `querySelectorAll` the way the real function uses it. */
function stubDocument(elements, baseURI = 'https://example.org/MechaLab/') {
  return { baseURI, querySelectorAll: () => elements };
}

function tag(tagName, attrs = {}) {
  return { tagName, getAttribute: (name) => (name in attrs ? attrs[name] : null) };
}

console.log('offline take-along');

check('the document, script, stylesheet and manifest are what the worker is asked to cache', () => {
  const urls = assetUrlsFromDocument(
    stubDocument([
      tag('SCRIPT', { src: './assets/index-abc.js' }),
      tag('LINK', { rel: 'stylesheet', href: '/MechaLab/assets/index-abc.css' }),
      tag('LINK', { rel: 'manifest', href: './manifest.webmanifest' }),
    ])
  );
  assert.ok(urls.includes('https://example.org/MechaLab/'), 'the shell document');
  assert.ok(urls.includes('https://example.org/MechaLab/index.html'));
  assert.ok(urls.includes('https://example.org/MechaLab/assets/index-abc.js'));
  assert.ok(urls.includes('https://example.org/MechaLab/assets/index-abc.css'));
  assert.ok(urls.includes('https://example.org/MechaLab/manifest.webmanifest'));
  assert.equal(new Set(urls).size, urls.length, 'no URL is sent twice');
});

check('a link this page does not need, and a CDN URL, are not sent', () => {
  const urls = assetUrlsFromDocument(
    stubDocument([
      tag('LINK', { rel: 'prefetch', href: './next-route.js' }),
      tag('SCRIPT', { src: 'https://cdn.jsdelivr.net/pyodide/v0.26/pyodide.mjs' }),
      tag('SCRIPT', { src: './assets/index-abc.js' }),
    ])
  );
  assert.ok(!urls.some((url) => url.includes('next-route')), 'a prefetch is not part of this step');
  assert.ok(
    !urls.some((url) => url.includes('jsdelivr')),
    'the interpreter is cached by its own requests, not by this list'
  );
  assert.ok(urls.includes('https://example.org/MechaLab/assets/index-abc.js'));
});

check('a duplicated tag and a malformed href do not break the list', () => {
  const urls = assetUrlsFromDocument(
    stubDocument([
      tag('SCRIPT', { src: './assets/index-abc.js' }),
      tag('SCRIPT', { src: './assets/index-abc.js' }),
      tag('SCRIPT', { src: 'http://[::1' }),
      tag('SCRIPT', {}),
    ])
  );
  assert.equal(
    urls.filter((url) => url.endsWith('index-abc.js')).length,
    1,
    'the same bundle is asked for once'
  );
});

check('a size reads the way a person says it', () => {
  assert.equal(formatTakeAlongSize(0), '0 B');
  assert.equal(formatTakeAlongSize(999), '999 B');
  assert.equal(formatTakeAlongSize(1_500), '2 kB');
  assert.equal(formatTakeAlongSize(25_100_000), '25.1 MB');
  assert.equal(formatTakeAlongSize(NaN), '0 B');
});

check('the report line never calls a shell-only cache offline-ready', () => {
  assert.equal(offlineReportLine({ entries: 0, bytes: 0, runtimeFiles: 0 }), 'nothing cached yet');
  const shellOnly = offlineReportLine({ entries: 4, bytes: 1_200_000, runtimeFiles: 0 });
  assert.match(shellOnly, /1\.2 MB · 4 files/);
  assert.match(shellOnly, /Python still needs the network/);
  const full = offlineReportLine({ entries: 3, bytes: 25_000_000, runtimeFiles: 2 });
  assert.match(full, /^25\.0 MB · 3 files$/);
});

check('one file is one file, not "1 files"', () => {
  assert.match(offlineReportLine({ entries: 1, bytes: 900, runtimeFiles: 1 }), /1 file$/);
});

check('a host with no service worker is not warmable, and says so without throwing', () => {
  assert.equal(offlineWarmSupported(), false, 'Node has no navigator.serviceWorker');
});

check('no Cache API means an empty inventory, not a crash', async () => {
  // `cacheInventory` is async; this check asserts its promise shape via a direct await in the runner
  // below rather than making every check async.
  assert.equal(typeof cacheInventory, 'function');
});

// The two async behaviours that the browser suite relies on: an inventory with no Cache API, and an
// unsupported host. Awaited here because a silent rejection would otherwise look like a pass.
const emptyInventory = await cacheInventory();
if (emptyInventory.entries !== 0 || emptyInventory.bytes !== 0 || emptyInventory.runtimeFiles !== 0) {
  failed += 1;
  console.error('  FAIL an environment without the Cache API must report an empty inventory');
} else {
  passed += 1;
  console.log('  ok   an environment without the Cache API reports an empty inventory');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
