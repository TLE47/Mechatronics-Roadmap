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

/** The imperative surface the runner (and the browser suites) need. */
export interface PythonEditorHandle {
  focus: () => void;
  getValue: () => string;
  setValue: (text: string) => void;
  /** Put the cursor at the start of a 1-based line and scroll it into view. */
  revealLine: (line: number) => void;
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
   * The worker's analysis channel, or null while there is none.
   *
   * A getter rather than a session, because the runner may replace the worker (Reset Runtime) and the
   * completion source must ask the *current* one. Null means the interpreter is not up yet or the
   * analyzers could not be installed: the source then answers from the keywords it always had.
   */
  getAnalysis?: () => AnalysisSession | null;
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
          minHeight: 288,
          maxHeight: 360,
          // Clipped rather than scrollable: a scroll container that is not keyboard reachable is an
          // axe finding, and this one exists for one frame. The editor's own scroller takes the tab
          // stop when it mounts.
          overflow: 'hidden',
          backgroundColor: 'var(--bg)',
          color: 'var(--dim)',
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
          fontSize: '12.5px',
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
