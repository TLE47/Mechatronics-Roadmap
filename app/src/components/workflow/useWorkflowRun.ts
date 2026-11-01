/**
 * The run in progress (`components/workflow/useWorkflowRun.ts`).
 *
 * A simulation is view state, not document state: it belongs to the panel, is reset by the edits the
 * editor writes (the document's `updatedAt` is the one signal every write stamps), and is never
 * stored. The engine in `workflowRun.ts` is pure; this hook only holds its answer and exposes the
 * four controls.
 */

import { useEffect, useMemo, useState } from 'react';
import type { WorkflowDoc } from '../../workflow.ts';
import {
  chooseRun,
  runStatus,
  startRun,
  stepRun,
  type WorkflowRun,
  type WorkflowRunStatus,
} from '../../workflowRun.ts';

/** What the panel hands the canvas: the run, its marks and the four controls. */
export interface WorkflowSimulation {
  run: WorkflowRun | null;
  activeIds: ReadonlySet<string>;
  takenEdges: ReadonlySet<string>;
  status: WorkflowRunStatus | null;
  start: () => void;
  step: () => void;
  choose: (edgeId: string) => void;
  stop: () => void;
}

export function useWorkflowRun(doc: WorkflowDoc | null): WorkflowSimulation {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const stamp = doc?.updatedAt;

  // Any edit — a move, a guard, a deleted card — invalidates the run: it was a walk through a
  // diagram that no longer exists.
  useEffect(() => setRun(null), [stamp]);

  const activeIds = useMemo(() => new Set(run?.at ?? []), [run]);
  const takenEdges = useMemo(() => new Set(run?.taken ?? []), [run]);

  return {
    run,
    activeIds,
    takenEdges,
    status: doc && run ? runStatus(doc, run) : null,
    start: () => setRun(doc ? startRun(doc) : null),
    step: () => setRun((current) => (doc && current ? stepRun(doc, current) : current)),
    choose: (edgeId: string) =>
      setRun((current) => (doc && current ? chooseRun(doc, current, edgeId) ?? current : current)),
    stop: () => setRun(null),
  };
}
