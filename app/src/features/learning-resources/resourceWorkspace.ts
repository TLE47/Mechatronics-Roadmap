/**
 * The resource workspace's browser preferences (`resourceWorkspace.ts`).
 *
 * Only the workspace's own arrangement lives here: how much of the split the lesson gets, whether
 * the resource is expanded, and which pane a phone was last reading. It is localStorage, beside the
 * other layout preferences, and never part of the progress backup: a restored archive must not
 * decide how this screen is arranged. Every read validates the stored value, so a hand-edited key
 * falls back to the default instead of producing an unusable split.
 */

export type ResourceMobilePane = 'lesson' | 'resource';

export interface ResourceWorkspacePreferences {
  /** The lesson's share of the side-by-side split. */
  ratio: number;
  expanded: boolean;
  mobilePane: ResourceMobilePane;
}

export const RESOURCE_WORKSPACE_STORAGE_KEY = 'mechalab_resource_workspace_v1';
export const RESOURCE_WORKSPACE_DEFAULT: ResourceWorkspacePreferences = {
  ratio: 0.5,
  expanded: false,
  mobilePane: 'resource',
};
export const RESOURCE_RATIO_MIN = 0.3;
export const RESOURCE_RATIO_MAX = 0.7;
export const RESOURCE_RATIO_KEY_STEP = 0.02;
export const RESOURCE_RATIO_KEY_STEP_SHIFT = 0.1;

export function clampResourceRatio(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return RESOURCE_WORKSPACE_DEFAULT.ratio;
  const clamped = Math.min(RESOURCE_RATIO_MAX, Math.max(RESOURCE_RATIO_MIN, number));
  return Math.round(clamped * 100) / 100;
}

export function resourceRatioPercent(ratio: number): number {
  return Math.round(clampResourceRatio(ratio) * 100);
}

/** The ratio a pointer asks for, measured against the container without its 8 px divider. */
export function resourceRatioAt(clientX: number, left: number, width: number): number | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(left) || !Number.isFinite(width) || width <= 0) {
    return null;
  }
  return clampResourceRatio((clientX - left) / width);
}

/** Arrow keys move the lesson's share; Home and End are the two ends a drag can reach. */
export function resourceRatioAfterKey(ratio: number, key: string, shift = false): number | null {
  const step = shift ? RESOURCE_RATIO_KEY_STEP_SHIFT : RESOURCE_RATIO_KEY_STEP;
  switch (key) {
    case 'ArrowLeft':
      return clampResourceRatio(ratio - step);
    case 'ArrowRight':
      return clampResourceRatio(ratio + step);
    case 'Home':
      return RESOURCE_RATIO_MIN;
    case 'End':
      return RESOURCE_RATIO_MAX;
    default:
      return null;
  }
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readResourceWorkspace(): ResourceWorkspacePreferences {
  const store = storage();
  if (!store) return { ...RESOURCE_WORKSPACE_DEFAULT };
  try {
    const raw = store.getItem(RESOURCE_WORKSPACE_STORAGE_KEY);
    if (!raw) return { ...RESOURCE_WORKSPACE_DEFAULT };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ...RESOURCE_WORKSPACE_DEFAULT };
    }
    const record = value as Record<string, unknown>;
    return {
      ratio: clampResourceRatio(record.ratio),
      expanded: record.expanded === true,
      mobilePane: record.mobilePane === 'lesson' ? 'lesson' : 'resource',
    };
  } catch {
    return { ...RESOURCE_WORKSPACE_DEFAULT };
  }
}

export function writeResourceWorkspace(
  next: Partial<ResourceWorkspacePreferences>
): ResourceWorkspacePreferences {
  const current = readResourceWorkspace();
  const merged: ResourceWorkspacePreferences = {
    ratio: clampResourceRatio(next.ratio ?? current.ratio),
    expanded: next.expanded ?? current.expanded,
    mobilePane: next.mobilePane ?? current.mobilePane,
  };
  const store = storage();
  if (store) {
    try {
      store.setItem(RESOURCE_WORKSPACE_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // A full or blocked localStorage must not break the reader; the session keeps the value.
    }
  }
  return merged;
}
