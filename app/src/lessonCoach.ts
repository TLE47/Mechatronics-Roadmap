// Type-only, and the `.ts` extension is for Node's type stripping (`scripts/test_lesson_draft.mjs`):
// the draft-progress rule below is tested as a function, not through a browser.
import type { PythonLessonItem } from './data/pythonLessonsData.ts';

/**
 * A short, lesson-specific first-run brief.
 *
 * The workbench already has the two things a newcomer needs before pressing Run: the starter's
 * marked holes and the instructor's own description of what it checks. This module turns them into
 * one sentence each, so the coach is not a generic "change a TODO" paragraph on every entry.
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

/** One marked hole, and the starter text a learner has to change to fill it. */
export interface HoleSpan {
  /** `todo-<n>` for a numbered marker, `line-<index>` for an unnumbered one. */
  key: string;
  /** The code the marker introduces: what a filled hole no longer looks like. */
  probe: string;
}

const CODE_LINE = /^[ \t]*\S/;
const COMMENT_LINE = /^[ \t]*#/;

function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * The code directly under a marker: the first non-comment, non-blank line, plus its neighbours at the
 * same indentation - stopping at the first blank line, which is where a starter stops marking.
 *
 * `safe_cmd = cmd` under `# TODO 1:` is one such probe. A TODO with no placeholder under it (the
 * learner writes a line that is not there yet) has an empty probe, and its span is used instead.
 */
function probeAfter(lines: string[], markerIndex: number): string {
  const collected: string[] = [];
  let indent: number | null = null;
  for (let index = markerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) break;
    if (COMMENT_LINE.test(line)) continue;
    if (!CODE_LINE.test(line)) continue;
    const own = line.length - line.trimStart().length;
    if (indent === null) indent = own;
    else if (own < indent) break;
    collected.push(line);
  }
  return collected.join('\n');
}

/**
 * The spans a starter marks that this measure can compare, in file order.
 *
 * The markers are the same two the coach counts above (`# TODO n:` comments and `raise
 * NotImplementedError("...")`), so the card and the guide are reading one definition of a hole - with
 * one honest difference: a TODO whose starter leaves no placeholder under it cannot be measured by
 * text, and is not counted, while the guide still mentions it.
 */
export function starterHoles(starter: string, isExercise: boolean): HoleSpan[] {
  const lines = starter.split('\n');
  if (isExercise) {
    const spans: HoleSpan[] = [];
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (!/raise\s+NotImplementedError\(/.test(line)) return;
      // Keyed by the raise itself, so a hole is still recognisable after the ones above it are
      // filled and the surviving raises renumber.
      const key = `raise-${compact(line)}`;
      if (seen.has(key)) return;
      seen.add(key);
      // The raise is both the marker and the placeholder: a filled hole is one where it is gone.
      spans.push({ key, probe: line.trim() });
    });
    return spans;
  }

  const matcher = /^[ \t]*#[ \t]*TODO\b(?:[ \t]*(\d+))?/i;
  const seen = new Set<string>();
  const spans: HoleSpan[] = [];
  lines.forEach((line, index) => {
    const match = line.match(matcher);
    if (!match) return;
    const key = match[1] ? `todo-${match[1]}` : `line-${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    // No placeholder under the marker means there is nothing to compare against: a learner writes
    // that line from nothing, and the scaffolding further down is not theirs to edit. Such a hole is
    // left out of the count rather than guessed at, so "3 of 4" is never three edits of `print`.
    const placeholder = probeAfter(lines, index);
    if (placeholder) spans.push({ key, probe: placeholder });
  });
  return spans;
}

/** What the roadmap card says about a half-finished exercise. */
export interface DraftProgress {
  /** Holes whose marked code the draft has already changed. */
  filled: number;
  /** Holes the starter marks in a way this can measure; 0 when the starter marks none. */
  total: number;
  /** True for a graded exercise bundle, which counts `raise NotImplementedError` instead. */
  isExercise: boolean;
}

/**
 * How much of a half-written exercise is written - the card's answer to "how close is this to
 * passing", as far as text can tell.
 *
 * It is deliberately a *text* measure and says so: filling every hole is necessary and not
 * sufficient, because the instructor's behavioural checks still have to run and agree. What it will
 * not do is guess from line counts, which is why run 136's "6 lines changed" could sit beside an
 * untouched starter.
 *
 * A hole counts as filled when the code its marker introduced is no longer in the draft - compared
 * by the probe rather than by position, so indenting or moving the answer still counts, and a learner
 * who deleted the TODO comment but reused the placeholder line does not.
 */
export function draftProgress(code: string, lesson: PythonLessonItem): DraftProgress {
  const isExercise = lesson.track === 'modules';
  const holes = starterHoles(lesson.starterCode, isExercise);
  if (holes.length === 0) return { filled: 0, total: 0, isExercise };
  const draftHoles = new Map(starterHoles(code, isExercise).map((hole) => [hole.key, hole]));
  const draftText = compact(code);
  let filled = 0;
  for (const hole of holes) {
    const inDraft = draftHoles.get(hole.key);
    if (inDraft) {
      if (compact(inDraft.probe) !== compact(hole.probe)) filled += 1;
    } else if (!draftText.includes(compact(hole.probe))) {
      // The marker is gone. That counts only when the code it marked is gone with it, so tidying a
      // comment up is not mistaken for work.
      filled += 1;
    }
  }
  return { filled, total: holes.length, isExercise };
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
