#!/usr/bin/env node
/**
 * Put a try-it link under every code block a page marks for running
 * (`scripts/generate_try_links.mjs`, `npm run check:try-links`).
 *
 * A page's `## 4. Worked example` says "predict first, then run it" - and until now the reader had no
 * Run to press: the Markdown block is inert, and the workbench is a page away with a different lesson
 * in its editor. Marking the fence with `<!-- try -->` turns it into a link that opens the workbench
 * on that page's own entry with the snippet in a **scratch** editor: Run prints what the snippet
 * prints, nothing is graded, and the learner's draft for that lesson is untouched
 * ([`app/src/tryLink.ts`](../app/src/tryLink.ts), [`app/src/tryLinks.ts`](../app/src/tryLinks.ts)).
 *
 * The link is generated, never typed, for the reason `generate_run_callouts.py` exists: a URL an
 * author retypes is a URL that goes stale, and one that carries a payload goes stale the moment the
 * block above it is edited. So the block's text is rewritten from the fence on every run, and
 * `--check` is the gate that says a page is up to date.
 *
 * The encoding is the app's own share codec, imported from `app/src/` rather than reimplemented in
 * Python: a payload written by a second implementation is a payload that can disagree with the
 * decoder by one byte, and base64url of JSON disagrees silently.
 *
 * Usage:
 *     node --experimental-strip-types scripts/generate_try_links.mjs            # rewrite every page
 *     node --experimental-strip-types scripts/generate_try_links.mjs --check    # exit 1 if stale
 *     node --experimental-strip-types scripts/generate_try_links.mjs --dry-run  # print, write nothing
 *
 * Exit-code family: typed (0 every page is up to date, 1 stale or an author mistake, 2 bad arguments).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { rewriteTryLinks } from '../app/src/tryLinks.ts';
import { REPO, tryLinkPages } from './try_link_pages.mjs';

const TABS = path.join(REPO, 'app', 'src', 'data', 'workbenchTabs.json');

function main(argv) {
  const args = new Set(argv);
  if (args.has('-h') || args.has('--help')) {
    process.stdout.write(
      'usage: generate_try_links.mjs [--check] [--dry-run] [-q]\n' +
        '\n' +
        '  --check     report pages whose generated try-it link is stale; exit 1 instead of writing\n' +
        '  --dry-run   print what would change and write nothing\n' +
        '  -q          print only the summary\n' +
        '\n' +
        'Exit-code family: typed (0 up to date, 1 stale or an author mistake, 2 bad arguments)\n'
    );
    return 0;
  }
  const unknown = argv.filter((arg) => !['--check', '--dry-run', '-q', '--quiet'].includes(arg));
  if (unknown.length) {
    process.stderr.write(`unknown argument(s): ${unknown.join(' ')} - see --help\n`);
    return 2;
  }
  const check = args.has('--check');
  const dryRun = args.has('--dry-run');
  const quiet = args.has('-q') || args.has('--quiet');

  const { workbenchUrl, tabs } = JSON.parse(readFileSync(TABS, 'utf8'));
  const tabName = tabs['tab-pyodide'];

  let linked = 0;
  let changedFiles = 0;
  const problems = [];
  // The lesson and module trees, never every `.md` in the repository: a changelog's fenced example of
  // the marker is prose about it, not a page with code to run (`scripts/try_link_pages.mjs`).
  for (const file of tryLinkPages()) {
    const before = readFileSync(file, 'utf8');
    const result = rewriteTryLinks(before, { href: workbenchUrl, tabName });
    linked += result.linked;
    const relative = path.relative(REPO, file).split(path.sep).join('/');
    for (const problem of result.problems) problems.push(`${relative}:${problem}`);
    if (!result.changed) continue;
    changedFiles += 1;
    if (!quiet) {
      process.stdout.write(`${check ? 'stale' : dryRun ? 'would update' : 'updated'}  ${relative}\n`);
    }
    if (!check && !dryRun) writeFileSync(file, result.markdown);
  }

  if (problems.length) {
    process.stderr.write(`\n${problems.length} problem(s) - these blocks carry no link:\n`);
    for (const problem of problems) process.stderr.write(`  ${problem}\n`);
  }
  if (!quiet) {
    process.stdout.write(
      `\n${linked} try-it block(s) across ${changedFiles} page(s) ` +
        `${check ? 'need a rewrite' : dryRun ? 'would be rewritten' : 'rewritten'}` +
        `${problems.length ? `, ${problems.length} problem(s)` : ''}\n`
    );
  }
  if (problems.length) return 1;
  if (check && changedFiles) return 1;
  return 0;
}

process.exitCode = main(process.argv.slice(2));
