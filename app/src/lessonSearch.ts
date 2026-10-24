/**
 * Searching *inside* the lessons (`⌘⇧F`, `app/src/lessonSearch.ts`).
 *
 * The palette already finds a lesson by its id, its title or its two ideas. This answers the other
 * question a learner asks: *which lesson mentions quadrature?* It reads the text the app already
 * carries — the starter, the hint ladder, the instructor's checks and the expected output — so the
 * answer is inside the lesson, not just its name.
 *
 * **The full solution is not indexed, on purpose.** The diff panel refuses to show it until the
 * learner has opened the solution in this visit or passed the lesson (`app/src/diffReference.ts`),
 * and a search box that echoed solution lines would be the same answer through a different door.
 * The rule is a property of this module, not of the screen that calls it.
 *
 * Line numbers are 1-based and count lines **within the field they came from** — a hint is line 3 of
 * the hint block, not line 3 of the file. Only a `starter` hit is a line of the editor, which is why
 * `isEditorLine` exists: everything else opens the lesson, and the row says which panel to look in.
 */

import { PYTHON_LESSONS } from './data/pythonLessonsData.ts';
import type { PythonLessonItem } from './data/pythonLessonsData.ts';
import type { PaletteItem } from './palette.ts';

/** Where a hit came from. `title` is the lesson's own name and ideas, not a line of anything. */
export type LessonField = 'starter' | 'hints' | 'checks' | 'expected' | 'title';

export interface LessonHit {
  lessonId: string;
  title: string;
  field: LessonField;
  /** 1-based, within that field's text. A `title` hit has no line, so it reports 0. */
  line: number;
  /** The matched line, trimmed and shortened, exactly as the row prints it. */
  text: string;
}

/** One letter is in every lesson, so a query needs two before it is a search. */
export const MIN_SEARCH_QUERY = 2;
/** Three lines of one lesson answer "is this the right lesson?"; a fourth is a wall. */
export const MAX_HITS_PER_LESSON = 3;
/** The cap the results list is held to, so a common word cannot build a 200-row dialog. */
export const MAX_SEARCH_HITS = 40;

const FIELD_LABEL: Record<LessonField, string> = {
  starter: 'starter',
  hints: 'hint',
  checks: 'checks',
  expected: 'expected output',
  title: 'title',
};

/** The label a row prints for where the hit is: `hint`, `checks`, `expected output`. */
export function lessonFieldLabel(field: LessonField): string {
  return FIELD_LABEL[field];
}

/** Only a starter line is a position in the editor; everything else names a panel. */
export function isEditorLine(hit: LessonHit): boolean {
  return hit.field === 'starter';
}

function snippet(raw: string, max = 92): string {
  const text = raw.trim().replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function searchableFields(lesson: PythonLessonItem): { field: LessonField; text: string }[] {
  return [
    { field: 'starter', text: lesson.starterCode },
    { field: 'hints', text: lesson.hints.join('\n') },
    { field: 'checks', text: lesson.instructorTests },
    { field: 'expected', text: lesson.expectedOutput },
  ];
}

/**
 * Every hit for one query, in lesson order.
 *
 * A lesson whose id, title or ideas match comes first for that lesson: somebody typing `P.1` is
 * looking for P.1, and its starter's hits are worth less than the fact that the lesson is the one
 * asked for. Nothing is re-sorted across lessons — the catalogue's order is the course's order, and
 * a search result list that reorders the course is a second curriculum to keep honest.
 */
export function searchLessonText(
  query: string,
  lessons: PythonLessonItem[] = PYTHON_LESSONS,
  options: { perLesson?: number; limit?: number } = {}
): LessonHit[] {
  const wanted = query.trim().toLowerCase();
  if (wanted.length < MIN_SEARCH_QUERY) return [];
  const perLesson = Math.max(1, options.perLesson ?? MAX_HITS_PER_LESSON);
  const limit = Math.max(1, options.limit ?? MAX_SEARCH_HITS);

  const hits: LessonHit[] = [];
  for (const lesson of lessons) {
    if (hits.length >= limit) break;
    let taken = 0;
    const headline = `${lesson.id} ${lesson.title} ${lesson.ideas.join(' ')}`.toLowerCase();
    if (headline.includes(wanted)) {
      hits.push({
        lessonId: lesson.id,
        title: lesson.title,
        field: 'title',
        line: 0,
        text: snippet(lesson.title),
      });
      taken += 1;
    }
    for (const { field, text } of searchableFields(lesson)) {
      if (taken >= perLesson) break;
      const lines = text.split('\n');
      for (let index = 0; index < lines.length && taken < perLesson; index += 1) {
        if (!lines[index].toLowerCase().includes(wanted)) continue;
        hits.push({
          lessonId: lesson.id,
          title: lesson.title,
          field,
          line: index + 1,
          text: snippet(lines[index]),
        });
        taken += 1;
      }
    }
  }
  return hits.slice(0, limit);
}

/**
 * The same hits as palette rows.
 *
 * `id` is unique per hit — the palette keys its options and its `aria-activedescendant` by it, so
 * three hits in one lesson must not share one. `lessonId` is what the app opens, and `line` is set
 * only when the hit is a line the editor can actually reveal.
 */
export function lessonSearchItems(
  query: string,
  lessons: PythonLessonItem[] = PYTHON_LESSONS
): PaletteItem[] {
  return searchLessonText(query, lessons).map((hit) => ({
    id: `search-${hit.lessonId}-${hit.field}-${hit.line}`,
    kind: 'lesson',
    lessonId: hit.lessonId,
    ...(isEditorLine(hit) ? { line: hit.line } : {}),
    label: `${hit.lessonId} · ${hit.title}`,
    detail:
      hit.field === 'title'
        ? 'title or ideas — the lesson itself matches'
        : `${lessonFieldLabel(hit.field)} · line ${hit.line} — ${hit.text}`,
  }));
}
