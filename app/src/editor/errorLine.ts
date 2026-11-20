/**
 * The line Python failed on (`app/src/editor/errorLine.ts`).
 *
 * A traceback card below the panes can explain a failure, but it cannot put the failure where a
 * learner is looking. This field marks the learner's own line in red and draws one muted sentence
 * above it — the exception summary, not a second dialog. The note is a block widget, so it sits over
 * the line like a margin note instead of pushing the code sideways; it is deliberately small and
 * low-contrast, and the full traceback keeps its card below the panes.
 *
 * The mark belongs to one document. Any edit clears it, because a line number from the previous run
 * may no longer name the same statement; the next run draws it again from `parseFailure`.
 */

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

export interface EditorErrorLine {
  /** 1-based line in the learner's file. */
  line: number;
  /** The parsed exception, e.g. `NameError: name 'kp' is not defined`. */
  message: string;
}

interface ErrorMark {
  line: number;
  message: string;
}

const setErrorLineEffect = StateEffect.define<ErrorMark | null>();

const errorLineField = StateField.define<ErrorMark | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setErrorLineEffect)) return effect.value;
    }
    // A mark about the old document is worse than no mark: an inserted line would make it point at
    // somebody else's statement.
    if (transaction.docChanged) return null;
    return value;
  },
});

/** The one sentence above the line. The title carries the whole summary for a clipped narrow pane. */
class ErrorNoteWidget extends WidgetType {
  constructor(private readonly message: string) {
    super();
  }

  eq(other: ErrorNoteWidget): boolean {
    return other.message === this.message;
  }

  toDOM(): HTMLElement {
    const note = document.createElement('div');
    note.className = 'cm-error-note';
    note.setAttribute('role', 'note');
    note.title = this.message;
    note.textContent = `Error · ${this.message}`;
    return note;
  }
}

const errorLineDecorations = EditorView.decorations.compute([errorLineField], (state) => {
  const mark = state.field(errorLineField);
  if (!mark) return Decoration.none;
  const line = state.doc.line(Math.min(Math.max(mark.line, 1), state.doc.lines));
  return Decoration.set(
    [
      Decoration.line({ attributes: { class: 'cm-error-line' } }).range(line.from),
      Decoration.widget({ widget: new ErrorNoteWidget(mark.message), block: true, side: -1 }).range(
        line.from
      ),
    ],
    true
  );
});

/** Install the field and its decoration. One per editor state, before any document is drawn. */
export const errorLineExtension = [errorLineField, errorLineDecorations];

/** Mark a line, or clear the mark with `null`. A line outside the document is clamped. */
export function showErrorLine(view: EditorView, error: EditorErrorLine | null): void {
  if (!error || !Number.isFinite(error.line) || error.line < 1) {
    view.dispatch({ effects: setErrorLineEffect.of(null) });
    return;
  }
  const message = String(error.message ?? '').trim().slice(0, 180) || 'Python stopped here.';
  view.dispatch({
    effects: setErrorLineEffect.of({ line: Math.floor(error.line), message }),
  });
}
