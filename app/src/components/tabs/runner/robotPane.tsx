/**
 * The Robot tab's slot (`components/tabs/runner/robotPane.tsx`).
 *
 * Only P.1, P.3, P.4 and P.5 have a grid. The pane is lazy, so a learner who never opens Robot
 * never downloads the robot model or its stage; the tab itself just asks this module for a slot.
 */
import React from 'react';
import type { RobotRunApi } from '../../../robotSim/model';

const ROBOT_LESSON_IDS = ['P.1', 'P.3', 'P.4', 'P.5'];
const RobotPane = React.lazy(() =>
  import('../../../robotSim/RobotPane').then((module) => ({ default: module.RobotPane }))
);

/** The lazy Robot pane for a grid lesson, or null where this lesson has no scenario. */
export function robotPaneFor(
  lessonId: string,
  robot: RobotRunApi,
  onLoadExample: (code: string) => void
): React.ReactNode {
  if (!ROBOT_LESSON_IDS.includes(lessonId)) return null;
  return (
    <React.Suspense fallback={null}>
      <RobotPane lessonId={lessonId} robot={robot} onLoadExample={onLoadExample} />
    </React.Suspense>
  );
}
