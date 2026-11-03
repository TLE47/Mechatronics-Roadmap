import React, { useEffect, useRef, useState } from 'react';
import type { PythonEditorHandle } from '../PythonEditor';
import { RunnerEditorCard } from './runner/RunnerEditorCard';
import { WorkflowPanel } from '../WorkflowPanel';
import { useMediaQuery } from '../../useMediaQuery';
import { readVim, writeVim } from '../../vimMode';
import {
  STORAGE_KEY_STUDIO_PANES,
  STUDIO_PANES,
  readPanes,
  writePanes,
  type EditorPanes,
} from '../../editorPanes';
import { readStudioView, writeStudioView, type StudioView } from '../../studioView';
import {
  MAX_STUDIO_NOTE_CHARS,
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
    if (!runner.current) runner.current = createScratchRunner(setRuntime);
    setResult(null);
    void runner.current.run(latest.current.code).then(setResult);
  };

  const output = result
    ? result.stdout || (result.stderr ? '' : result.ok ? '(no output)' : '')
    : 'Nothing run yet — press Run.';

  const notePane = (
    <div
      data-testid="studio-note-pane"
      className="space-y-2 rounded-xl border border-line bg-panel p-4"
    >
      <label htmlFor="studio-note" className="block text-[12px] text-muted">
        Notebook — what clicked, what to try next. Saved on this device.
      </label>
      <textarea
        id="studio-note"
        data-testid="studio-note"
        value={doc.note}
        onChange={(event) => update({ note: event.target.value })}
        rows={phone ? 8 : 16}
        maxLength={MAX_STUDIO_NOTE_CHARS}
        placeholder="e.g. The tolerance is on the angle, not the position."
        className="w-full resize-y rounded-lg border px-2.5 py-2 font-mono text-[12.5px] outline-none"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--canvas)',
          color: 'var(--text)',
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span data-testid="studio-note-status">{saveState || 'Saved on this device'}</span>
        <span>
          {doc.note.length.toLocaleString()} / {MAX_STUDIO_NOTE_CHARS.toLocaleString()}
        </span>
      </div>
    </div>
  );

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
        onClick={() => runner.current?.stop()}
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

  // The runner's editor card, ungraded: same tabs, same splittable panes, same editor settings, with
  // the views this workspace can honestly offer (the run output) and none it cannot. What is absent
  // is absent on purpose rather than wired to a no-op: no prediction (nothing to forecast), no
  // expected output (nothing graded), no workflow pane (the Plan view is the same canvas, one press
  // away), no lesson files or go-to-definition (there is no second file), no analysis or inline
  // values and no breakpoint dots or run-to-a-cell (studio/pythonRun.ts sends no analysis channel, no
  // breakpoints and no cell budget, so a control that offered any of them would do nothing).
  const codePane = (
    <div data-testid="studio-code" className="min-w-0">
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
          lesson: { id: 'studio', question: '' },
          onSliderCommit: () => {},
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
          workflowPane: null,
        }}
        collab={{ coEdit: null, collabNotice: null, peerLabel: null }}
        resultViews={['actual']}
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
