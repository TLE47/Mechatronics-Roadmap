/**
 * What the phone keyboard types into when the field is not the Python editor
 * (`keyboard/fieldTarget.ts`).
 *
 * The editor owns CodeMirror and the block fields, so its keyboard talks to an editor handle. Every
 * other typing surface on the site is a plain `<input>`, a `<textarea>` or the note composer's
 * `contenteditable`: a lesson search, a name in a sheet, a calculator expression, a sticky note.
 * This module recognises those surfaces and edits them the way their owner expects — through the
 * browser's own editing command where that works, so undo still has a history, and through a native
 * value write plus an `input` event where it does not.
 *
 * The `input` event is the contract, not the DOM write: React's `onChange` is built on it, so a
 * controlled field updates its state and a plain one lets a form listener see the keystroke. A
 * programmatic `field.value = …` alone would update neither.
 */

/** The input types the site keyboard types into. `password` is here on purpose: a login is text. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password']);

export type TextField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/** A field with `selectionStart`/`value`: an `<input>` or a `<textarea>`. */
export function isTextControl(field: TextField): field is HTMLInputElement | HTMLTextAreaElement {
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement;
}

/**
 * A rich-text composer: an element that owns a caret without a `value`. CodeMirror's editable is
 * one too, but its caret belongs to the editor's keyboard, so an ancestor `.cm-editor` disqualifies
 * it. The same goes for the block fields, which are inputs and are filtered separately.
 */
function isRichField(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isContentEditable) return false;
  return !element.closest('.cm-editor, [data-block-id]');
}

/**
 * Does this element type text with a caret? Numbers, dates, ranges, colours, checkboxes and files
 * are the browser's own controls and keep the OS keyboard (or picker); the editor's block fields are
 * `[data-block-id]` and belong to the editor's keyboard.
 */
export function isTextField(element: Element | null): element is TextField {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(element.type) && !element.readOnly && !element.disabled;
  }
  return isRichField(element);
}

/**
 * The field a focus or a tap is about, or null when it is not one this keyboard owns.
 *
 * `[data-no-phone-keyboard]` is the small opt-out a future control can carry when the OS keyboard
 * is the only honest one; nothing uses it today.
 */
export function keyboardFieldFrom(node: EventTarget | null): TextField | null {
  if (!(node instanceof Element)) return null;
  const candidate = node.closest('input, textarea, [contenteditable="true"]');
  if (!isTextField(candidate)) return null;
  if (
    candidate.closest(
      '[data-block-id], [data-no-phone-keyboard], [data-testid="mobile-keyboard-shell"], [data-testid="phone-field-keyboard"]'
    )
  ) {
    return null;
  }
  return candidate;
}

/** A selection in an input or a textarea, with a collapsed caret standing in for both ends. */
function selectionOf(field: HTMLInputElement | HTMLTextAreaElement): [number, number] {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  return start <= end ? [start, end] : [end, start];
}

/** The selection inside a rich editor, or null when the caret is somewhere else on the page. */
function rangeIn(field: HTMLElement): Range | null {
  const selection = field.ownerDocument.getSelection?.();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return field.contains(range.commonAncestorContainer) ? range : null;
}

/** An `input` event, the one signal every consumer in this app already listens for. */
function raiseInput(field: HTMLElement): void {
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Write a value the way a keystroke would, for the commands the browser declines.
 *
 * The prototype setter is used on purpose: assigning `field.value` updates React's value tracker,
 * and the `input` event React then sees looks unchanged. Writing through the native setter leaves
 * the tracker on the old value, so the dispatched event is a real edit to the framework as well.
 */
function writeValue(field: HTMLInputElement | HTMLTextAreaElement, next: string, caret: number): void {
  const prototype =
    field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(field, next);
  else field.value = next;
  try {
    field.setSelectionRange(caret, caret);
  } catch {
    // A field without a selection API still takes the value.
  }
  raiseInput(field);
}

/** Put the caret in the field without scrolling the page under the fixed keys. */
function focusField(field: TextField): void {
  if (field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
}

function insertControlText(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  focusField(field);
  const before = field.value;
  const [start, end] = selectionOf(field);
  try {
    if (field.ownerDocument.execCommand('insertText', false, text)) {
      // Some fields accept the command and still leave the document alone (or move the caret
      // without the text); the length check is the only honest success signal.
      if (field.value.length === before.length - (end - start) + text.length) return;
    }
  } catch {
    // Fall through to the value write.
  }
  writeValue(field, before.slice(0, start) + text + before.slice(end), start + text.length);
}

/** Put a node at the selection and leave the caret after it, the way typing a character does. */
function insertRichNode(field: HTMLElement, range: Range, node: Node): void {
  range.deleteContents();
  range.insertNode(node);
  const after = field.ownerDocument.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  const selection = field.ownerDocument.getSelection?.();
  selection?.removeAllRanges();
  selection?.addRange(after);
  raiseInput(field);
}

function insertRichText(field: HTMLElement, text: string): void {
  focusField(field);
  const range = rangeIn(field);
  if (!range) return;
  // The note composer stores a line break as a newline text node, not as a `<div>` or a `<br>`
  // (its own Enter handler explains why), so Enter through the keys writes the same kind of node.
  if (text === '\n') {
    insertRichNode(field, range, field.ownerDocument.createTextNode('\n'));
    return;
  }
  try {
    if (field.ownerDocument.execCommand('insertText', false, text)) return;
  } catch {
    // Fall through to the DOM insertion.
  }
  insertRichNode(field, range, field.ownerDocument.createTextNode(text));
}

/**
 * Insert text at the caret, replacing any selection.
 *
 * The native `insertText` command is tried first because it is a real edit: the browser's undo
 * stack, the caret and any input listener all behave exactly as for a physical key. A browser that
 * refuses it (or a field that ignored it) falls back to the value write or the DOM insertion.
 */
export function insertFieldText(field: TextField, text: string): void {
  if (isTextControl(field)) insertControlText(field, text);
  else insertRichText(field, text);
}

/** Delete one range as a native edit, so Backspace is undoable like a physical key. */
function deleteControlRange(
  field: HTMLInputElement | HTMLTextAreaElement,
  from: number,
  to: number
): void {
  if (to <= from) return;
  focusField(field);
  const before = field.value;
  try {
    field.setSelectionRange(from, to);
    if (
      field.ownerDocument.execCommand('insertText', false, '') &&
      field.value.length === before.length - (to - from)
    ) {
      return;
    }
  } catch {
    // Fall through to the value write.
  }
  writeValue(field, before.slice(0, from) + before.slice(to), from);
}

function backspaceControl(field: HTMLInputElement | HTMLTextAreaElement): void {
  const [start, end] = selectionOf(field);
  if (start === 0 && end === 0) return;
  deleteControlRange(field, end > start ? start : start - 1, end);
}

function backspaceRich(field: HTMLElement): void {
  focusField(field);
  const range = rangeIn(field);
  if (!range) return;
  if (!range.collapsed) {
    range.deleteContents();
    raiseInput(field);
    return;
  }
  const selection = field.ownerDocument.getSelection?.();
  const before = field.textContent?.length ?? 0;
  try {
    // Extend by one character and let the browser delete it: that is a real edit, so undo sees
    // it. The length check catches a browser that answers true and deletes nothing.
    selection?.modify('extend', 'backward', 'character');
    if (field.ownerDocument.execCommand('delete')) {
      if ((field.textContent?.length ?? 0) < before) return;
    }
  } catch {
    // Fall through to deleting the selection the modify left behind.
  }
  const current = rangeIn(field);
  if (current && !current.collapsed) {
    current.deleteContents();
    raiseInput(field);
  }
}

/** Backspace: the selection, or one character before the caret. */
export function backspaceField(field: TextField): void {
  if (isTextControl(field)) backspaceControl(field);
  else backspaceRich(field);
}

/** Two spaces at the caret — what an indent is outside a code editor. */
export function indentField(field: TextField): void {
  insertFieldText(field, '  ');
}

/** Remove up to two leading spaces (or one tab) from the caret's line. */
export function dedentField(field: TextField): void {
  if (isTextControl(field)) {
    const value = field.value;
    const [start] = selectionOf(field);
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const leading = value.slice(lineStart).match(/^(\t| {1,2})/);
    if (!leading) return;
    deleteControlRange(field, lineStart, lineStart + leading[1].length);
    return;
  }
  // A rich editor has no line model here; remove the spaces (or tab) immediately behind the caret
  // when that is what is there, which is the visible half of the same action.
  const range = rangeIn(field);
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return;
  const offset = range.startOffset;
  const before = (range.startContainer.textContent ?? '').slice(0, offset);
  const trailing = before.match(/(\t| {1,2})$/);
  if (!trailing) return;
  range.setStart(range.startContainer, offset - trailing[1].length);
  range.deleteContents();
  raiseInput(field);
}

/** The line the selection touches: its first character and the position just past its last. */
function lineBounds(value: string, start: number, end: number): { from: number; to: number } {
  const from = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const newline = value.indexOf('\n', end);
  return { from, to: newline === -1 ? value.length : newline };
}

/**
 * Duplicate the caret's line (or the whole value of a single-line field) below it. A rich note has
 * no line model this keyboard can read without re-implementing its Markdown serialiser, so the verb
 * is a no-op there rather than a guess that could duplicate formatting.
 */
export function duplicateFieldLine(field: TextField): void {
  if (!isTextControl(field)) return;
  const [start, end] = selectionOf(field);
  const value = field.value;
  if (value.length === 0) return;
  const line = lineBounds(value, start, end);
  const text = value.slice(line.from, line.to);
  field.setSelectionRange(line.to, line.to);
  insertFieldText(field, `\n${text}`);
}

/** Delete the caret's line; a single-line field has one line, so this clears it. */
export function deleteFieldLine(field: TextField): void {
  if (!isTextControl(field)) return;
  const [start, end] = selectionOf(field);
  const value = field.value;
  const line = lineBounds(value, start, end);
  deleteControlRange(field, line.from, Math.min(value.length, line.to + 1));
}

/** The browser's own history. A command it declines leaves the text where it was, never a throw. */
export function undoField(field: TextField): void {
  focusField(field);
  try {
    field.ownerDocument.execCommand('undo');
  } catch {
    // A browser without the command keeps the text; the other keys still work.
  }
}

export function redoField(field: TextField): void {
  focusField(field);
  try {
    field.ownerDocument.execCommand('redo');
  } catch {
    // As above.
  }
}

/**
 * Enter: a new line in a textarea or a rich note, and the phone keyboard's return in a one-line
 * field, which is "leave the field" (search boxes and names have nothing to break). Returns whether
 * text changed.
 */
export function newlineField(field: TextField): boolean {
  if (isTextControl(field) && !(field instanceof HTMLTextAreaElement)) return false;
  insertFieldText(field, '\n');
  return true;
}

/** The event the page keyboard sends when it takes the bottom edge, so an editor folds its keys. */
export const FIELD_KEYBOARD_OPEN_EVENT = 'mechalab:phone-field-keyboard';
