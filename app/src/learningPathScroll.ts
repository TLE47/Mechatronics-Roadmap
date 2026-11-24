/**
 * Where the learner left the path (`app/src/learningPathScroll.ts`).
 *
 * Starting a lesson unmounts the page; Back mounts it again. Without a remembered position the
 * learner returns to the top of the city and has to find the platform they just left. One record —
 * the scroll offset and the selected lesson — is enough, and `sessionStorage` is the right span: a
 * new tab is a new visit and should open at the top, not inherit another tab's place.
 *
 * Every call is guarded. Private mode and a refused third-party store make storage throw, and a
 * remembered position is a convenience, never a reason the page fails.
 */

export const STORAGE_KEY_PATH_MEMORY = 'mechalab_learning_path_memory_v1';

export interface PathMemory {
  y: number;
  selectedId: string | null;
}

function bucket(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/** The remembered place, or the top with nothing selected. */
export function readPathMemory(store: Storage | null = bucket()): PathMemory {
  const empty: PathMemory = { y: 0, selectedId: null };
  if (!store) return empty;
  try {
    const raw = store.getItem(STORAGE_KEY_PATH_MEMORY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PathMemory> | null;
    if (!parsed || typeof parsed !== 'object') return empty;
    const y = typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? Math.max(0, parsed.y) : 0;
    const selectedId = typeof parsed.selectedId === 'string' ? parsed.selectedId : null;
    return { y: Math.round(y), selectedId };
  } catch {
    return empty;
  }
}

/** Merge a partial update into the record and return what was written. Never throws. */
export function rememberPath(
  update: Partial<PathMemory>,
  store: Storage | null = bucket()
): PathMemory {
  const current = readPathMemory(store);
  const next: PathMemory = {
    y:
      typeof update.y === 'number' && Number.isFinite(update.y)
        ? Math.max(0, Math.round(update.y))
        : current.y,
    selectedId:
      update.selectedId === undefined ? current.selectedId : update.selectedId,
  };
  if (!store) return next;
  try {
    store.setItem(STORAGE_KEY_PATH_MEMORY, JSON.stringify(next));
  } catch {
    // A blocked store costs the memory, not the visit.
  }
  return next;
}
