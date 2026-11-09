/** The four Python lessons whose goals bind values a robot can show. This module stays tiny: the
 * eager Robot slot needs only these ids, while the model and stage remain in the lazy pane. */
export const ROBOT_LESSON_IDS = ['P.1', 'P.3', 'P.4', 'P.5'] as const;
export type RobotLessonId = (typeof ROBOT_LESSON_IDS)[number];
