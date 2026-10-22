#!/usr/bin/env node
/**
 * The token table's source of truth (`scripts/test_theme_tokens.mjs`, `npm run test:theme:tokens`)
 *
 * `?view=theme` prints the palette it parses out of `app/src/index.css`. That is the point of the
 * page — one copy of the palette — so the thing worth testing is not "does it render 25 rows" but
 * "does it follow the stylesheet". Three kinds of case:
 *
 * 1. **Agreement.** Every row's values match an independent read of the file in all three palettes,
 *    the utilities match `@theme inline` in both directions, and the two tokens with no family say so.
 * 2. **Mutation.** Change a value, add a token, drop a block — the parse must follow each, which a
 *    hand-typed table cannot do. This is what "live" is supposed to mean.
 * 3. **The address.** `?view=theme` is the route and nothing else is, and the SSR guard answers
 *    `false` where there is no `window` (Node here, the smoke test in the app).
 *
 * The parser imports nothing but types, so Node strips the types and runs it directly.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isThemeView, themeViewFromLocation, themeViewSearch } from '../app/src/themeRoute.ts';
import { normaliseValue, themeTokensFromCss } from '../app/src/themeTokens.ts';

const CSS_PATH = path.join(process.cwd(), 'app', 'src', 'index.css');
const SOURCE = fs.readFileSync(CSS_PATH, 'utf8');

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

/** The declarations of one `opener { ... }` block, read without the parser under test. */
function independentBlock(source, opener) {
  // Line-anchored: the header comment also names these blocks in prose.
  const match = new RegExp(`^${opener.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm').exec(source);
  assert.ok(match, `index.css has no ${opener} block`);
  const open = source.indexOf('{', match.index);
  const close = source.indexOf('}', open);
  const body = source.slice(open + 1, close);
  const out = new Map();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(match[1], match[2].trim());
  }
  return out;
}

const table = themeTokensFromCss(SOURCE);
const darkBlock = independentBlock(SOURCE, ':root');
const lightBlock = independentBlock(SOURCE, '[data-theme="light"]');
const contrastBlock = independentBlock(SOURCE, '[data-theme="contrast"]');

console.log('theme tokens');

check('the stylesheet still parses', () => {
  assert.equal(
    table.error,
    null,
    `expected no parse error, got: ${table.error} — the page would render its warning panel instead of the palette`,
  );
  assert.ok(table.colour.length >= 20, `expected the ~25 colour tokens, got ${table.colour.length}`);
});

check('every colour row matches the stylesheet, read independently', () => {
  for (const row of table.colour) {
    assert.equal(
      row.dark,
      darkBlock.get(row.name),
      `expected ${row.name} to be ${darkBlock.get(row.name)} from :root, got ${row.dark} — the page reads a different copy of the palette`,
    );
    const expectedLight = lightBlock.get(row.name) ?? darkBlock.get(row.name);
    assert.equal(
      row.light,
      expectedLight,
      `expected ${row.name} to resolve to ${expectedLight} in light mode, got ${row.light}`,
    );
    const expectedContrast = contrastBlock.get(row.name) ?? darkBlock.get(row.name);
    assert.equal(
      row.contrast,
      expectedContrast,
      `expected ${row.name} to resolve to ${expectedContrast} in high contrast, got ${row.contrast}`,
    );
  }
});

check('each palette re-points exactly the colours its block overrides', () => {
  const isColourValue = (value) => /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))$/.test(value);
  const paletteNames = new Set(
    [...darkBlock.entries()].filter(([, value]) => isColourValue(value)).map(([name]) => name)
  );
  for (const [label, block, field] of [
    ['light', lightBlock, 'themed'],
    ['high contrast', contrastBlock, 'themedContrast'],
  ]) {
    const themed = table.colour.filter((row) => row[field]).map((row) => row.name).sort();
    // Both override blocks re-point the shadows and the focus ring too; those belong in the scale table.
    const expected = [...block.keys()].filter((name) => paletteNames.has(name)).sort();
    assert.deepEqual(
      themed,
      expected,
      `expected exactly the tokens the ${label} block overrides to be marked themed; an unmarked override shows the dark value in that column`,
    );
  }
  for (const name of ['--plot', '--plot-line']) {
    const row = table.colour.find((candidate) => candidate.name === name);
    assert.ok(row, `expected ${name} to be a colour row`);
    assert.equal(row.themed, false, `expected ${name} to stay dark in every palette`);
    assert.equal(row.themedContrast, false, `expected ${name} to stay dark in high contrast too`);
    assert.equal(row.dark, row.light, `expected ${name} to have one value, got ${row.dark} / ${row.light}`);
    assert.equal(row.dark, row.contrast, `expected ${name} to keep its value in high contrast, got ${row.contrast}`);
  }
});

check('the utility families come from @theme inline, both ways', () => {
  assert.equal(table.utilities['--color-panel'], '--panel', 'expected bg-panel to resolve to --panel');
  assert.equal(table.utilities['--color-raise'], '--panel-2', 'expected bg-raise to resolve to --panel-2');
  const reverse = new Map(Object.entries(table.utilities).map(([utility, token]) => [token, utility]));
  for (const row of table.colour) {
    const registered = reverse.get(row.name);
    assert.equal(
      row.utility,
      registered ? registered.replace('--color-', '') : null,
      `expected ${row.name}'s family to be ${registered ?? 'none'}, got ${row.utility} — the page would name a class that reaches another token`,
    );
  }
  for (const name of ['--accent-soft', '--plot-line']) {
    const row = table.colour.find((candidate) => candidate.name === name);
    assert.equal(
      row?.utility,
      null,
      `expected ${name} to show no family; it is a property with no @theme inline entry, so any class printed for it does nothing`,
    );
  }
});

check('the scale values are not mistaken for colours', () => {
  for (const name of ['--r-md', '--s-3', '--shadow-md', '--t-base', '--step-0', '--measure']) {
    assert.ok(
      table.scale.some((row) => row.name === name),
      `expected ${name} in the scale table; a shadow starts with a length and a radius with px, so neither is a colour`,
    );
    assert.ok(
      !table.colour.some((row) => row.name === name),
      `expected ${name} not to get a swatch — it is not a colour`,
    );
  }
  const shadow = table.scale.find((row) => row.name === '--shadow-md');
  assert.equal(shadow?.themed, true, 'expected --shadow-md to be marked themed; light mode softens it');
  assert.equal(shadow?.themedContrast, true, 'expected --shadow-md to be marked themed in high contrast; the shadows deepen on near-black');
  const radius = table.scale.find((row) => row.name === '--r-md');
  assert.equal(radius?.themedContrast, false, 'expected --r-md to be unchanged in high contrast; the scale is shared');
});

check('a changed value shows up in the table (it is not a typed copy)', () => {
  const edited = SOURCE.replace('--panel: #0e1624;', '--panel: #123456;');
  assert.notEqual(edited, SOURCE, 'expected --panel: #0e1624; in index.css; the mutation test edited nothing');
  const changed = themeTokensFromCss(edited);
  const panel = changed.colour.find((row) => row.name === '--panel');
  assert.equal(panel?.dark, '#123456', `expected the edited value to reach the page, got ${panel?.dark}`);
  assert.equal(panel?.light, '#ffffff', 'expected the light override to survive an edit to the dark value');
  const untouched = changed.colour.filter((row) => row.name !== '--panel');
  const original = table.colour.filter((row) => row.name !== '--panel');
  assert.deepEqual(untouched, original, 'expected one edit to change one row, not the whole table');
});

check('a new token appears without editing the page', () => {
  const edited = SOURCE.replace(
    '  --panel-3: #1f2f47;',
    '  --panel-3: #1f2f47;\n  --keel: #123abc;',
  ).replace('  --color-plot: var(--plot);', '  --color-plot: var(--plot);\n  --color-keel: var(--keel);');
  assert.notEqual(edited, SOURCE, 'expected the anchor declarations in index.css; the mutation test edited nothing');
  const grown = themeTokensFromCss(edited);
  const keel = grown.colour.find((row) => row.name === '--keel');
  assert.ok(keel, 'expected a token added to :root to appear in the table');
  assert.equal(keel.utility, 'keel', `expected the new @theme inline family to be found, got ${keel.utility}`);
  assert.equal(keel.light, '#123abc', 'expected a token the light block does not override to keep its dark value');
  assert.equal(keel.contrast, '#123abc', 'expected a token no override block touches to keep its dark value in high contrast');
});

check('a missing block is reported, not rendered as a half-empty table', () => {
  const broken = SOURCE.replace('@theme inline {', '@theme gone {');
  const result = themeTokensFromCss(broken);
  assert.equal(result.colour.length, 0, 'expected no rows when the stylesheet cannot be read');
  assert.match(
    result.error ?? '',
    /@theme inline/,
    `expected the error to name the missing block, got: ${result.error}`,
  );
  const noContrast = themeTokensFromCss(SOURCE.replace('[data-theme="contrast"] {', '[data-theme="gone"] {'));
  assert.match(
    noContrast.error ?? '',
    /\[data-theme="contrast"\]/,
    `expected a missing high-contrast block to be reported rather than painted as the dark value, got: ${noContrast.error}`,
  );
});

check('the address is ?view=theme and only that', () => {
  assert.equal(isThemeView('?view=theme'), true, 'expected ?view=theme to open the token page');
  assert.equal(isThemeView('?lesson=P.1'), false, 'expected a lesson deep link to stay on the workbench');
  assert.equal(isThemeView(''), false, 'expected the bare workbench to stay the workbench');
  assert.equal(isThemeView('?view=themes'), false, 'expected an unknown view to be ignored, not guessed at');
  assert.equal(themeViewSearch(), '?view=theme', 'expected one spelling of the link, used by the footer and the page');
  assert.equal(
    themeViewFromLocation(),
    false,
    'expected the location read to answer false without a window (SSR, the smoke render); a throw here breaks the prerender',
  );
});

check('values compare equal regardless of spacing', () => {
  assert.equal(
    normaliseValue('rgba(56, 189, 248, 0.14)'),
    normaliseValue('RGBA(56,189,248,0.14)'),
    'expected the browser-vs-stylesheet comparison to ignore whitespace and case',
  );
});

console.log(`\ntheme tokens: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
