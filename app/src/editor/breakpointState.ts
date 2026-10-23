/**
 * Breakpoints inside the editor's state, and how an edit carries them along
 * (`app/src/editor/breakpointState.ts`).
 *
 * A breakpoint is *remembered* as a line number (`breakpoints.ts`: that is what a reload restores
 * with the draft). What it is *held* as while the editor is open is a document **position**, so
 * CodeMirror's own change mapping can carry it along: press Enter above a dot and the dot moves down
 * with the statement it was placed on, undo and it comes back, type in the middle of a line and it
 * stays where it is.
 *
 * That split is the whole design. A line number cannot be mapped (line 3 means something else after
 * a newline is typed above it), and a position cannot be stored (a reload has a different document).
 * The field holds positions, `armedLines` answers the line numbers the runner persists, and
 * `setBreakpointLines` converts back.
 *
 * **No DOM and no view.** This module imports `@codemirror/state` only, so the mapping can be pinned
 * headlessly (`npm run test:breakpoints`): insert a line above a breakpoint, read it back at line 4.
 */

import { StateEffect, StateField, type EditorState, type Text } from '@codemirror/state';
import { normalizeBreakpoints } from './breakpoints.ts';

/** Replace the armed lines; `[]` removes every dot. Numbered as the learner sees them. */
export const setBreakpointLines = StateEffect.define<number[]>();

/** Where each of these lines starts, clamped to the document. */
export function positionsForLines(doc: Text, lines: readonly number[]): number[] {
  return normalizeBreakpoints([...lines]).map((line) => {
    const number = Math.max(1, Math.min(line, doc.lines));
    return doc.line(number).from;
  });
}

/**
 * The armed lines, as the learner counts them.
 *
 * Normalised on the way out — sorted, deduped and capped — because a mapping and a click can land
 * two breakpoints on the same line, and the gutter, the store and the run request must agree.
 */
export function armedLines(state: EditorState): number[] {
  const doc = state.doc;
  const positions = state.field(breakpointLinesField);
  return normalizeBreakpoints(
    positions.map((position) => doc.lineAt(Math.max(0, Math.min(position, doc.length))).number)
  );
}

/**
 * The armed lines, held as positions.
 *
 * A transaction that carries `setBreakpointLines` wins over mapping: it describes a whole new list
 * for the document *this* transaction produces, which is what an external replacement (Load Solution,
 * Reset Starter, a restored draft) needs — positions mapped through a replacement would all collapse
 * to one end of the file.
 */
export const breakpointLinesField = StateField.define<number[]>({
  create: () => [],
  update: (positions, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setBreakpointLines)) return positionsForLines(transaction.state.doc, effect.value);
    }
    if (!transaction.docChanged) return positions;
    // `1` keeps the position with what comes **after** an insertion exactly at it. Pressing Enter at
    // the start of a line inserts there; associating forwards is what walks the dot down with the
    // statement rather than leaving it on the empty line above.
    return positions.map((position) => transaction.changes.mapPos(position, 1));
  },
});
