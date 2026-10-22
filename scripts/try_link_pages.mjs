/**
 * Which pages the try-it generator owns (`scripts/try_link_pages.mjs`).
 *
 * Only the lesson and module trees: `track-p`, `stage-0`, `ramp`, `modules`, and any top-level
 * `NN-<name>` track directory. The generator is shared with the suite, so the walk lives here rather
 * than in each of them — two lists of directories would drift, and the second one would be the one
 * that skips the page someone just marked.
 *
 * Everything else is deliberately out of scope. A `<!-- try -->` in `docs/`, a changelog or this
 * repository's own README is prose *about* the marker (a fenced example, a quote in a paragraph), not
 * a page that has code to run - and the first draft of the generator, which walked every `.md` file,
 * tried to put a workbench link in the changelog's own example.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root, from this file's own location. */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NAMED_ROOTS = ['track-p', 'stage-0', 'ramp', 'modules'];

/** Every `.md` under `directory`, in a stable order. */
function markdownFiles(directory, found = []) {
  for (const name of readdirSync(directory).sort()) {
    if (name.startsWith('.')) continue;
    const full = path.join(directory, name);
    const stats = statSync(full);
    if (stats.isDirectory()) markdownFiles(full, found);
    else if (name.endsWith('.md')) found.push(full);
  }
  return found;
}

/** The page trees the generator owns, resolved from the repository root. */
export function tryLinkRoots() {
  const roots = [...NAMED_ROOTS];
  for (const name of readdirSync(REPO).sort()) {
    const full = path.join(REPO, name);
    if (/^\d{2}-/.test(name) && statSync(full).isDirectory()) roots.push(name);
  }
  return roots;
}

/** Every lesson and module page, in a stable order, as absolute paths. */
export function tryLinkPages() {
  const pages = [];
  for (const root of tryLinkRoots()) {
    const directory = path.join(REPO, root);
    if (existsSync(directory)) pages.push(...markdownFiles(directory));
  }
  return pages;
}
