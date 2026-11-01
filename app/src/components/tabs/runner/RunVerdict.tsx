import React from 'react';
import { AlertTriangle, CheckCircle2, OctagonX } from 'lucide-react';
import type { HarnessGate } from '../../../harnessGrading';

/**
 * What the last run decided, beside the controls that produced it (`runner/RunVerdict.tsx`).
 *
 * The verdict belongs to the run, not to an output tab: a learner presses Run and has to see what
 * came back without opening a pane. Six states, one line each, and they live here so the tab's
 * markup does not restate them.
 */
export function RunVerdict({
  passStatus,
  harnessResult,
}: {
  passStatus: 'untested' | 'passed' | 'harness_failed' | 'behavior_failed' | 'mismatch' | 'stopped' | 'error';
  harnessResult: HarnessGate | null;
}) {
  if (passStatus === 'untested') return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-[11px] font-bold">
      {passStatus === 'passed' && (
        <span data-testid="status-assert-passed" className="flex items-center gap-1 text-emerald">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>PASS · Behavior &amp; Output Verified</span>
        </span>
      )}
      {passStatus === 'harness_failed' && (
        <span data-testid="status-harness-failed" className="flex items-center gap-1 text-rose">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            HARNESS FAILED · {harnessResult?.met ?? 0} / {harnessResult?.total ?? 0} Metrics At
            Target
          </span>
        </span>
      )}
      {passStatus === 'behavior_failed' && (
        <span data-testid="status-behavior-failed" className="flex items-center gap-1 text-rose">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>BEHAVIOR FAILED · Instructor Tests Failed</span>
        </span>
      )}
      {passStatus === 'mismatch' && (
        <span data-testid="status-output-mismatch" className="flex items-center gap-1 text-amber">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>BEHAVIOR PASSED · Output Format Differs</span>
        </span>
      )}
      {passStatus === 'stopped' && (
        <span data-testid="status-execution-stopped" className="flex items-center gap-1 text-amber">
          <OctagonX className="h-3.5 w-3.5" />
          <span>STOPPED · Loop Limit / Cancelled</span>
        </span>
      )}
      {passStatus === 'error' && (
        <span data-testid="status-execution-error" className="flex items-center gap-1 text-rose">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>ERROR · Syntax / Runtime Error</span>
        </span>
      )}
    </span>
  );
}
