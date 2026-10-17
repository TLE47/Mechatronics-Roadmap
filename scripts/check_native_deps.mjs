#!/usr/bin/env node
/**
 * Fails when a platform-specific optional dependency that the lockfile records for THIS
 * os/cpu is not installed.
 *
 * Why this exists: `npm ci` installs exactly the optional packages present in
 * `package-lock.json`, and a lockfile resolved on one platform lists only that platform's
 * binaries. A lockfile generated on Linux therefore carries `@esbuild/linux-x64` and no
 * darwin entries, so `npm ci` on a Mac installs no native binaries at all and the failure
 * surfaces much later, inside a build, as
 *   Error: Cannot find module '@rollup/rollup-darwin-arm64'
 * Running this check right after `npm ci` turns that into one clear sentence on the pull
 * request, whatever platform the job runs on.
 *
 * Usage: `node scripts/check_native_deps.mjs` (also `npm run check:native`).
 * Exit codes: 0 when every applicable package is installed, 1 when any is missing.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LOCKFILE = path.join(ROOT, 'package-lock.json');
const PLATFORM = process.platform;
const ARCH = process.arch;

function asList(value) {
  if (value === undefined || value === null) return null;
  return Array.isArray(value) ? value : [value];
}

function appliesHere(pkg) {
  const os = asList(pkg.os);
  const cpu = asList(pkg.cpu);
  if (!os && !cpu) return false; // not a platform-specific package
  if (os && !os.includes(PLATFORM)) return false;
  if (cpu && !cpu.includes(ARCH)) return false;
  return true;
}

function parentInstalled(key) {
  // The parent package's directory, stepping over the extra `@scope` level: the parent of
  // `node_modules/@rollup/rollup-darwin-arm64` is `node_modules/rollup`, not `node_modules/@rollup`.
  let parent = path.dirname(key);
  if (path.basename(parent).startsWith('@')) parent = path.dirname(parent);
  if (parent === 'node_modules') return true; // a direct dependency of the project
  return fs.existsSync(path.join(ROOT, parent, 'package.json'));
}

function main() {
  if (!fs.existsSync(LOCKFILE)) {
    console.log(`[FAIL] no package-lock.json at ${LOCKFILE}`);
    return 1;
  }
  const lock = JSON.parse(fs.readFileSync(LOCKFILE, 'utf8'));
  const packages = lock.packages ?? {};

  const applicable = [];
  const missing = [];
  for (const [key, pkg] of Object.entries(packages)) {
    if (!key.startsWith('node_modules/')) continue;
    if (pkg.optional !== true) continue;
    if (!appliesHere(pkg)) continue;
    if (!parentInstalled(key)) continue; // its parent was skipped, so this is not a gap
    applicable.push(key);
    if (!fs.existsSync(path.join(ROOT, key, 'package.json'))) missing.push(key.slice('node_modules/'.length));
  }

  if (missing.length > 0) {
    console.log(
      `[FAIL] ${missing.length} optional package(s) recorded for ${PLATFORM}/${ARCH} are not installed:`
    );
    for (const name of missing) console.log(`  ${name}`);
    console.log(
      'The lockfile is missing this platform\'s optional binaries. Regenerate it once per\n' +
      'platform in a clean directory and commit the result:\n' +
      '  npm install --package-lock-only --os=linux --cpu=x64\n' +
      '  npm install --package-lock-only --os=linux --cpu=arm64\n' +
      '  npm install --package-lock-only --os=darwin --cpu=arm64\n' +
      '  npm install --package-lock-only --os=darwin --cpu=x64'
    );
    return 1;
  }

  console.log(`[PASS] all ${applicable.length} optional package(s) for ${PLATFORM}/${ARCH} are installed`);
  return 0;
}

process.exit(main());
