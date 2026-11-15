#!/usr/bin/env node
/**
 * The local CI mirror must name things that exist (`scripts/test_verify_ci.mjs`).
 *
 * `scripts/verify_ci.mjs` is a hand-written list of the commands CI runs, so it has the one failure
 * mode every hand-written list has: it can name a script that was renamed, or an npm script that was
 * deleted, and then the local run grades something else. This suite reads the plan and checks it
 * against the repository: every `npm run <script>` names a script in `package.json`, every
 * `node`/`python3`/`npx` path exists, the lanes are the three the script documents, and the text
 * step is `check_all.py --ci` (the same command CI's text job runs).
 *
 * It reads the plan through the module, so a step added to the plan is graded here with no second
 * list to update.
 *
 * Run: `node --experimental-strip-types scripts/test_verify_ci.mjs` (`npm run test:verify-ci`)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { STEPS, selected } from './verify_ci.mjs';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts ?? {};
const known = new Set(Object.keys(scripts));

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}`);
  }
};

check('every step has a unique id, a CI job, a lane and at least one command', () => {
  const ids = new Set();
  for (const step of STEPS) {
    assert.ok(step.id && !ids.has(step.id), `duplicate or empty id: ${step.id}`);
    ids.add(step.id);
    assert.ok(step.job, `${step.id} names no CI job`);
    assert.ok(['fast', 'browser', 'heavy'].includes(step.lane), `${step.id} has lane ${step.lane}`);
    assert.ok(Array.isArray(step.cmds) && step.cmds.length > 0, `${step.id} runs nothing`);
  }
});

check('every npm command names a script package.json still has', () => {
  for (const step of STEPS) {
    for (const cmd of step.cmds) {
      if (cmd[0] !== 'npm') continue;
      assert.equal(cmd[1], 'run', `${step.id}: only \`npm run\` is expected, got ${cmd.slice(0, 2).join(' ')}`);
      assert.ok(known.has(cmd[2]), `${step.id}: package.json has no script named ${cmd[2]}`);
    }
  }
});

check('every script file a command names is on disk', () => {
  for (const step of STEPS) {
    for (const cmd of step.cmds) {
      if (!['node', 'python3', 'npx'].includes(cmd[0])) continue;
      const target = cmd.slice(1).find((part) => part.endsWith('.mjs') || part.endsWith('.py') || part.endsWith('.js'));
      if (!target) continue;
      assert.ok(fs.existsSync(path.join(ROOT, target)), `${step.id}: ${target} does not exist`);
    }
  }
});

check('the text step is exactly the command CI runs', () => {
  const text = STEPS.find((step) => step.id === 'text');
  assert.ok(text, 'no text step');
  assert.deepEqual(text.cmds, [['python3', 'scripts/check_all.py', '--ci']]);
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.ok(
    workflow.includes('python3 scripts/check_all.py --ci'),
    'CI no longer runs check_all.py --ci; the mirror would grade a different list'
  );
});

check('the lanes select what they say they do', () => {
  assert.deepEqual(
    selected(['fast']).map((step) => step.id),
    ['text', 'typecheck', 'unit', 'build'],
    'the default lane changed shape; update the docstring or the selection'
  );
  const browser = selected(['fast', 'browser']).map((step) => step.id);
  for (const id of ['e2e-a', 'e2e-b', 'bundle', 'labels', 'bridge-contrast']) {
    assert.ok(browser.includes(id), `the browser lane is missing ${id}`);
  }
  assert.ok(!browser.includes('lighthouse'), 'lighthouse belongs to the heavy lane');
  const all = selected(['fast', 'browser', 'heavy']).map((step) => step.id);
  assert.equal(new Set(all).size, STEPS.length, 'a step is unreachable from any lane');
  for (const forbidden of ['macos', 'deploy']) {
    assert.ok(!all.some((id) => id.includes(forbidden)), `${forbidden} must not be part of a local mirror`);
  }
});

check('every browser step names an environment CI gives it', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const step of STEPS.filter((one) => one.lane === 'browser')) {
    for (const key of Object.keys(step.env ?? {})) {
      assert.ok(
        workflow.includes(`${key}:`) || workflow.includes(`${key}=`),
        `${step.id}: ${key} is not set anywhere in ci.yml`
      );
    }
  }
});

console.log(`\nverify:ci plan: ${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
