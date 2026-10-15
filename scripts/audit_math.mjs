#!/usr/bin/env node
// Typesets every formula the roadmap ships - the `$...$`/`$$...$$` spans in the Markdown
// modules, the `equation:` literals of the workbench curriculum, and every
// <MathView math="..."> attribute - through the same KaTeX the app renders with.
//
//   node scripts/audit_math.mjs [repo-root]
//
// Exit-code family: typed (0 = every formula renders, 1 = findings, 2 = usage error).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..'));
const require = createRequire(path.join(ROOT, 'package.json'));

let katex;
try {
  katex = require('katex');
} catch {
  process.stderr.write('error: katex is not installed - run `npm install` first\n');
  process.exit(2);
}

const failures = [];
const counts = { markdown: 0, equations: 0, views: 0 };

function check(tex, where, display = false) {
  if (tex === undefined || tex === null || !tex.trim()) return;
  try {
    katex.renderToString(tex, { displayMode: display, throwOnError: true });
  } catch (error) {
    failures.push({ where, tex, msg: error.message.replace(/^KaTeX parse error: /, '') });
  }
}

// ---- the workbench curriculum: `equation: '...'` string literals ----------------------
const dataFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(entry.name)) dataFiles.push(p);
  }
})(path.join(ROOT, 'src'));

const EQUATION = /equation:\s*'((?:[^'\\]|\\.)*)'/g;
const JSX_MATH = /math=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g;

for (const file of dataFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const lineAt = (index) => src.slice(0, index).split('\n').length;

  for (const match of src.matchAll(EQUATION)) {
    // `equation:` sits in a TypeScript string, so `\\` is one backslash by render time.
    const tex = match[1].replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch));
    counts.equations++;
    check(tex, `${rel}:${lineAt(match.index)}`);
  }

  for (const match of src.matchAll(JSX_MATH)) {
    // JSX attribute text is raw: a backslash reaches MathView exactly as written.
    const tex = match[1] ?? match[2] ?? match[3];
    counts.views++;
    check(tex, `${rel}:${lineAt(match.index)}`);
  }
}

// ---- the published Markdown modules ---------------------------------------------------
const FENCE = /^\s*(`{3,}|~{3,})/;
const INLINE_CODE = /`[^`\n]*`/g;

for (const entry of fs.readdirSync(ROOT, { recursive: true })) {
  const rel = String(entry);
  if (!rel.endsWith('.md') || rel.startsWith('.git') || rel.startsWith('node_modules')) continue;
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  let fence = false;
  let display = false;

  lines.forEach((raw, index) => {
    if (FENCE.test(raw)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    const masked = raw.replace(INLINE_CODE, (code) => '\x05'.repeat(code.length));
    if (masked.trim() === '$$') display = !display;
    if (display) return;

    for (const match of masked.matchAll(/(?<!\\)\$\$(?!\$)([\s\S]*?)(?<!\\)\$\$/g)) {
      if (match[0].length === 4) continue;
      counts.markdown++;
      check(match[1], `${rel}:${index + 1}`, true);
    }
    for (const match of masked.matchAll(/(?<!\\)\$(?!\$)([^$\n]{1,400}?)(?<!\\)\$(?!\$)/g)) {
      counts.markdown++;
      check(match[1], `${rel}:${index + 1}`);
    }
  });
}

// ---- report ---------------------------------------------------------------------------
const total = counts.markdown + counts.equations + counts.views;
const MINIMUM = 500; // a silent extraction regression must not read as "all render"

if (failures.length) {
  process.stderr.write(`\n${failures.length} formula(s) do not typeset:\n`);
  for (const failure of failures) {
    process.stderr.write(`  ${failure.where}\n    ${failure.tex}\n    ${failure.msg}\n`);
  }
}

process.stdout.write(
  `[${failures.length ? 'FAIL' : 'PASS'}] markdown=${counts.markdown} ` +
    `equations=${counts.equations} mathviews=${counts.views} failures=${failures.length}\n`
);

if (total < MINIMUM) {
  process.stderr.write(`error: only ${total} formulas found, expected at least ${MINIMUM}\n`);
  process.exit(1);
}

process.exit(failures.length ? 1 : 0);
