import { lazy, Suspense, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Lock } from 'lucide-react';
import { PythonEditor, type PythonEditorHandle } from '../../PythonEditor';
import { PredictPane } from './PredictPane';
import { RunVerdict } from './RunVerdict';
import { EditorGoalCard } from './EditorGoal';
import { resultTabMeta } from './resultTabMeta';
import { PythonKeys } from '../../PythonKeys';
import { MAIN_FILE_NAME, type LessonFile } from '../../../lessonFiles';
import {
  focusSlot,
  isSplit,
  showView,
  splitPane,
  slotFor,
  viewsForLayout,
  visibleViews,
  type EditorPanes,
  type EditorView,
} from '../../../editorPanes';
import type { WorkspaceLayout } from '../../../workspaceLayout';
import type { AnalysisSession } from '../../../analysisClient';
import type { HarnessGate } from '../../../harnessGrading';
import type { PredictGate } from './usePredictGate';
import { vimModeLabel as vimModeLabelFor } from '../../../vimMode';

// The pass conditions are only read when their tab is opened, so they do not belong in the first
// paint's chunk. The editor itself stays eager: it is the surface this card exists for.
const EditorRequirements = lazy(() =>
  import('./EditorRequirements').then((module) => ({ default: module.EditorRequirements }))
);
// Axis, Add, Swap and Close only exist after a split, so the arrangement is a second lazy boundary.
const EditorPaneArrangement = lazy(() =>
  import('./EditorPaneArrangement').then((module) => ({ default: module.EditorPaneArrangement }))
);

/** Which surface the card is on, and what that surface may show. */
interface EditorSurface {
  panelRef: RefObject<HTMLDivElement | null>;
  phoneCode: boolean;
  editorShown: boolean;
  /** The preset in force shows the run's results, so its tabs and panes belong on screen. */
  resultsAllowed: boolean;
  /** False on the phone's Lesson surface: the editor is hidden but stays mounted once opened. */
  phoneEditorVisible: boolean;
  isPhone: boolean;
  deferPhoneEditor: boolean;
  /** The preset in force where the card belongs to one; a lesson-less surface has no preset. */
  layout?: WorkspaceLayout;
}

/** The text in the editor, its writer, the files it may open, and the editor's own settings. */
interface EditorDraft {
  code: string;
  commitCode: (next: string) => void;
  mainEditorRef: RefObject<PythonEditorHandle | null>;
  helperEditorRef: RefObject<PythonEditorHandle | null>;
  helperFiles: LessonFile[];
  openHelper: string | null;
  onOpenHelper: (name: string | null) => void;
  pendingJump: { file: string; line: number; lesson: string } | null;
  onClearJump: () => void;
  symbolMiss: string | null;
  sliderCount: number;
  vim: { on: boolean; mode: string; onMode: (mode: string) => void };
  lesson: { id: string; question: string; goal: string; requirements: string[] };
  onSliderCommit: () => void;
  /** Null in a workspace with no interpreter to ask; the free-study editor has no lesson files. */
  getAnalysis?: () => AnalysisSession | null;
  onGoToDefinition?: (name: string) => void;
  onRunCell?: (line: number) => void;
  /** Absent where nothing can stop at a line, so the gutter offers no dot it cannot honour. */
  breakpoints?: {
    entries: { line: number; condition: string }[];
    onToggle: (line: number) => void;
    onMoved: (entries: { line: number; condition: string }[]) => void;
  };
  /** The test bridge id for the main editor; the runner's is `editor-main`. */
  editorTestId?: string;
}

/** The editor's panes and the arrangement they are drawn in. */
interface EditorPaneSet {
  value: EditorPanes;
  /** Write the arrangement. Everything else about the panes is a view of `value`. */
  onPanes: (next: EditorPanes) => void;
}

/** What the last run said, as the verdict and the gate's lead line read it. */
interface EditorRun {
  isRunning: boolean;
  passStatus: Parameters<typeof RunVerdict>[0]['passStatus'];
  harnessResult: HarnessGate | null;
  asksForFinish: boolean;
}

/** The regions laid out inside the card but owned by the caller. */
interface EditorSlots {
  toolbar: ReactNode;
  feedback: ReactNode;
  actualOutputPane: ReactNode;
  expectedOutputPane: ReactNode;
  casesPane?: ReactNode;
  workflowPane: ReactNode;
  tracePane?: ReactNode;
}

/** The other workbench, when this document is shared. */
interface EditorCollab {
  coEdit: { lesson: string; remote: number } | null;
  collabNotice: string | null;
  peerLabel: string | null | undefined;
}

interface RunnerEditorCardProps {
  surface: EditorSurface;
  draft: EditorDraft;
  panes: EditorPaneSet;
  /** The prediction gate, where the surface has one: the free-study editor has nothing to predict. */
  gate?: PredictGate;
  run: EditorRun;
  slots: EditorSlots;
  collab: EditorCollab;
  onClosePredict?: () => void;
  /** The next lesson after a verified pass, offered in the header while the win is fresh. */
  nextChapter?: { label: string; title: string; onOpen: () => void } | null;
  /**
   * The result views this surface really has. The runner offers all four; the studio offers the run
   * output alone, because it has no expected output, no prediction and no lesson workflow.
   */
  resultViews?: EditorView[];
}

/**
 * Code editor: a small project, not a scratch pad. `main.py` is the learner's; a helper the lesson
 * imports is a second, locked tab whose text is the module Pyodide loads.
 *
 * One body, up to two panes (`editorPanes.ts`). Every view stays mounted and a pane that is not
 * showing is `display:none`: that is what keeps exactly one `pre-actual-stdout` on the page, so the
 * last run can be read without selecting its tab. `order` follows the slots, which is what lets an
 * arrangement opened on an output read left to right.
 */
export function RunnerEditorCard(props: RunnerEditorCardProps) {
  const {
    panelRef,
    phoneCode,
    editorShown,
    resultsAllowed,
    phoneEditorVisible,
    isPhone,
    deferPhoneEditor,
    layout,
  } = props.surface;
  const {
    code,
    commitCode,
    mainEditorRef,
    helperEditorRef,
    helperFiles,
    openHelper,
    onOpenHelper,
    pendingJump,
    onClearJump,
    symbolMiss,
    sliderCount,
    vim: { on: vimOn, mode: vimMode, onMode: onVimMode },
    lesson: { id: lessonId, question: writeQuestion, goal: lessonGoal, requirements: lessonRequirements },
    onSliderCommit,
    getAnalysis,
    onGoToDefinition,
    onRunCell,
    breakpoints,
    editorTestId = 'editor-main',
  } = props.draft;
  /** The badge's word, from the mode the editor is reading keys in. */
  const vimModeLabel = vimModeLabelFor(vimMode);
  const { value: panes, onPanes } = props.panes;
  // Study and Read open folded: their job is the reading, and the editor is one press away. Write
  // and Debug open the body because those presets exist for typing and for reading a failure. A
  // phone's Code surface is the exception: there the editor is the whole task.
  const [bodyCollapsed, setBodyCollapsed] = useState(
    (layout === 'study' || layout === 'read') && !isPhone
  );
  useEffect(() => {
    setBodyCollapsed((layout === 'study' || layout === 'read') && !isPhone);
  }, [layout, isPhone]);
  // Opening the trace from More is a request for the editor body even when Study folded it.
  useEffect(() => {
    if (visibleViews(panes).includes('trace')) setBodyCollapsed(false);
  }, [panes]);
  /** The prediction gate and the result views this surface has; read before `shownViews` uses them. */
  const {
    gate,
    onClosePredict,
    nextChapter,
    resultViews = ['requirements', 'predict', 'actual', 'expected', 'cases', 'workflow', 'trace'],
  } = props;
  // A held run is a question that has to be visible. Study opens folded, but the gate lives in the
  // body: a Run that opens it must not leave the learner with an invisible question and a held run.
  useEffect(() => {
    if (gate?.holding) setBodyCollapsed(false);
  }, [gate?.holding]);
  /**
   * What the editor body shows right now.
   *
   * The stored arrangement is the learner's, but a preset still owns the regions: Write has no
   * results, so an output tab there would be a door into a hidden room. In that preset the body
   * falls back to the editor and the stored tab comes back with Study, which is why this is derived
   * here rather than written back to the store.
   */
  /**
   * The result views this preset allows. A preset owns the region (Read has no results, Write has
   * Predict and Workflow but no run output), and the stored arrangement is still the learner's: a
   * view the preset forbids is not shown and is not written away, so it comes back with Study.
   */
  const allowedViews: EditorView[] = layout
    ? viewsForLayout(layout)
    : resultsAllowed
      ? resultViews
      : [];
  const shownViews = new Set<EditorView>(
    visibleViews(panes).filter((view) => view === 'main' || allowedViews.includes(view))
  );
  /** Every view on screen, in slot order: the pane strip and the body read the same list. */
  const views = visibleViews(panes);
  /** A split only when two or more views are really on screen. */
  const paneSplit = allowedViews.length > 0 && isSplit(panes) && shownViews.size > 1;
  const paneCount = shownViews.size;
  /** Slot order, so an arrangement opened on an output still reads left to right. */
  const paneOrder = (view: EditorView): number => slotFor(panes, view) ?? 0;
  /** The helper the strip names, from the file the tab picked. */
  const openHelperFile = helperFiles.find((file) => file.name === openHelper) ?? null;
  /**
   * A pane's surface and, when split, the faint inset ring that makes the focused one visible. A
   * split is a keyboard-and-pointer workspace: the tab press fills the pane the learner last
   * clicked, so which pane that is has to be visible rather than remembered. The rules between
   * panes are the body's one-pixel gap showing the line colour through, which works for a row and
   * a grid without a border class per pane.
   */
  const paneClass = (view: EditorView): string =>
    `min-w-0 flex-1 bg-panel ${
      paneSplit && panes.focus === paneOrder(view) ? 'ring-1 ring-inset ring-accent/20' : ''
    }`;
  /**
   * Clicking a pane makes it the one a tab press fills.
   *
   * Without this the focused slot was only ever the one last opened, so putting Run output and
   * Expected side by side took a tab press nobody could be expected to guess: the first click
   * replaces the pane that already has focus. Click the pane you want to change, then its tab - the
   * way a terminal multiplexer's active pane owns the next command.
   */
  const focusPane = (view: EditorView) => {
    if (!paneSplit) return;
    const slot = slotFor(panes, view);
    if (slot !== null && panes.focus !== slot) onPanes(focusSlot(panes, slot));
  };
  /** One writer for every tab press and every arrangement control below. */
  const onShowView = (view: EditorView) => {
    setBodyCollapsed(false);
    onPanes(showView(panes, view));
  };
  const { isRunning, passStatus, harnessResult, asksForFinish } = props.run;
  // A failure is read in the traceback that sits under the panes. Study still opens folded, but a
  // red verdict is the one moment the body must come to the learner rather than wait to be found.
  useEffect(() => {
    if (passStatus === 'untested' || passStatus === 'passed') return;
    setBodyCollapsed(false);
  }, [passStatus]);
  const {
    toolbar,
    feedback,
    actualOutputPane,
    expectedOutputPane,
    casesPane,
    workflowPane,
    tracePane,
  } = props.slots;
  const { coEdit, collabNotice, peerLabel } = props.collab;

  return (
    <div
      ref={panelRef}
      id="python-runner-editor"
      data-testid="editor-panel"
      data-tour="editor"
      // The phone's Code surface is the one place the editor may take the theme's taller frame
      // (`index.css`), and 16 px is the size a phone keyboard will not zoom on.
      data-phone-code={phoneCode ? '1' : undefined}
      // Read hides the editor rather than shrinking it: a traceback is what that preset is for. On a
      // phone's Lesson surface it is hidden too, and kept mounted once opened so a switch back is
      // instant.
      style={{ display: editorShown && phoneEditorVisible ? undefined : 'none' }}
      className="bg-panel border border-line rounded-xl overflow-hidden scroll-mt-4"
    >
      <div className="bg-canvas border-b border-line-soft px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          {/* The strip takes the row's spare width and wraps when its tabs do not fit, at any width:
              a second header row costs less than a view nobody can see, and a helper file is what
              makes the six tabs overrun a 1280 px card. No sideways scroll, so every view is on
              screen on a phone and on a desktop. The 12rem floor is what keeps the arrangement
              controls from squeezing the strip into one tab per line on a phone: when both cannot
              fit, the controls wrap below the tabs instead of drawing over them. */}
          <div className="flex min-w-[12rem] flex-1 flex-wrap items-center gap-1" role="tablist" aria-label="Editor tabs">
            <button
              role="tab"
              aria-selected={openHelper === null && shownViews.has('main')}
              data-testid="editor-tab-main"
              title="main.py — F12 on a name jumps to the line that defines it"
              onClick={() => {
                onClearJump();
                onOpenHelper(null);
                onShowView('main');
              }}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t px-2.5 py-1.5 text-[12.5px] font-mono cursor-pointer"
              style={{
                color: openHelper === null && shownViews.has('main') ? 'var(--accent)' : 'var(--muted)',
                borderBottom:
                  openHelper === null && shownViews.has('main')
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
              }}
            >
              <CheckCircle2 className="hidden h-3 w-3 sm:block" aria-hidden="true" />
              {MAIN_FILE_NAME}
            </button>
            {helperFiles.map((file) => (
              <button
                key={file.name}
                role="tab"
                aria-selected={openHelper === file.name && shownViews.has('main')}
                data-testid={`editor-tab-${file.name}`}
                onClick={() => {
                  onClearJump();
                  onOpenHelper(file.name);
                  onShowView('main');
                }}
                title={`${file.name} is read-only: it is the module the checks import. F12 on a name jumps to its definition.`}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t px-2.5 py-1.5 text-[12.5px] font-mono cursor-pointer"
                style={{
                  color: openHelper === file.name && shownViews.has('main') ? 'var(--accent)' : 'var(--muted)',
                  borderBottom:
                    openHelper === file.name && shownViews.has('main')
                      ? '2px solid var(--accent)'
                      : '2px solid transparent',
                }}
              >
                <Lock className="hidden h-3 w-3 sm:block" aria-hidden="true" />
                {file.name}
              </button>
            ))}
            {allowedViews.length > 0 && (
              <>
                <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 self-center bg-line-soft" />
                {resultViews
                  .filter(
                    (view) =>
                      allowedViews.includes(view) &&
                      (view !== 'requirements' || lessonRequirements.length > 0)
                  )
                  .map((view) => {
                  const selected = shownViews.has(view);
                  const meta = resultTabMeta(view);
                  return (
                    <button
                      key={view}
                      role="tab"
                      aria-selected={selected}
                      data-testid={`editor-tab-${view}`}
                      title={meta.title}
                      onClick={() => onShowView(view)}
                      // Predict has its own fixed button in the phone bar; its tab would take the
                      // width that keeps Run output and Expected on screen.
                      className={`shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t px-2.5 py-1.5 text-[12.5px] font-mono cursor-pointer ${
                        view === 'predict' ? 'hidden md:flex' : 'flex'
                      }`}
                      style={{
                        color: selected ? 'var(--accent)' : 'var(--muted)',
                        borderBottom: selected ? '2px solid var(--accent)' : '2px solid transparent',
                      }}
                    >
                      {meta.icon}
                      {meta.label}
                    </button>
                  );
                })}
              </>
            )}
          </div>
          {/* The terminal split, in the tab row rather than the run row: §3 caps the run controls at
              eight, and this is a property of the body instead of an action of the run. Side by side
              by default; the arrows choose a stacked split, which is the shape a narrow window gets
              anyway.

              A sibling of the tablist, not a child: a tablist may only own tabs, and axe reports any
              other child role inside it as an aria-required-children violation. Outside it the
              controls also stay put while the tabs scroll. */}
          {allowedViews.length > 0 && (
            <div className="ml-1 flex shrink-0 items-center gap-0.5 pl-1">
              {!paneSplit ? (
                <button
                  type="button"
                  data-testid="btn-pane-split"
                  onClick={() => onPanes(splitPane(panes, undefined, allowedViews))}
                  className="cursor-pointer rounded border border-line bg-canvas px-2 py-0.5 text-[12px] font-mono text-body hover:bg-raise"
                >
                  Split
                </button>
              ) : (
                <Suspense fallback={null}>
                  <EditorPaneArrangement panes={panes} onPanes={onPanes} candidates={allowedViews} />
                </Suspense>
              )}
            </div>
          )}
          <button
            type="button"
            data-testid="btn-toggle-editor"
            aria-expanded={!bodyCollapsed}
            aria-controls="editor-panes-body"
            aria-label={bodyCollapsed ? 'Expand editor and goal' : 'Collapse editor and goal'}
            title={bodyCollapsed ? 'Expand the editor and the goal' : 'Collapse the editor and the goal'}
            onClick={() => setBodyCollapsed((open) => !open)}
            className="flex shrink-0 items-center gap-1 rounded border border-line bg-canvas px-1.5 py-0.5 text-[12px] font-mono text-muted hover:border-accent hover:text-accent cursor-pointer"
          >
            {bodyCollapsed ? (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{bodyCollapsed ? 'Expand' : 'Collapse'}</span>
          </button>
          <span className="shrink-0 whitespace-nowrap text-[11px] font-mono text-faint tabular-nums">
            {symbolMiss ? (
              <span role="status" data-testid="symbol-miss" style={{ color: 'var(--muted)' }}>
                no definition for <code style={{ color: 'var(--accent)' }}>{symbolMiss}</code>
              </span>
            ) : openHelperFile ? (
              `${openHelperFile.content.split('\n').length} lines · read-only`
            ) : (
              // On a phone the count costs the strip the width of a tab, so it steps aside there; a
              // symbol miss and a read-only helper still say their piece.
              <span className="hidden sm:inline">
                {`${code.split('\n').length} lines${sliderCount ? ` · ${sliderCount} slider${sliderCount === 1 ? '' : 's'}` : ''}`}
              </span>
            )}
            {/* Which mode is reading the keys. A live region, not decoration: with Vim on, a
                keystroke that does nothing is correct behaviour, and this is the only place the
                screen says which mode it is correct in. */}
            {vimOn && (
              <span
                role="status"
                data-testid="vim-mode"
                title="The mode the editor is reading keys in — Escape for NORMAL, i for INSERT"
                className="ml-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em]"
                style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
              >
                {vimModeLabel}
              </span>
            )}
          </span>
        </div>
        {/* The run controls live in the editor's own header: a learner's eyes are in the code, and
            crossing the screen to press Run was the one trip this card can save. Read hides this
            header, so the toolbar falls back to the top of the page there. Its own row, because a
            toolbar sharing a row with four tabs was what pushed this header to 175 px - more than
            the editor it sits above. */}
        {editorShown && (
          <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-1.5">
            <RunVerdict passStatus={passStatus} harnessResult={harnessResult} />
            {passStatus === 'passed' && nextChapter && (
              <button
                type="button"
                data-testid="btn-next-chapter"
                title={nextChapter.title}
                onClick={nextChapter.onOpen}
                className="flex min-h-8 shrink-0 items-center gap-1 rounded border border-emerald/50 bg-emerald/10 px-2 py-1 font-mono text-[12px] font-bold text-emerald hover:bg-emerald/20 cursor-pointer"
              >
                {nextChapter.label}
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
            <div className="ml-auto flex min-w-0 items-center gap-2">{toolbar}</div>
          </div>
        )}
      </div>
      {/* Write hides the prose, so the question it asks is printed here as the one comment a Python
          file would carry. The task is read from the starter's marked functions, in plain text, and
          the word "Question:" is visible: a beginner should not have to decode backticks to know
          what the file is for. Read-only. */}
      {!bodyCollapsed && layout === 'write' && writeQuestion && (
        <p
          data-testid="write-question"
          className="border-b border-line-soft bg-canvas px-3 py-2 font-mono text-[11.5px] leading-relaxed text-muted"
        >
          <span className="font-semibold text-accent"># Question:</span> {writeQuestion}
        </p>
      )}
      {/* The lesson's own goal as the comment the file would carry, before the first line of code.
          It gives the starter a direction without changing a byte of the starter: drafts, checks
          and the learner's undo history all still compare against exactly the text the lesson ships. */}
      {/* The goal belongs to the editor, so the editor's one disclosure owns it too: collapsed, the
          card keeps its header and hides the goal with the body rather than leaving a paragraph
          floating above a closed pane. Styled as the micro lessons ask a question — a label, a
          readable prompt, then the requirements as answers, not a mono comment block. */}
      {editorShown && lessonGoal && !bodyCollapsed && (
        <div data-testid="editor-goal" className="border-b border-line-soft p-3">
          <EditorGoalCard goal={lessonGoal} />
        </div>
      )}
      <div
        id="editor-panes-body"
        data-testid="editor-panes"
        style={{ display: bodyCollapsed ? 'none' : undefined }}
        data-axis={panes.axis}
        data-split={paneSplit ? 'split' : 'single'}
        data-focus={paneSplit ? panes.focus : 0}
        data-views={views.join(',')}
        data-count={paneCount}
        className={
          !paneSplit
            ? 'flex flex-col'
            : `${
                panes.axis === 'rows'
                  ? 'flex flex-col'
                  : paneCount > 2
                    ? 'grid grid-cols-1 items-stretch md:grid-cols-2'
                    : 'grid grid-cols-1 items-start lg:grid-cols-2'
              } gap-px bg-line-soft`
        }
      >
        <div
          data-testid="pane-main"
          data-pane="main"
          onClick={() => focusPane('main')}
          style={{ display: shownViews.has('main') ? undefined : 'none', order: paneOrder('main') }}
          className={paneClass('main')}
        >
          {coEdit && (
            <p
              role="status"
              data-testid="coedit-status"
              className="border-b px-3 py-1.5 text-[11px]"
              style={{ borderColor: 'var(--border)', color: 'var(--emerald, var(--accent))', backgroundColor: 'var(--bg)' }}
            >
              Co-editing {coEdit.lesson} with {peerLabel ?? 'the other workbench'} ·{' '}
              {coEdit.remote === 0 ? 'no edits from them yet' : `${coEdit.remote} of their edits`} · undo is yours
            </p>
          )}
          {!coEdit && collabNotice && (
            <p
              role="status"
              data-testid="coedit-notice"
              className="border-b px-3 py-1.5 text-[11px]"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)', backgroundColor: 'var(--bg)' }}
            >
              {collabNotice}
            </p>
          )}
          {/* The phone's punctuation strip: a phone keyboard has no colon, bracket or underscore on
              its first pane, and every Python line has at least one of them. */}
          {!deferPhoneEditor && isPhone && !openHelperFile && (
            <PythonKeys onInsert={(text) => mainEditorRef.current?.insertText(text)} />
          )}
          {deferPhoneEditor ? null : openHelperFile ? (
            <>
              <p
                className="border-b px-3 py-1.5 text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', backgroundColor: 'var(--bg)' }}
              >
                Read-only helper. Your code imports this file; edit{' '}
                <span className="font-mono" style={{ color: 'var(--accent)' }}>
                  {MAIN_FILE_NAME}
                </span>{' '}
                to change the answer.
              </p>
              <PythonEditor
                key={`${lessonId}:${openHelperFile.name}`}
                ref={helperEditorRef}
                value={openHelperFile.content}
                readOnly
                ariaLabel={`${openHelperFile.name}, read-only lesson helper`}
                testId="editor-helper"
                onGoToDefinition={onGoToDefinition}
                initialLine={pendingJump?.file === openHelperFile.name ? pendingJump.line : undefined}
              />
            </>
          ) : (
            <PythonEditor
              key={`main:${lessonId}`}
              ref={mainEditorRef}
              value={code}
              onChange={commitCode}
              ariaLabel="Python code editor"
              testId={editorTestId}
              onSliderCommit={onSliderCommit}
              getAnalysis={getAnalysis}
              onGoToDefinition={onGoToDefinition}
              onRunCell={onRunCell}
              onToggleBreakpoint={breakpoints?.onToggle}
              onBreakpointsMoved={breakpoints?.onMoved}
              breakpoints={breakpoints?.entries}
              vimMode={vimOn}
              onVimMode={onVimMode}
              initialLine={pendingJump?.file === MAIN_FILE_NAME ? pendingJump.line : undefined}
            />
          )}
        </div>
        {allowedViews.length > 0 && (
          <>
            {allowedViews.includes('requirements') && lessonRequirements.length > 0 && (
              <div
                data-testid="pane-requirements"
                data-pane="requirements"
                onClick={() => focusPane('requirements')}
                style={{
                  display: shownViews.has('requirements') ? undefined : 'none',
                  order: paneOrder('requirements'),
                }}
                className={paneClass('requirements')}
              >
                {shownViews.has('requirements') && (
                  <Suspense fallback={null}>
                    <EditorRequirements items={lessonRequirements} />
                  </Suspense>
                )}
              </div>
            )}
            {gate && (
              <div
                data-testid="pane-predict"
                data-pane="predict"
                onClick={() => focusPane('predict')}
                style={{ display: shownViews.has('predict') ? undefined : 'none', order: paneOrder('predict') }}
                className={paneClass('predict')}
              >
                <PredictPane
                  record={gate.record}
                  text={gate.text}
                  onText={gate.setText}
                  onCommit={gate.commit}
                  onSkip={gate.skip}
                  onAgain={gate.again}
                  onClose={() => onClosePredict?.()}
                  asksForFinish={asksForFinish}
                  held={gate.holding}
                  running={isRunning}
                />
              </div>
            )}
            <div
              data-testid="pane-actual"
              data-pane="actual"
              onClick={() => focusPane('actual')}
              style={{ display: shownViews.has('actual') ? undefined : 'none', order: paneOrder('actual') }}
              className={paneClass('actual')}
            >
              {actualOutputPane}
            </div>
            <div
              data-testid="pane-expected"
              data-pane="expected"
              onClick={() => focusPane('expected')}
              style={{ display: shownViews.has('expected') ? undefined : 'none', order: paneOrder('expected') }}
              className={paneClass('expected')}
            >
              {expectedOutputPane}
            </div>
            {casesPane && (
              <div
                data-testid="pane-cases"
                data-pane="cases"
                onClick={() => focusPane('cases')}
                style={{
                  display: shownViews.has('cases') ? undefined : 'none',
                  order: paneOrder('cases'),
                }}
                className={paneClass('cases')}
              >
                {casesPane}
              </div>
            )}
            <div
              data-testid="pane-workflow"
              data-pane="workflow"
              onClick={() => focusPane('workflow')}
              style={{ display: shownViews.has('workflow') ? undefined : 'none', order: paneOrder('workflow') }}
              className={paneClass('workflow')}
            >
              {workflowPane}
            </div>
            {tracePane && (
              <div
                data-testid="pane-trace"
                data-pane="trace"
                onClick={() => focusPane('trace')}
                style={{ display: shownViews.has('trace') ? undefined : 'none', order: paneOrder('trace') }}
                className={paneClass('trace')}
              >
                {tracePane}
              </div>
            )}
          </>
        )}
      </div>
      {!bodyCollapsed && feedback}
    </div>
  );
}
