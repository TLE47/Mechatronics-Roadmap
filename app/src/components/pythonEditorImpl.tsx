/**
 * The CodeMirror half of the editor, behind its own chunk.
 *
 * [`PythonEditor.tsx`](PythonEditor.tsx) is the component the runner imports; it renders a placeholder
 * and loads this module with `React.lazy`. CodeMirror and its parser are ~149 kB gzipped — the lesson
 * text, the Run button and the output panel do not need any of it to paint, so the entry no longer
 * waits for it (`docs/weight-budget.json`, `entry_gzip`).
 *
 * Nothing here is exported through the wrapper: the handle type and the props live in
 * `PythonEditor.tsx`, so this file and the thin wrapper cannot drift apart. The import below is
 * `import type` on purpose — it is a cycle at the type level only, and it is erased at build time.
 *
 * The component is intentionally thin: the document is owned by React (`value`), every edit is
 * reported through `onChange`, and an external `value` change (a different lesson, Load Solution,
 * Reset) replaces the document. CodeMirror is the view; it is never the source of truth.
 */

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  startCompletion,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { pythonEditorTheme } from '../editor/theme';
import { sliderAnnotation, sliderField } from '../editor/sliderWidget';
import { pythonCompletionSource } from '../editor/completions';
import { analysisHover, analysisSignature } from '../editor/analysisTips';
import { markPaintReady } from '../paintTiming';
import type { PythonEditorHandle, PythonEditorProps } from './PythonEditor';

/**
 * Move the cursor to a line, clamped to the document, and scroll it into view.
 *
 * Not a selection: the failure card's job is to show the learner the line that raised, and a selected
 * line would also arm the study panel's "pin selected text" for a passage they did not choose.
 */
function revealLine(view: EditorView, line: number): void {
  const number = Math.max(1, Math.min(Math.round(line), view.state.doc.lines));
  const target = view.state.doc.line(number);
  view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true });
  view.focus();
}

/** `useLayoutEffect` on the browser, `useEffect` during SSR: React warns about the former on a server. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const PYTHON_WORDS = [
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while',
  'with', 'yield',
  'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'float', 'input', 'int', 'len', 'list', 'map',
  'max', 'min', 'print', 'range', 'round', 'set', 'sorted', 'str', 'sum', 'tuple', 'zip',
];

/** Names the document defines, so `zeta` completes inside the same file. */
function documentNames(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/^\s*(?:def|class)\s+([A-Za-z_]\w*)/gm)) names.add(match[1]);
  for (const match of text.matchAll(/^\s*([A-Za-z_]\w*)\s*(?:=(?!=)|\+=|-=|\*=|\/=)/gm)) names.add(match[1]);
  return [...names];
}

const pythonCompletions: CompletionSource = (context) => {
  const word = context.matchBefore(/[A-Za-z_][\w.]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const options = [...new Set([...PYTHON_WORDS, ...documentNames(context.state.doc.toString())])].map(
    (label) => ({ label, type: PYTHON_WORDS.includes(label) ? 'keyword' : 'variable' })
  );
  return { from: word.from, options, validFor: /^[\w.]*$/ };
};

declare global {
  interface Window {
    /** Browser suites drive the editor through this, so they never depend on DOM shape. */
    __mechalabEditors?: Record<
      string,
      {
        get: () => string;
        set: (text: string) => void;
        focus: () => void;
        /** Move the cursor, clamped to the document: a suite types at a known position. */
        setCursor: (pos: number) => void;
        getCursor: () => number;
        /** Cursor to a 1-based line, scrolled into view: the failure card's "show line N". */
        revealLine: (line: number) => void;
        /**
         * Open the completion list, the same command `Ctrl-Space` runs.
         *
         * A suite cannot rely on a synthetic key press landing in a contenteditable after a tab
         * switch, and the binding itself is CodeMirror's, not this app's: what is worth pinning is
         * that the list appears and what is in it.
         */
        startCompletion: () => void;
        /**
         * Where a document position is on screen, so a browser suite can put the real pointer over
         * a name. Hover is a mouse gesture CodeMirror owns; a synthetic event would be a test of the
         * harness rather than of the card that opens.
         */
        coordsOf: (pos: number) => { left: number; top: number; bottom: number } | null;
      }
    >;
  }
}

/**
 * The Python editor: CodeMirror 6 in place of the textarea.
 *
 * A textarea cannot colour syntax, complete a name, keep an undo history, or hold a widget under a
 * line. This does all four and stays a small dependency (~200 kB before gzip, versus Monaco), works
 * on touch, and takes its colours from the app's tokens so light mode is not a second theme.
 *
 * Loaded only through `React.lazy` in `PythonEditor.tsx`; import that, not this.
 */
export const PythonEditorImpl = forwardRef<PythonEditorHandle, PythonEditorProps>(
  function PythonEditorImpl(
    { value, onChange, readOnly = false, ariaLabel, testId, onSliderCommit, getAnalysis, className },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onSliderRef = useRef(onSliderCommit);
    // Read at completion time, not captured: the session appears once the interpreter is ready, and
    // the editor is created long before that.
    const analysisRef = useRef(getAnalysis);
    analysisRef.current = getAnalysis;
    onChangeRef.current = onChange;
    onSliderRef.current = onSliderCommit;

    useImperativeHandle(
      ref,
      () => ({
        focus: () => viewRef.current?.focus(),
        getValue: () => viewRef.current?.state.doc.toString() ?? value,
        setValue: (text: string) => {
          const view = viewRef.current;
          if (!view) return;
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
        },
        revealLine: (line: number) => {
          const view = viewRef.current;
          if (view) revealLine(view, line);
        },
      }),
      [value]
    );

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const state = EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          foldGutter(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          rectangularSelection(),
          highlightSelectionMatches(),
          autocompletion({
            override: [pythonCompletionSource(() => analysisRef.current?.() ?? null, pythonCompletions)],
          }),
          // Hover and signature help read the same session the completion list does, and are only
          // installed where one can exist: the read-only helper tab passes no `getAnalysis`, and a
          // hover card over somebody else's file would be a card about the lesson, not the learner's code.
          ...(getAnalysis
            ? [
                analysisHover(() => analysisRef.current?.() ?? null),
                ...analysisSignature(() => analysisRef.current?.() ?? null),
              ]
            : []),
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, 'data-testid': testId }),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          python(),
          pythonEditorTheme,
          sliderField,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
            if (update.transactions.some((tr) => tr.annotation(sliderAnnotation))) {
              onSliderRef.current?.();
            }
          }),
        ],
      });
      const view = new EditorView({ state, parent: host });
      viewRef.current = view;
      // The paint reading's third moment: the editor exists where the placeholder stood. `fcp` already
      // covered the lesson text and the code, so this is what the lazy boundary costs (`paintTiming.ts`).
      markPaintReady('editor');
      // The scroller is a scroll container of its own, so it takes a tab stop: CodeMirror focuses the
      // editable content, which scrolls only with the caret, so without this a keyboard user has no
      // way to page through a long file while leaving the cursor where it is (WCAG 2.1.1; axe's
      // `scrollable-region-focusable` names exactly this element).
      view.scrollDOM.setAttribute('tabindex', '0');

      // The suites type code from a string, read it back, and check it survived a reload; going
      // through the view keeps React's `value` in step instead of only the DOM.
      const bridge = {
        get: () => view.state.doc.toString(),
        set: (text: string) => {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
        },
        focus: () => view.focus(),
        setCursor: (pos: number) => {
          const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
          view.dispatch({ selection: { anchor: clamped } });
          view.focus();
        },
        getCursor: () => view.state.selection.main.head,
        revealLine: (line: number) => revealLine(view, line),
        startCompletion: () => {
          view.focus();
          startCompletion(view);
        },
        coordsOf: (pos: number) => {
          const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
          const coords = view.coordsAtPos(clamped);
          return coords ? { left: coords.left, top: coords.top, bottom: coords.bottom } : null;
        },
      };
      window.__mechalabEditors = { ...(window.__mechalabEditors ?? {}), [testId]: bridge };

      return () => {
        view.destroy();
        viewRef.current = null;
        if (window.__mechalabEditors?.[testId] === bridge) {
          delete window.__mechalabEditors[testId];
        }
      };
      // The document is synced by the effect below; mounting once per editor instance is the point.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [testId, readOnly, ariaLabel]);

    // External changes: a different lesson, Load Solution, Reset starter. The learner's own keystrokes
    // arrive here too and are already equal to the document, so nothing is dispatched twice.
    useIsomorphicLayoutEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === value) return;
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }, [value]);

    return (
      <div className={className} data-editor={testId} data-editor-ready="true">
        <div ref={hostRef} className="cm-host" />
        {/* Server-rendered markup and no-JS readers still see the code as text; the browser suite
            asserts the starter reaches the page, and hiding it would make that check vacuous. */}
        <pre hidden data-testid={`${testId}-text`}>
          {value}
        </pre>
      </div>
    );
  }
);
