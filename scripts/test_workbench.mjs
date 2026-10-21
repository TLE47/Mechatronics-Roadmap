#!/usr/bin/env node
/**
 * The whole Workbench test surface, one run (`scripts/test_workbench.mjs`, `npm run test:workbench`)
 *
 * The suites used to run one after another, each booting what it needed:
 *
 *   test:practice    the roadmap <-> workbench join, pure TypeScript (Node type stripping)
 *   test:theme       light/dark rules: stored choice, OS default, the data-theme attribute
 *   test:theme:tokens  the ?view=theme page's parse of index.css, and its address
 *   test:spine       the ten-step spine the pages print, and the numbering no surface repeats
 *   test:palette     the ⌘K catalogue: every lesson/tab/command once, and predictable ranking
 *   test:editor      slider directives (parse/clamp/format) and which lessons get helper tabs
 *   test:resume      the lesson the next visit reopens, including the ids it must refuse
 *   test:draft       the editor's unfinished work: kept, bounded, evicted, and never a starter copy
 *   test:fonts       the two self-hosted faces are named, imported and emitted
 *   test:smoke       Vite in middleware mode, SSR-render App + Runner + Quiz
 *   test:e2e         Vite dev server on a random port + Chromium
 *   test:e2e:pages   `npm run build` if `dist/` was missing, a static Pages server + Chromium, Firefox
 *   test:pairs       the same dev server + Chromium, for the same-task control-pair sweep
 *   test:tour        the same dev server + Chromium, walking the guided tour's Apply Demo Presets
 *
 * Nothing they check depends on the others' timing, and the app is the same app. So this runner:
 *
 *   - builds `dist/` only when it is missing (CI builds it in its own step, before this one);
 *   - starts *one* dev server and *one* dist server, and hands their URLs to the suites
 *     (`E2E_BASE_URL`, `PAGES_SERVER_URL`) so no suite boots a second one;
 *   - runs the smoke suite in this process, against that same dev server, so its SSR module graph
 *     is the graph the browser suites load - not a third transformation of the same sources;
 *   - runs the four browser suites side by side, each in its own process, output prefixed.
 *
 * Wall clock is the slowest suite rather than their sum, and the coverage is exactly what the separate
 * scripts cover when run alone. Each one still passes standalone: they create their own servers when
 * no URL is given.
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startDevServer } from './e2e_browser_workbench.mjs';
import { BASE, startStaticServer } from './e2e_pages_bundle.mjs';
import { runSmokeTests } from './smoke_test_workbench.mjs';

const repoRoot = process.cwd();

/** Stream a child's output line by line, prefixed, so two suites' logs stay readable. */
function pipe(stream, prefix) {
  let carry = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (carry + chunk).split('\n');
    carry = lines.pop() ?? '';
    for (const line of lines) process.stdout.write(`${prefix} ${line}\n`);
  });
  stream.on('end', () => {
    if (carry) process.stdout.write(`${prefix} ${carry}\n`);
    carry = '';
  });
}

function runSuite(label, script, env) {
  const started = Date.now();
  const child = spawn(process.execPath, [path.join('scripts', script)], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipe(child.stdout, `[${label}]`);
  pipe(child.stderr, `[${label}]`);
  return new Promise((resolve) => {
    child.on('close', (code) => resolve({ label, code, ms: Date.now() - started }));
    child.on('error', (error) => {
      process.stdout.write(`[${label}] spawn failed: ${error.message}\n`);
      resolve({ label, code: 1, ms: Date.now() - started });
    });
  });
}

/** Run the smoke suite in-process with its own log prefix, leaving the child pipes alone. */
function runSmoke(viteServer) {
  const started = Date.now();
  const write = console.log;
  console.log = (...args) => write('[smoke]', ...args);
  return runSmokeTests(viteServer)
    .then(() => ({ label: 'smoke', code: 0, ms: Date.now() - started }))
    .catch((error) => {
      write('[smoke] FAILED:', error?.stack ?? String(error));
      return { label: 'smoke', code: 1, ms: Date.now() - started };
    })
    .finally(() => {
      console.log = write;
    });
}

async function main() {
  const distIndex = path.join(repoRoot, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.log('[build] dist/index.html is missing - running `npm run build` first');
    execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: repoRoot });
    if (!fs.existsSync(distIndex)) throw new Error('npm run build produced no dist/index.html');
  }

  const { viteServer, baseUrl: devUrl } = await startDevServer(repoRoot);
  const { server: distServer, port } = await startStaticServer();
  const pagesUrl = `http://127.0.0.1:${port}${BASE}`;
  console.log(`[setup] dev server ${devUrl}`);
  console.log(`[setup] built bundle ${pagesUrl}`);

  const suites = [
    runSmoke(viteServer),
    runSuite('links', 'test_practice_links.mjs', {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-strip-types`.trim(),
    }),
    runSuite('theme', 'test_theme.mjs', {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-strip-types`.trim(),
    }),
    runSuite('tokens', 'test_theme_tokens.mjs', {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-strip-types`.trim(),
    }),
    runSuite('spine', 'test_spine.mjs', {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-strip-types`.trim(),
    }),
    runSuite('palette', 'test_palette.mjs', {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-strip-types`.trim(),
    }),
    runSuite('editor', 'test_editor.mjs', {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-strip-types`.trim(),
    }),
    runSuite('resume', 'test_last_lesson.mjs', {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-strip-types`.trim(),
    }),
    runSuite('draft', 'test_lesson_draft.mjs', {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-strip-types`.trim(),
    }),
    runSuite('fonts', 'test_fonts.mjs', {}),
    runSuite('e2e', 'e2e_browser_workbench.mjs', { E2E_BASE_URL: devUrl }),
    runSuite('pages', 'e2e_pages_bundle.mjs', { PAGES_SERVER_URL: pagesUrl }),
    runSuite('pairs', 'e2e_same_task_pairs.mjs', { E2E_BASE_URL: devUrl }),
    runSuite('tour', 'e2e_tour_presets.mjs', { E2E_BASE_URL: devUrl }),
  ];
  // Ctrl-C must not leave a Vite server or two Chromium runs behind.
  const stop = () => {
    viteServer.close();
    distServer.close();
    process.exit(130);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  let results;
  try {
    results = await Promise.all(suites);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await viteServer.close();
    distServer.close();
  }

  const failed = results.filter((result) => result.code !== 0);
  for (const result of results) {
    console.log(
      `[${result.code === 0 ? 'PASS' : 'FAIL'}] ${result.label.padEnd(5)} ${(result.ms / 1000).toFixed(1)}s`
    );
  }
  if (failed.length) {
    console.error(`[FAIL] ${failed.length} of ${results.length} workbench suites failed: ${failed.map((f) => f.label).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[PASS] Workbench suites passed on one dev server and one built bundle: ${results
      .map((result) => `${result.label} ${(result.ms / 1000).toFixed(1)}s`)
      .join(', ')}`
  );
}

main().catch((error) => {
  console.error('[FAIL] Workbench suite run failed:', error?.stack ?? error);
  process.exit(1);
});
