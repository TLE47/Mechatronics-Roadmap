#!/usr/bin/env node
/**
 * The workbench draws in the fonts it says it does (`npm run test:fonts`).
 *
 * `body` used to declare `font-family: Inter, -apple-system, ...` with no Inter anywhere in the
 * bundle: on macOS that fell through to the system face and looked close enough, and on Windows and
 * Linux it was Segoe or DejaVu, which is why the same screenshot looked like two different products.
 * The editor carried its own hard-coded mono stack besides, so the code face and the table face were
 * two different families chosen in two different files.
 *
 * Both faces are now self-hosted from `@fontsource-variable` and named once, in `src/index.css`, as
 * `--font-sans` and `--font-mono`. That is easy to lose without a symptom: drop one import and the
 * page still renders - in the fallback - and no other test notices. So this suite pins:
 *
 * 1. **Both packages are imported** by `src/main.tsx`, which is what puts the `@font-face` rules in
 *    the bundle.
 * 2. **The tokens name the variable families**, and `body` uses the token rather than a stack with
 *    the family spelled out a second time.
 * 3. **Nothing is fetched from a font CDN.** A Google Fonts `<link>` would undo the reason for
 *    self-hosting: no third-party request, no CDN outage, and the same face offline.
 * 4. **The built bundle carries the files**, and the editor asks for `--font-mono` so the code face
 *    and the app's numbers are the same family.
 *
 * Run: `node scripts/test_fonts.mjs` (also part of `npm run test:workbench`).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const main = read('app/src/main.tsx');
const css = read('app/src/index.css');
const html = read('app/index.html');
const editorTheme = read('app/src/editor/theme.ts');

// 1. The imports that bring the @font-face rules in.
for (const pkg of ['@fontsource-variable/inter', '@fontsource-variable/jetbrains-mono']) {
  assert.ok(
    main.includes(`import '${pkg}'`),
    `expected src/main.tsx to import ${pkg}; without it the family is named but never loaded, and the page falls back to the system face`
  );
}

// 2. One name per face, and body reading the token.
assert.match(
  css,
  /--font-sans:\s*'Inter Variable'/,
  "expected --font-sans to name 'Inter Variable', the family the fontsource package declares"
);
assert.match(
  css,
  /--font-mono:\s*'JetBrains Mono Variable'/,
  "expected --font-mono to name 'JetBrains Mono Variable', the family the fontsource package declares"
);
assert.match(
  css,
  /font-family:\s*var\(--font-sans\)/,
  'expected body to use var(--font-sans) instead of spelling a stack out a second time'
);

// 3. No font CDN, in the shell or the stylesheet.
for (const [where, text] of [
  ['app/index.html', html],
  ['app/src/index.css', css],
]) {
  assert.ok(
    !/fonts\.(googleapis|gstatic)\.com/.test(text),
    `expected ${where} not to load a font from a CDN; the two faces are self-hosted so the page needs no third-party request`
  );
}

// 4. The editor and the built bundle.
assert.match(
  editorTheme,
  /fontFamily:\s*'var\(--font-mono/,
  'expected the editor to ask for --font-mono, so the code face and the app’s tables are one family'
);

const distAssets = path.join(repoRoot, 'dist', 'assets');
if (fs.existsSync(distAssets)) {
  const files = fs.readdirSync(distAssets);
  for (const [family, pattern] of [
    ['Inter', /^inter-latin-wght-normal-[\w-]+\.woff2$/],
    ['JetBrains Mono', /^jetbrains-mono-latin-wght-normal-[\w-]+\.woff2$/],
  ]) {
    assert.ok(
      files.some((file) => pattern.test(file)),
      `expected a Latin ${family} woff2 in dist/assets; the import is there but nothing was emitted, so the browser falls back`
    );
  }
  const fontKb = files
    .filter((file) => file.endsWith('.woff2'))
    .reduce((total, file) => total + fs.statSync(path.join(distAssets, file)).size, 0);
  console.log(`[fonts] dist carries ${files.filter((f) => f.endsWith('.woff2')).length} woff2 files (${Math.round(fontKb / 1024)} KB total, subsets unicode-range gated)`);
} else {
  console.log('[fonts] dist/ absent - bundle half skipped (it runs in CI, after the build)');
}

console.log('[fonts] ok');
