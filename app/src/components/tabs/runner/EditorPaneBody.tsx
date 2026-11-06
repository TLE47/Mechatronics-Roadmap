import {
  Suspense,
  lazy,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { PythonKeys } from '../../PythonKeys';
import { PythonEditor, type PythonEditorHandle } from '../../PythonEditor';
import { MAIN_FILE_NAME, type LessonFile } from '../../../lessonFiles';
import {
  focusSlot,
  resizeColumn,
  resizeRows,
  slotFor,
  type EditorPanes,
  type EditorView,
} from '../../../editorPanes';
import { PredictPane } from './PredictPane';
import type { PredictGate } from './usePredictGate';
import type { AnalysisSession } from '../../../analysisClient';

const EditorRequirements = lazy(() =>
  import('./EditorRequirements').then((module) => ({ default: module.EditorRequirements }))
);

/** The editor's own draft and files, as the body's main pane draws them. */
interface PaneDraft {
  code: string;
  commitCode: (next: string) => void;
  mainEditorRef: RefObject<PythonEditorHandle | null>;
  helperEditorRef: RefObject<PythonEditorHandle | null>;
  helperFiles: LessonFile[];
  openHelper: string | null;
  pendingJump: { file: string; line: number; lesson: string } | null;
  vim: { on: boolean; onMode: (mode: string) => void };
  lesson: { id: string };
  onSliderCommit: () => void;
  getAnalysis?: () => AnalysisSession | null;
  onGoToDefinition?: (name: string) => void;
  onRunCell?: (line: number) => void;
  breakpoints?: {
    entries: { line: number; condition: string }[];
    onToggle: (line: number) => void;
    onMoved: (entries: { line: number; condition: string }[]) => void;
  };
  editorTestId?: string;
}

/** The result views the card was handed. Each one keeps its own scroll and its own state. */
interface PaneSlots {
  actualOutputPane: ReactNode;
  expectedOutputPane: ReactNode;
  casesPane?: ReactNode;
  workflowPane: ReactNode;
  tracePane?: ReactNode;
}

interface PaneCollab {
  coEdit: { lesson: string; remote: number } | null;
  collabNotice: string | null;
  peerLabel: string | null | undefined;
}

/** Equal shares for a stack of `count` panes. */
function equalShares(count: number): number[] {
  return count > 0 ? Array.from({ length: count }, () => 1 / count) : [];
}

/** Row shares a layout can use: the stored ones when they fit, equal rows otherwise. */
function sharesFor(count: number, stored: number[] | undefined): number[] {
  return stored && stored.length === count ? stored : equalShares(count);
}

/**
 * The editor's body: up to four panes, mixed side-by-side and stacked (`runner/EditorPaneBody.tsx`).
 *
 * Three panes side by side use both axes — the first runs full height and the other two stack beside
 * it — so a third pane never leaves an empty grid cell under it. Each boundary is a divider the
 * learner can drag; the release writes the shares once, not once per pointer move, and the release
 * position is the one that counts because a pointermove's state can still be queued.
 *
 * A phone stacks a side-by-side arrangement: two 195 px columns are narrower than a line of Python.
 */
export function EditorPaneBody({
  panes,
  onPanes,
  views,
  shownViews,
  allowedViews,
  collapsed,
  isPhone,
  deferPhoneEditor,
  draft,
  gate,
  requirements,
  asksForFinish,
  running,
  slots,
  collab,
  onClosePredict,
}: {
  panes: EditorPanes;
  onPanes: (next: EditorPanes) => void;
  views: EditorView[];
  shownViews: Set<EditorView>;
  allowedViews: EditorView[];
  collapsed: boolean;
  isPhone: boolean;
  deferPhoneEditor: boolean;
  draft: PaneDraft;
  gate?: PredictGate;
  requirements: string[];
  asksForFinish: boolean;
  running: boolean;
  slots: PaneSlots;
  collab: PaneCollab;
  onClosePredict?: () => void;
}) {
  const {
    code,
    commitCode,
    mainEditorRef,
    helperEditorRef,
    helperFiles,
    openHelper,
    pendingJump,
    vim: { on: vimOn, onMode: onVimMode },
    lesson: { id: lessonId },
    onSliderCommit,
    getAnalysis,
    onGoToDefinition,
    onRunCell,
    breakpoints,
    editorTestId = 'editor-main',
  } = draft;
  const { coEdit, collabNotice, peerLabel } = collab;
  const { actualOutputPane, expectedOutputPane, casesPane, workflowPane, tracePane } = slots;
  const paneSplit = allowedViews.length > 0 && views.length > 1 && shownViews.size > 1;
  const paneSlots = views.filter((view) => shownViews.has(view));
  const sideBySide = panes.axis === 'columns' && !isPhone && paneSlots.length > 1;
  const rowCount = sideBySide ? (paneSlots.length > 2 ? 2 : 1) : paneSlots.length;
  const [preview, setPreview] = useState<{ col?: number; rows?: number[] }>({});
  const dragRef = useRef<{
    axis: 'column' | 'row';
    index: number;
    from: number;
    span: number;
    col: number;
    rows: number[];
  } | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const colShare = preview.col ?? panes.colShare ?? 0.5;
  const rowShares = preview.rows ?? sharesFor(rowCount, panes.rowShares);
  const openHelperFile = helperFiles.find((file) => file.name === openHelper) ?? null;

  const resizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta =
      (drag.axis === 'column' ? event.clientX - drag.from : event.clientY - drag.from) / drag.span;
    if (drag.axis === 'column') {
      setPreview({ col: Math.min(0.8, Math.max(0.2, drag.col + delta)) });
      return;
    }
    const next = [...drag.rows];
    const first = drag.rows[drag.index] + delta;
    const second = drag.rows[drag.index + 1] - delta;
    if (first < 0.15 || second < 0.15) return;
    next[drag.index] = first;
    next[drag.index + 1] = second;
    setPreview({ rows: next });
  };

  const resizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // The release position, not the last rendered preview: a pointermove's setState can still be
    // queued when the release arrives, and committing that would leave the divider a step behind.
    const delta =
      (drag.axis === 'column' ? event.clientX - drag.from : event.clientY - drag.from) / drag.span;
    setPreview({});
    if (drag.axis === 'column') {
      onPanes(resizeColumn(panes, drag.col + delta));
      return;
    }
    const next = [...drag.rows];
    next[drag.index] = drag.rows[drag.index] + delta;
    next[drag.index + 1] = drag.rows[drag.index + 1] - delta;
    onPanes(resizeRows(panes, next));
  };

  const beginResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    axis: 'column' | 'row',
    index: number,
    rows: number[]
  ) => {
    if (event.button !== 0) return;
    const box = bodyRef.current?.getBoundingClientRect();
    if (!box) return;
    dragRef.current = {
      axis,
      index,
      from: axis === 'column' ? event.clientX : event.clientY,
      span: (axis === 'column' ? box.width : box.height) || 1,
      col: panes.colShare ?? 0.5,
      rows,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  /** Where a pane sits in the mixed grid, or in the stack on a phone and a rows split. */
  const paneLayout = (view: EditorView): CSSProperties => {
    const slot = paneSlots.indexOf(view);
    if (slot === -1) return { display: 'none' };
    if (!sideBySide) return { order: slot, flexGrow: rowShares[slot] ?? 1, flexBasis: 0 };
    if (paneSlots.length === 2) return { order: slot, gridColumnStart: slot + 1, gridRowStart: 1 };
    if (paneSlots.length === 3) {
      return slot === 0
        ? { order: slot, gridColumnStart: 1, gridRowStart: 1, gridRowEnd: 3 }
        : { order: slot, gridColumnStart: 2, gridRowStart: slot };
    }
    return {
      order: slot,
      gridColumnStart: (slot % 2) + 1,
      gridRowStart: Math.floor(slot / 2) + 1,
    };
  };

  const dividerStyle = (axis: 'column' | 'row', offset: string, left = '0%'): CSSProperties => ({
    position: 'absolute',
    top: axis === 'column' ? 0 : `calc(${offset} - 5px)`,
    bottom: axis === 'column' ? 0 : undefined,
    left: axis === 'column' ? `calc(${offset} - 5px)` : left,
    right: axis === 'column' ? undefined : 0,
    width: axis === 'column' ? 10 : undefined,
    height: axis === 'row' ? 10 : undefined,
    cursor: axis === 'column' ? 'col-resize' : 'row-resize',
    touchAction: 'none',
    zIndex: 2,
  });

  const paneClass = (view: EditorView): string =>
    `min-w-0 flex-1 bg-panel ${
      paneSplit ? 'min-h-0 overflow-x-hidden overflow-y-auto' : ''
    } ${
      paneSplit && panes.focus === slotFor(panes, view) ? 'ring-1 ring-inset ring-accent/20' : ''
    }`;

  const focusPane = (view: EditorView) => {
    if (!paneSplit) return;
    const slot = slotFor(panes, view);
    if (slot !== null && panes.focus !== slot) onPanes(focusSlot(panes, slot));
  };

  return (
    <div
      ref={bodyRef}
      id="editor-panes-body"
      data-testid="editor-panes"
      style={{
        display: collapsed ? 'none' : undefined,
        position: 'relative',
        // A split needs a definite body height: a card that sizes itself to its content would let
        // every `flex-basis: 0` pane collapse to nothing. A preset body taller than this floor keeps
        // its own height; a content-sized one gets a usable, screen-sized body.
        minHeight: paneSplit ? (isPhone ? '20rem' : 'min(65vh, 36rem)') : undefined,
        gridTemplateColumns: sideBySide ? `${colShare}fr ${1 - colShare}fr` : undefined,
        gridTemplateRows:
          sideBySide && rowCount > 1
            ? rowShares.map((share) => `${share}fr`).join(' ')
            : undefined,
      }}
      data-axis={panes.axis}
      data-split={paneSplit ? 'split' : 'single'}
      data-focus={paneSplit ? panes.focus : 0}
      data-views={views.join(',')}
      data-count={shownViews.size}
      className={`${!paneSplit ? 'flex flex-col' : `${sideBySide ? 'grid' : 'flex flex-col'} gap-px bg-line-soft`}`}
    >
      {paneSplit && sideBySide && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize the left and right panes"
          data-testid="pane-divider-column"
          onPointerDown={(event) => beginResize(event, 'column', 0, rowShares)}
          onPointerMove={resizeMove}
          onPointerUp={resizeEnd}
          onPointerCancel={resizeEnd}
          style={dividerStyle('column', `${colShare * 100}%`)}
        />
      )}
      {paneSplit &&
        !sideBySide &&
        rowShares.slice(0, -1).map((_, index) => (
          <div
            key={index}
            role="separator"
            aria-orientation="horizontal"
            aria-label={`Drag to resize panes ${index + 1} and ${index + 2}`}
            data-testid="pane-divider-row"
            data-index={index}
            onPointerDown={(event) => beginResize(event, 'row', index, rowShares)}
            onPointerMove={resizeMove}
            onPointerUp={resizeEnd}
            onPointerCancel={resizeEnd}
            style={dividerStyle(
              'row',
              `${rowShares.slice(0, index + 1).reduce((sum, share) => sum + share, 0) * 100}%`
            )}
          />
        ))}
      {paneSplit && sideBySide && paneSlots.length >= 3 && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize the stacked panes"
          data-testid="pane-divider-row"
          onPointerDown={(event) => beginResize(event, 'row', 0, rowShares)}
          onPointerMove={resizeMove}
          onPointerUp={resizeEnd}
          onPointerCancel={resizeEnd}
          style={dividerStyle(
            'row',
            `${(rowShares[0] ?? 0.5) * 100}%`,
            paneSlots.length === 3 ? `${colShare * 100}%` : '0%'
          )}
        />
      )}
      <div
        data-testid="pane-main"
        data-pane="main"
        onClick={() => focusPane('main')}
        style={paneLayout('main')}
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
          {allowedViews.includes('requirements') && requirements.length > 0 && (
            <div
              data-testid="pane-requirements"
              data-pane="requirements"
              onClick={() => focusPane('requirements')}
              style={paneLayout('requirements')}
              className={paneClass('requirements')}
            >
              {shownViews.has('requirements') && (
                <Suspense fallback={null}>
                  <EditorRequirements items={requirements} />
                </Suspense>
              )}
            </div>
          )}
          {gate && (
            <div
              data-testid="pane-predict"
              data-pane="predict"
              onClick={() => focusPane('predict')}
              style={paneLayout('predict')}
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
                running={running}
              />
            </div>
          )}
          <div
            data-testid="pane-actual"
            data-pane="actual"
            onClick={() => focusPane('actual')}
            style={paneLayout('actual')}
            className={paneClass('actual')}
          >
            {actualOutputPane}
          </div>
          <div
            data-testid="pane-expected"
            data-pane="expected"
            onClick={() => focusPane('expected')}
            style={paneLayout('expected')}
            className={paneClass('expected')}
          >
            {expectedOutputPane}
          </div>
          {casesPane && (
            <div
              data-testid="pane-cases"
              data-pane="cases"
              onClick={() => focusPane('cases')}
              style={paneLayout('cases')}
              className={paneClass('cases')}
            >
              {casesPane}
            </div>
          )}
          <div
            data-testid="pane-workflow"
            data-pane="workflow"
            onClick={() => focusPane('workflow')}
            style={paneLayout('workflow')}
            className={paneClass('workflow')}
          >
            {workflowPane}
          </div>
          {tracePane && (
            <div
              data-testid="pane-trace"
              data-pane="trace"
              onClick={() => focusPane('trace')}
              style={paneLayout('trace')}
              className={paneClass('trace')}
            >
              {tracePane}
            </div>
          )}
        </>
      )}
    </div>
  );
}
