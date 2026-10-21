import React from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, Play, Wrench } from 'lucide-react';
import type { HarnessReport, LessonHarness } from '../harnessGrading.ts';
import {
  formatHarnessMetric,
  formatHarnessTarget,
  harnessGate,
  unitVerdict,
} from '../harnessGrading.ts';

interface LessonHarnessPanelProps {
  harness: LessonHarness;
  /** The numbers the learner's own functions produced on the last run. */
  report: HarnessReport | null;
  /** True while the runner is executing the editor's code. */
  grading: boolean;
  /** Runs the editor's code, which is what refreshes the report. */
  onGrade: () => void;
}

function verdictBadge(verdict: ReturnType<typeof unitVerdict>): React.ReactNode {
  if (verdict === 'met') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald">
        <CheckCircle2 className="w-3 h-3" /> AT TARGET
      </span>
    );
  }
  if (verdict === 'missed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-rose">
        <AlertTriangle className="w-3 h-3" /> OFF TARGET
      </span>
    );
  }
  if (verdict === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber">
        <AlertTriangle className="w-3 h-3" /> CALL FAILED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-faint">
      <CircleSlash className="w-3 h-3" /> NOT RUN
    </span>
  );
}

function valueColor(verdict: ReturnType<typeof unitVerdict>): string {
  if (verdict === 'met') return 'text-emerald';
  if (verdict === 'missed') return 'text-rose';
  if (verdict === 'error') return 'text-amber';
  return 'text-faint';
}

/**
 * A capstone's graded numbers, one row each.
 *
 * Nothing here is a toggle: the values come from the worker's last run, computed by the harness from
 * the learner's own functions on inputs the lesson never shows them. The pass gates on all of them.
 */
export const LessonHarnessPanel: React.FC<LessonHarnessPanelProps> = ({
  harness,
  report,
  grading,
  onGrade,
}) => {
  const gate = harnessGate(harness, report);

  return (
    <section
      data-testid="lesson-harness"
      className="bg-panel border border-line rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-accent flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" />
            <span>{harness.title}</span>
          </div>
          <p className="text-xs text-muted mt-0.5 max-w-3xl">
            Each number is computed by the harness from <b>your</b> functions, on inputs this lesson
            never prints, and checked against the capstone&apos;s own limits. The lesson verifies only
            when every row is at target.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            data-testid="harness-count"
            className={`px-3 py-1.5 rounded-lg border font-mono text-xs tabular-nums ${
              gate.passed
                ? 'bg-emerald/15 border-emerald/50 text-emerald'
                : 'bg-canvas border-line text-body'
            }`}
          >
            {gate.met} / {gate.total} at target
          </div>
          <button
            onClick={onGrade}
            disabled={grading}
            data-testid="btn-harness-grade"
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-accent/15 hover:bg-accent/25 disabled:opacity-60 disabled:cursor-wait text-accent border border-accent/50 flex items-center gap-1.5 cursor-pointer"
          >
            {grading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {grading ? 'Grading…' : harness.action}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {harness.units.map((unit) => {
          const metric = report?.[unit.key];
          const verdict = unitVerdict(unit, metric);
          return (
            <div
              key={unit.key}
              data-testid={`harness-row-${unit.key}`}
              className={`rounded-lg border p-3 ${
                verdict === 'met'
                  ? 'bg-emerald/50 border-emerald/50'
                  : 'bg-canvas border-line'
              }`}
            >
              <div className="flex items-center justify-between gap-2 h-4">
                <span className="text-[11px] font-mono text-muted truncate">{unit.label}</span>
                <span className="shrink-0">{verdictBadge(verdict)}</span>
              </div>
              <div
                data-testid={`harness-metric-${unit.key}`}
                className={`mt-2 font-mono text-2xl font-bold tabular-nums ${valueColor(verdict)}`}
              >
                {formatHarnessMetric(metric?.value ?? null, unit)}
              </div>
              <div className="text-[11px] text-muted mt-0.5">{formatHarnessTarget(unit)}</div>
              {metric?.error && (
                <div className="mt-1 text-[10px] font-mono text-amber break-words">
                  {metric.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-faint">
        These are the capstone&apos;s pass condition: <b className="text-body">Run &amp; Verify
        Output</b> marks this lesson verified only when every row is at target, so a number left off
        its limit keeps the lesson unverified however its printed lines read.
      </p>
    </section>
  );
};
