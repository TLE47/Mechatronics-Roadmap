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
  useCallback,
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
import { Compartment, EditorState } from '@codemirror/state';
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
import { applyInlineValues, inlineValueField } from '../editor/inlineWidget';
import { CELL_RUN_EVENT, cellField } from '../editor/cellWidget';
import { BREAKPOINT_TOGGLE_EVENT, breakpointGutter } from '../editor/breakpointGutter';
import { armedLines, setBreakpointLines } from '../editor/breakpointState';
import type { InlineValueAt } from '../inlineValues';
import { pythonCompletionSource } from '../editor/completions';
import { analysisHover, analysisSignature } from '../editor/analysisTips';
import { symbolAt } from '../symbolIndex';
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

type VimModule = typeof import('@replit/codemirror-vim');

/**
 * The Vim plugin, fetched the first time somebody asks for the keys and never before.
 *
 * It is 41 kB gzipped — a full Vim emulation is not a small keymap — and it is **off by default**, so
 * a static import would charge every learner who opens the editor for a feature most of them will never
 * turn on. The import lands in its own chunk (`vite.config.ts`, `vendor-vim`), which is not in the
 * entry's preload list, so a visit that never enables it never fetches it. One promise per page: a
 * second enable reuses the module the first one loaded.
 */
let vimModule: Promise<VimModule> | null = null;
function loadVim(): Promise<VimModule> {
  vimModule ??= import('@replit/codemirror-vim');
  return vimModule;
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
        /** The inline values currently drawn, read from the widgets themselves. */
        inlineValues: () => { name: string; value: string }[];
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
    {
      value,
      onChange,
      readOnly = false,
      ariaLabel,
      testId,
      onSliderCommit,
      getAnalysis,
      className,
      onGoToDefinition,
      onRunCell,
      onToggleBreakpoint,
      onBreakpointsMoved,
      breakpoints = [],
      vimMode = false,
      onVimMode,
      initialLine,
    },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onSliderRef = useRef(onSliderCommit);
    // A jump is asked for by the runner, which may change its mind between renders (a different
    // lesson's files); read through a ref so a mounted editor always calls the current one.
    const onDefinitionRef = useRef(onGoToDefinition);
    // A cell button dispatches a DOM event (`cellWidget.ts`); the runner is called from here, because
    // a `StateField` cannot hold a callback without rebuilding the state on every render.
    const onRunCellRef = useRef(onRunCell);
    // A gutter click asks for a line to be armed; the list belongs to the runner, which is the only
    // place that knows which lesson this is and where it is kept (`breakpoints.ts`).
    const onToggleBreakpointRef = useRef(onToggleBreakpoint);
    // An edit carries a dot down with its statement (`breakpointState.ts`); the runner persists the
    // resulting line numbers, because it is the owner of the list.
    const onBreakpointsMovedRef = useRef(onBreakpointsMoved);
    // The list as the runner last handed it over, and the list last reported back to it. A report is
    // sent only when an edit moved a dot to a line the runner does not already know about.
    const breakpointsRef = useRef(breakpoints);
    // Read at completion time, not captured: the session appears once the interpreter is ready, and
    // the editor is created long before that.
    const analysisRef = useRef(getAnalysis);
    analysisRef.current = getAnalysis;
    onChangeRef.current = onChange;
    onSliderRef.current = onSliderCommit;
    onDefinitionRef.current = onGoToDefinition;
    onRunCellRef.current = onRunCell;
    onToggleBreakpointRef.current = onToggleBreakpoint;
    onBreakpointsMovedRef.current = onBreakpointsMoved;
    breakpointsRef.current = breakpoints;
    // A string key rather than the array: the runner hands over a fresh array each render, and an
    // effect keyed on it would dispatch a transaction on every keystroke.
    const breakpointsKey = breakpoints.join(',');
    const reportedBreakpointsKey = useRef(breakpointsKey);
    // The Vim mode word, reported upward as it changes: the badge the learner reads is the runner's
    // (`app/src/vimMode.ts`), and this file only knows what the plugin says the mode is.
    const onVimModeRef = useRef(onVimMode);
    onVimModeRef.current = onVimMode;
    // The plugin rides in a compartment of the editor's own state, so the toggle is a reconfigure
    // rather than a second editor: the document, the undo history and the caret survive it.
    const vimSlot = useRef(new Compartment());
    /** Whether the plugin is installed in the state right now: the module load is asynchronous. */
    const vimApplied = useRef(false);
    /** This editor's subscription to `vim-mode-change`, so a re-enable does not add a second one. */
    const vimSub = useRef<{ off: () => void } | null>(null);

    /**
     * Listen to the Vim plugin's mode, and report the one it opens in.
     *
     * `getCM(view)` is the plugin's CM5 facade and `vim-mode-change` is the event CM5's Vim emits; the
     * word that comes out of it is what the runner's badge prints. One subscription per enable —
     * `detachVim` runs before the compartment is reconfigured, because the plugin (and its facade) are
     * replaced when it is.
     */
    const attachVim = useCallback((view: EditorView, mod: VimModule) => {
      const cm = mod.getCM(view);
      if (!cm) return;
      const report = (event: { mode?: string; subMode?: string }) => {
        const mode = [event?.mode, event?.subMode].filter(Boolean).join(' ');
        onVimModeRef.current?.(mode || 'normal');
      };
      cm.on('vim-mode-change', report);
      vimSub.current = { off: () => cm.off('vim-mode-change', report) };
      // A fresh editor starts in normal mode; the plugin says nothing until the first change.
      onVimModeRef.current?.('normal');
    }, []);

    const detachVim = useCallback(() => {
      vimSub.current?.off();
      vimSub.current = null;
      vimApplied.current = false;
    }, []);

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
        setInlineValues: (entries: InlineValueAt[]) => {
          const view = viewRef.current;
          if (view) applyInlineValues(view, entries);
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
          // The Vim plugin's slot, empty until the module has loaded and the keys were asked for:
          // it sits before every other keymap, which is what the package's README asks for (in
          // normal mode it has to see the key first). `vimMode` arrives asynchronously below.
          vimSlot.current.of([]),
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
          // ⌘-click, the other half of the gesture: the caret moves to the clicked name and the
          // runner is asked for its definition. A plain click is left entirely to CodeMirror.
          EditorView.domEventHandlers({
            mousedown: (event, view) => {
              if (!(event.metaKey || event.ctrlKey) || !onDefinitionRef.current) return false;
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (pos === null) return false;
              const at = symbolAt(view.state.doc.toString(), pos);
              if (!at || at.attribute) return false;
              event.preventDefault();
              view.dispatch({ selection: { anchor: at.from } });
              onDefinitionRef.current(at.name);
              return true;
            },
          }),
          keymap.of([
            // F9 arms the caret's line, the keyboard route to the gutter. Absent without a handler,
            // so a read-only helper leaves the key alone.
            ...(onToggleBreakpoint
              ? [
                  {
                    key: 'F9',
                    run: (view: EditorView) => {
                      const line = view.state.doc.lineAt(view.state.selection.main.head).number;
                      view.dom.dispatchEvent(
                        new CustomEvent(BREAKPOINT_TOGGLE_EVENT, { detail: { line }, bubbles: true })
                      );
                      return true;
                    },
                  },
                ]
              : []),
            // First, so it wins over anything CodeMirror binds to F12 (nothing today). A name the
            // editor cannot resolve returns `false` and the key falls through untouched.
            {
              key: 'F12',
              run: (view) => {
                const at = symbolAt(view.state.doc.toString(), view.state.selection.main.head);
                if (!at || at.attribute || !onDefinitionRef.current) return false;
                onDefinitionRef.current(at.name);
                return true;
              },
            },
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
          inlineValueField,
          // Only where a cell can be run: a read-only helper with a `# %%` in it gets no buttons.
          ...(onRunCell ? [cellField] : []),
          // Only where a line can be armed: the read-only helper gets no gutter, so it also gets no
          // column of slots that would suggest one.
          ...(onToggleBreakpoint ? [breakpointGutter] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
            // A dot is held as a position, so an edit above it moved it. The line numbers it now sits
            // on are what the runner stores and what the next run is sent; a report is made only when
            // they differ from the list the runner already holds, or every keystroke would write.
            if (update.docChanged && onToggleBreakpointRef.current) {
              const lines = armedLines(update.state);
              const key = lines.join(',');
              if (key !== reportedBreakpointsKey.current) {
                reportedBreakpointsKey.current = key;
                onBreakpointsMovedRef.current?.(lines);
              }
            }
            if (update.transactions.some((tr) => tr.annotation(sliderAnnotation))) {
              onSliderRef.current?.();
            }
          }),
        ],
      });
      const view = new EditorView({ state, parent: host });
      viewRef.current = view;
      // The cell button's own event, listened for on the editor's element (it bubbles from the button).
      const onCellRun = (event: Event) => {
        const index = (event as CustomEvent<{ index?: number }>).detail?.index;
        if (typeof index === 'number') onRunCellRef.current?.(index);
      };
      view.dom.addEventListener(CELL_RUN_EVENT, onCellRun);
      // The gutter's click, bubbled from the slot (`breakpointGutter.ts`).
      const onBreakpointToggle = (event: Event) => {
        const line = (event as CustomEvent<{ line?: number }>).detail?.line;
        if (typeof line === 'number') onToggleBreakpointRef.current?.(line);
      };
      view.dom.addEventListener(BREAKPOINT_TOGGLE_EVENT, onBreakpointToggle);
      // The paint reading's third moment: the editor exists where the placeholder stood. `fcp` already
      // covered the lesson text and the code, so this is what the lazy boundary costs (`paintTiming.ts`).
      markPaintReady('editor');
      // A jump that landed in this file arrives with its line, because the tab switch mounted this
      // editor after the decision was made (`PythonEditorProps.initialLine`).
      if (initialLine && Number.isFinite(initialLine)) revealLine(view, initialLine);
      // The scroller is a scroll container of its own, so it takes a tab stop: CodeMirror focuses the
      // editable content, which scrolls only with the caret, so without this a keyboard user has no
      // way to page through a long file while leaving the cursor where it is (WCAG 2.1.1; axe's
      // `scrollable-region-focusable` names exactly this element).
      view.scrollDOM.setAttribute('tabindex', '0');
      // The column is a picture of state, so it needs a sentence saying what a click does: a dot that
      // only appears after the first click would be a feature nobody finds.
      view.dom
        .querySelector('.cm-breakpoint-gutter')
        ?.setAttribute('title', 'Click a line to break there (or press F9 with the cursor on it)');

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
        inlineValues: () =>
          [...view.dom.querySelectorAll<HTMLElement>('.cm-inline-value')].map((element) => ({
            name: element.dataset.inlineName ?? '',
            value: element.dataset.inlineValue ?? '',
          })),
      };
      window.__mechalabEditors = { ...(window.__mechalabEditors ?? {}), [testId]: bridge };

      return () => {
        detachVim();
        view.dom.removeEventListener(CELL_RUN_EVENT, onCellRun);
        view.dom.removeEventListener(BREAKPOINT_TOGGLE_EVENT, onBreakpointToggle);
        view.destroy();
        viewRef.current = null;
        if (window.__mechalabEditors?.[testId] === bridge) {
          delete window.__mechalabEditors[testId];
        }
      };
      // The document is synced by the effect below; mounting once per editor instance is the point.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [testId, readOnly, ariaLabel]);

    // The Vim preference changed: reconfigure this editor instead of mounting another one, so the
    // document, the undo history and the caret survive the toggle. Also runs on mount, which is how a
    // remembered `on` reaches an editor whose state was created before the plugin had loaded.
    useEffect(() => {
      const view = viewRef.current;
      if (!view || vimApplied.current === vimMode) return;
      detachVim();
      // Turning it off is synchronous: the plugin is already in memory, and there is nothing to load.
      if (!vimMode) {
        view.dispatch({ effects: vimSlot.current.reconfigure([]) });
        // Nothing to read any more: the runner drops its badge on this word.
        onVimModeRef.current?.('');
        return;
      }
      let cancelled = false;
      void loadVim()
        .then((mod) => {
          // Off again before the chunk arrived, or this editor is gone: the wish was withdrawn.
          if (cancelled || !viewRef.current) return;
          vimApplied.current = true;
          view.dispatch({ effects: vimSlot.current.reconfigure(mod.vim()) });
          // Read after the dispatch: the plugin builds its CM5 facade when it is installed.
          attachVim(view, mod);
        })
        .catch((error: unknown) => {
          // A chunk that never arrived (offline, or a deploy that replaced the file). The editor is
          // unchanged and still works; the badge says the keys are not there rather than pretending.
          console.warn('The Vim keymap could not be loaded; the editor keeps its plain keys.', error);
          if (!cancelled) onVimModeRef.current?.('unavailable');
        });
      return () => {
        cancelled = true;
      };
    }, [vimMode, attachVim, detachVim]);

    // The dots follow the runner's list: a lesson switch, a click, or a list read back from storage.
    // Declared after the mount effect, so the first run of this effect finds the view.
    useEffect(() => {
      const view = viewRef.current;
      if (!view || !onToggleBreakpointRef.current) return;
      // The runner's list is now the one this editor holds: a report echoing it back would be a
      // write per edit.
      reportedBreakpointsKey.current = breakpointsKey;
      view.dispatch({ effects: setBreakpointLines.of(breakpoints) });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the joined key is the value
    }, [breakpointsKey, testId]);

    // External changes: a different lesson, Load Solution, Reset starter. The learner's own keystrokes
    // arrive here too and are already equal to the document, so nothing is dispatched twice.
    useIsomorphicLayoutEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === value) return;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        // A replaced document has no positions to map — every dot would land on the end of the new
        // file — so the list is re-seeded from the lines the runner holds. Load Solution and a
        // restored draft then leave the dots on the lines they name.
        ...(onToggleBreakpointRef.current
          ? { effects: setBreakpointLines.of(breakpointsRef.current) }
          : {}),
      });
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
