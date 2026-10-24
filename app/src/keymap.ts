/**
 * The workbench's own keys, as data (`app/src/keymap.ts`).
 *
 * The sheet says which key does what, and until now the answer was written twice: once in the table
 * (`app/src/shortcuts.ts`) and once in the handlers that compared `event.key` and `event.metaKey` by
 * hand. A learner whose keyboard has no `?` — a layout where it is not Shift+Slash — could read the
 * sheet and still not be able to open it. This module is the one place a key is defined, matched,
 * stored and printed.
 *
 * Three rules shape it:
 *
 * 1. **A chord is physical.** It is stored as a `KeyboardEvent.code` plus the three modifiers, so
 *    `⌥1` stays ⌥1 on a Mac that types `¡` for it, and a learner on a French keyboard does not get a
 *    shortcut that only works on a US layout. `mod` is ⌘ on a Mac and Ctrl elsewhere; the person's
 *    own modifier is the one stored.
 * 2. **A new key must hold ⌘ or ⌥.** A bare letter is typing, and a rebinder that accepts one would
 *    take letters away from the editor. The sheet's own `?` is the deliberate exception: it ships
 *    that way because the sheet is not a place people type into.
 * 3. **Two actions never share a chord.** A clash is refused with the name of the action that has
 *    it, rather than silently giving one of them the key.
 *
 * Only the six app-wide actions are remappable. The four layout presets are a positional family
 * (⌥1–⌥4 are the first to fourth arrangement), the editor's own F9/F12 belong to the caret, and
 * Escape/Tab belong to dialogs — the sheet prints that instead of pretending they are free.
 *
 * The store is a module-level cache plus a subscription, so `App` and the runner read the same map
 * and a rebind reaches both without threading a prop through the tab tree. A blocked storage costs
 * the memory of the change, never the rebind.
 */

export const KEYMAP_ACTIONS = ['palette', 'lessons', 'search', 'sheet', 'run', 'focus'] as const;

export type KeymapAction = (typeof KEYMAP_ACTIONS)[number];

/**
 * A key: either a chord or a character.
 *
 * `code`/`mod`/`alt`/`shift` is the chord form — `⌘K`, `⌥1` — matched on the **physical** key so a
 * Mac that types `¡` for ⌥1 still opens Study. `char` is the character form, matched on what the key
 * types: the sheet's own `?` is that form, because `?` is Shift+Slash on a US layout, a key of its
 * own on a French one, and a browser test can synthesise it with no shift at all. Matching the
 * character is the only rule that is true on every keyboard.
 */
export interface KeyChord {
  /** A `KeyboardEvent.code`: `KeyK`, `Digit1`, `Enter`, … */
  code: string;
  /** Set for a character shortcut: the character the key types. */
  char?: string;
  mod: boolean;
  alt: boolean;
  shift: boolean;
}

export type Keymap = Record<KeymapAction, KeyChord>;

/** What a conflict message calls the action, in the sheet's own words. */
export const ACTION_NAMES: Record<KeymapAction, string> = {
  palette: 'the palette',
  lessons: 'open a lesson',
  search: 'search inside the lessons',
  sheet: 'this sheet',
  run: 'run the lesson',
  focus: 'focus mode',
};

export const DEFAULT_KEYMAP: Keymap = {
  palette: { code: 'KeyK', mod: true, alt: false, shift: false },
  lessons: { code: 'KeyP', mod: true, alt: false, shift: false },
  search: { code: 'KeyF', mod: true, alt: false, shift: true },
  // The one character shortcut: `?` is Shift+Slash on a US keyboard and its own key elsewhere.
  sheet: { code: 'Slash', char: '?', mod: false, alt: false, shift: false },
  run: { code: 'Enter', mod: true, alt: false, shift: false },
  focus: { code: 'Period', mod: true, alt: false, shift: false },
};

export const STORAGE_KEY_KEYMAP = 'mechalab_keymap_v1';
/** Fired after a write, so every mounted handler sees the new map without a prop. */
export const KEYMAP_EVENT = 'mechalab:keymap';

// ---------------------------------------------------------------------------------------------
// Printing a chord.
// ---------------------------------------------------------------------------------------------

/** Keys whose name on a keyboard is not their code. */
const NAMED_CODES: Record<string, string> = {
  Enter: '↵',
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: '⌦',
  Slash: '/',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: "'",
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

function codeLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  return NAMED_CODES[code] ?? code;
}

/** Can this sheet print the key's name at all? A rebind of a key it cannot name is refused. */
export function isFormattableCode(code: string): boolean {
  return (
    /^Key[A-Z]$/.test(code) ||
    /^Digit[0-9]$/.test(code) ||
    /^Numpad[0-9]$/.test(code) ||
    /^F([1-9]|1[0-2])$/.test(code) ||
    Object.prototype.hasOwnProperty.call(NAMED_CODES, code)
  );
}

/**
 * The key as the sheet prints it: `⌘⇧F`, `⌥1`, `?`, `⌘↵`.
 *
 * A character shortcut prints the character, because that is what the learner types; a chord prints
 * its modifiers and the key's name.
 */
export function formatChord(chord: KeyChord): string {
  if (chord.char) return chord.char;
  const glyphs = `${chord.mod ? '⌘' : ''}${chord.alt ? '⌥' : ''}${chord.shift ? '⇧' : ''}`;
  return `${glyphs}${codeLabel(chord.code)}`;
}

/** A character a shortcut can be: punctuation, not a letter, a digit or a space. */
export function isSymbolChar(char: string): boolean {
  return char.length === 1 && !/[\p{L}\p{N}\s]/u.test(char);
}

// ---------------------------------------------------------------------------------------------
// Reading a keypress.
// ---------------------------------------------------------------------------------------------

/** The parts of a `KeyboardEvent` this module needs, so the suite can pass a plain object. */
export interface ChordEvent {
  code?: string;
  key?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const MODIFIER_ONLY = /^(Meta|Control|Alt|Shift)(Left|Right)$/;

/**
 * The chord a keypress is, or null while only modifiers are down.
 *
 * `metaKey || ctrlKey` becomes `mod`: one action cannot have a different key on a Mac and a PC, and
 * the app has always answered to both. Everything else is exact, so ⌘K and ⌘⇧K are two keys.
 */
export function chordFromEvent(event: ChordEvent): KeyChord | null {
  const code = event.code ?? '';
  if (!code || MODIFIER_ONLY.test(code)) return null;
  const mod = Boolean(event.metaKey || event.ctrlKey);
  const alt = Boolean(event.altKey);
  const key = event.key ?? '';
  // A bare symbol is a character shortcut (`?`), whichever physical key produced it and whether or
  // not the browser reports Shift: the character is the thing the learner pressed.
  if (!mod && !alt && isSymbolChar(key)) {
    return { code, char: key, mod: false, alt: false, shift: false };
  }
  return { code, mod, alt, shift: Boolean(event.shiftKey) };
}

export function chordsEqual(a: KeyChord, b: KeyChord): boolean {
  // A character shortcut is the character, not the key that typed it: `?` is the same shortcut on
  // a US layout and a French one, and a chord and a character never collide.
  if (a.char || b.char) return Boolean(a.char) && a.char === b.char;
  return a.code === b.code && a.mod === b.mod && a.alt === b.alt && a.shift === b.shift;
}


/** Does this keypress hold exactly the chord's key and modifiers? */
export function chordMatches(chord: KeyChord, event: ChordEvent): boolean {
  const pressed = chordFromEvent(event);
  return pressed !== null && chordsEqual(chord, pressed);
}

/**
 * The action this press asks for, or null when it asks for none of the app's keys.
 *
 * A plain key that is not in the map is never an action: typing `k` is typing.
 */
export function actionForEvent(map: Keymap, event: ChordEvent): KeymapAction | null {
  const pressed = chordFromEvent(event);
  if (!pressed) return null;
  return KEYMAP_ACTIONS.find((action) => chordsEqual(map[action], pressed)) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Rebinding.
// ---------------------------------------------------------------------------------------------

/** Keys the browser or a dialog owns, even with ⌘/⌥. */
const RESERVED_CODES = new Set(['Escape', 'Tab', 'F5', 'F9', 'F12', 'Space']);

/** ⌘/Ctrl chords the browser keeps for itself: closing a tab, a window, a reload, saving a page. */
const BROWSER_CODES = new Set(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyR', 'KeyL', 'KeyS']);

/**
 * Why this chord cannot be somebody's shortcut, in a sentence, or null when it can.
 *
 * Kept apart from the clash check so a stored map can be validated without knowing what else is in
 * it, and so the sheet can say "that is the browser's" rather than "conflict".
 */
export function keymapIssue(chord: KeyChord, action?: KeymapAction): string | null {
  if (chord.char) {
    // A character shortcut is a bare key, so it may only be the sheet's own — and only a symbol:
    // binding a letter would take it from the editor, which is where letters are typed.
    if (action !== 'sheet') return 'A new key needs ⌘ or ⌥ — a bare character is typing, not a shortcut.';
    if (!isSymbolChar(chord.char)) return 'The sheet’s own key must be a symbol like ? or /, not a letter.';
    return null;
  }
  if (!isFormattableCode(chord.code)) {
    return 'That key has no name this sheet can print — try ⌘ (or ⌥) with a letter, a digit or Enter.';
  }
  if (RESERVED_CODES.has(chord.code)) {
    return 'That key belongs to the keyboard itself: Escape, Tab, Space and F5/F9/F12 are fixed.';
  }
  if (chord.mod && (/^Digit[0-9]$/.test(chord.code) || BROWSER_CODES.has(chord.code))) {
    return 'That is one of the browser’s own shortcuts (a tab, a window, reload, save) — pick another.';
  }
  if (!chord.mod && !chord.alt) {
    return 'A new key needs ⌘ or ⌥ — a bare key is typing, not a shortcut.';
  }
  return null;
}

export interface RebindResult {
  /** The map to render: unchanged on an error. */
  keymap: Keymap;
  /** Why the press was refused, or null. */
  error: string | null;
}

/**
 * Give one action a new chord.
 *
 * A refusal returns the map untouched and the reason, never a map with two actions on one key: the
 * later press would be the only one that could ever fire, which is a shortcut that silently stops
 * working.
 */
export function rebind(map: Keymap, action: KeymapAction, chord: KeyChord): RebindResult {
  const issue = keymapIssue(chord, action);
  if (issue) return { keymap: map, error: issue };
  const clash = KEYMAP_ACTIONS.find((other) => other !== action && chordsEqual(map[other], chord));
  if (clash) {
    return { keymap: map, error: `${formatChord(chord)} is already ${ACTION_NAMES[clash]}.` };
  }
  return { keymap: { ...map, [action]: { ...chord } }, error: null };
}

/** True when every action still has its shipped key. */
export function isDefaultKeymap(map: Keymap): boolean {
  return KEYMAP_ACTIONS.every((action) => chordsEqual(map[action], DEFAULT_KEYMAP[action]));
}

/** A copy of the defaults, so a caller cannot mutate the constant. */
export function defaultKeymap(): Keymap {
  return cloneKeymap(DEFAULT_KEYMAP);
}

function cloneKeymap(map: Keymap): Keymap {
  return KEYMAP_ACTIONS.reduce((copy, action) => {
    copy[action] = { ...map[action] };
    return copy;
  }, {} as Keymap);
}

/**
 * A stored map, action by action.
 *
 * Per field, not all-or-nothing: one action that a build does not know, or a chord the rules now
 * refuse, falls back to its default and leaves the other five alone. A duplicate keeps the first
 * action in `KEYMAP_ACTIONS` order, because a map with two actions on one key is not one anybody can
 * have meant.
 */
export function normalizeKeymap(value: unknown): Keymap {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const map = defaultKeymap();
  const used: KeyChord[] = [];
  for (const action of KEYMAP_ACTIONS) {
    const stored = record[action] as Partial<KeyChord> | undefined;
    if (!stored || typeof stored !== 'object') {
      used.push(map[action]);
      continue;
    }
    const chord: KeyChord = {
      code: typeof stored.code === 'string' ? stored.code : '',
      mod: Boolean(stored.mod),
      alt: Boolean(stored.alt),
      shift: Boolean(stored.shift),
    };
    if (typeof stored.char === 'string' && stored.char) chord.char = stored.char;
    const usable =
      Boolean(chord.char || chord.code) &&
      !keymapIssue(chord, action) &&
      !used.some((other) => chordsEqual(other, chord));
    if (usable) {
      map[action] = chord;
      used.push(chord);
    } else {
      used.push(map[action]);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------------------------
// The store.
// ---------------------------------------------------------------------------------------------

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

let cached: Keymap | null = null;
const listeners = new Set<() => void>();
let windowBound = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function readStored(): Keymap {
  const store = storage();
  if (!store) return defaultKeymap();
  try {
    const raw = store.getItem(STORAGE_KEY_KEYMAP);
    if (raw === null || raw.trim() === '') return defaultKeymap();
    return normalizeKeymap(JSON.parse(raw));
  } catch {
    return defaultKeymap();
  }
}

/** The map every handler should read. Stable between writes, which is what a React store needs. */
export function keymapSnapshot(): Keymap {
  if (!cached) cached = readStored();
  return cached;
}

/** The map as stored, read fresh — for a caller that wants to know whether somebody else changed it. */
export function readKeymap(): Keymap {
  return readStored();
}

/** Remember a map and return what to render (normalized, not what was asked for). */
export function writeKeymap(map: Keymap): Keymap {
  const next = normalizeKeymap(map);
  cached = next;
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_KEYMAP, JSON.stringify(next));
    } catch {
      // Blocked or full: the change lasts this visit only.
    }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      const EventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent;
      window.dispatchEvent(new EventCtor(KEYMAP_EVENT, { detail: { keymap: next } }));
    } catch {
      // A page with no CustomEvent still gets the return value.
    }
  }
  return next;
}

/** Put every action back on its shipped key, and remember that. */
export function resetKeymap(): Keymap {
  return writeKeymap(defaultKeymap());
}

/** Forget the cached map and tell subscribers: another tab wrote, or a test replaced storage. */
export function invalidateKeymap(): void {
  cached = null;
  notify();
}

/** Subscribe to changes. The window listeners are attached once and live with the page. */
export function subscribeKeymap(listener: () => void): () => void {
  listeners.add(listener);
  if (!windowBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    windowBound = true;
    window.addEventListener(KEYMAP_EVENT, notify);
    window.addEventListener('storage', (event) => {
      if (!event.key || event.key === STORAGE_KEY_KEYMAP) invalidateKeymap();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}
