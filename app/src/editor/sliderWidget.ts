/**
 * The slider a `# @slider` comment turns into.
 *
 * A block widget sits under the assignment it tunes. Dragging it dispatches a normal document
 * change - the literal is rewritten in the file, so the code the learner runs is the code on screen,
 * and the file remains valid Python for anyone who opens it elsewhere.
 *
 * Two details make dragging feel right rather than jumpy:
 *
 *  - the widget is **reused** while its range and line stay the same (`eq` ignores the value), so
 *    the range input is not replaced under the pointer mid-drag; `updateDOM` refreshes the label;
 *  - a drag is tagged with `sliderAnnotation`, so the runner can re-run on a drag without treating
 *    every keystroke as a request to run.
 */

import { Annotation, RangeSetBuilder, StateField, type EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import { formatSliderValue, parseSliders, sliderEdit, type SliderSpec } from './sliderModel';

/** Mark a transaction as "a slider moved", for the component's debounced re-run. */
export const sliderAnnotation = Annotation.define<boolean>();

/** Rewrite one slider's literal in the current document. Offsets are re-derived, never reused. */
export function applySliderValue(view: EditorView, line: number, value: number): void {
  const spec = parseSliders(view.state.doc.toString()).find((candidate) => candidate.line === line);
  if (!spec) return;
  const edit = sliderEdit(spec, value);
  if (!edit) return;
  view.dispatch({
    changes: edit,
    annotations: sliderAnnotation.of(true),
    userEvent: 'input.slider',
  });
}

class SliderWidget extends WidgetType {
  constructor(readonly spec: SliderSpec) {
    super();
  }

  /** Reuse the DOM while only the value moved: replacing it would abort the drag in progress. */
  eq(other: SliderWidget): boolean {
    return (
      other.spec.line === this.spec.line &&
      other.spec.name === this.spec.name &&
      other.spec.min === this.spec.min &&
      other.spec.max === this.spec.max &&
      other.spec.step === this.spec.step &&
      other.spec.decimals === this.spec.decimals
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cm-slider-row';
    row.dataset.sliderName = this.spec.name;

    const label = document.createElement('label');
    label.textContent = `${this.spec.name} = ${formatSliderValue(this.spec.value, this.spec.decimals)}`;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(this.spec.min);
    input.max = String(this.spec.max);
    input.step = String(this.spec.step);
    input.value = String(this.spec.value);
    input.setAttribute('aria-label', `Set ${this.spec.name}, from ${this.spec.min} to ${this.spec.max}`);
    input.dataset.testid = `slider-${this.spec.name}`;
    input.dataset.sliderLine = String(this.spec.line);

    const range = document.createElement('span');
    range.className = 'cm-slider-range';
    range.textContent = `${this.spec.min} → ${this.spec.max}`;

    // Read the line from the element, not from the closed-over spec: the widget instance is kept
    // across value changes, and the line stays attached to the element that was drawn for it.
    input.addEventListener('input', () => {
      label.textContent = `${this.spec.name} = ${input.value}`;
      applySliderValue(view, Number(input.dataset.sliderLine), Number(input.value));
    });

    row.append(label, input, range);
    return row;
  }

  updateDOM(dom: HTMLElement, _view: EditorView, old: SliderWidget): boolean {
    if (old.spec.value === this.spec.value) return true;
    const input = dom.querySelector<HTMLInputElement>('input[type="range"]');
    const label = dom.querySelector('label');
    if (input) input.value = String(this.spec.value);
    if (label) label.textContent = `${this.spec.name} = ${formatSliderValue(this.spec.value, this.spec.decimals)}`;
    return true;
  }

  /** Keep CodeMirror's own mouse handling out of the slider's way. */
  ignoreEvent(): boolean {
    return true;
  }
}

function buildSliders(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const spec of parseSliders(state.doc.toString())) {
    const line = state.doc.line(spec.line + 1);
    builder.add(
      line.to,
      line.to,
      Decoration.widget({ widget: new SliderWidget(spec), block: true, side: 1 })
    );
  }
  return builder.finish();
}

/**
 * A **state field**, not a view plugin: CodeMirror refuses block decorations from plugins, because
 * a block widget changes heights and line layout must be known before measuring. The field also
 * maps through edits, so an insertion above a slider moves its row instead of hiding it.
 */
export const sliderField = StateField.define<DecorationSet>({
  create: (state) => buildSliders(state),
  update: (decorations, transaction) =>
    transaction.docChanged ? buildSliders(transaction.state) : decorations.map(transaction.changes),
  provide: (field) => EditorView.decorations.from(field),
});
