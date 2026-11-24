/**
 * The Learning Path's data model (`app/src/learningPath.ts`).
 *
 * Pure functions over the real curriculum and the real progress maps, so the page draws what the
 * runner already believes and the prototype can grow to all 97 entries by passing their ids. It
 * creates no second curriculum and stores nothing.
 *
 * The prototype is the first six Python lessons as the generated registry orders them:
 * `P.1`, `P.2`, `P.2.5`, `P.3`, `P.4`, `P.5`. `P.2.5` sits between `P.2` and `P.3` in the course,
 * which is why the six are not "P.1 to P.6".
 *
 * States, with the approved one-step rule:
 *
 * - **completed** — the lesson is verified in this browser (or the account) already.
 * - **current** — the first unverified lesson in the slice: the one "Continue" belongs to.
 * - **available** — the lesson immediately after the current one. A learner can step one ahead;
 *   that is what keeps the next platform from looking shut.
 * - **locked** — every later unverified lesson. Locked is preview-only: the platform opens its
 *   card and names the missing prerequisite, and the action is refused. A deep link still opens the
 *   lesson, because the runner's own navigation is not the path's to take away.
 */

import { PYTHON_LESSONS, type PythonLessonItem } from './data/pythonLessonsData.ts';
import { regionForTrack, type PathRegionId } from './learningPathRegions.ts';

export const PROTOTYPE_LESSON_IDS = ['P.1', 'P.2', 'P.2.5', 'P.3', 'P.4', 'P.5'] as const;

export type PathState = 'completed' | 'current' | 'available' | 'locked';

export type LandmarkKey =
  | 'storage-tower'
  | 'operator-tower'
  | 'blueprint-tower'
  | 'branch-arch'
  | 'library-ring'
  | 'robot-factory'
  | 'region-tower';

export interface PathAction {
  kind: 'review' | 'continue' | 'start' | 'locked';
  label: string;
}

export interface PathNode {
  lesson: PythonLessonItem;
  /** 1-based position in the path slice, printed on the label. */
  index: number;
  region: PathRegionId;
  landmark: LandmarkKey;
  state: PathState;
  action: PathAction;
  /** The lesson whose verification opens this one, named only when it is locked. */
  prerequisite: string | null;
}

export interface PathInput {
  verified: Record<string, boolean>;
  /** The lesson the learner last opened, for Continue versus Start. */
  lastLessonId?: string | null;
  /** The slice to draw. Defaults to the six-lesson prototype. */
  lessonIds?: readonly string[];
  /** The registry to read. Injected so the unit suite can name its own rows. */
  lessons?: readonly PythonLessonItem[];
}

/** The prototype's six rows, in curriculum order, ignoring an id this build does not list. */
export function prototypeLessons(
  lessons: readonly PythonLessonItem[] = PYTHON_LESSONS
): PythonLessonItem[] {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  return PROTOTYPE_LESSON_IDS.map((id) => byId.get(id)).filter(
    (lesson): lesson is PythonLessonItem => Boolean(lesson)
  );
}

/** The per-lesson landmark, so a new lesson needs a mapping, not a layout edit. */
const LANDMARK_BY_ID: Record<string, LandmarkKey> = {
  'P.1': 'storage-tower',
  'P.2': 'operator-tower',
  'P.2.5': 'blueprint-tower',
  'P.3': 'branch-arch',
  'P.4': 'library-ring',
  'P.5': 'robot-factory',
};

const LANDMARK_RULES: Array<[RegExp, LandmarkKey]> = [
  [/variable|data type|store|storage/i, 'storage-tower'],
  [/arithmetic|order of operations|operator/i, 'operator-tower'],
  [/comment|document|docstring/i, 'blueprint-tower'],
  [/decision|condition|clamp|branch|truth/i, 'branch-arch'],
  [/list|loop|iteration|for-loop|while-loop/i, 'library-ring'],
  [/function|module|assert|robot|factory/i, 'robot-factory'],
];

/** The structure a lesson raises. An unmapped lesson gets its region's tower, never nothing. */
export function landmarkFor(lesson: Pick<PythonLessonItem, 'id' | 'title'>): LandmarkKey {
  const known = LANDMARK_BY_ID[lesson.id];
  if (known) return known;
  for (const [pattern, key] of LANDMARK_RULES) if (pattern.test(lesson.title)) return key;
  return 'region-tower';
}

/**
 * Build the path: one node per lesson, in order, with its state and the one action it allows.
 *
 * No clock, randomness or storage. The caller passes the verified map and (optionally) the last
 * lesson; the same inputs always draw the same city.
 */
export function buildLearningPath(input: PathInput): PathNode[] {
  const ids = input.lessonIds ?? PROTOTYPE_LESSON_IDS;
  const byId = new Map((input.lessons ?? PYTHON_LESSONS).map((lesson) => [lesson.id, lesson]));
  const lessons = ids
    .map((id) => byId.get(id))
    .filter((lesson): lesson is PythonLessonItem => Boolean(lesson));

  const verified = input.verified ?? {};
  const firstUnverified = lessons.findIndex((lesson) => !verified[lesson.id]);
  const lastId = input.lastLessonId ?? null;

  return lessons.map((lesson, index) => {
    let state: PathState;
    if (verified[lesson.id]) state = 'completed';
    else if (firstUnverified === -1) state = 'completed';
    else if (index === firstUnverified) state = 'current';
    else if (index === firstUnverified + 1) state = 'available';
    else state = 'locked';

    const previous = index > 0 ? lessons[index - 1] : null;
    const prerequisite = state === 'locked' && previous ? previous.title : null;

    const action: PathAction =
      state === 'completed'
        ? { kind: 'review', label: 'Review lesson' }
        : state === 'current'
          ? lastId === lesson.id
            ? { kind: 'continue', label: 'Continue lesson' }
            : { kind: 'start', label: 'Start lesson' }
          : state === 'available'
            ? { kind: 'start', label: 'Start lesson' }
            : { kind: 'locked', label: 'Locked' };

    return {
      lesson,
      index: index + 1,
      region: regionForTrack(lesson.track),
      landmark: landmarkFor(lesson),
      state,
      action,
      prerequisite,
    };
  });
}

/** How much of the slice is verified, for the header's meter. */
export function pathSummary(nodes: readonly PathNode[]): { done: number; total: number } {
  return {
    done: nodes.filter((node) => node.state === 'completed').length,
    total: nodes.length,
  };
}

/** The words a platform announces, including its state: the label is never colour alone. */
export function stateLabel(state: PathState): string {
  switch (state) {
    case 'completed':
      return 'Completed';
    case 'current':
      return 'Current lesson';
    case 'available':
      return 'Available';
    case 'locked':
      return 'Locked';
  }
}
