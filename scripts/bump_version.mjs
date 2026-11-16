#!/usr/bin/env node
/**
 * The one command that moves the brand version (`scripts/bump_version.mjs`).
 *
 * `package.json` is the release identity: `vite.config.ts` reads it once and injects
 * `__APP_VERSION__`, the header prints it under the wordmark and the footer prints it beside the
 * build. That makes the number cheap to change — and easy to forget, which is how a learner reports
 * a bug against a version whose behaviour no longer exists.
 *
 * The increment is chosen by what changed, not by how large the diff looks:
 *
 *   **major**  a restructure a learner can feel: the course order, the storage format of progress,
 *              or anything that invalidates a saved state. After this, an old store must still load
 *              or migrate, and the release notes say so.
 *   **minor**  a new capability: a control, a tab, a pane, a visual, a question that was not there.
 *              This is the default for feature work, and the one to use when in doubt.
 *   **patch**  a repair with no new capability: a bug fix, a copy correction, a dependency bump, a
 *              test or gate that now catches something. Nothing a learner can do that they could
 *              not do before.
 *
 * Every bump also stamps the changelog's release-identity line, so the number the header prints and
 * the number the changelog leads with are the same edit rather than two that can drift.
 *
 * Usage
 *   node scripts/bump_version.mjs minor          # 3.3.0 -> 3.4.0
 *   node scripts/bump_version.mjs patch --dry    # print the next version, write nothing
 *   node scripts/bump_version.mjs --check        # package.json and the changelog agree
 *
 * Exit codes: 0 done (or a clean check), 1 refused, 2 usage.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PKG = path.join(ROOT, 'package.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const LEVELS = ['major', 'minor', 'patch'];

const argv = process.argv.slice(2);
const level = argv.find((arg) => LEVELS.includes(arg));
const dry = argv.includes('--dry');
const checkOnly = argv.includes('--check');

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** The next version for a level: each level resets the ones below it. */
export function nextVersion(version, kind) {
  const current = parse(version);
  if (!current) throw new Error(`not a semver release: ${version}`);
  if (!LEVELS.includes(kind)) throw new Error(`unknown increment: ${kind}`);
  if (kind === 'major') return `${current.major + 1}.0.0`;
  if (kind === 'minor') return `${current.major}.${current.minor + 1}.0`;
  return `${current.major}.${current.minor}.${current.patch + 1}`;
}

function changelogLine(version) {
  return `**Release identity: \`${version}\`.**`;
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  const changelog = fs.readFileSync(CHANGELOG, 'utf8');
  const current = pkg.version;

  if (checkOnly) {
    const stamped = /Release identity: `([^`]+)`/.exec(changelog)?.[1] ?? '';
    if (!parse(current)) {
      console.error(`[FAIL] package.json version "${current}" is not semver`);
      return 1;
    }
    if (stamped !== current) {
      console.error(
        `[FAIL] the header prints v${current} but CHANGELOG.md leads with ${stamped || 'no version'}` +
          `\n  run: node scripts/bump_version.mjs patch   (or the level this change deserves)`
      );
      return 1;
    }
    console.log(`[PASS] brand version ${current}: package.json and the changelog agree`);
    return 0;
  }

  if (!level) {
    console.error(
      'usage: node scripts/bump_version.mjs <major|minor|patch> [--dry]\n' +
        '  major  a restructure a learner can feel (course order, saved state)\n' +
        '  minor  a new capability (a control, a tab, a visual)\n' +
        '  patch  a repair with no new capability'
    );
    return 2;
  }

  const next = nextVersion(current, level);
  if (dry) {
    console.log(`${current} -> ${next} (${level}); nothing written`);
    return 0;
  }
  pkg.version = next;
  fs.writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);

  const stamped = changelogLine(next);
  const updated = /Release identity: `[^`]+`\.\*\*/.test(changelog)
    ? changelog.replace(/Release identity: `[^`]+`\.\*\*/, stamped)
    : `${changelog.replace(/^(# .*\n)/, `$1\n${stamped} `)}`;
  fs.writeFileSync(CHANGELOG, updated);
  console.log(`${current} -> ${next} (${level}); package.json and CHANGELOG.md stamped`);
  console.log('next: add the changelog entry that explains what changed at this level');
  return 0;
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bump_version.mjs') {
  process.exit(main());
}
