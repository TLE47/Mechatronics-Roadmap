/**
 * Is the bundle in `dist/` made of the sources in this checkout? (`scripts/buildFreshness.mjs`)
 *
 * Two places measure or grade `dist/` — the weight gate and the Pages browser suite — and both used
 * to trust whatever they found there. Run 165 quoted a weight from a bundle built before the two
 * features it was verifying; the Pages sweep had the same hole, one worse, because a stale bundle
 * there grades exercises that no longer exist in the source. Rather than fix that twice, the walk
 * lives here and the rule itself stays pure in [`weight_budget.mjs`](weight_budget.mjs)'s
 * `staleSources`.
 *
 * What counts as a source: everything the bundler reads to make the shell — `app/**` (its TypeScript,
 * its HTML, its public files), the Vite config, the TypeScript project and `package.json`. What does
 * not: `node_modules`, the build output itself, and `tsc -b`'s `.tsbuildinfo` bookkeeping, which is
 * written next to the sources and would otherwise mark every build stale the moment it was typechecked.
 */

import fs from 'node:fs';
import path from 'node:path';
import { staleSources } from './weight_budget.mjs';

export const SOURCE_ENTRIES = ['app', 'vite.config.ts', 'tsconfig.json', 'package.json'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.fb-scratch']);

/** `{ path, mtimeMs }` for every file under `entries`, skipping dependency and output trees. */
export function fileMtimes(root, entries) {
  const files = [];
  // A named root is always walked: `dist` is in SKIP_DIRS so a source walk does not descend into a
  // nested build, and the output walk itself starts at `dist`.
  const walk = (target, isRoot = false) => {
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      if (!isRoot && SKIP_DIRS.has(path.basename(target))) return;
      for (const child of fs.readdirSync(target)) walk(path.join(target, child));
      return;
    }
    if (target.endsWith('.tsbuildinfo')) return;
    files.push({ path: path.relative(root, target), mtimeMs: stat.mtimeMs });
  };
  for (const entry of entries) walk(path.join(root, entry), true);
  return files;
}

/**
 * The sources this checkout has changed since the bundle was built.
 *
 * Returns `{ built, stale }`: `built` is false when there is no `dist/index.html` at all, and `stale`
 * is every source newer than the newest file in `dist/`, newest first — empty when the build is fresh.
 */
export function staleBuild(root = process.cwd()) {
  const built = fs.existsSync(path.join(root, 'dist', 'index.html'));
  const stale = staleSources(fileMtimes(root, SOURCE_ENTRIES), fileMtimes(root, ['dist']));
  return { built, stale };
}

/** `app/src/watchMode.ts, app/src/main.tsx` — the few files a message can name before it gets long. */
export function nameStale(stale, limit = 3) {
  const named = stale.slice(0, limit).map((file) => file.path).join(', ');
  return stale.length > limit ? `${named} (+${stale.length - limit} more)` : named;
}
