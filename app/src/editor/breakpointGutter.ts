/**
 * The breakpoint gutter (`app/src/editor/breakpointGutter.ts`).
 *
 * A column to the left of the line numbers where a dot means *stop here*. Click it to arm a line,
 * click again to disarm it; `F9` does the same for the caret line, because a gutter is a mouse target
 * and a feature only a mouse can operate is half a feature.
 *
 * **A slot on every line, not a marker on some lines.** CodeMirror renders gutter elements only for
 * lines that carry a marker unless `renderEmptyElements` is set, and a gutter that is invisible until
 * it holds something has no affordance to click. `lineMarker` therefore answers every line with a
 * slot: empty at rest, faint on hover, filled when the line is armed. The dot the learner reads and
 * the hit area they click are the same element.
 *
 * **The click leaves the editor as an event.** The gutter's configuration is built once, with no
 * access to React props, and the runner owns the list (it is per lesson, persisted, and travels with
 * the run). A bubbling `CustomEvent` on the editor's own DOM is the seam this app already uses for
 * cells and focus mode: the gutter stays pure, and `pythonEditorImpl` calls the runner.
 *
 * **A breakpoint is read when a run starts.** The worker parks from the list that travelled with the
 * request; a dot added during a run is for the next one. That is a real limit and it is written down
 * in `docs/PLAN-2.0-GAP.md` rather than papered over — the toolbar's Pause is what catches a loop
 * that is already spinning.
 */

import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';
import { normalizeBreakpoints } from './breakpoints';

/** Dispatched on the editor's DOM with `detail: { line }` (1-based) when a slot is clicked. */
export const BREAKPOINT_TOGGLE_EVENT = 'mechalab:toggle-breakpoint';

/** Replace the drawn list; `[]` removes every dot. */
export const setBreakpointLines = StateEffect.define<number[]>();

/**
 * The armed lines, as the editor draws them.
 *
 * A `StateField` because the list is data and one transaction replaces it. It is **not** mapped
 * through edits — a breakpoint is a line number, which is what lets it survive a lesson switch in
 * `localStorage` (see `breakpoints.ts`).
 */
export const breakpointLinesField = StateField.define<number[]>({
  create: () => [],
  update: (lines, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setBreakpointLines)) return normalizeBreakpoints(effect.value);
    }
    return lines;
  },
});

/** One slot: the click target for a line, carrying whether that line is armed. */
class BreakpointSlot extends GutterMarker {
  constructor(readonly line: number, readonly armed: boolean) {
    super();
  }

  /** A dot is reused while its line and state are unchanged, which is the whole viewport's worth. */
  eq(other: GutterMarker): boolean {
    return other instanceof BreakpointSlot && other.line === this.line && other.armed === this.armed;
  }

  toDOM(): Node {
    const slot = document.createElement('span');
    slot.className = 'cm-breakpoint-slot';
    slot.dataset.breakpoint = this.armed ? 'on' : 'off';
    slot.dataset.line = String(this.line);
    // Named for the browser suites, which click the slot for a line rather than counting elements.
    slot.dataset.testid = `breakpoint-slot-${this.line}`;
    // The dot is a picture of state, not a control a screen reader can press: the keyboard route is
    // `F9`, and a `role="button"` on every line of a file would be a tab stop per line.
    slot.setAttribute('aria-hidden', 'true');
    return slot;
  }
}

/** The line number a gutter block starts on. */
function lineNumberAt(state: EditorState, from: number): number {
  return state.doc.lineAt(from).number;
}

/**
 * The gutter itself: a slot per line, and a click that asks the runner to toggle that line.
 *
 * The runner is the owner, so the dot does not flip here. It flips when the new list is dispatched
 * back as `setBreakpointLines`, which also means a click the runner refuses (storage gone, a run
 * already carrying the old list) leaves the gutter telling the truth.
 */
const breakpointGutterColumn = gutter({
  class: 'cm-breakpoint-gutter',
  lineMarker: (view, block) => {
    const line = lineNumberAt(view.state, block.from);
    return new BreakpointSlot(line, view.state.field(breakpointLinesField).includes(line));
  },
  // A slot carries its line number, so an edit can change what a slot *is* even when the list did
  // not move: inserting a line above a dot shifts every line under it. Both cases rebuild.
  lineMarkerChange: (update) =>
    update.docChanged ||
    update.startState.field(breakpointLinesField) !== update.state.field(breakpointLinesField),
  domEventHandlers: {
    click: (view, block, event) => {
      // A drag that ends on the gutter is a selection, not a request. `detail === 0` is a click a
      // script dispatched; a learner's click always carries a count.
      const mouse = event as MouseEvent;
      if (typeof mouse.detail === 'number' && mouse.detail > 1) return false;
      const line = lineNumberAt(view.state, block.from);
      view.dom.dispatchEvent(
        new CustomEvent(BREAKPOINT_TOGGLE_EVENT, { detail: { line }, bubbles: true })
      );
      return true;
    },
  },
});

/**
 * The editor's breakpoint column, field included.
 *
 * The field has to travel with the gutter: `lineMarker` asks it which lines are armed, and a gutter
 * without it would throw on the first draw. Exporting one extension keeps the two impossible to
 * install apart.
 */
export const breakpointGutter: Extension = [breakpointLinesField, breakpointGutterColumn];
