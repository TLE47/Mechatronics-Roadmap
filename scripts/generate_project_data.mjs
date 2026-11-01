#!/usr/bin/env node
/**
 * Write the app's project document from the capstone's own EDA report
 * (`scripts/generate_project_data.mjs`).
 *
 * The bill of materials has had two lives: the capstone script generates it from the design and
 * checks every derating margin, and `TabCadPcb` used to carry a hand-typed six-line summary beside
 * it. A hand-typed copy is the wrong number the first time a part changes, and the summary dropped
 * six lines while still printing the report's total. So the app reads a document generated from the
 * report, through `app/src/projectModel.ts`, and every component in it has an id other views can
 * cite.
 *
 * `--check` is the drift gate: a report edited without regenerating fails here, exactly like
 * `generate_spine_data.py --check`. `npm run test:project` also compares the two files, so the unit
 * suite catches drift even when nobody runs this script.
 *
 * Usage:
 *     node --experimental-strip-types scripts/generate_project_data.mjs           # rewrite the file
 *     node --experimental-strip-types scripts/generate_project_data.mjs --check   # exit 1 if stale
 *     node --experimental-strip-types scripts/generate_project_data.mjs --dry-run # print, write nothing
 *
 * Exit-code family: typed (0 current, 1 stale or a bad report, 2 bad arguments).
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { projectFromReport, projectObjects } from '../app/src/projectModel.ts';

const REPO = process.cwd();
const REPORT = '08-capstone-projects/eda-capstone1-foc-drive/foc_thermal_and_bom.json';
const OUT = 'app/src/data/capstoneProject.json';
/** The picker's share of the project: ids, kinds and labels, so the workflow does not parse the BOM. */
const OBJECTS_OUT = 'app/src/data/capstoneObjects.json';
// Run from the repository root, like every other generator here.

function main(argv) {
  const args = new Set(argv);
  if (args.has('-h') || args.has('--help')) {
    process.stdout.write(
      'usage: generate_project_data.mjs [--check] [--dry-run] [-q]\n' +
        '\n' +
        '  --check     report a stale app/src/data/capstoneProject.json; exit 1 instead of writing\n' +
        '  --dry-run   print what would change and write nothing\n' +
        '  -q          print only the summary\n' +
        '\n' +
        'Exit-code family: typed (0 current, 1 stale or a bad report, 2 bad arguments)\n'
    );
    return 0;
  }
  const unknown = argv.filter(
    (arg) => !['--check', '--dry-run', '-q', '--quiet'].includes(arg)
  );
  if (unknown.length) {
    process.stderr.write(`unknown argument(s): ${unknown.join(' ')} - see --help\n`);
    return 2;
  }
  const check = args.has('--check');
  const dryRun = args.has('--dry-run');
  const quiet = args.has('-q') || args.has('--quiet');

  const reportPath = path.join(REPO, REPORT);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const project = projectFromReport(report, REPORT);
  const files = [
    [OUT, JSON.stringify(project, null, 2) + '\n'],
    [OBJECTS_OUT, JSON.stringify(projectObjects(project), null, 2) + '\n'],
  ];

  const stale = files.filter(([file, document]) => {
    try {
      return readFileSync(path.join(REPO, file), 'utf8') !== document;
    } catch {
      return true;
    }
  });
  if (stale.length === 0) {
    if (!quiet) {
      process.stdout.write(
        `current  ${OUT}  ${project.summary.lines} lines / ` +
          `${project.summary.placements} placements / $${project.summary.costUsd.toFixed(2)}\n`
      );
    }
    return 0;
  }
  if (check) {
    for (const [file] of stale) {
      process.stderr.write(`stale    ${file} does not match ${REPORT} - run npm run gen:project\n`);
    }
    return 1;
  }
  if (dryRun) {
    for (const [file, document] of stale) process.stdout.write(`--- ${file}\n${document}`);
    return 0;
  }
  for (const [file, document] of stale) {
    // Atomic, in the target's own directory: a reader never sees half a parts list.
    const target = path.join(REPO, file);
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, document);
    renameSync(temporary, target);
    if (!quiet) process.stdout.write(`wrote    ${file}\n`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
