/**
 * The Robot dock's slot (components/tabs/runner/robotPane.tsx).
 *
 * Only the four Python lessons whose goals bind robot values have a dock. The stage is lazy, so the
 * main.py pane pays a few bytes for the gate, not for the arena. The dock is mounted below the one
 * editor and never offers a second code path.
 */
import React from 'react';
import type { RobotRunApi } from '../../../robotSim/model';

/** Keep in step with ROBOT_LESSON_IDS in app/src/robotLessons.ts. This gate is deliberately a
 * regex rather than an import: the eager slot should pay a few bytes, not pull the model in. */
const ROBOT_DOCK_LESSON = /^P\.[1345]$/;

const RobotDock = React.lazy(() => import('../../../robotSim/RobotPane'));

/** The lazy Robot dock for a lesson with a robot view, or null everywhere else. */
export function robotDockFor(lessonId: string, robot: RobotRunApi): React.ReactNode {
  if (!ROBOT_DOCK_LESSON.test(lessonId)) return null;
  return (
    <React.Suspense fallback={null}>
      <RobotDock lessonId={lessonId} robot={robot} />
    </React.Suspense>
  );
}
