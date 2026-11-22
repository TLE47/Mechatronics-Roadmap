/**
 * The editor as the runner imports it: a thin, always-resident shell around the CodeMirror module.
 *
 * CodeMirror and its Python parser are ~149 kB gzipped, and they are the largest thing the opening tab
 * used to wait for. This file keeps the props, the handle type and a placeholder that paints the
 * learner's code immediately, and the real editor arrives through `React.lazy`
 * ([`pythonEditorImpl.tsx`](pythonEditorImpl.tsx)) — so the lesson text, the Run button and the starter
 * are on screen before the editor is parsed (`docs/weight-budget.json`, the `entry_gzip` metric).
 *
 * Three consequences worth knowing, all pinned by `npm run test:editor:deferred`:
 *
 * - `window.__mechalabEditors[testId]` does not exist until the chunk lands. The bridge is a
 *   post-mount promise, and `scripts/editor-code.mjs`'s `waitForEditor` is how a suite waits for it.
 * - The wrapper stays mounted while the module loads, so a `ref` held by the runner is attached for
 *   the component's whole life; the impl fills it when it mounts. A `focus()` or `revealLine()` asked
 *   in that first moment does nothing rather than throwing.
 * - A chunk that never arrives is caught here. Without the boundary below, a deploy that replaced the
 *   hashed file (or an offline visit that precached an index naming it) would throw out of the lazy
 *   component, and an app with no other boundary would unmount entirely — the lesson, the Run button
 *   and the learner's own code with it. The placeholder stays instead, says so, and Run still works.
 */

import React, { Suspense, forwardRef } from 'react';
import type { AnalysisSession } from '../analysisClient';
import type { Breakpoint } from '../editor/breakpoints';
import type { InlineValueAt } from '../inlineValues';

/** The imperative surface the runner (and the browser suites) need. */
export interface PythonEditorHandle {
  focus: () => void;
  getValue: () => string;
  setValue: (text: string) => void;
  /**
   * Replace the document with text this editor did not type — a peer's edit in a co-editing session.
   *
   * The smallest change that reaches `text`, applied **outside the undo history**: ⌘Z undoes what this
   * workbench typed, not what the other one did. Without that separation one undo would reach across
   * two people's work and put the document back to a state neither of them is editing, which is the
   * "whose undo?" question the pair sheet answers by giving each person their own.
   */
  applyWithoutHistory: (text: string) => void;
  /** Put the cursor at the start of a 1-based line and scroll it into view. */
  revealLine: (line: number) => void;
  /**
   * Draw the robot's rectangle around a 1-based line, or clear it with null. Unlike `revealLine`
   * this is a decoration, not a selection: the learner's caret and selection stay where they were.
   */
  setRunLine: (line: number | null) => void;
  /**
   * Draw the values a run left beside their assignment lines; `[]` clears them. The editor clears
   * them itself on the next edit, because a value describes one run of one document.
   */
  setInlineValues: (entries: InlineValueAt[]) => void;
  /**
   * Insert text at the caret and put the caret back in the document.
   *
   * The phone keyboard (`components/MobilePythonKeyboard.tsx`) is outside the editable surface, so
   * a tap otherwise leaves focus on the button and the next keyboard press goes nowhere. Going
   * through the view keeps React's `value` and the document in step, the same reason the suites use
   * the bridge.
   */
  insertText: (text: string) => void;
  /** Delete the selection, or one character before the caret when nothing is selected. */
  backspace: () => void;
  /** Indent the caret's line, or every line a selection touches. */
  indent: () => void;
  /** Remove one indentation step from the caret's line or the selected lines. */
  dedent: () => void;
  /** Insert a newline and the indentation the new line needs. */
  insertNewLine: () => void;
  /** Insert four spaces at the caret, the project's one tab width. */
  insertTab: () => void;
  /** Undo through CodeMirror's history. */
  undo: () => void;
  /** Redo through CodeMirror's history. */
  redo: () => void;
  /** Copy the selected text, or the caret's whole line, directly after itself. */
  duplicate: () => void;
  /** Delete the selection, or the caret's whole line when nothing is selected. */
  deleteLine: () => void;
  /** Let go of the editing surface, so the phone's own keyboard can close. */
  blur: () => void;
  /**
   * Ask for the phone's own keyboard inside the press that chose it.
   *
   * The `keyboardMode` prop removes `inputmode=none` on the next render, but a focus taken
   * outside the tap's gesture may not raise the OS keyboard on iOS. This does the removal and the
   * focus synchronously, while the tap still counts as the user's.
   */
  openNativeKeyboard: () => void;
}

export interface PythonEditorProps {
  value: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
  /** Accessible name for the editing surface. */
  ariaLabel: string;
  /** Stable id: `editor-main`, `editor-helper`. Also the key in the test bridge below. */
  testId: string;
  /** Called (debounced by the caller) when a slider drag changed the code. */
  onSliderCommit?: () => void;
  /**
   * A name the learner asked to go to: `F12`, or ⌘-click on it.
   *
   * The editor reports the name and nothing else — deciding which file defines it belongs to the
   * runner, which is the only place that knows what the lesson's files are (`symbolIndex.ts`).
   */
  onGoToDefinition?: (name: string) => void;
  /**
   * A `# %%` cell's **Run to here** button was pressed.
   *
   * Only the main editor gets one: a read-only helper has no cells to run, and the runner is the only
   * thing that can start a program (`app/src/editor/cells.ts`).
   */
  onRunCell?: (index: number) => void;
  /**
   * The gutter slot beside a line was clicked, or `F9` was pressed on the caret line.
   *
   * The editor reports the line and nothing else: the list is per lesson, persisted, and travels with
   * the run, so the runner owns it (`app/src/editor/breakpoints.ts`). No handler, no gutter — a
   * read-only helper is a file the learner is reading, not debugging.
   */
  onToggleBreakpoint?: (line: number) => void;
  /**
   * An edit carried a dot to another line, and these are the entries it now sits on.
   *
   * A breakpoint is held inside the editor as a document position so CodeMirror can map it through a
   * change — its condition rides with it, so a park narrowed to `n == 3` stays narrowed after a line
   * is inserted above. The line numbers are what the runner stores and sends with the next run
   * (`app/src/editor/breakpointState.ts`). Reported only when an entry actually changed.
   */
  onBreakpointsMoved?: (entries: Breakpoint[]) => void;
  /**
   * The parks that should show a dot. Drawn, not owned: the runner decides, and a click it refuses
   * leaves the gutter saying what is actually armed.
   */
  breakpoints?: Breakpoint[];
  /**
   * Read the keys as Vim: normal mode, insert mode, `dd`, `u`, the lot.
   *
   * Only the main editor takes it. A read-only helper is a file the learner is looking at rather than
   * writing, and the plugin's whole vocabulary of edits would be a vocabulary of refusals there.
   */
  vimMode?: boolean;
  /** The mode the plugin is in, as it changes: `normal`, `insert`, `visual line` (`vimMode.ts`). */
  onVimMode?: (mode: string) => void;
  /**
   * The line to put the cursor on when this editor mounts.
   *
   * Used when a jump lands in the *other* file: the tab switch unmounts one editor and mounts the
   * other, so the line has to be part of the mount rather than a call on a ref that does not exist
   * yet.
   */
  initialLine?: number;
  /**
   * The line to mark with the run box, or null to clear it.
   *
   * A prop rather than only the imperative handle because the pane that owns this editor can be
   * mounted by a view change: a call made before the lazy impl attaches its ref would be lost, and
   * the box is what makes the Trace tab's step visible in the code. The robot keeps using
   * `setRunLine` while a run is live; this prop is the resting value.
   */
  runLine?: number | null;
  /**
   * The line Python failed on, with the exception summary drawn quietly above it.
   *
   * A prop rather than only an imperative call for the same reason as `runLine`: the pane can be
   * mounted by a preset change, and a failure that arrived while it was away must still be marked.
   */
  errorLine?: { line: number; message: string } | null;
  /**
   * Whether hovering a name and typing inside a call may open a `cm-mechalab-tip` card.
   *
   * Off removes both the hover card and signature help; completion, linting and inline values are
   * separate surfaces and stay on. A read-only helper never gets these cards in the first place.
   */
  tooltipsEnabled?: boolean;
  /**
   * The worker's analysis channel, or null while there is none.
   *
   * A getter rather than a session, because the runner may replace the worker (Reset Runtime) and the
   * completion source must ask the *current* one. Null means the interpreter is not up yet or the
   * analyzers could not be installed: the source then answers from the keywords it always had.
   */
  getAnalysis?: () => AnalysisSession | null;
  /**
   * How the phone keyboard is drawing this editor.
   *
   * `custom` suppresses the OS keyboard with `inputmode=none`, because the custom keys are the
   * keyboard; `native` removes that and focuses the surface so the OS keyboard can open; `off`
   * leaves the surface exactly as it was before the keyboard existed.
   */
  keyboardMode?: 'off' | 'custom' | 'native';
  /**
   * The editing surface took or lost the caret.
   *
   * The phone keyboard's visibility belongs to the pane, not to the editor: this reports the event
   * only, and `EditorCodePane` decides whether what received the focus keeps the keys on screen.
   * `related` is the element taking the focus on a blur, which is the one fact that decision needs.
   */
  onFocusChange?: (focused: boolean, related: EventTarget | null) => void;
  className?: string;
}

/** One loader for the module: a second call returns the same chunk from the module map. */
const loadEditorImpl = () => import('./pythonEditorImpl');

const EditorImpl = React.lazy(() =>
  loadEditorImpl().then((module) => ({ default: module.PythonEditorImpl }))
);

/**
 * Start fetching the editor's chunk without rendering it.
 *
 * Called by the runner where a press is likely but not certain (the helper tab is in the tab list of
 * every lesson that has one). It is the same module the lazy boundary asks for, so a prefetch is
 * never work the page would not have done anyway.
 */
export function prefetchPythonEditor(): void {
  void loadEditorImpl().catch(() => undefined);
}

/**
 * What is on screen for the first frames: the code itself.
 *
 * Not a spinner and not an empty box. The starter is the thing the learner came to read, it is already
 * in memory as a string, and a monospace block at the editor's own size and metrics means the swap to
 * CodeMirror changes the surface's internals rather than the page's shape — the line box, the padding
 * and the minimum height are the theme's numbers (`app/src/editor/theme.ts`).
 *
 * The text is left padded by the gutter's width so the first character sits close to where CodeMirror
 * will draw it; the gutter is the one part that cannot be faked without a second layout engine.
 */
function EditorPlaceholder({
  value,
  testId,
  className,
  ariaLabel,
  notice,
}: PythonEditorProps & { notice?: string }) {
  return (
    <div className={className} data-editor={testId} data-editor-ready="false">
      <div
        role="status"
        aria-label={`${ariaLabel}: opening the editor`}
        data-testid={`${testId}-loading`}
        className="overflow-hidden"
        style={{
          minHeight: 'var(--editor-min-h, 288px)',
          maxHeight: 'var(--editor-max-h, 360px)',
          // Clipped rather than scrollable: a scroll container that is not keyboard reachable is an
          // axe finding, and this one exists for one frame. The editor's own scroller takes the tab
          // stop when it mounts.
          overflow: 'hidden',
          backgroundColor: 'var(--bg)',
          color: 'var(--dim)',
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
          fontSize: 'var(--editor-font-size, 12.5px)',
          lineHeight: 1.6,
        }}
      >
        {notice ? (
          <p
            data-testid={`${testId}-notice`}
            style={{ margin: 0, padding: '10px 12px 0 44px', color: 'var(--muted)' }}
          >
            {notice}
          </p>
        ) : null}
        <pre
          data-testid={`${testId}-preview`}
          className="whitespace-pre-wrap break-words"
          style={{ margin: 0, padding: '12px 12px 12px 44px' }}
        >
          {value}
        </pre>
      </div>
    </div>
  );
}

/**
 * The one failure a lazy boundary adds, caught where it happens.
 *
 * `React.lazy` marks its module rejected for the life of the page, so there is no retry to offer from
 * here: what the boundary owes the learner is that the screen they came for survives, with a sentence
 * saying which half is missing and what still works.
 */
class EditorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Quiet and named: the app is still usable, and the next deploy is the fix.
    console.warn('The editor could not be loaded; showing the code instead.', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The Python editor, with CodeMirror loaded on demand.
 *
 * The ref is forwarded straight to the lazy component: `React.lazy` passes the element's own `ref`
 * through to whatever it resolves to, so the runner's `guideEditorRef` needs no changed callers.
 */
export const PythonEditor = forwardRef<PythonEditorHandle, PythonEditorProps>(
  function PythonEditor(props, ref) {
    return (
      <EditorBoundary
        fallback={
          <EditorPlaceholder
            {...props}
            notice="The editor could not be loaded — this is your code, and Run still works. Reload to bring the editor back."
          />
        }
      >
        <Suspense fallback={<EditorPlaceholder {...props} />}>
          <EditorImpl {...props} ref={ref} />
        </Suspense>
      </EditorBoundary>
    );
  }
);
