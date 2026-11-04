import React, { useEffect, useRef, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import type { PythonEditorHandle } from '../PythonEditor';
import { RunnerEditorCard } from './runner/RunnerEditorCard';
import { BreakpointPanel } from './runner/BreakpointPanel';
import { TracePanel } from '../TracePanel';
import { WorkflowPanel } from '../WorkflowPanel';
import { Notebook } from '../Notebook';
import {
  breakpointsForRun,
  readBreakpoints,
  setBreakpointCondition,
  toggleBreakpoint,
  writeBreakpoints,
  type Breakpoint,
} from '../../editor/breakpoints';
import { StudioMore, type StudioRunSnapshot } from './studio/StudioMore';
import { useMediaQuery } from '../../useMediaQuery';
import { readVim, writeVim } from '../../vimMode';
import {
  STORAGE_KEY_STUDIO_PANES,
  STUDIO_PANES,
  readPanes,
  writePanes,
  showView,
  type EditorPanes,
} from '../../editorPanes';
import { readStudioView, writeStudioView, type StudioView } from '../../studioView';
import {
  MAX_STUDIO_NOTE_CHARS,
  STARTER_CODE,
  saveStudio,
  readStudio,
  type StudioDoc,
} from '../../studio/store';
import {
  createScratchRunner,
  type ScratchResult,
  type ScratchRunner,
  type ScratchStatus,
} from '../../studio/pythonRun';

/**
 * The free-study workspace (`components/tabs/TabStudio.tsx`).
 *
 * The runner is built around a lesson: a starter, an expected output, a check that decides whether
 * the program is finished. This tab is the other half of self-paced study — a place to write a
 * program nobody graded, sketch the plan behind it, and keep the note that made it click, without
 * choosing an exercise first.
 *
 * Three decisions this view keeps:
 *
 * 1. **Nothing is graded and nothing is recorded as progress.** The program is sent without
 *    instructor tests or a bench; no draft, verified flag, study note, review card or sitting is
 *    written here. The only record is the studio's own store.
 * 2. **The note is always beside the work on a desktop.** Code and Plan are two views of one main
 *    area, not two pages: a learner moving between the program and the diagram should not lose the
 *    sentence they were writing. A phone shows one of the three at a time because three panes at
 *    390 px is three panes too many.
 * 3. **The diagram is the workflow panel, not a second copy of it.** The same cards, arrows,
 *    templates, checklist and undo live under a reserved document key (`studio`), so a plan drawn
 *    here is a real workflow, rides the backup, and cannot drift from the one the lesson tab draws.
 */

const NOT_SAVED = 'Not saved — storage is blocked or full';

const RUNTIME: Record<ScratchStatus, string> = {
  idle: 'Python loads on the first Run.',
  loading: 'Loading Python…',
  running: 'Running…',
  ready: 'Python ready.',
  error: 'Python did not load. Press Run to retry.',
};

export const TabStudio: React.FC = () => {
  const [doc, setDoc] = useState<StudioDoc>(() => readStudio());
  // The header's choice is a preference (`studioView.ts`): a learner who works from the plan comes
  // back to the plan, and a phone keeps whichever of the three pages it was reading.
  const [view, setView] = useState<StudioView>(() => readStudioView());
  const phone = useMediaQuery('(max-width: 1023px)');
  const [saveState, setSaveState] = useState('');
  const [runtime, setRuntime] = useState<ScratchStatus>('idle');
  const [result, setResult] = useState<ScratchResult | null>(null);
  // The trace belongs to the run that produced it; the source is the text that ran, not the editor's
  // current text, so a step's quoted line is never a line the program did not execute.
  const [traceStep, setTraceStep] = useState(0);
  const [traceSource, setTraceSource] = useState('');
  // A park is shown where the run is, with Continue and Stop: a breakpoint that silently held the
  // page for the 30 s kill clock would be worse than no breakpoint at all.
  const [pausedLine, setPausedLine] = useState<number | null>(null);
  // Breakpoints are per surface, under the studio's own key, so arranging or arming the scratch
  // editor cannot touch a lesson's debugger state.
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>(() => readBreakpoints('studio'));
  const [breakpointsOpen, setBreakpointsOpen] = useState(false);
  const runner = useRef<ScratchRunner | null>(null);
  // The editor is the runner's own card (`runner/RunnerEditorCard.tsx`), so the studio gets the same
  // tabs, panes and editor settings a lesson does. The result views are the ones this surface really
  // has: the run output, because nothing here has an expected output or a prediction to grade.
  // The card's own key, not the lesson editor's: a learner who arranges this card has arranged the
  // studio, and the runner's split belongs to a different workspace (`editorPanes.ts`). The default
  // is the shape this card has always had — code above the run output — and a missing, corrupt or
  // half-written entry falls back to it rather than to a blank pane.
  const [panes, setPanes] = useState<EditorPanes>(() =>
    readPanes(STORAGE_KEY_STUDIO_PANES, STUDIO_PANES)
  );
  const commitPanes = (next: EditorPanes) => setPanes(writePanes(next, STORAGE_KEY_STUDIO_PANES));
  const [moreOpen, setMoreOpen] = useState(false);
  const [history, setHistory] = useState<StudioRunSnapshot[]>([]);
  const [formatNote, setFormatNote] = useState('');
  const editorPanelRef = useRef<HTMLDivElement | null>(null);
  const mainEditorRef = useRef<PythonEditorHandle | null>(null);
  const [vimOn, setVimOn] = useState<boolean>(() => readVim());
  const [vimMode, setVimMode] = useState<string>('normal');
  // What the store would be if the tab closed now. Refs rather than state because the debounce and
  // the unmount write read the text that is on screen, not the render that scheduled them.
  const latest = useRef(doc);
  latest.current = doc;
  const dirty = useRef(false);

  const update = (patch: Partial<Pick<StudioDoc, 'code' | 'note'>>) => {
    setDoc((previous) => ({ ...previous, ...patch }));
    dirty.current = true;
    setSaveState('');
  };

  // The box saves once the learner pauses, like the lesson's note. A refused write leaves the flag
  // set, so leaving the tab is one more attempt and the line says why a reload may not show it.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => {
      const landed = saveStudio({ code: latest.current.code, note: latest.current.note });
      if (landed) dirty.current = false;
      setSaveState(landed ? 'Saved' : NOT_SAVED);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [doc.code, doc.note]);

  // Closing the tab is the other half of that debounce: a sentence typed and left inside half a
  // second is still a sentence. The worker goes with it — a loaded interpreter is not a reason to
  // keep a closed studio alive.
  useEffect(
    () => () => {
      if (dirty.current) saveStudio({ code: latest.current.code, note: latest.current.note });
      runner.current?.dispose();
    },
    []
  );

  const run = () => {
    if (!runner.current) {
      runner.current = createScratchRunner(setRuntime, (step) =>
        setPausedLine(step?.line ?? null)
      );
    }
    const runCode = latest.current.code;
    setResult(null);
    setPausedLine(null);
    setTraceStep(0);
    setTraceSource(runCode);
    const armed = breakpointsForRun(runCode, breakpoints);
    void runner.current.run(runCode, armed).then((next) => {
      setResult(next);
      setHistory((previous) =>
        [
          {
            code: runCode,
            output: next.stdout || next.stderr || (next.ok ? '(no output)' : ''),
            ok: next.ok,
            at: Date.now(),
          },
          ...previous,
        ].slice(0, 8)
      );
    });
  };

  const stopRun = () => {
    runner.current?.stop();
    setPausedLine(null);
  };

  const commitBreakpoints = (entries: Breakpoint[]) => {
    setBreakpoints(writeBreakpoints('studio', entries));
  };
  const toggleBreakpointAt = (line: number) => {
    setBreakpoints((entries) => writeBreakpoints('studio', toggleBreakpoint(entries, line)));
  };
  const setBreakpointConditionAt = (line: number, condition: string) => {
    setBreakpoints((entries) =>
      writeBreakpoints('studio', setBreakpointCondition(entries, line, condition))
    );
  };

  const output = result
    ? result.stdout || (result.stderr ? '' : result.ok ? '(no output)' : '')
    : 'Nothing run yet — press Run.';

  const notePane = (
    <div
      data-testid="studio-note-pane"
      className="rounded-xl border border-line bg-panel p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[13px] text-accent">
          <NotebookPen className="h-4 w-4" aria-hidden="true" />
          Notebook
        </span>
        <span data-testid="studio-note-status" className="text-[11px] text-muted">
          {saveState || 'Saved on this device'}
        </span>
      </div>
      <Notebook
        id="studio-note"
        testId="studio-note"
        value={doc.note}
        onChange={(next) => update({ note: next })}
        label="What clicked, what to try next. Saved on this device."
        placeholder="e.g. The tolerance is on the angle, not the position."
        rows={phone ? 8 : 14}
        maxLength={MAX_STUDIO_NOTE_CHARS}
        className="mt-2"
      />
    </div>
  );

  const resetCode = () => {
    update({ code: STARTER_CODE });
    setResult(null);
    setMoreOpen(false);
  };

  const resetRuntime = () => {
    runner.current?.dispose();
    runner.current = null;
    setRuntime('idle');
    setResult(null);
    setPausedLine(null);
    setTraceSource('');
    setMoreOpen(false);
  };

  const formatCode = () => {
    setMoreOpen(false);
    if (!runner.current) runner.current = createScratchRunner(setRuntime);
    const target = runner.current;
    const source = latest.current.code;
    setFormatNote('Formatting…');
    void target.format(source).then((answer) => {
      if (answer.formatted) {
        update({ code: answer.formatted });
        setResult(null);
        setFormatNote('Formatted with Black');
      } else {
        setFormatNote(answer.error || answer.unavailable || 'Format did not change the file');
      }
    });
  };

  const copyCode = () => {
    void navigator.clipboard?.writeText(doc.code).catch(() => {});
    setMoreOpen(false);
  };

  const downloadCode = () => {
    const blob = new Blob([doc.code], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'studio.py';
    anchor.click();
    URL.revokeObjectURL(url);
    setMoreOpen(false);
  };

  const openWorkflow = () => {
    if (phone) setView(writeStudioView('code'));
    commitPanes(showView(panes, 'workflow'));
    setMoreOpen(false);
  };

  /** The card's toolbar slot: the run controls and the one editor setting a scratch file has. */
  const studioToolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        data-testid="studio-run"
        onClick={run}
        disabled={runtime === 'running' || runtime === 'loading'}
        className="btn btn-primary text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Run
      </button>
      <button
        type="button"
        data-testid="studio-stop"
        onClick={stopRun}
        disabled={runtime !== 'running' && runtime !== 'loading'}
        className="btn btn-ghost text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Stop
      </button>
      <button
        type="button"
        data-testid="studio-vim"
        aria-pressed={vimOn}
        onClick={() => {
          const next = !vimOn;
          setVimOn(next);
          writeVim(next);
        }}
        title="Read the editor's keys as Vim: normal, insert and the motions between"
        className="btn btn-ghost text-[12.5px] aria-pressed:bg-accent aria-pressed:text-inverse"
      >
        Vim
      </button>
      <StudioMore
        open={moreOpen}
        onToggle={() => setMoreOpen((on) => !on)}
        onClose={() => setMoreOpen(false)}
        onResetCode={resetCode}
        onResetRuntime={resetRuntime}
        onFormat={formatCode}
        onCopyCode={copyCode}
        onDownloadCode={downloadCode}
        onOpenWorkflow={openWorkflow}
        onToggleBreakpoints={() => {
          setBreakpointsOpen((open) => !open);
          setMoreOpen(false);
        }}
        breakpointsOpen={breakpointsOpen}
        breakpointCount={breakpoints.length}
        history={history}
        onRestore={(entry) => {
          update({ code: entry.code });
          setMoreOpen(false);
        }}
        onClearHistory={() => setHistory([])}
      />
    </div>
  );

  /** The run output, in the card's own pane rather than a block under it. */
  const studioOutput = (
    <div className="bg-canvas p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted">Output</div>
      <pre
        data-testid="studio-output"
        aria-live="polite"
        className="mt-1 min-h-[72px] overflow-auto whitespace-pre-wrap font-mono text-[12.5px] text-body"
      >
        {output}
      </pre>
      {result?.stderr ? (
        <pre
          data-testid="studio-stderr"
          className="mt-1 whitespace-pre-wrap font-mono text-[12.5px] text-rose"
        >
          {result.stderr}
        </pre>
      ) : null}
    </div>
  );

  /** The last run's trace, replayed. A run with no trace still shows the tab and says how to get one. */
  const studioTrace = (
    <div data-testid="studio-trace-pane" className="bg-canvas p-2.5">
      {result?.trace ? (
        <TracePanel
          trace={result.trace}
          step={traceStep}
          onStep={setTraceStep}
          source={traceSource}
          onReveal={(line) => mainEditorRef.current?.revealLine(line)}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-line px-3 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">Trace</p>
          <p className="mt-1 text-[12px] text-muted">
            Run the program to record every line it executes. The last run&apos;s trace is replayed
            here, step by step, with the values its frame held.
          </p>
        </div>
      )}
    </div>
  );

  /** A breakpoint stopped the interpreter: the run is alive and waiting on Continue. */
  const studioPaused = pausedLine !== null && (
    <div
      data-testid="studio-paused"
      role="status"
      className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber/50 bg-amber/10 px-2.5 py-2"
    >
      <span className="font-mono text-[11.5px] text-amber">
        Paused at line {pausedLine} · the interpreter is waiting
      </span>
      <button
        type="button"
        data-testid="studio-continue"
        onClick={() => {
          runner.current?.continue();
          setPausedLine(null);
        }}
        className="btn btn-primary text-[12px]"
      >
        Continue
      </button>
      <button type="button" data-testid="studio-stop-paused" onClick={stopRun} className="btn btn-ghost text-[12px]">
        Stop
      </button>
    </div>
  );

  /** The learner's plan, also available as a view of the editor rather than only the Plan page. */
  const studioWorkflow = (
    <div data-testid="studio-workflow-pane" className="bg-canvas p-2.5">
      <WorkflowPanel lessonId="studio" lessonTitle="Free study" />
    </div>
  );

  // The runner's editor card, ungraded: same tabs, same splittable panes, same editor settings, with
  // the views this workspace can honestly offer (the run output and the workflow). What is absent is
  // absent on purpose rather than wired to a no-op: no prediction (nothing to forecast), no expected
  // output (nothing graded), no lesson files or go-to-definition (there is no second file), and no
  // analysis, inline values or run-to-a-cell (studio/pythonRun.ts sends no analysis channel and no
  // cell budget, so a control that offered any of them would do nothing). Breakpoints and the Trace
  // tab are wired: the studio sends its own armed lines and reads the same recording a lesson does.
  const codePane = (
    <div data-testid="studio-code" className="min-w-0">
      {studioPaused}
      <RunnerEditorCard
        surface={{
          panelRef: editorPanelRef,
          phoneCode: phone,
          editorShown: true,
          resultsAllowed: true,
          phoneEditorVisible: true,
          isPhone: phone,
          deferPhoneEditor: false,
        }}
        draft={{
          code: doc.code,
          commitCode: (next) => update({ code: next }),
          mainEditorRef,
          helperEditorRef: mainEditorRef,
          helperFiles: [],
          openHelper: null,
          onOpenHelper: () => {},
          pendingJump: null,
          onClearJump: () => {},
          symbolMiss: null,
          sliderCount: 0,
          vim: { on: vimOn, mode: vimMode, onMode: setVimMode },
          lesson: { id: 'studio', question: '', goal: '' },
          onSliderCommit: () => {},
          breakpoints: {
            entries: breakpoints,
            onToggle: toggleBreakpointAt,
            onMoved: commitBreakpoints,
          },
          editorTestId: 'editor-studio',
        }}
        panes={{ value: panes, onPanes: commitPanes }}
        run={{
          isRunning: runtime === 'running' || runtime === 'loading',
          passStatus: 'untested',
          harnessResult: null,
          asksForFinish: false,
        }}
        slots={{
          toolbar: studioToolbar,
          feedback: null,
          actualOutputPane: studioOutput,
          expectedOutputPane: null,
          workflowPane: studioWorkflow,
          tracePane: studioTrace,
        }}
        collab={{ coEdit: null, collabNotice: null, peerLabel: null }}
        resultViews={['actual', 'workflow', 'trace']}
      />
      <BreakpointPanel
        open={breakpointsOpen}
        breakpoints={breakpoints}
        onSetCondition={setBreakpointConditionAt}
        onToggle={toggleBreakpointAt}
      />
    </div>
  );

  const mainView: StudioView = phone ? view : view === 'note' ? 'code' : view;

  return (
    <div data-testid="studio" className="mx-auto w-full max-w-[1400px] px-3.5 py-4 sm:px-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">
            Free study <span className="text-faint">· nothing here is graded</span>
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-muted">
            A scratch editor, a plan and a note. No lesson — saved on this device.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span data-testid="studio-python-status" className="text-[11px] text-muted">
            {RUNTIME[runtime]}
          </span>
          {formatNote && (
            <span data-testid="studio-format-status" className="text-[11px] text-muted">
              {formatNote}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Studio view">
            {(
              [
                ['code', 'Code'],
                ['plan', 'Plan'],
                ...(phone ? [['note', 'Note'] as const] : []),
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`studio-view-${id}`}
                aria-pressed={mainView === id}
                onClick={() => setView(writeStudioView(id))}
                className="btn btn-ghost text-[12.5px] aria-pressed:bg-accent aria-pressed:text-inverse"
              >
                {label}
              </button>
            ))}
          </span>
        </div>
      </header>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          {mainView === 'code' ? (
            codePane
          ) : mainView === 'plan' ? (
            <div data-testid="studio-plan" className="min-w-0">
              <WorkflowPanel lessonId="studio" lessonTitle="Free study" />
            </div>
          ) : (
            notePane
          )}
        </section>
        {!phone && <aside className="min-w-0">{notePane}</aside>}
      </div>
    </div>
  );
};
