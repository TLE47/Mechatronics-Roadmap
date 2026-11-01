import type { ReactNode, RefObject } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Columns2,
  GitBranch,
  Lock,
  Rows2,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { PythonEditor, type PythonEditorHandle } from '../../PythonEditor';
import { PredictPane } from './PredictPane';
import { RunVerdict } from './RunVerdict';
import { PythonKeys } from '../../PythonKeys';
import { MAIN_FILE_NAME, type LessonFile } from '../../../lessonFiles';
import type { EditorPanes, EditorView } from '../../../editorPanes';
import type { WorkspaceLayout } from '../../../workspaceLayout';
import type { AnalysisSession } from '../../../analysisClient';
import type { HarnessGate } from '../../../harnessGrading';
import type { PredictionRecord } from '../../../predictGate';

interface RunnerEditorCardProps {
  panelRef: RefObject<HTMLDivElement | null>;
  phoneCode: boolean;
  editorShown: boolean;
  /** The preset in force shows the run's results, so its tabs and panes belong on screen. */
  resultsAllowed: boolean;
  /** False on the phone's Lesson surface: the editor is hidden but stays mounted once opened. */
  phoneEditorVisible: boolean;
  isPhone: boolean;
  deferPhoneEditor: boolean;
  layout: WorkspaceLayout;
  code: string;
  commitCode: (next: string) => void;
  mainEditorRef: RefObject<PythonEditorHandle | null>;
  helperEditorRef: RefObject<PythonEditorHandle | null>;
  helperFiles: LessonFile[];
  openHelper: string | null;
  openHelperFile: LessonFile | null;
  onOpenHelper: (name: string | null) => void;
  pendingJump: { file: string; line: number; lesson: string } | null;
  onClearJump: () => void;
  panes: EditorPanes;
  paneSplit: boolean;
  shownViews: Set<EditorView>;
  views: EditorView[];
  onShowView: (view: EditorView) => void;
  onSplit: () => void;
  onSetAxis: (axis: 'columns' | 'rows') => void;
  onCloseSplit: () => void;
  focusPane: (view: EditorView) => void;
  paneOrder: (view: EditorView) => number;
  paneBorder: (view: EditorView) => string;
  symbolMiss: string | null;
  sliderCount: number;
  vimOn: boolean;
  vimModeLabel: string;
  onVimMode: (mode: string) => void;
  writeQuestion: string;
  lessonId: string;
  onSliderCommit: () => void;
  getAnalysis: () => AnalysisSession | null;
  onGoToDefinition: (name: string) => void;
  onRunCell: (line: number) => void;
  onToggleBreakpoint: (line: number) => void;
  onBreakpointsMoved: (entries: { line: number; condition: string }[]) => void;
  breakpoints: { line: number; condition: string }[];
  predictRecord: PredictionRecord | null;
  predictText: string;
  onPredictText: (text: string) => void;
  onCommitPrediction: () => void;
  onSkipPrediction: () => void;
  onPredictAgain: () => void;
  onClosePredict: () => void;
  asksForFinish: boolean;
  heldRun: boolean;
  isRunning: boolean;
  passStatus: Parameters<typeof RunVerdict>[0]['passStatus'];
  harnessResult: HarnessGate | null;
  toolbar: ReactNode;
  feedback: ReactNode;
  actualOutputPane: ReactNode;
  expectedOutputPane: ReactNode;
  workflowPane: ReactNode;
  coEdit: { lesson: string; remote: number } | null;
  collabNotice: string | null;
  peerLabel: string | null | undefined;
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
    code,
    commitCode,
    mainEditorRef,
    helperEditorRef,
    helperFiles,
    openHelper,
    openHelperFile,
    onOpenHelper,
    pendingJump,
    onClearJump,
    panes,
    paneSplit,
    shownViews,
    views,
    onShowView,
    onSplit,
    onSetAxis,
    onCloseSplit,
    focusPane,
    paneOrder,
    paneBorder,
    symbolMiss,
    sliderCount,
    vimOn,
    vimModeLabel,
    onVimMode,
    writeQuestion,
    lessonId,
    onSliderCommit,
    getAnalysis,
    onGoToDefinition,
    onRunCell,
    onToggleBreakpoint,
    onBreakpointsMoved,
    breakpoints,
    predictRecord,
    predictText,
    onPredictText,
    onCommitPrediction,
    onSkipPrediction,
    onPredictAgain,
    onClosePredict,
    asksForFinish,
    heldRun,
    isRunning,
    passStatus,
    harnessResult,
    toolbar,
    feedback,
    actualOutputPane,
    expectedOutputPane,
    workflowPane,
    coEdit,
    collabNotice,
    peerLabel,
  } = props;

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
        <div className="flex min-w-0 items-center justify-between gap-2">
          {/* The strip takes the row's spare width and wraps when its tabs do not fit, at any width:
              a second header row costs less than a view nobody can see, and a helper file is what
              makes the six tabs overrun a 1280 px card. No sideways scroll, so every view is on
              screen on a phone and on a desktop. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" role="tablist" aria-label="Editor tabs">
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
            {resultsAllowed && (
              <>
                <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 self-center bg-line-soft" />
                {(['predict', 'actual', 'expected', 'workflow'] as const).map((view) => {
                  const selected = shownViews.has(view);
                  const meta =
                    view === 'predict'
                      ? {
                          label: 'Predict',
                          title:
                            'The prediction gate: commit to what this will print before the run — tab here, or split it beside the code',
                          icon: <Sparkles className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
                        }
                      : view === 'actual'
                        ? {
                            label: 'Run output',
                            title: 'The last run’s stdout and verdict — tab here, or split it beside the code',
                            icon: <Terminal className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
                          }
                        : view === 'workflow'
                          ? {
                              label: 'Workflow',
                              title:
                                'How this problem gets solved — given, model, compute, check, with a live checklist',
                              icon: <GitBranch className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
                            }
                          : {
                              label: 'Expected',
                              title: 'The lesson’s Expected Output — tab here, or split it beside the code',
                              icon: <CheckSquare className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
                            };
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
          {resultsAllowed && (
            <div role="group" aria-label="Editor panes" className="ml-1 flex shrink-0 items-center gap-0.5 pl-1">
              {!paneSplit ? (
                <button
                  type="button"
                  data-testid="btn-pane-split"
                  onClick={onSplit}
                  title="Split the editor: show two views, like a terminal"
                  className="flex items-center gap-1 rounded border border-line bg-canvas px-2 py-0.5 text-[12px] font-mono text-body hover:bg-raise cursor-pointer"
                >
                  <Columns2 className="h-3 w-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Split</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="btn-pane-columns"
                    aria-pressed={panes.axis === 'columns'}
                    onClick={() => onSetAxis('columns')}
                    title="Divide the panes side by side"
                    className={`rounded border px-1.5 py-0.5 cursor-pointer ${
                      panes.axis === 'columns'
                        ? 'border-accent/60 bg-accent/10 text-accent'
                        : 'border-line bg-canvas text-muted hover:bg-raise'
                    }`}
                  >
                    <Columns2 className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Side by side</span>
                  </button>
                  <button
                    type="button"
                    data-testid="btn-pane-rows"
                    aria-pressed={panes.axis === 'rows'}
                    onClick={() => onSetAxis('rows')}
                    title="Divide the panes one above the other"
                    className={`rounded border px-1.5 py-0.5 cursor-pointer ${
                      panes.axis === 'rows'
                        ? 'border-accent/60 bg-accent/10 text-accent'
                        : 'border-line bg-canvas text-muted hover:bg-raise'
                    }`}
                  >
                    <Rows2 className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">One above the other</span>
                  </button>
                  <button
                    type="button"
                    data-testid="btn-pane-close"
                    onClick={onCloseSplit}
                    title="Close the second pane"
                    aria-label="Close the second pane"
                    className="rounded border border-line bg-canvas px-1.5 py-0.5 text-muted hover:bg-raise hover:text-body cursor-pointer"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          )}
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
            <div className="ml-auto flex min-w-0 items-center gap-2">{toolbar}</div>
          </div>
        )}
      </div>
      {/* Write hides the prose, so the question it asks is printed here as the one comment a Python
          file would carry. The task is read from the starter's marked functions, in plain text, and
          the word "Question:" is visible: a beginner should not have to decode backticks to know
          what the file is for. Read-only. */}
      {layout === 'write' && writeQuestion && (
        <p
          data-testid="write-question"
          className="border-b border-line-soft bg-canvas px-3 py-2 font-mono text-[11.5px] leading-relaxed text-muted"
        >
          <span className="font-semibold text-accent"># Question:</span> {writeQuestion}
        </p>
      )}
      <div
        data-testid="editor-panes"
        data-axis={panes.axis}
        data-split={paneSplit ? 'split' : 'single'}
        data-focus={paneSplit ? panes.focus : 0}
        data-views={views.join(',')}
        role="group"
        aria-label="Editor panes: a tab press fills the pane you last clicked"
        className={paneSplit && panes.axis === 'columns' ? 'flex flex-col lg:flex-row lg:items-start' : 'flex flex-col'}
      >
        <div
          data-testid="pane-main"
          data-pane="main"
          onClick={() => focusPane('main')}
          style={{ display: shownViews.has('main') ? undefined : 'none', order: paneOrder('main') }}
          className={`min-w-0 flex-1 ${paneBorder('main')}`}
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
              testId="editor-main"
              onSliderCommit={onSliderCommit}
              getAnalysis={getAnalysis}
              onGoToDefinition={onGoToDefinition}
              onRunCell={onRunCell}
              onToggleBreakpoint={onToggleBreakpoint}
              onBreakpointsMoved={onBreakpointsMoved}
              breakpoints={breakpoints}
              vimMode={vimOn}
              onVimMode={onVimMode}
              initialLine={pendingJump?.file === MAIN_FILE_NAME ? pendingJump.line : undefined}
            />
          )}
        </div>
        {resultsAllowed && (
          <>
            <div
              data-testid="pane-predict"
              data-pane="predict"
              onClick={() => focusPane('predict')}
              style={{ display: shownViews.has('predict') ? undefined : 'none', order: paneOrder('predict') }}
              className={`min-w-0 flex-1 border-t border-line-soft ${paneBorder('predict')}`}
            >
              <PredictPane
                record={predictRecord}
                text={predictText}
                onText={onPredictText}
                onCommit={onCommitPrediction}
                onSkip={onSkipPrediction}
                onAgain={onPredictAgain}
                onClose={onClosePredict}
                asksForFinish={asksForFinish}
                held={heldRun}
                running={isRunning}
              />
            </div>
            <div
              data-testid="pane-actual"
              data-pane="actual"
              onClick={() => focusPane('actual')}
              style={{ display: shownViews.has('actual') ? undefined : 'none', order: paneOrder('actual') }}
              className={`min-w-0 flex-1 border-t border-line-soft ${paneBorder('actual')}`}
            >
              {actualOutputPane}
            </div>
            <div
              data-testid="pane-expected"
              data-pane="expected"
              onClick={() => focusPane('expected')}
              style={{ display: shownViews.has('expected') ? undefined : 'none', order: paneOrder('expected') }}
              className={`min-w-0 flex-1 border-t border-line-soft ${paneBorder('expected')}`}
            >
              {expectedOutputPane}
            </div>
            <div
              data-testid="pane-workflow"
              data-pane="workflow"
              onClick={() => focusPane('workflow')}
              style={{ display: shownViews.has('workflow') ? undefined : 'none', order: paneOrder('workflow') }}
              className={`min-w-0 flex-1 border-t border-line-soft ${paneBorder('workflow')}`}
            >
              {workflowPane}
            </div>
          </>
        )}
      </div>
      {feedback}
    </div>
  );
}
