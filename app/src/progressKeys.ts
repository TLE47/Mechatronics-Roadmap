/**
 * The three progress maps and where they live (`app/src/progressKeys.ts`).
 *
 * They used to be declared beside the components that read them, which was fine until a second
 * surface — the backup — had to know their names without importing React. Reading and writing a flag
 * map is the same three defensive lines everywhere, so they live here once: the App and the runner
 * both re-export their old constant names, and the backup reads the same keys the UI does.
 */

export const STORAGE_KEY_VERIFIED = 'mechalab_pyodide_verified_v1';
export const STORAGE_KEY_COMPLETED = 'mechalab_pyodide_completed_v1';
export const STORAGE_KEY_MILESTONES = 'mechalab_linear_milestones_v1';
/** When the three maps last changed, so a cloud merge can tell which side is newer. */
export const STORAGE_KEY_PROGRESS_UPDATED = 'mechalab.progress.updatedAt.v1';

/**
 * A flag map as stored, or `{}` for a key that is missing, disabled or not JSON.
 *
 * A stored `false` is kept, not dropped: cloud sync reads an explicit false as "un-ticked on the newer
 * side", and that decision cannot survive if the reader throws it away here.
 */
export function readFlagMap(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const flags: Record<string, boolean> = {};
    for (const [id, done] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof done === 'boolean') flags[id] = done;
    }
    return flags;
  } catch {
    return {};
  }
}

/** Merge `next` into the stored map, keeping every flag either side set. Never throws. */
export function mergeFlagMap(key: string, next: Record<string, boolean>): Record<string, boolean> {
  const merged = { ...readFlagMap(key) };
  for (const [id, done] of Object.entries(next)) {
    if (done === true) merged[id] = true;
  }
  try {
    localStorage.setItem(key, JSON.stringify(merged));
  } catch {
    // Storage disabled or over quota: the in-memory copy the caller shows is still right.
  }
  return merged;
}
