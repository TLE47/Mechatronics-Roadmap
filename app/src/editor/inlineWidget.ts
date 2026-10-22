/**
 * The value a run left a name holding, drawn at the end of the line that bound it.
 *
 * A widget rather than a tooltip: the learner's question while reading a failed run is "what is in
 * `total`?", and an answer that needs a hover is an answer they have to already suspect they want.
 * It is deliberately quiet — muted ink, no border — because it is a note about the line, not a
 * verdict about it.
 *
 * Two rules keep it honest, both enforced here rather than by the caller:
 *
 * - **An edit clears every value.** The numbers describe one run of one document; the moment the
 *   document changes they are describing code that is no longer on screen. `docChanged` empties the
 *   field instead of mapping the decorations through the edit, which would move a value to whatever
 *   line drifted under it.
 * - **A line that no longer exists is dropped at draw time.** The set is built against the current
 *   document, so a stale entry cannot throw or land on the wrong line.
 */

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { InlineValueAt } from '../inlineValues';

/** Replace the drawn set: sent by the runner after a run, and with `[]` to clear. */
export const setInlineValuesEffect = StateEffect.define<InlineValueAt[]>();

class InlineValueWidget extends WidgetType {
  constructor(readonly entry: InlineValueAt) {
    super();
  }

  /** Same line, same text: the DOM is reused rather than replaced on every dispatch. */
  eq(other: InlineValueWidget): boolean {
    return (
      other.entry.line === this.entry.line &&
      other.entry.name === this.entry.name &&
      other.entry.value === this.entry.value
    );
  }

  toDOM(): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'cm-inline-value';
    chip.dataset.inlineName = this.entry.name;
    chip.dataset.inlineValue = this.entry.value;
    chip.textContent = this.entry.value;
    // The chip is drawn after `total =` and reads as more code to a screen reader; the name is what
    // makes it a sentence. The title is the same sentence for a pointer.
    chip.title = `${this.entry.name} = ${this.entry.value}`;
    chip.setAttribute('role', 'note');
    chip.setAttribute('aria-label', `${this.entry.name} is ${this.entry.value}`);
    return chip;
  }

  /** A chip is text: clicking it must put the cursor on the line, not select the chip. */
  ignoreEvent(): boolean {
    return false;
  }
}

function build(state: { doc: { lines: number; line: (n: number) => { to: number } } }, entries: InlineValueAt[]): DecorationSet {
  const ranges = entries
    .filter((entry) => entry.line >= 1 && entry.line <= state.doc.lines)
    .map((entry) =>
      Decoration.widget({ widget: new InlineValueWidget(entry), side: 1 }).range(
        state.doc.line(entry.line).to
      )
    );
  // `true`: the entries arrive sorted by line, and a widget set must be in range order.
  return Decoration.set(ranges, true);
}

/** A state field, not a plugin: decorations are part of the state the theme resolves against. */
export const inlineValueField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setInlineValuesEffect)) return build(transaction.state, effect.value);
    }
    // An edit means these values describe a document that is gone.
    if (transaction.docChanged) return Decoration.none;
    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Draw `entries`; the editor's own handle is the only caller. */
export function applyInlineValues(view: EditorView, entries: InlineValueAt[]): void {
  view.dispatch({ effects: setInlineValuesEffect.of(entries) });
}
