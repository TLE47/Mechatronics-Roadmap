/**
 * The Workflow pane's slot (`components/tabs/runner/WorkflowPane.tsx`).
 *
 * The runner's own comment says the plan is "mounted only while the editor shows, so the Read
 * preset pays nothing for it" — but `WorkflowPanel` was imported statically, so the *bytes* were
 * still in the chunk every first paint parses, whether or not the pane had ever been opened. The
 * panel is a view like Run output: one tab press away, splittable beside the code, and never part
 * of the lesson text a learner waits for.
 *
 * So the slot is lazy, the same shape as `robotPane.tsx`: the tab keeps one dynamic import and the
 * panel's own chunk (shared with the Studio tab, which is lazy too) arrives when the pane opens.
 * `npm run check:weight` measures the result on `largest_js_gzip` and `entry_gzip`.
 */
import React from 'react';
import { LazyPending } from '../../LazyPending';
import type { WorkflowPanelProps } from '../../WorkflowPanel';

const WorkflowPanel = React.lazy(() =>
  import('../../WorkflowPanel').then((module) => ({ default: module.WorkflowPanel }))
);

/** The Workflow pane, fetched the first time a learner opens or splits it. */
export function WorkflowPane(props: WorkflowPanelProps): React.ReactElement {
  return (
    <React.Suspense fallback={<LazyPending what="the workflow" />}>
      <WorkflowPanel {...props} />
    </React.Suspense>
  );
}
