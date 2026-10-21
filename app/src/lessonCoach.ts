// Type-only, and the `.ts` extension is for Node's type stripping (`scripts/test_lesson_draft.mjs`):
// the hole parser and the draft-progress rule are tested as functions, not through a browser.
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

/** One marked hole: what the guide names, and the starter code a learner has to change. */
export interface HoleSpan {
  /** `todo-<n>` for a numbered marker, `line-<index>` for an unnumbered one, `raise-<text>` for a package. */
  key: string;
  /**
   * The code the marker introduces: what a filled hole no longer looks like. Empty for a TODO that
   * leaves no placeholder - there the marker is an insertion point, and anything typed under it is
   * the answer.
   */
  probe: string;
  /** The marker's own words, continuation comments folded in; what the guide prints. */
  label: string;
}

const CODE_LINE = /^[ \t]*\S/;
const COMMENT_LINE = /^[ \t]*#/;
const TODO_MARKER = /^[ \t]*#[ \t]*TODO\b(?:[ \t]*(\d+))?[ \t]*:?[ \t]*(.*)$/i;
const RAISE_MARKER = /raise\s+NotImplementedError\(/;

function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * The code directly under a marker: the first non-comment, non-blank line, plus its neighbours at the
 * same indentation - stopping at the first blank line, which is where a starter stops marking.
 *
 * `safe_cmd = cmd` under `# TODO 1:` is one such probe. A TODO with no placeholder under it has an
 * empty probe: the learner writes that line from nothing.
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
 * A TODO whose sentence wraps onto the comment lines under it reads better as one phrase.
 *
 * Two shapes are folded in: the deeply-indented continuation (`#         and update ...`) and a
 * numbered list (`# 1. Convert ...`, `# 2. Compute ...`), which is how a micro-lab writes its steps
 * under a bare `# TODO 1:`. A plain one-space comment is a different note and stops the fold.
 */
function todoLabel(lines: string[], markerIndex: number, own: string): string {
  let label = own;
  for (let next = markerIndex + 1; next < lines.length; next += 1) {
    const continuation = lines[next].match(/^[ \t]*#[ \t]{2,}(.+)$/);
    const numbered = lines[next].match(/^[ \t]*#[ \t]+(\d+\.\s+.+)$/);
    const piece = continuation?.[1] ?? numbered?.[1];
    if (!piece) break;
    label = label ? `${label} ${piece}` : piece;
  }
  return label;
}

/**
 * Every hole a starter marks, in file order.
 *
 * One parser feeds both surfaces: the guide's "leaves N TODO lines" and the roadmap card's "1 of N"
 * take their count from here, so the two cannot drift into two numbers for the same starter. The
 * markers are `# TODO n:` comments (numbered ones deduplicated, as the guide has always done) and,
 * for a graded package, `raise NotImplementedError(...)`.
 */
export function starterHoles(starter: string, isExercise: boolean): HoleSpan[] {
  const lines = starter.split('\n');
  const spans: HoleSpan[] = [];

  if (isExercise) {
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (!RAISE_MARKER.test(line)) return;
      // Keyed by the raise itself, so a hole is still recognisable after the ones above it are
      // filled and the surviving raises renumber.
      const key = `raise-${compact(line)}`;
      if (seen.has(key)) return;
      seen.add(key);
      const message = line.match(/NotImplementedError\(\s*(?:f)?["']([^"'\n]+)["']/);
      // The raise is both the marker and the placeholder: a filled hole is one where it is gone.
      spans.push({ key, probe: line.trim(), label: message?.[1] ?? line.trim() });
    });
    return spans;
  }

  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const match = line.match(TODO_MARKER);
    if (!match) return;
    const key = match[1] ? `todo-${match[1]}` : `line-${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    spans.push({
      key,
      // An empty probe is the insertion hole: it counts when anything appears under the marker.
      probe: probeAfter(lines, index),
      label: todoLabel(lines, index, match[2] ?? ''),
    });
  });
  return spans;
}

/** What the roadmap card says about a half-finished exercise. */
export interface DraftProgress {
  /** Holes whose marked code the draft has already written. */
  filled: number;
  /** Holes the starter marks - the guide's own count, from the same parser. */
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
 * who deleted the TODO comment but reused the placeholder line does not. A hole with no placeholder
 * is filled by *any* code appearing directly under its marker: there was nothing there to compare, so
 * "something is there now" is the whole of what text can say. Neither rule can be fooled by typing
 * elsewhere in the file, which is what "6 lines changed" could not promise.
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
      const written =
        hole.probe === '' ? compact(inDraft.probe) !== '' : compact(inDraft.probe) !== compact(hole.probe);
      if (written) filled += 1;
    } else if (hole.probe !== '' && !draftText.includes(compact(hole.probe))) {
      // The marker is gone. That counts only when the code it marked is gone with it, so tidying a
      // comment up is not mistaken for work. An insertion hole whose marker was deleted cannot be
      // judged at all, and is left uncounted rather than guessed.
      filled += 1;
    }
  }
  return { filled, total: holes.length, isExercise };
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
  const holes = starterHoles(lesson.starterCode, isExercise);
  // The count and the first hole come from one parse - the same one the roadmap card counts - so
  // "leaves 4 TODO lines" and "0 of 4 written" are the same four lines by construction. The first
  // *readable* hole is the one named: a marker with no words of its own (a bare `# TODO 1:` whose
  // description dropped) must not turn the guide generic.
  const firstHole =
    holes.map((hole) => cleanHole(hole.label)).find((text) => text.length > 0) ??
    'the first marked line in the starter';

  return {
    holeCount: holes.length,
    firstHole,
    check: checkFor(lesson, firstHole),
    finish: finishFor(lesson.expectedOutput),
    isExercise,
  };
}
