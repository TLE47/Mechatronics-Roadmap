/**
 * The breakpoint gutter (`app/src/editor/breakpointGutter.ts`).
 *
 * A column to the left of the line numbers where a dot means *stop here*. Click it to arm a line,
 * click again to disarm it; `F9` does the same for the caret line, because a gutter is a mouse target
 * and a feature only a mouse can operate is half a feature. The armed list itself — and the way an
 * edit carries a dot along with its statement — is [`breakpointState.ts`](breakpointState.ts).
 *
 * **A slot on every line, not a marker on some lines.** CodeMirror renders gutter elements only for
 * lines that carry a marker unless `renderEmptyElements` is set, and a gutter that is invisible until
 * it holds something has no affordance to click. `lineMarker` therefore answers every line with a
 * slot: empty at rest, faint on hover, filled when the line is armed. The dot the learner reads and
 * the hit area they click are the same element.
 *
 * **A dot that waits for something is drawn hollow.** A conditional breakpoint parks only on the pass
 * its expression is true, and a filled dot would say "this always stops" — the wrong sentence about a
 * park the learner just narrowed. The condition itself is written in the Breakpoints panel, not in a
 * popover on a nine-pixel dot.
 *
 * **The click leaves the editor as an event.** The gutter's configuration is built once, with no
 * access to React props, and the runner owns the persisted list (it is per lesson and travels with
 * the run). A bubbling `CustomEvent` on the editor's own DOM is the seam this app already uses for
 * cells and focus mode: the gutter stays pure, and `pythonEditorImpl` calls the runner.
 *
 * **A breakpoint is read when a run starts.** The worker parks from the list that travelled with the
 * request, conditions included; a dot added during a run is for the next one. That is a real limit
 * and it is written down in `docs/PLAN-2.0-GAP.md` rather than papered over — the toolbar's Pause is
 * what catches a loop that is already spinning.
 */

import { type EditorState, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';
import { type ArmedBreakpoint, armedBreakpoints, breakpointLinesField } from './breakpointState.ts';

/** Dispatched on the editor's DOM with `detail: { line }` (1-based) when a slot is clicked. */
export const BREAKPOINT_TOGGLE_EVENT = 'mechalab:toggle-breakpoint';

/**
 * The armed lines and their conditions for one state, cached by the positions array they came from.
 *
 * `lineMarker` is asked about every visible line; walking the list and turning positions into line
 * numbers for each would be the same work twenty-five times a line. The positions array is replaced
 * on every edit and every effect, so its identity is the cache key. The value is `line → condition`,
 * which is every question the slot asks of state: armed or not, and why.
 */
const lineCache = new WeakMap<ArmedBreakpoint[], Map<number, string>>();
function armedLineMap(state: EditorState): Map<number, string> {
  const positions = state.field(breakpointLinesField);
  let lines = lineCache.get(positions);
  if (!lines) {
    lines = new Map(armedBreakpoints(state).map((entry) => [entry.line, entry.condition]));
    lineCache.set(positions, lines);
  }
  return lines;
}

/** One slot: the click target for a line, carrying whether it is armed and what it waits for. */
class BreakpointSlot extends GutterMarker {
  constructor(readonly line: number, readonly condition: string | null) {
    super();
  }

  /** A dot is reused while its line and condition are unchanged, which is the viewport's worth. */
  eq(other: GutterMarker): boolean {
    return (
      other instanceof BreakpointSlot &&
      other.line === this.line &&
      other.condition === this.condition
    );
  }

  toDOM(): Node {
    const slot = document.createElement('span');
    slot.className = 'cm-breakpoint-slot';
    // `conditional` is a hollow ring: the dot is armed, the run stops only when its expression is true.
    slot.dataset.breakpoint =
      this.condition === null ? 'off' : this.condition.trim() ? 'conditional' : 'on';
    if (this.condition) slot.title = `Stop here only when ${this.condition}`;
    slot.dataset.line = String(this.line);
    // Named for the browser suites, which click the slot for a line rather than counting elements.
    slot.dataset.testid = `breakpoint-slot-${this.line}`;
    // The dot is a picture of state, not a control a screen reader can press: the keyboard route is
    // `F9`, and a `role="button"` on every line of a file would be a tab stop per line.
    slot.setAttribute('aria-hidden', 'true');
    return slot;
  }
}

const breakpointGutterColumn = gutter({
  class: 'cm-breakpoint-gutter',
  lineMarker: (view, block) => {
    const line = view.state.doc.lineAt(block.from).number;
    return new BreakpointSlot(line, armedLineMap(view.state).get(line) ?? null);
  },
  // A slot carries its line number, and a dot's line changes when the text above it does: every edit
  // redraws, as does a new list from the runner.
  lineMarkerChange: (update) =>
    update.docChanged ||
    update.startState.field(breakpointLinesField) !== update.state.field(breakpointLinesField),
  domEventHandlers: {
    click: (view, block, event) => {
      // A double click is a selection gesture, not a second request.
      const mouse = event as MouseEvent;
      if (typeof mouse.detail === 'number' && mouse.detail > 1) return false;
      const line = view.state.doc.lineAt(block.from).number;
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
