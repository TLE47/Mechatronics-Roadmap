#!/usr/bin/env node
/**
 * The CI verdict, before the push (`scripts/verify_ci.mjs`, `npm run verify:ci`).
 *
 * `scripts/check_all.py --ci` is CI's *text* job, and running it was the local ritual — which is why
 * a push could be green locally and red in CI three times in one afternoon: the browser partitions,
 * the label audit and the unittest discovery live in other jobs and were never part of the ritual.
 * This script is the missing list. Each entry names the CI job it mirrors and runs that job's
 * commands, in order, with the environment CI gives them.
 *
 * Lanes, so the cost matches the change:
 *
 *   (default)   the fast lane: the text gates, the typecheck, the Node unit batch and the build.
 *   --browser   + every browser lane: the three workbench partitions and the audit gates
 *               (weight, theme, axe, settle, snapshot, labels, every Bridge Notes card).
 *   --all       + the heavy lanes: the exercise sweep and unittest discovery, the reference labs,
 *               Lighthouse, and the two runtime suites.
 *
 * `--keep-going` runs the rest after a failure (CI does) and reports every red at the end; without
 * it the first failure stops the run, because a local loop wants the first error.
 *
 * `--list` prints the plan without running it, which is also what `scripts/test_verify_ci.mjs`
 * grades: every npm script this file names must exist, every file it names must be on disk.
 *
 * Not mirrored: the macOS jobs (they grade the Intel runner, not this machine) and the Pages deploy
 * (it publishes; a local run never should).
 *
 * Usage
 *   npm run verify:ci                 # fast lane
 *   npm run verify:ci -- --browser    # + browser lanes (needs the Playwright libs)
 *   npm run verify:ci -- --all        # everything except macOS and the deploy
 *   npm run verify:ci -- --list
 *
 * Exit-code family: typed
 *   0  every selected step passed
 *   1  a step failed (named, with its lane)
 *   2  bad command line, or no dependencies installed
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** One CI job's commands. `lane` is when it runs here; `job` names the workflow job it mirrors. */
export const STEPS = [
  {
    id: 'text',
    job: 'python-text',
    lane: 'fast',
    name: 'Text gates (Markdown, math, generated data, workflows)',
    cmds: [['python3', 'scripts/check_all.py', '--ci']],
  },
  {
    id: 'typecheck',
    job: 'typecheck',
    lane: 'fast',
    name: 'Typecheck every project reference',
    cmds: [['npx', 'tsc', '-b']],
  },
  {
    id: 'unit',
    job: 'node-unit',
    lane: 'fast',
    name: 'Node unit checks',
    cmds: [
      ['node', 'scripts/audit_math.mjs', '.'],
      ['npm', 'run', 'test:merge'],
      ['npm', 'run', 'test:accounts'],
      ['npm', 'run', 'test:faultbench'],
      ['npm', 'run', 'test:game'],
      ['npm', 'run', 'test:practice'],
      ['npm', 'run', 'test:content'],
      ['npm', 'run', 'test:perf:unit'],
    ],
  },
  {
    id: 'build',
    job: 'build-workbench',
    lane: 'fast',
    name: 'Generate the lesson data and build the bundle',
    cmds: [
      ['npm', 'run', 'prebuild'],
      ['npx', 'vite', 'build'],
    ],
  },
  {
    id: 'e2e-a',
    job: 'e2e-suites (shard e2e-a)',
    lane: 'browser',
    name: 'Workbench — dev-server sweep and its light flows',
    env: { PW_BROWSERS: 'chromium' },
    cmds: [['npm', 'run', 'test:workbench', '--', '--partition', 'e2e-a']],
  },
  {
    id: 'e2e-b',
    job: 'e2e-suites (shard e2e-b)',
    lane: 'browser',
    name: 'Workbench — the remaining dev-server flows',
    env: { PW_BROWSERS: 'chromium' },
    cmds: [['npm', 'run', 'test:workbench', '--', '--partition', 'e2e-b']],
  },
  {
    id: 'bundle',
    job: 'bundle-suites',
    lane: 'browser',
    name: 'Workbench — built bundle, control pairs, tour, home, the reader route',
    env: { PW_BROWSERS: 'chromium', PLAYWRIGHT_BROWSERS: 'both' },
    cmds: [['npm', 'run', 'test:workbench', '--', '--partition', 'bundle']],
  },
  {
    id: 'weight',
    job: 'audit-suites',
    lane: 'browser',
    name: 'Weight budget',
    cmds: [['npm', 'run', 'check:weight']],
  },
  {
    id: 'theme',
    job: 'audit-suites',
    lane: 'browser',
    name: 'Palette contract and contrast',
    cmds: [['npm', 'run', 'test:theme:e2e']],
  },
  {
    id: 'axe',
    job: 'audit-suites',
    lane: 'browser',
    name: 'axe over every tab in both themes',
    cmds: [['npm', 'run', 'check:axe']],
  },
  {
    id: 'settle',
    job: 'audit-suites',
    lane: 'browser',
    name: 'Settle gate',
    cmds: [['npm', 'run', 'test:settle']],
  },
  {
    id: 'snapshot',
    job: 'audit-suites',
    lane: 'browser',
    name: 'Surface snapshot',
    cmds: [['npm', 'run', 'check:snapshot']],
  },
  {
    id: 'labels',
    job: 'audit-suites',
    lane: 'browser',
    name: 'Label sizes',
    cmds: [['npm', 'run', 'check:labels']],
  },
  {
    id: 'bridge-contrast',
    job: 'audit-suites',
    lane: 'browser',
    name: 'Every Bridge Notes card in every palette at both widths',
    cmds: [['npm', 'run', 'check:bridge-contrast']],
  },
  {
    id: 'runtime',
    job: 'runtime-python',
    lane: 'browser',
    name: 'Python worker under isolation',
    cmds: [['npm', 'run', 'test:runtime']],
  },
  {
    id: 'offline',
    job: 'runtime-offline',
    lane: 'browser',
    name: 'Offline workbench',
    cmds: [['npm', 'run', 'test:offline']],
  },
  {
    id: 'exercises',
    job: 'python-exercises',
    lane: 'heavy',
    name: 'Exercise sweep, coverage and the unittest discovery',
    env: { RUN_EXERCISE_REPORT: path.join('/tmp', 'run-exercise.json') },
    cmds: [
      ['python3', 'scripts/run_exercise.py', '--verbose', '--report-file', path.join('/tmp', 'run-exercise.json')],
      ['python3', 'scripts/check_exercise_coverage.py'],
      ['python3', '-m', 'unittest', 'discover', '-s', 'tests'],
    ],
  },
  {
    id: 'labs',
    job: 'python-labs',
    lane: 'heavy',
    name: 'Reference simulations, module diffs, CAD, PCB and firmware',
    cmds: [['python3', 'scripts/run_all_labs.py', '--verbose']],
  },
  {
    id: 'lighthouse',
    job: 'lighthouse',
    lane: 'heavy',
    name: 'Lighthouse on the built bundle',
    cmds: [['npm', 'run', 'check:lighthouse']],
  },
];

const LANES = ['fast', 'browser', 'heavy'];

export function selected(lanes) {
  return STEPS.filter((step) => lanes.includes(step.lane));
}

function main() {
  const args = process.argv.slice(2);
  const keepGoing = args.includes('--keep-going');
  const lanes = ['fast'];
  if (args.includes('--browser')) lanes.push('browser');
  if (args.includes('--all')) lanes.push('browser', 'heavy');

  const steps = selected(lanes);
  if (steps.length === 0) {
    console.error('no steps selected');
    return 2;
  }

  if (args.includes('--list')) {
    for (const step of steps) {
      console.log(`\n${step.id}  (${step.job}, ${step.lane})\n  ${step.name}`);
      for (const cmd of step.cmds) console.log(`    ${cmd.join(' ')}`);
    }
    return 0;
  }

  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    console.error('[FAIL] node_modules is missing: run `npm ci` first (the lanes use the locked tree)');
    return 2;
  }

  console.log(
    `verify:ci — ${steps.length} step(s), lane(s) ${lanes.join(', ')}` +
      `${keepGoing ? ', keep going after a failure' : ''}\n`
  );
  const failed = [];
  const started = Date.now();
  for (const step of steps) {
    for (const cmd of step.cmds) {
      const at = Date.now();
      const result = spawnSync(cmd[0], cmd.slice(1), {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, ...(step.env ?? {}) },
      });
      const seconds = ((Date.now() - at) / 1000).toFixed(1);
      if (result.status === 0) {
        console.log(`[ok] ${step.id.padEnd(16)} ${seconds}s  ${cmd.join(' ')}`);
        continue;
      }
      const code = result.status ?? result.signal ?? 'spawn-error';
      console.error(`[FAIL] ${step.id} (${step.job}) — ${cmd.join(' ')} exited ${code}`);
      failed.push({ step, cmd, code });
      if (!keepGoing) break;
    }
    if (failed.length && !keepGoing) break;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  if (failed.length) {
    console.error(`\n[FAIL] ${failed.length} of ${steps.length} step(s) failed in ${seconds}s:`);
    for (const one of failed) console.error(`  - ${one.step.id}: ${one.cmd.join(' ')} (${one.code})`);
    return 1;
  }
  console.log(`\n[PASS] every selected CI step passed in ${seconds}s (${steps.length} step(s))`);
  return 0;
}

if (process.argv[1] && path.basename(process.argv[1]) === 'verify_ci.mjs') {
  process.exit(main());
}
