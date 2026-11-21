/**
 * The visual editor's remembered preferences (`app/src/pythonBlocks/settings.ts`).
 *
 * Three choices belong to the surface itself, not to a lesson: whether the editor opens in Visual
 * or Python Code, whether blocks are Normal or Colorful, and how the toolbox is sorted. They are
 * stored on this device beside the editor's tooltip switch, so a learner who prefers blocks gets
 * blocks on their next visit and a learner who never opens them keeps the code editor they had.
 *
 * The default mode is **Python Code**. Visual mode is a new way to write the same `main.py`, not a
 * replacement for the editor every existing lesson and test types into; opening it once is what
 * records the preference. `normalizeBlockSettings` is the single door stored values go through, so
 * a half-written or older value cannot put the editor into a state it cannot draw.
 */

export type BlockMode = 'visual' | 'code';

interface BlockSettings {
  mode: BlockMode;
  appearance: 'normal' | 'colorful';
  sort: 'recommended' | 'categories' | 'az' | 'recent';
  /** Toolbox item ids, most recently inserted first. */
  recent: string[];
}

const BLOCK_SETTINGS_KEY = 'mechalab_python_blocks_v1';

const DEFAULTS: BlockSettings = {
  mode: 'code',
  appearance: 'normal',
  sort: 'recommended',
  recent: [],
};

const MODES: readonly BlockMode[] = ['visual', 'code'];
const APPEARANCES: readonly BlockSettings['appearance'][] = ['normal', 'colorful'];
const SORTS: readonly BlockSettings['sort'][] = ['recommended', 'categories', 'az', 'recent'];

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** A complete, drawable value from anything that was stored. */
export function normalizeBlockSettings(value: unknown): BlockSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const recent = Array.isArray(record.recent)
    ? record.recent.filter((entry): entry is string => typeof entry === 'string').slice(0, 8)
    : [];
  return {
    mode: MODES.includes(record.mode as BlockMode) ? (record.mode as BlockMode) : DEFAULTS.mode,
    appearance: APPEARANCES.includes(record.appearance as BlockSettings['appearance'])
      ? (record.appearance as BlockSettings['appearance'])
      : DEFAULTS.appearance,
    sort: SORTS.includes(record.sort as BlockSettings['sort'])
      ? (record.sort as BlockSettings['sort'])
      : DEFAULTS.sort,
    recent: [...new Set(recent)],
  };
}

export function readBlockSettings(): BlockSettings {
  try {
    const raw = store()?.getItem(BLOCK_SETTINGS_KEY);
    if (!raw || raw.trim() === '') return normalizeBlockSettings(null);
    return normalizeBlockSettings(JSON.parse(raw));
  } catch {
    return normalizeBlockSettings(null);
  }
}

/**
 * Write the preferences, merging into what is stored.
 *
 * Two controls own different halves of this record (the pane owns `mode`, the block toolbar owns
 * `appearance` and `sort`), so a write is a patch rather than a whole value: one control must not
 * erase the other's choice. A blocked store costs the memory, never the switch.
 */
export function writeBlockSettings(patch: Partial<BlockSettings>): BlockSettings {
  const next = normalizeBlockSettings({ ...readBlockSettings(), ...patch });
  try {
    store()?.setItem(BLOCK_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Blocked or full: the choice lasts this visit.
  }
  return next;
}
