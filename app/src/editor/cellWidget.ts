/**
 * The row a `# %%` marker turns into (`app/src/editor/cellWidget.ts`).
 *
 * Above each marker sits one button: `▶ Cell 2 · Set up`, which runs the document **through the end of
 * that cell** (`cells.ts`). The marker line itself gets a hairline and a muted tint so the boundary is
 * visible while reading, not only where a button happens to be.
 *
 * **The click leaves the editor as an event.** The widget is built by a `StateField`, which is created
 * once with the document and has no access to React props; the alternative (a facet carrying a
 * callback) would rebuild state whenever the callback identity changed — on every render. A bubbling
 * `CustomEvent` on the editor's own DOM is the seam this app already uses for focus mode: the field
 * stays pure, and `pythonEditorImpl` listens and calls the runner.
 *
 * A **state field**, not a view plugin, for the same reason the sliders use one: CodeMirror refuses
 * block decorations from plugins because a block changes heights, and layout must be known before it
 * is measured.
 */

import { StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { cellLabel, hasCells, parseCells, type Cell } from './cells';

/** Dispatched on the editor's DOM with `detail: { index }` when a cell's button is pressed. */
export const CELL_RUN_EVENT = 'mechalab:run-cell';

class CellRunWidget extends WidgetType {
  constructor(readonly cell: Cell) {
    super();
  }

  /** Reuse the DOM while the cell's number and title are unchanged: a rebuild happens on each edit. */
  eq(other: CellRunWidget): boolean {
    return other.cell.index === this.cell.index && other.cell.title === this.cell.title;
  }

  toDOM(view: EditorView): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cm-cell-row';

    const run = document.createElement('button');
    run.type = 'button';
    run.className = 'cm-cell-run';
    run.dataset.testid = `cell-run-${this.cell.index}`;
    run.dataset.cellIndex = String(this.cell.index);
    run.textContent = `▶ ${cellLabel(this.cell)}`;
    run.title = `Run to here: run everything through the end of ${cellLabel(this.cell)}`;
    run.addEventListener('click', (event) => {
      event.preventDefault();
      view.dom.dispatchEvent(
        new CustomEvent(CELL_RUN_EVENT, { detail: { index: this.cell.index }, bubbles: true })
      );
    });

    row.append(run);
    return row;
  }

  /** Keep CodeMirror out of the button's way; the listener above is the only handler. */
  ignoreEvent(): boolean {
    return true;
  }
}

function buildCells(state: EditorState): DecorationSet {
  const cells = parseCells(state.doc.toString());
  // A lesson with no markers gets no decorations at all, so every other lesson is untouched.
  if (!hasCells(cells)) return Decoration.none;
  const ranges: ReturnType<Decoration['range']>[] = [];
  for (const cell of cells) {
    if (cell.markerLine === null) continue;
    const line = state.doc.line(cell.markerLine + 1);
    ranges.push(Decoration.line({ class: 'cm-cell-marker' }).range(line.from));
    ranges.push(
      Decoration.widget({ widget: new CellRunWidget(cell), block: true, side: -1 }).range(line.from)
    );
  }
  return Decoration.set(ranges, true);
}

export const cellField = StateField.define<DecorationSet>({
  create: (state) => buildCells(state),
  // Rebuilt rather than mapped: a parsed range is a few dozen lines of splitting, and a marker that
  // was typed a keystroke ago must get its button without waiting for a re-mount.
  update: (decorations, transaction) =>
    transaction.docChanged ? buildCells(transaction.state) : decorations,
  provide: (field) => EditorView.decorations.from(field),
});
