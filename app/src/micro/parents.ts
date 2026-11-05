/**
 * Parent-lesson metadata (`app/src/micro/parents.ts`).
 *
 * Runtime code may read this checked-in manifest, but never the filesystem or a Markdown page.
 * The Python adapter writes `parentLessons.json` at build time; a second subject adds an adapter,
 * not a second runtime reader.
 */

import PARENT_LESSONS from '../data/parentLessons.json';

export interface ParentLessonRef {
  id: string;
  subjectId: string;
  title: string;
  path: string;
  sourceFormat: string;
}

export interface ParentLessonAdapter {
  subjectId: string;
  list(): ParentLessonRef[];
  read(ref: ParentLessonRef): ParentLessonRef | null;
}

const LESSONS = (PARENT_LESSONS as { lessons: ParentLessonRef[] }).lessons;

export const PYTHON_PARENT_ADAPTER: ParentLessonAdapter = {
  subjectId: 'python',
  list: () => LESSONS.filter((lesson) => lesson.subjectId === 'python'),
  read: (ref) =>
    LESSONS.find((lesson) => lesson.subjectId === ref.subjectId && lesson.id === ref.id) ?? null,
};

export function parentLesson(ref: ParentLessonRef): ParentLessonRef | null {
  return PYTHON_PARENT_ADAPTER.read(ref);
}

export function parentLessonHref(ref: ParentLessonRef, anchor?: string): string {
  return `?lesson=${encodeURIComponent(ref.id)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
}
