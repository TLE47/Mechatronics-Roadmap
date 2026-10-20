import { PythonLessonItem } from './data/pythonLessonsData';

/**
 * A short, lesson-specific first-run brief.
 *
 * The workbench already has the two things a newcomer needs before pressing Run: the starter's
 * marked holes and the instructor's own description of what it checks. This module turns them into
 * one sentence each, so the coach is not a generic "change a TODO" paragraph on all 86 entries.
 */
export interface LessonCoach {
  /** Number of TODO/NotImplementedError holes the starter leaves. */
  holeCount: number;
  /** The first hole, with its marker and backticks removed. */
  firstHole: string;
  /** What the first instructor check is looking for. */
  check: string;
  /** The first line or two of the target output. */
  finish: string;
  /** True for a graded exercise bundle, false for a hand-written lesson page. */
  isExercise: boolean;
}

const MAX_HOLE_CHARS = 150;
const MAX_CHECK_CHARS = 190;
const MAX_FINISH_CHARS = 150;

function squeeze(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function trim(text: string, max: number): string {
  const clean = squeeze(text).replace(/`/g, '').replace(/^["']|["']$/g, '');
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** `# TODO 1: ...` comments, with numbered markers deduplicated. */
function todoHoles(starter: string): { count: number; first: string } {
  const matcher = /^[ \t]*#[ \t]*TODO\b(?:[ \t]*(\d+))?[ \t]*:?[ \t]*(.*)$/gim;
  const lines = starter.split('\n');
  const seen = new Set<string>();
  let first = '';

  for (const match of starter.matchAll(matcher)) {
    const key = match[1] ? `todo-${match[1]}` : `line-${match.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (first) continue;

    let text = match[2] || '';
    if (match.index !== undefined) {
      const lineIndex = starter.slice(0, match.index).split('\n').length - 1;
      // A TODO that wraps onto indented comment lines reads better as one sentence.
      for (let next = lineIndex + 1; next < lines.length; next += 1) {
        const continuation = lines[next].match(/^[ \t]*#[ \t]{2,}(.+)$/);
        if (!continuation) break;
        text += ` ${continuation[1]}`;
      }
    }
    first = text;
  }

  return { count: seen.size, first };
}

/** `raise NotImplementedError("TODO 1: ...")` and the exercise packages' unnumbered holes. */
function notImplementedHoles(starter: string): { count: number; first: string } {
  const matcher = /raise\s+NotImplementedError\(\s*(?:f)?["']([^"'\n]+)["']\s*\)/g;
  let count = 0;
  let first = '';
  for (const match of starter.matchAll(matcher)) {
    count += 1;
    if (!first) first = match[1];
  }
  return { count, first };
}

function cleanHole(text: string): string {
  const cleaned = text
    .replace(/^TODO\s*\d+\s*[:.-]?\s*/i, '')
    .replace(/^Implement\s+/i, '')
    .trim();
  return trim(cleaned || text, MAX_HOLE_CHARS);
}

function checkFor(lesson: PythonLessonItem, firstHole: string): string {
  if (lesson.track === 'modules') {
    return firstHole
      ? `the package's own self-check, which fails first on "${firstHole}"`
      : "the package's own self-check, which names the first behaviour to fix";
  }
  const summary =
    lesson.instructorTestSummary.find((line) => line && !/^Re-evaluate/i.test(line)) ||
    lesson.instructorTestSummary[0] ||
    'the lesson behavioural checks';
  return trim(summary, MAX_CHECK_CHARS);
}

function finishFor(expectedOutput: string): string {
  const lines = expectedOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
  return trim(lines.join(' · ') || 'the Expected Output panel', MAX_FINISH_CHARS);
}

export function coachForLesson(lesson: PythonLessonItem): LessonCoach {
  const isExercise = lesson.track === 'modules';
  const exercise = notImplementedHoles(lesson.starterCode);
  const lessonHoles = todoHoles(lesson.starterCode);
  // A beginner page marks its holes in comments; a package marks them in the exception it raises.
  const primary = isExercise ? exercise : lessonHoles;
  const fallback = isExercise ? lessonHoles : exercise;
  const holes = primary.count > 0 ? primary : fallback;
  const firstHole = cleanHole(holes.first) || 'the first marked line in the starter';

  return {
    holeCount: holes.count,
    firstHole,
    check: checkFor(lesson, firstHole),
    finish: finishFor(lesson.expectedOutput),
    isExercise,
  };
}
