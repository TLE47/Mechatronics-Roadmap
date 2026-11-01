import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { StudyPanel } from '../../StudyPanel';
import { TracePanel } from '../../TracePanel';
import { ScopePanel } from '../../ScopePanel';
import { noteLabel, type LintNote } from '../../../analysisClient';
import type { FailingCheck } from '../../../checkHints';
import type { HarnessGate } from '../../../harnessGrading';
import type { TraceSnapshot } from '../../../runTrace';
import {
  DEFAULT_SPLIT_RATIO,
  SPLIT_MAX_RATIO,
  SPLIT_MIN_RATIO,
  splitRatioAfterKey,
  splitRatioPercent,
} from '../../../workspaceLayout';
import type { ScopeSeries } from '../../../scopeModel';
import { AssessmentPanel } from './AssessmentPanel';

interface ResultsColumnProps {
  resultsSide: 'left' | 'right';
  /** False on the phone's Lesson surface: the checks come back with the code, not before it. */
  visible: boolean;
  columns: boolean;
  splitRatio: number;
  draggingSplit: boolean;
  onBeginSplitDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onMoveSplitDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onEndSplitDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCommitSplitRatio: (ratio: number) => void;
  lintNotes: LintNote[];
  analysisNotice: string | null;
  lessonId: string;
  onOpenWorkflow: () => void;
  assessmentRef: RefObject<HTMLDivElement | null>;
  behaviorCheck: 'untested' | 'passed' | 'failed';
  outputCheck: 'untested' | 'matched' | 'differs';
  outputMatchMode: string;
  exactFormatting: boolean;
  instructorTestSummary: string[] | undefined;
  checkFailures: FailingCheck[];
  revealedHints: number;
  hintCount: number;
  onRevealHint: (rung: number) => void;
  instructorError: string;
  passStatus: string;
  harnessResult: HarnessGate | null;
  resultsShown: boolean;
  trace: TraceSnapshot | null;
  traceStep: number;
  onTraceStep: (step: number) => void;
  runSource: string;
  onRevealTrace: (line: number) => void;
  scopeSeries: ScopeSeries[];
  pinnedScope: ScopeSeries[] | null;
  onPinScope: () => void;
  onUnpinScope: () => void;
}

/**
 * Everything that reports on the editor.
 *
 * One wrapper, because Split's second column is exactly this block: the checker, the trace, the scope
 * and the study note describe the code, and a preset that moved only half of them would put a verdict
 * beside nothing.
 */
export function ResultsColumn({
  resultsSide,
  visible,
  columns,
  splitRatio,
  draggingSplit,
  onBeginSplitDrag,
  onMoveSplitDrag,
  onEndSplitDrag,
  onCommitSplitRatio,
  lintNotes,
  analysisNotice,
  lessonId,
  onOpenWorkflow,
  assessmentRef,
  behaviorCheck,
  outputCheck,
  outputMatchMode,
  exactFormatting,
  instructorTestSummary,
  checkFailures,
  revealedHints,
  hintCount,
  onRevealHint,
  instructorError,
  passStatus,
  harnessResult,
  resultsShown,
  trace,
  traceStep,
  onTraceStep,
  runSource,
  onRevealTrace,
  scopeSeries,
  pinnedScope,
  onPinScope,
  onUnpinScope,
}: ResultsColumnProps) {
  return (
    <div
      className="space-y-4 relative"
      data-testid="results-column"
      data-side={resultsSide}
      // The phone's Lesson surface is one task: the checks, the trace and the study panel come back
      // with the code, not before it.
      style={{ display: visible ? undefined : 'none' }}
    >
      {/* The results column is the divider's anchor: the handle sits in the gap on its left edge,
          which is the boundary itself. Dragging it moves the boundary, and the share it leaves behind
          is remembered. Hidden below `lg`, where the two halves stack and there is no boundary to
          drag. */}
      {columns && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the editor and results columns"
          aria-valuemin={splitRatioPercent(SPLIT_MIN_RATIO)}
          aria-valuemax={splitRatioPercent(SPLIT_MAX_RATIO)}
          aria-valuenow={splitRatioPercent(splitRatio)}
          aria-valuetext={`${splitRatioPercent(splitRatio)}% editor`}
          data-side={resultsSide}
          title="Drag to resize · double-click for an even split · ←/→ also work"
          data-testid="split-divider"
          tabIndex={0}
          onPointerDown={onBeginSplitDrag}
          onPointerMove={onMoveSplitDrag}
          onPointerUp={onEndSplitDrag}
          onPointerCancel={onEndSplitDrag}
          onDoubleClick={() => onCommitSplitRatio(DEFAULT_SPLIT_RATIO)}
          onKeyDown={(event) => {
            const next = splitRatioAfterKey(splitRatio, event.key, event.shiftKey, resultsSide);
            if (next === null) return;
            event.preventDefault();
            onCommitSplitRatio(next);
          }}
          className={`hidden lg:flex absolute top-0 bottom-0 z-10 w-3 cursor-col-resize touch-none items-center justify-center ${
            resultsSide === 'left' ? '-right-3' : '-left-3'
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-10 w-[3px] rounded-full transition-colors ${
              draggingSplit ? 'opacity-100' : 'opacity-60 hover:opacity-100'
            }`}
            style={{ background: draggingSplit ? 'var(--accent)' : 'var(--muted)' }}
          />
        </div>
      )}
      {/* What the checker saw. Absent when there is nothing to say, because a green "0 notes" strip
          under every lesson is furniture, not information. */}
      {(lintNotes.length > 0 || analysisNotice) && (
        <div
          data-testid="analysis-notes"
          data-lint-count={lintNotes.length}
          className="bg-panel border border-line rounded-xl px-3.5 py-2.5 text-[11.5px]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
              Checker · pyflakes + pycodestyle
            </span>
            <span className="text-[10.5px] font-mono text-faint">
              {lintNotes.length
                ? `${lintNotes.length} note${lintNotes.length === 1 ? '' : 's'}`
                : 'unavailable'}
            </span>
          </div>
          {analysisNotice ? (
            <p data-testid="analysis-unavailable" className="mt-1.5 text-muted">
              {analysisNotice}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {lintNotes.slice(0, 3).map((note, index) => (
                <li
                  key={`${note.line}:${note.column}:${index}`}
                  data-testid={`lint-note-${index}`}
                  className="font-mono text-[11px] text-muted"
                >
                  {noteLabel(note)}
                </li>
              ))}
              {lintNotes.length > 3 && (
                <li className="text-[10.5px] text-faint">+ {lintNotes.length - 3} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* What the learner wrote down about this lesson. It sits between the code and the checks
          because it is about the learner's understanding rather than about the run. */}
      <StudyPanel lessonId={lessonId} onOpenWorkflow={onOpenWorkflow} />

      <AssessmentPanel
        panelRef={assessmentRef}
        behaviorCheck={behaviorCheck}
        outputCheck={outputCheck}
        outputMatchMode={outputMatchMode}
        exactFormatting={exactFormatting}
        instructorTestSummary={instructorTestSummary}
        checkFailures={checkFailures}
        revealedHints={revealedHints}
        hintCount={hintCount}
        onRevealHint={onRevealHint}
        instructorError={instructorError}
        passStatus={passStatus}
        harnessResult={harnessResult}
      />

      {/* The run trace: the last run replayed step by step, beside the output it explains. A
          recording, so it is gone when an edit makes it describe a program that no longer exists. */}
      <div style={{ display: resultsShown ? undefined : 'none' }}>
        <TracePanel trace={trace} step={traceStep} onStep={onTraceStep} source={runSource} onReveal={onRevealTrace} />
      </div>

      {/* The Scope: the learner's own traced signal, drawn the moment the first batch lands. */}
      <ScopePanel series={scopeSeries} pinned={pinnedScope} onPin={onPinScope} onUnpin={onUnpinScope} />

      {/* The output lives in the editor's own panes (`editorPanes.ts`), under the tabs of the code
          that produced it. There is no results-only preset any more — Read keeps the lesson text and
          Write keeps the editor — so there is no second home for it here. */}
    </div>
  );
}
