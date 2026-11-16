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
  EDITOR_VIEW_LABELS,
  EDITOR_VIEWS,
  focusSlot,
  paneColumns,
  paneWidths,
  resizeColumn,
  resizeColumns,
  resizeRows,
  setPaneOrientation,
  slotFor,
  type EditorPanes,
  type EditorView,
} from '../../../editorPanes';
import { PredictPane } from './PredictPane';
import { recordClose } from './paneUndo';
import type { PredictGate } from './usePredictGate';
import type { AnalysisSession } from '../../../analysisClient';

const EditorRequirements = lazy(() =>
  import('./EditorRequirements').then((module) => ({ default: module.EditorRequirements }))
);

// The placement control only exists in a body of three or more panes; keeping it out of the entry
// chunk leaves room in the shell's weight budget for the panes themselves.
const PanePlacement = lazy(() =>
  import('./PanePlacement').then((module) => ({ default: module.PanePlacement }))
);

// The pane grips only matter once a body is split; their pointer work is not the entry's to carry.
const PaneHandles = lazy(() => import('./PaneDrag'));

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
  /** The breakpoint list as a pane of its own, beside the code it belongs to. */
  breakpointsPane?: ReactNode;
  tracePane?: ReactNode;
  robotPane?: ReactNode;
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
 * The editor's body: up to four panes, grouped into columns of stacks
 * (`runner/EditorPaneBody.tsx`).
 *
 * The arrangement is a list of boundaries (`editorPanes.ts`): each pane after the first joins the
 * body beside the one before it (a new column) or under it (a stack in that column). The default
 * mixed three-pane body is one full-height column and a stack of two beside it; the 2×2 four-pane
 * body is two stacks side by side, and a learner can flip any single boundary with the chip in the
 * corner of the pane it moves without disturbing the others.
 *
 * Every boundary is a divider the learner can drag; the release writes the shares once, not once
 * per pointer move, and the release position is the one that counts because a pointermove's state
 * can still be queued. Every view stays mounted and an unshown pane is `display:none`, which keeps
 * exactly one `pre-actual-stdout` on the page.
 *
 * Each pane in a split carries its own close in the corner: it takes that view off the screen and
 * leaves the rest in order (`closeView`), which is the opposite of the tab row's Close every pane
 * except the first. The close and the drag grip ride in the pane chrome chunk (`PaneDrag.tsx`), so a
 * one-pane body never pays for either, and the placement chips keep their own spot beside them. A
 * close is reversible, the prediction gate's own Close included: every close records the arrangement
 * it took away in `paneUndo.ts`, and the body also renders that chunk's `undo` instance, which offers
 * the view and its slot back for a few seconds — the thing that must outlive the pane it unmounted.
 *
 * A phone stacks every arrangement: two 195 px columns are narrower than a line of Python.
 */
export function EditorPaneBody({
  panes,
  onPanes,
  views,
  shownViews,
  allowedViews,
  collapsed,
  boundedBody,
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
  /** A preset owns a split body whose panes may shrink; the studio keeps a content-sized card. */
  boundedBody: boolean;
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
  const {
    actualOutputPane,
    expectedOutputPane,
    casesPane,
    workflowPane,
    breakpointsPane,
    tracePane,
    robotPane,
  } = slots;
  const paneSplit = allowedViews.length > 0 && views.length > 1 && shownViews.size > 1;
  const paneSlots = views.filter((view) => shownViews.has(view));
  /** The arrangement's own slot numbers for the panes on screen, which is what boundaries index. */
  const slotNumbers = paneSlots.map((view) => slotFor(panes, view) ?? 0);
  const groups =
    !paneSplit || isPhone ? (slotNumbers.length ? [slotNumbers] : []) : paneColumns(panes, slotNumbers);
  const [preview, setPreview] = useState<{ columns?: number[]; rows?: number[] }>({});
  const dragRef = useRef<{
    axis: 'column' | 'row';
    index: number;
    from: number;
    span: number;
    columns: number[];
    rows: number[];
  } | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const columnWidths = paneWidths(panes, Math.max(groups.length, 1));
  const shownWidths = preview.columns ?? columnWidths;
  const rowSharesFor = (count: number) => preview.rows ?? sharesFor(count, panes.rowShares);
  const openHelperFile = helperFiles.find((file) => file.name === openHelper) ?? null;

  const resizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.axis === 'column') {
      const delta = (event.clientX - drag.from) / drag.span;
      const next = [...drag.columns];
      const first = next[drag.index] + delta;
      const second = next[drag.index + 1] - delta;
      // Two columns keep the editor's 20% floor; three or four columns may be thinner.
      const floor = drag.columns.length === 2 ? 0.2 : 0.15;
      if (first < floor || second < floor) return;
      next[drag.index] = first;
      next[drag.index + 1] = second;
      setPreview({ columns: next });
      return;
    }
    const delta = (event.clientY - drag.from) / drag.span;
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
    if (drag.axis === 'column') {
      const delta = (event.clientX - drag.from) / drag.span;
      const next = [...drag.columns];
      next[drag.index] = drag.columns[drag.index] + delta;
      next[drag.index + 1] = drag.columns[drag.index + 1] - delta;
      setPreview({});
      onPanes(
        drag.columns.length === 2 ? resizeColumn(panes, next[0]) : resizeColumns(panes, next)
      );
      return;
    }
    const delta = (event.clientY - drag.from) / drag.span;
    const next = [...drag.rows];
    next[drag.index] = drag.rows[drag.index] + delta;
    next[drag.index + 1] = drag.rows[drag.index + 1] - delta;
    setPreview({});
    onPanes(resizeRows(panes, next));
  };

  const beginResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    axis: 'column' | 'row',
    index: number,
    columns: number[],
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
      columns,
      rows,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const dividerStyle = (
    axis: 'column' | 'row',
    offset: string,
    span?: { left: number; width: number }
  ): CSSProperties =>
    axis === 'column'
      ? {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `calc(${offset} - 5px)`,
          width: 10,
          cursor: 'col-resize',
          touchAction: 'none',
          zIndex: 2,
        }
      : {
          position: 'absolute',
          top: `calc(${offset} - 5px)`,
          height: 10,
          left: `${(span?.left ?? 0) * 100}%`,
          width: `${(span?.width ?? 1) * 100}%`,
          cursor: 'row-resize',
          touchAction: 'none',
          zIndex: 2,
        };

  const paneClass = (view: EditorView): string =>
    `min-w-0 flex-1 bg-panel ${
      paneSplit && boundedBody ? 'min-h-0 overflow-x-hidden overflow-y-auto' : ''
    } ${
      paneSplit && panes.focus === slotFor(panes, view) ? 'ring-1 ring-inset ring-accent/20' : ''
    }`;

  const focusPane = (view: EditorView) => {
    if (!paneSplit) return;
    const slot = slotFor(panes, view);
    if (slot !== null && panes.focus !== slot) onPanes(focusSlot(panes, slot));
  };

  /** Whether a view has something to draw at all, which is also whether it stays mounted hidden. */
  const paneAvailable = (view: EditorView): boolean => {
    if (view === 'main') return true;
    if (allowedViews.length === 0) return false;
    if (view === 'requirements') {
      return allowedViews.includes('requirements') && requirements.length > 0;
    }
    if (view === 'predict') return Boolean(gate);
    if (view === 'cases') return Boolean(casesPane);
    if (view === 'breakpoints') return Boolean(breakpointsPane);
    if (view === 'trace') return Boolean(tracePane);
    if (view === 'robot') return allowedViews.includes('robot') && Boolean(robotPane);
    return true;
  };

  const paneContent = (view: EditorView): ReactNode => {
    if (view === 'main') {
      return (
        <div data-pane-main-body className="flex min-h-0 flex-1 flex-col">
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
      );
    }
    if (view === 'requirements') {
      return shownViews.has('requirements') ? (
        <Suspense fallback={null}>
          <EditorRequirements items={requirements} />
        </Suspense>
      ) : null;
    }
    if (view === 'predict') {
      return gate ? (
        <PredictPane
          record={gate.record}
          text={gate.text}
          onText={gate.setText}
          onCommit={gate.commit}
          onSkip={gate.skip}
          onAgain={gate.again}
          onClose={(keyboard) => {
            // The gate's Close is a pane close like the corner ×: record the arrangement before the
            // tab writes one without this view, so the same Undo puts it back in its slot.
            if (!onClosePredict) return;
            recordClose(panes, EDITOR_VIEW_LABELS.predict, keyboard);
            onClosePredict();
          }}
          asksForFinish={asksForFinish}
          held={gate.holding}
          running={running}
        />
      ) : null;
    }
    if (view === 'breakpoints') return breakpointsPane ?? null;
    if (view === 'robot') return robotPane ?? null;
    if (view === 'actual') return actualOutputPane;
    if (view === 'expected') return expectedOutputPane;
    if (view === 'cases') return casesPane ?? null;
    if (view === 'workflow') return workflowPane;
    return tracePane ?? null;
  };

  const renderPane = (
    view: EditorView,
    slot: number,
    options: { hidden: boolean; rowIndex?: number; rows?: number[] }
  ) => {
    const { hidden, rowIndex = 0, rows } = options;
    // Only a pane that has a pane before it has a placement to choose, and the choice is worth a
    // control only once the body has a third pane: a two-pane body's axis is the whole answer.
    const showPlacement = !hidden && paneSplit && !isPhone && paneSlots.length >= 3 && slot > 0;
    const boundary =
      panes.orientations?.[slot - 1] ?? (panes.axis === 'rows' ? 'rows' : 'columns');
    return (
      <div
        key={view}
        data-testid={`pane-${view}`}
        data-pane={view}
        data-slot={slot}
        onClick={() => focusPane(view)}
        style={
          hidden
            ? { display: 'none' }              : {
                  position: 'relative',
                  // Only a bounded split may shrink its panes. A content-sized card keeps the flex
                  // item's automatic content floor, which is what stops a Requirements-only body
                  // from collapsing to zero height.
                  minHeight: paneSplit && boundedBody ? 0 : undefined,
                  flexGrow: rows?.[rowIndex] ?? 1,
                }
        }
        className={paneClass(view)}
      >
        {!hidden && paneSplit && (
          <Suspense fallback={null}>
            <PaneHandles slot={slot} view={view} panes={panes} onPanes={onPanes} />
          </Suspense>
        )}
        {showPlacement && (
          <Suspense fallback={null}>
            <PanePlacement
              slot={slot}
              boundary={boundary}
              onPlace={(choice) => onPanes(setPaneOrientation(panes, slot, choice))}
            />
          </Suspense>
        )}
        {paneContent(view)}
      </div>
    );
  };

  /** Panes the arrangement does not show still mount, so their content and scroll survive a switch. */
  const hiddenViews = EDITOR_VIEWS.filter(
    (view) => !shownViews.has(view) && paneAvailable(view)
  );

  return (
    <div
      ref={bodyRef}
      id="editor-panes-body"
      data-testid="editor-panes"
      style={{
        display: collapsed ? 'none' : undefined,
        position: 'relative',
        flexDirection: groups.length > 1 ? 'row' : 'column',
        // The split's height floor lives in `index.css`, keyed on the `data-bounded` and
        // `data-split` attributes below; a desktop gets 65vh, a phone 20rem.
      }}
      data-axis={panes.axis}
      data-bounded={boundedBody || undefined}
      data-orientations={(panes.orientations ?? []).join(',')}
      data-split={paneSplit ? 'split' : 'single'}
      data-focus={paneSplit ? panes.focus : 0}
      data-views={views.join(',')}
      data-count={shownViews.size}
      className={`${!paneSplit ? 'flex flex-col' : 'flex gap-px bg-line-soft'}`}
    >
      {paneSplit &&
        groups.length > 1 &&
        shownWidths.slice(0, -1).map((_, index) => (
          <div
            key={`column-divider-${index}`}
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize columns ${index + 1} and ${index + 2}`}
            data-testid="pane-divider-column"
            onPointerDown={(event) =>
              beginResize(event, 'column', index, shownWidths, rowSharesFor(1))
            }
            onPointerMove={resizeMove}
            onPointerUp={resizeEnd}
            onPointerCancel={resizeEnd}
            style={dividerStyle(
              'column',
              `${shownWidths.slice(0, index + 1).reduce((sum, share) => sum + share, 0) * 100}%`
            )}
          />
        ))}
      {paneSplit &&
        groups.map((group, columnIndex) => {
          if (group.length < 2) return null;
          const rows = rowSharesFor(group.length);
          const left = shownWidths
            .slice(0, columnIndex)
            .reduce((sum, share) => sum + share, 0);
          const width = shownWidths[columnIndex] ?? 1;
          return rows.slice(0, -1).map((_, index) => (
            <div
              key={`row-divider-${columnIndex}-${index}`}
              role="separator"
              aria-label={`Resize panes ${index + 1} and ${index + 2} in column ${columnIndex + 1}`}
              data-testid="pane-divider-row"
              onPointerDown={(event) =>
                beginResize(event, 'row', index, [], rows)
              }
              onPointerMove={resizeMove}
              onPointerUp={resizeEnd}
              onPointerCancel={resizeEnd}
              style={dividerStyle(
                'row',
                `${rows.slice(0, index + 1).reduce((sum, share) => sum + share, 0) * 100}%`,
                { left, width }
              )}
            />
          ));
        })}
      {groups.map((group, columnIndex) => {
        const rows = rowSharesFor(group.length);
        return (
          <div
            key={`pane-column-${columnIndex}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              flexGrow: shownWidths[columnIndex] ?? 1,
              // A column is a width share only when there is more than one; a lone column must let
              // its panes size the body instead of collapsing it to its zero flex-basis.
              flexBasis: groups.length > 1 ? 0 : 'auto',
              minWidth: 0,
              minHeight: paneSplit && boundedBody ? 0 : undefined,
              gap: 1,
            }}
          >
            {group.map((slot, rowIndex) =>
              renderPane(panes.views[slot], slot, { hidden: false, rowIndex, rows })
            )}
          </div>
        );
      })}
      {hiddenViews.map((view) =>
        renderPane(view, slotFor(panes, view) ?? panes.views.length, { hidden: true })
      )}
      {boundedBody && !isPhone && (
        <Suspense fallback={null}>
          <PaneHandles resize />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <PaneHandles undo onPanes={onPanes} />
      </Suspense>
    </div>
  );
}
