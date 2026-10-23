/**
 * Breakpoints inside the editor's state, and how an edit carries them along
 * (`app/src/editor/breakpointState.ts`).
 *
 * A breakpoint is *remembered* as a line number and a condition (`breakpoints.ts`: that is what a
 * reload restores with the draft). What it is *held* as while the editor is open is a document
 * **position**, so CodeMirror's own change mapping can carry it along: press Enter above a dot and
 * the dot moves down with the statement it was placed on, undo and it comes back, type in the middle
 * of a line and it stays where it is. The condition rides on the same entry, which is why a moved
 * breakpoint keeps `n == 3` rather than losing it to whatever line now starts at the old number.
 *
 * That split is the whole design. A line number cannot be mapped (line 3 means something else after
 * a newline is typed above it), and a position cannot be stored (a reload has a different document).
 * The field holds positions with their conditions, `armedBreakpoints` answers the entries the runner
 * persists, and `setBreakpointLines` converts back.
 *
 * **No DOM and no view.** This module imports `@codemirror/state` only, so the mapping can be pinned
 * headlessly (`npm run test:breakpoints`): insert a line above a breakpoint, read it back at line 4 —
 * condition and all.
 */

import { StateEffect, StateField, type EditorState, type Text } from '@codemirror/state';
import { type Breakpoint, normalizeBreakpointEntries } from './breakpoints.ts';

/** One park as the editor holds it: where it sits in this document, and what it waits for. */
export interface ArmedBreakpoint {
  pos: number;
  condition: string;
}

/** Replace the armed entries; `[]` removes every dot. Lines numbered as the learner sees them. */
export const setBreakpointLines = StateEffect.define<readonly Breakpoint[]>();

/** Where each of these entries starts, clamped to the document, condition kept. */
export function positionsForBreakpoints(
  doc: Text,
  entries: readonly Breakpoint[]
): ArmedBreakpoint[] {
  return normalizeBreakpointEntries([...entries]).map((entry) => {
    const number = Math.max(1, Math.min(entry.line, doc.lines));
    return { pos: doc.line(number).from, condition: entry.condition };
  });
}

/**
 * The armed entries, as the learner counts them.
 *
 * Normalised on the way out — sorted by line, deduped, capped — because a mapping and a click can
 * land two breakpoints on the same line, and the gutter, the store and the run request must agree.
 */
export function armedBreakpoints(state: EditorState): Breakpoint[] {
  const doc = state.doc;
  const positions = state.field(breakpointLinesField);
  return normalizeBreakpointEntries(
    positions.map((entry) => ({
      line: doc.lineAt(Math.max(0, Math.min(entry.pos, doc.length))).number,
      condition: entry.condition,
    }))
  );
}

/** The armed line numbers alone, for the tests and for anything that draws a dot without asking why. */
export function armedLines(state: EditorState): number[] {
  return armedBreakpoints(state).map((entry) => entry.line);
}

/**
 * The armed entries, held as positions.
 *
 * A transaction that carries `setBreakpointLines` wins over mapping: it describes a whole new list
 * for the document *this* transaction produces, which is what an external replacement (Load Solution,
 * Reset Starter, a restored draft) needs — positions mapped through a replacement would all collapse
 * to one end of the file.
 */
export const breakpointLinesField = StateField.define<ArmedBreakpoint[]>({
  create: () => [],
  update: (positions, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setBreakpointLines)) {
        return positionsForBreakpoints(transaction.state.doc, effect.value);
      }
    }
    if (!transaction.docChanged) return positions;
    // `1` keeps the position with what comes **after** an insertion exactly at it. Pressing Enter at
    // the start of a line inserts there; associating forwards is what walks the dot down with the
    // statement rather than leaving it on the empty line above.
    return positions.map((entry) => ({
      pos: transaction.changes.mapPos(entry.pos, 1),
      condition: entry.condition,
    }));
  },
});
