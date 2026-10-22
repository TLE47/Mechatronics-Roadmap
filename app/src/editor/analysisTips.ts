/**
 * Hover cards and call signatures (`app/src/editor/analysisTips.ts`).
 *
 * Both are the same Jedi install the completion list already pays for, asked two more questions:
 * `help()` for the name under the pointer, `get_signatures()` for the call the cursor is inside. What
 * this module adds is where to ask, when to ask, and how the answer is drawn:
 *
 * - **Hover asks at the end of the name.** `math.acos` is one token, not three: the range under the
 *   pointer is expanded to the whole dotted name (so a flag drawn over `acos` still describes
 *   `math.acos`) and Jedi is asked about the position after it, which is where it resolves.
 * - **Signature help asks only inside a call.** `callContext` finds the unmatched `(` behind the
 *   cursor, ignoring brackets in strings and comments, and counts the top-level commas so the tooltip
 *   can bold the argument being typed - including in a nested call, where the inner signature is the
 *   one that matters.
 * - **A stale answer draws nothing.** The document is compared before the tooltip is created or
 *   dispatched; a reply about text the learner already replaced is dropped rather than shown one
 *   keystroke late.
 *
 * Nothing here renders learner or analyzer text as HTML: every string goes in through `textContent`,
 * because a docstring is third-party text and a tooltip is not a place to interpret it.
 */

import { StateEffect, StateField } from '@codemirror/state';
import {
  hoverTooltip,
  showTooltip,
  ViewPlugin,
  type EditorView,
  type Tooltip,
  type ViewUpdate,
} from '@codemirror/view';
import {
  docParagraph,
  hoverTitle,
  lineColumnAt,
  splitSignature,
  type AnalysisSession,
  type HoverInfo,
  type SignatureInfo,
} from '../analysisClient.ts';
import { callContext, hoverRange } from './callContext.ts';

/** A tooltip shell: one card, one test id, and the classes the editor theme colours. */
function tipShell(testId: string): HTMLDivElement {
  const dom = document.createElement('div');
  dom.className = 'cm-mechalab-tip';
  dom.setAttribute('data-testid', testId);
  return dom;
}

function line(className: string, text: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

/** The hover card: what it is, how it is called, and the docstring's first paragraph. */
export function buildHover(hover: HoverInfo): HTMLElement {
  const dom = tipShell('hover-tip');
  dom.setAttribute('data-hover-name', hover.name);
  dom.appendChild(line('cm-mechalab-tip-title', hoverTitle(hover)));
  if (hover.signature) dom.appendChild(line('cm-mechalab-tip-sig', hover.signature));
  const doc = docParagraph(hover.doc);
  if (doc) dom.appendChild(line('cm-mechalab-tip-doc', doc));
  return dom;
}

/**
 * The signature card: the call, with the argument being typed marked.
 *
 * `splitSignature` is what makes the mark land on the right argument; when it cannot (an empty
 * argument, a parameter the label does not spell out) the label is drawn whole rather than guessed at.
 */
export function buildSignature(signature: SignatureInfo): HTMLElement {
  const dom = tipShell('signature-tip');
  dom.setAttribute('data-signature-label', signature.label);
  if (signature.index !== null) dom.setAttribute('data-active-param', String(signature.index));
  const call = document.createElement('div');
  call.className = 'cm-mechalab-tip-sig';
  const parts = splitSignature(signature);
  if (parts) {
    for (const [className, text] of [
      ['cm-mechalab-tip-sig-plain', parts.before],
      ['cm-mechalab-tip-sig-active', parts.active],
      ['cm-mechalab-tip-sig-plain', parts.after],
    ] as const) {
      if (!text) continue;
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      call.appendChild(span);
    }
  } else {
    call.textContent = signature.label;
  }
  dom.appendChild(call);
  const doc = docParagraph(signature.doc, 2, 160);
  if (doc) dom.appendChild(line('cm-mechalab-tip-doc', doc));
  return dom;
}

/**
 * The hover extension.
 *
 * `hoverTime` is longer than CodeMirror's 300 ms default on purpose: a card that appears while the
 * pointer is crossing the code is noise, and the answer behind it is a request to the worker rather
 * than a lookup in the page.
 */
export function analysisHover(getSession: () => AnalysisSession | null) {
  return hoverTooltip(
    async (view, pos) => {
      const session = getSession();
      if (!session) return null;
      const doc = view.state.doc.toString();
      const range = hoverRange(doc, pos);
      if (!range) return null;
      const { line: lineNumber, column } = lineColumnAt(doc, range.to);
      const reply = await session.hover({ code: doc, line: lineNumber, column });
      if (!reply.ok || !reply.value) return null;
      const hover = reply.value;
      // The buffer moved on while Jedi was thinking; a card about text that is gone is worse than none.
      if (view.state.doc.toString() !== doc) return null;
      return {
        pos: range.from,
        end: range.to,
        above: true,
        create: () => ({ dom: buildHover(hover) }),
      };
    },
    { hoverTime: 400, hideOnChange: true }
  );
}

/** The signature card is a state field, because `showTooltip` reads facets rather than DOM nodes. */
const setSignatureTip = StateEffect.define<Tooltip | null>();

const signatureField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSignatureTip)) return effect.value;
    }
    // Any edit or cursor move makes the arguments the card describes out of date; the watcher asks
    // again once the learner pauses.
    if (transaction.docChanged || transaction.selection) return null;
    return value;
  },
});

/**
 * Watches the cursor and asks for the enclosing call's signature.
 *
 * The wait is short because the answer is local to the worker (Jedi is already loaded by the time a
 * learner is typing a call), and every answer is checked against the document it was asked about:
 * the worker is one thread shared with runs, so a reply can arrive after a Run or after more typing.
 */
class SignatureWatcher {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly getSession: () => AnalysisSession | null
  ) {}

  update(update: ViewUpdate): void {
    if (!update.docChanged && !update.selectionSet) return;
    this.schedule();
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.ask();
    }, 120);
  }

  private hide(): void {
    if (this.view.state.field(signatureField)) {
      this.view.dispatch({ effects: setSignatureTip.of(null) });
    }
  }

  private async ask(): Promise<void> {
    const state = this.view.state;
    if (state.readOnly) return this.hide();
    const session = this.getSession();
    if (!session) return this.hide();
    const doc = state.doc.toString();
    const context = callContext(doc, state.selection.main.head);
    if (!context) return this.hide();
    const reply = await session.signature({ code: doc, line: context.line, column: context.column });
    if (this.view.state.doc.toString() !== doc) return; // the learner kept typing
    if (!reply.ok || !reply.value) return this.hide();
    const signature = reply.value;
    const tip: Tooltip = {
      pos: context.open,
      above: false,
      create: () => ({ dom: buildSignature(signature) }),
    };
    this.view.dispatch({ effects: setSignatureTip.of(tip) });
  }
}

export function analysisSignature(getSession: () => AnalysisSession | null) {
  return [
    signatureField,
    showTooltip.from(signatureField),
    ViewPlugin.fromClass(
      class {
        private readonly watcher: SignatureWatcher;
        constructor(view: EditorView) {
          this.watcher = new SignatureWatcher(view, getSession);
        }
        update(update: ViewUpdate): void {
          this.watcher.update(update);
        }
        destroy(): void {
          this.watcher.destroy();
        }
      }
    ),
  ];
}
