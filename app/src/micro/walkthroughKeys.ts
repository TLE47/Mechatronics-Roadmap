/**
 * Individual walkthrough shortcuts (`app/src/micro/walkthroughKeys.ts`).
 *
 * These keys belong to the walkthrough, not the workbench, so a bare arrow or letter is safe here:
 * the walkthrough has no editor. The two bindings are stored beside the other micro preferences,
 * validated as a pair, and always leave a usable default when storage is blocked or corrupt.
 */

import {
  chordFromEvent,
  chordsEqual,
  formatChord,
  type ChordEvent,
  type KeyChord,
} from '../keymap.ts';

export type WalkthroughKeyAction = 'next' | 'previous';

export interface WalkthroughKeys {
  next: KeyChord;
  previous: KeyChord;
}

export const WALKTHROUGH_KEYS_KEY = 'mechalab_micro_walkthrough_keys_v1';

export const DEFAULT_WALKTHROUGH_KEYS: WalkthroughKeys = {
  next: { code: 'ArrowRight', mod: false, alt: false, shift: false },
  previous: { code: 'ArrowLeft', mod: false, alt: false, shift: false },
};

const RESERVED_CODES = new Set(['Escape', 'Tab', 'Enter', 'Space', 'F5', 'F9', 'F12']);
const BROWSER_CODES = new Set(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyR', 'KeyL', 'KeyS']);

function clone(keys: WalkthroughKeys): WalkthroughKeys {
  return { next: { ...keys.next }, previous: { ...keys.previous } };
}

export function defaultWalkthroughKeys(): WalkthroughKeys {
  return clone(DEFAULT_WALKTHROUGH_KEYS);
}

export function formatWalkthroughChord(chord: KeyChord): string {
  return formatChord(chord);
}

/** Why a chord cannot be a walkthrough key, or null when it can. */
export function walkthroughKeyIssue(chord: KeyChord): string | null {
  if (!chord.char && !chord.code) return 'Press a key, not only a modifier.';
  if (RESERVED_CODES.has(chord.code)) {
    return 'Escape, Tab, Enter, Space and F5/F9/F12 belong to the keyboard or a dialog; pick another key.';
  }
  if (chord.mod && BROWSER_CODES.has(chord.code)) {
    return 'That is one of the browser’s own shortcuts (a tab, a window, reload, save) — pick another.';
  }
  return null;
}

export function walkthroughKeyFromEvent(event: ChordEvent): KeyChord | null {
  return chordFromEvent(event);
}

function normalizeChord(value: unknown, fallback: KeyChord): KeyChord {
  if (!value || typeof value !== 'object') return { ...fallback };
  const record = value as Partial<KeyChord>;
  const chord: KeyChord = {
    code: typeof record.code === 'string' ? record.code : '',
    mod: Boolean(record.mod),
    alt: Boolean(record.alt),
    shift: Boolean(record.shift),
  };
  if (typeof record.char === 'string' && record.char) chord.char = record.char;
  if (walkthroughKeyIssue(chord)) return { ...fallback };
  return chord;
}

export function normalizeWalkthroughKeys(value: unknown): WalkthroughKeys {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const next = normalizeChord(record.next, DEFAULT_WALKTHROUGH_KEYS.next);
  const previous = normalizeChord(record.previous, DEFAULT_WALKTHROUGH_KEYS.previous);
  if (chordsEqual(next, previous)) return defaultWalkthroughKeys();
  return { next, previous };
}

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readWalkthroughKeys(storage: Storage | null = storageOrNull()): WalkthroughKeys {
  try {
    const raw = storage?.getItem(WALKTHROUGH_KEYS_KEY);
    if (!raw) return defaultWalkthroughKeys();
    return normalizeWalkthroughKeys(JSON.parse(raw));
  } catch {
    return defaultWalkthroughKeys();
  }
}

export function writeWalkthroughKeys(
  keys: WalkthroughKeys,
  storage: Storage | null = storageOrNull()
): WalkthroughKeys {
  const next = normalizeWalkthroughKeys(keys);
  try {
    storage?.setItem(WALKTHROUGH_KEYS_KEY, JSON.stringify(next));
  } catch {
    // A blocked store costs the memory of the change, never the control.
  }
  return next;
}

export interface WalkthroughRebind {
  keys: WalkthroughKeys;
  error: string | null;
}

/** Give one control a new key, or explain why it cannot have it. */
export function updateWalkthroughKey(
  keys: WalkthroughKeys,
  action: WalkthroughKeyAction,
  chord: KeyChord,
  storage: Storage | null = storageOrNull()
): WalkthroughRebind {
  const issue = walkthroughKeyIssue(chord);
  if (issue) return { keys, error: issue };
  const other = action === 'next' ? keys.previous : keys.next;
  if (chordsEqual(chord, other)) {
    return {
      keys,
      error: `${formatWalkthroughChord(chord)} is already the ${action === 'next' ? 'previous' : 'next'} key.`,
    };
  }
  const next = writeWalkthroughKeys({ ...keys, [action]: { ...chord } }, storage);
  return { keys: next, error: null };
}
