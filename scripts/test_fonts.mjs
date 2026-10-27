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
 * Both faces are now self-hosted from `@fontsource-variable` (Geist and Geist Mono) and named once,
 * in `src/index.css`, as
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
 * 5. **Maths is self-hosted too.** The KaTeX stylesheet is imported from the package rather than
 *    linked from jsdelivr, its 19 woff2 faces are emitted beside the other fonts, and neither the
 *    document nor the emitted CSS names another origin — the property that makes a formula render on
 *    a machine that cannot reach a CDN. The stylesheet's `woff` and `ttf` sources are trimmed by
 *    `vite.config.ts`; a face left behind at those formats is another 817 kB of fonts nobody loads, so the
 *    suite fails on one too.
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
for (const pkg of ['@fontsource-variable/geist', '@fontsource-variable/geist-mono']) {
  assert.ok(
    main.includes(`import '${pkg}'`),
    `expected src/main.tsx to import ${pkg}; without it the family is named but never loaded, and the page falls back to the system face`
  );
}

// 2. One name per face, and body reading the token.
assert.match(
  css,
  /--font-sans:\s*'Geist Variable'/,
  "expected --font-sans to name 'Geist Variable', the family the fontsource package declares"
);
assert.match(
  css,
  /--font-mono:\s*'Geist Mono Variable'/,
  "expected --font-mono to name 'Geist Mono Variable', the family the fontsource package declares"
);
assert.match(
  css,
  /font-family:\s*var\(--font-sans\)/,
  'expected body to use var(--font-sans) instead of spelling a stack out a second time'
);

// 3. No font CDN, in the shell or the stylesheet — and no remote stylesheet of any kind.
for (const [where, text] of [
  ['app/index.html', html],
  ['app/src/index.css', css],
]) {
  assert.ok(
    !/fonts\.(googleapis|gstatic)\.com/.test(text),
    `expected ${where} not to load a font from a CDN; the two faces are self-hosted so the page needs no third-party request`
  );
  assert.ok(
    !/<link[^>]+href="https?:\/\//.test(text),
    `expected ${where} to link only stylesheets this bundle ships; a remote one (KaTeX used to come from jsdelivr) is a render that waits on somebody else's server`
  );
}

// 4. The editor and the built bundle.
assert.match(
  editorTheme,
  /fontFamily:\s*'var\(--font-mono/,
  'expected the editor to ask for --font-mono, so the code face and the app’s tables are one family'
);

// 5. Maths: the stylesheet is imported from the package, not linked from a CDN.
assert.ok(
  main.includes("import 'katex/dist/katex.min.css'"),
  'expected src/main.tsx to import katex/dist/katex.min.css; without it KaTeX has no layout rules and every formula renders as stacked plain text'
);

const distAssets = path.join(repoRoot, 'dist', 'assets');
if (fs.existsSync(distAssets)) {
  const files = fs.readdirSync(distAssets);
  for (const [family, pattern] of [
    ['Geist', /^geist-latin-wght-normal-[\w-]+\.woff2$/],
    ['Geist Mono', /^geist-mono-latin-wght-normal-[\w-]+\.woff2$/],
  ]) {
    assert.ok(
      files.some((file) => pattern.test(file)),
      `expected a Latin ${family} woff2 in dist/assets; the import is there but nothing was emitted, so the browser falls back`
    );
  }

  // The maths stylesheet is its own emitted file: `vendor-katex`, because `katex` has a chunk of its
  // own in `vite.config.ts`, and the built index.html links it so formulas are styled at first paint
  // rather than after the JavaScript injects a <link>.
  const katexCss = files.find((file) => /^vendor-katex-[\w-]+\.css$/.test(file));
  assert.ok(
    katexCss,
    'expected a vendor-katex stylesheet in dist/assets: katex/dist/katex.min.css is imported but nothing was emitted'
  );
  const builtHtml = fs.readFileSync(path.join(repoRoot, 'dist', 'index.html'), 'utf8');
  assert.ok(
    new RegExp(`<link[^>]+href="[^"]*${katexCss}"`).test(builtHtml),
    `expected dist/index.html to link ${katexCss}; without the link the rules arrive late and every formula flashes unstyled`
  );
  assert.ok(
    !/(?:src|href)="https?:\/\//.test(builtHtml),
    'expected the built document to name no third-party asset; a CDN stylesheet is the dependency self-hosting removed'
  );

  const katexCssText = fs.readFileSync(path.join(distAssets, katexCss), 'utf8');
  assert.ok(
    !/url\(\s*['"]?https?:\/\//.test(katexCssText),
    `expected ${katexCss} to fetch nothing from another origin; every face it names must be a file this bundle serves`
  );
  const katexFonts = [...katexCssText.matchAll(/url\(\s*['"]?([^'")]*KaTeX_[^'")]*)/g)].map((match) => match[1]);
  assert.ok(katexFonts.length >= 19, `expected ${katexCss} to name KaTeX’s 19 faces, found ${katexFonts.length}`);
  for (const ref of katexFonts) {
    const name = path.basename(ref);
    assert.ok(
      files.includes(name),
      `expected ${name} beside the stylesheet: a url() the build did not emit is a request that 404s, and the formula falls back to a text face`
    );
  }
  // No `woff`/`ttf` left over: the plugin keeps only the first source of each `@font-face`, and the
  // other two are 1.17 MB of files no current browser asks for.
  const legacy = files.filter((file) => /^KaTeX_.*\.(?:woff|ttf|otf)$/.test(file));
  assert.equal(
    legacy.length,
    0,
    `expected no legacy KaTeX font formats in dist/assets, found ${legacy.join(', ')}; the woff2-only trim in vite.config.ts did not reach the stylesheet`
  );

  const woff2 = files.filter((file) => file.endsWith('.woff2'));
  const fontKb = woff2.reduce((total, file) => total + fs.statSync(path.join(distAssets, file)).size, 0);
  console.log(
    `[fonts] dist carries ${woff2.length} woff2 files (${Math.round(fontKb / 1024)} KB total, subsets unicode-range gated) `+
      `including KaTeX’s ${new Set(katexFonts.map((ref) => path.basename(ref))).size} maths faces`
  );
} else {
  console.log('[fonts] dist/ absent - bundle half skipped (it runs in CI, after the build)');
}

console.log('[fonts] ok');
