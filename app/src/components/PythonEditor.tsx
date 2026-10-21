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

/** The imperative surface the runner (and the browser suites) need. */
export interface PythonEditorHandle {
  focus: () => void;
  getValue: () => string;
  setValue: (text: string) => void;
}

interface PythonEditorProps {
  value: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
  /** Accessible name for the editing surface. */
  ariaLabel: string;
  /** Stable id: `editor-main`, `editor-helper`. Also the key in the test bridge below. */
  testId: string;
  /** Called (debounced by the caller) when a slider drag changed the code. */
  onSliderCommit?: () => void;
  className?: string;
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
      { get: () => string; set: (text: string) => void; focus: () => void }
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
 * The component is intentionally thin: the document is owned by React (`value`), every edit is
 * reported through `onChange`, and an external `value` change (a different lesson, Load Solution,
 * Reset) replaces the document. CodeMirror is the view; it is never the source of truth.
 */
export const PythonEditor = forwardRef<PythonEditorHandle, PythonEditorProps>(function PythonEditor(
  { value, onChange, readOnly = false, ariaLabel, testId, onSliderCommit, className },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSliderRef = useRef(onSliderCommit);
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
        autocompletion({ override: [pythonCompletions] }),
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

    // The suites type code from a string, read it back, and check it survived a reload; going
    // through the view keeps React's `value` in step instead of only the DOM.
    const bridge = {
      get: () => view.state.doc.toString(),
      set: (text: string) => {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      },
      focus: () => view.focus(),
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
    <div className={className} data-editor={testId}>
      <div ref={hostRef} className="cm-host" />
      {/* Server-rendered markup and no-JS readers still see the code as text; the browser suite
          asserts the starter reaches the page, and hiding it would make that check vacuous. */}
      <pre hidden data-testid={`${testId}-text`}>
        {value}
      </pre>
    </div>
  );
});
