/**
 * The Robot tab's slot (components/tabs/runner/robotPane.tsx).
 *
 * Only the five Python lessons whose goals bind robot values have the tab. The stage is lazy, so a
 * learner who never opens Robot never downloads the model or its arena; the tab itself just asks
 * this module for a slot. The pane reads the current main.py and never offers a second code path.
 */
import React from 'react';
import type { RobotRunApi } from '../../../robotSim/model';

/** Keep in step with ROBOT_LESSON_IDS in app/src/robotLessons.ts. This gate is deliberately a
 * regex rather than an import: the eager slot should pay a few bytes, not pull the model in. */
const ROBOT_TAB_LESSON = /^P\.[12345]$/;

const RobotPane = React.lazy(() => import('../../../robotSim/RobotPane'));

/** The lazy Robot tab for a lesson with a robot view, or null everywhere else. */
export function robotPaneFor(lessonId: string, robot: RobotRunApi): React.ReactNode {
  if (!ROBOT_TAB_LESSON.test(lessonId)) return null;
  return (
    <React.Suspense fallback={null}>
      <RobotPane lessonId={lessonId} robot={robot} />
    </React.Suspense>
  );
}
