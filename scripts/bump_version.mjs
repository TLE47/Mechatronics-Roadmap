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
 *   node scripts/bump_version.mjs --check        # they agree, and this change moved the number
 *
 * Exit codes: 0 done (or a clean check), 1 refused, 2 usage.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
/**
 * Paths a release does not have to move for.
 *
 * These are the release's own bookkeeping (the number, the entry that explains it) and the gates
 * that read it; a change confined to them cannot change what a learner sees. Everything else — a
 * lesson page, a micro concept, the workbench — is learner-facing, and changing it without moving
 * the number is how a bug report ends up naming a version whose behaviour no longer exists.
 */
const RELEASE_NEUTRAL = [
  /^package\.json$/,
  /^CHANGELOG\.md$/,
  /^docs\//,
  /^scripts\//,
  /^\.github\//,
  /^tests?\//,
  /(^|\/)[^/]+\.test\.[cm]?[jt]sx?$/,
];
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

/** One git question, or null when git cannot answer (no repository, no history, no `git`). */
function git(args) {
  try {
    // Only the trailing newline goes: `git status --porcelain` puts the worktree flag in column
    // one, and trimming the first line would shift every path on it by a character.
    return execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .replace(/\s+$/, '');
  } catch {
    return null;
  }
}

/** The version a revision records, or null when git cannot say. */
function versionAt(revision) {
  try {
    return JSON.parse(git(['show', `${revision}:package.json`]) ?? '{}').version ?? null;
  } catch {
    return null;
  }
}

/** What is uncommitted right now: staged, unstaged and untracked, with renames read as their end. */
function workingTreePaths() {
  const status = git(['status', '--porcelain']);
  if (!status) return [];
  return status
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.slice(3).split(' -> ').pop().trim())
    .filter(Boolean);
}

/** What the commit itself changed, measured against its first parent. */
function commitPaths(parent) {
  if (!parent) return [];
  const diff = git(['diff', '--name-only', parent, 'HEAD']);
  if (!diff) return [];
  return diff
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Did this change move the number?
 *
 * A learner-facing path that changed while `package.json` still carries the version that shipped
 * before it is a release that forgot to say it was one. The check is about paths versus the
 * version, not about the size of the diff: a one-word lesson correction is a patch, a new lesson is
 * a minor, and both have to say so somewhere the learner can read.
 *
 * Two questions, because there are two places a change can sit: the working tree (what a developer
 * runs before committing) and the commit itself against its first parent (what CI runs on a pushed
 * commit, where the working tree is clean). A merge commit is not asked to move the number twice —
 * if either side already did, the merge carries the newer number and passes.
 */
function releaseGuard(current) {
  if (!git(['rev-parse', '--verify', 'HEAD'])) {
    return { ok: true, note: 'no git history here, so what changed cannot be read' };
  }
  const parent = git(['rev-parse', '--verify', 'HEAD^1']);
  const learnerFacing = (paths) =>
    paths.filter((file) => !RELEASE_NEUTRAL.some((pattern) => pattern.test(file)));

  const head = versionAt('HEAD');
  const pending = learnerFacing(workingTreePaths());
  if (pending.length && current === head) {
    return { ok: false, problem: forgot(pending, current, 'the working tree') };
  }
  const committed = learnerFacing(commitPaths(parent));
  if (committed.length && parent && head === versionAt('HEAD^1')) {
    return { ok: false, problem: forgot(committed, head, 'this commit') };
  }
  return { ok: true, note: null };

  function forgot(paths, version, where) {
    const named = paths.slice(0, 3).join(', ') + (paths.length > 3 ? ', …' : '');
    return (
      `${paths.length} learner-facing file(s) changed in ${where} (${named}) but the version is ` +
      `still ${version}.\n  run: node scripts/bump_version.mjs patch   (or the level this change deserves)`
    );
  }
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
    const guard = releaseGuard(current);
    if (!guard.ok) {
      console.error(`[FAIL] ${guard.problem}`);
      return 1;
    }
    console.log(
      `[PASS] brand version ${current}: package.json and the changelog agree` +
        (guard.note ? ` (${guard.note})` : '')
    );
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
  // The leading stars belong to the stamp: matching from `Release identity` replaced only the words
  // and left the old `**` behind, so every bump added a pair. A new file still gets the line inserted.
  const updated = /\*+Release identity: `[^`]+`\.\*\*/.test(changelog)
    ? changelog.replace(/\*+Release identity: `[^`]+`\.\*\*/, stamped)
    : `${changelog.replace(/^(# .*\n)/, `$1\n${stamped} `)}`;
  fs.writeFileSync(CHANGELOG, updated);
  console.log(`${current} -> ${next} (${level}); package.json and CHANGELOG.md stamped`);
  console.log('next: add the changelog entry that explains what changed at this level');
  return 0;
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bump_version.mjs') {
  process.exit(main());
}
