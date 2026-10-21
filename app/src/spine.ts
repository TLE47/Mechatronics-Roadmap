import { SPINE_SOURCE, type SpineStepData } from './data/spineData.ts';
// `import type` so Node's type stripping can run this module without a bundler
// (`scripts/test_spine.mjs`), the same way `practiceLinks.ts` is imported there.
import { PYTHON_LESSONS } from './data/pythonLessonsData.ts';
import type { PythonLessonItem } from './data/pythonLessonsData.ts';
import {
  ALL_PASS_STEPS,
  TRACK_DIRS,
  entriesForStep,
  type PassStep,
} from './practiceLinks.ts';
import type { ActiveTierPass } from './curriculumData.ts';

/**
 * One spine: the ten steps the reading route prints, with the workbench's entries hung on them.
 *
 * Before this file the app had four numberings at once - ten reading steps, four passes, eight
 * tracks, and the runner's own "Step 1 / Steps 3-5 / Steps 6-10" - so a learner could not tell
 * whether they were on step 1 or 6. The step titles and outcomes are copied from
 * `scripts/route_model.py` by `scripts/generate_spine_data.py`; the entries are joined from the
 * registry the runner already lists. Nothing here is hand-typed prose.
 */

export interface HourRange {
  low: number;
  high: number;
}

export interface SpineStep {
  /** 1..10, the number every surface prints. */
  number: number;
  slug: string;
  title: string;
  outcome: string;
  start: string;
  /** Track directories this step covers: 00..08, or none for the two on-ramp steps. */
  trackDirs: string[];
  /** Workbench entries in every depth, in registry order. */
  entries: PythonLessonItem[];
  /**
   * Focused hours from the pages' own metadata: the arm pass, the depth pass split into its
   * Tier 2 and Tier 3 halves (the matrix's Depth 2 and Depth 3 columns), and their sum.
   */
  hours: {
    arm: HourRange;
    depth2: HourRange;
    depth3: HourRange;
    depth: HourRange;
    total: HourRange;
  };
}

export const SPINE_STEP_COUNT = SPINE_SOURCE.length;

/** `00-foundations.T1.00a` or `00-foundations/00.1-...md` -> the `00` track number. */
function trackNumber(text: string): number | null {
  const match = /(?:^EX\.)?(\d\d)-/.exec(text) ?? /^(\d\d)[./]/.exec(text);
  return match ? Number(match[1]) : null;
}

function trackDirsOf(step: SpineStepData): string[] {
  const numbers = new Set<number>();
  for (const id of [...step.modules, ...step.optional]) {
    const number = trackNumber('EX.' + id);
    if (number !== null) numbers.add(number);
  }
  for (const path of step.lessons) {
    const number = trackNumber(path);
    if (number !== null) numbers.add(number);
  }
  return [...numbers].sort((a, b) => a - b).map((number) => TRACK_DIRS[number]);
}

/** The depth's roadmap step for spine steps 3-10; the eight positions of a pass, in order. */
function passStep(spineNumber: number, pass: ActiveTierPass): PassStep | null {
  if (spineNumber < 3) return null;
  return ALL_PASS_STEPS.filter((candidate) => candidate.pass === pass)[spineNumber - 3] ?? null;
}

const ONRAMP_STEP = 1;
const BENCH_STEP = 2;
const ONRAMP_LAST_STEP = 2;

function entriesForSpineStep(source: SpineStepData): PythonLessonItem[] {
  if (source.number === ONRAMP_STEP) {
    return PYTHON_LESSONS.filter((entry) => entry.track === 'track-p');
  }
  if (source.number === BENCH_STEP) {
    return PYTHON_LESSONS.filter((entry) => entry.track === 'stage-0');
  }
  const dirs = new Set(trackDirsOf(source));
  return PYTHON_LESSONS.filter((entry) => {
    const number = trackNumber(entry.id) ?? trackNumber(entry.path);
    return number !== null && dirs.has(TRACK_DIRS[number]);
  });
}

/**
 * Workbench entries that sit before Step 1 rather than inside it: the school-maths ramp.
 *
 * They are runnable and graded like every other entry, so they are listed in the runner and their
 * pages carry the "run this" callout, but they are remedial - the Tier 1 exit check sends a miss
 * here - so they are not a completion requirement of Step 1 and do not belong in `step.entries`.
 */
export const PRE_STEP_RAMP: PythonLessonItem[] = PYTHON_LESSONS.filter(
  (entry) => entry.track === 'ramp'
);

export const SPINE: SpineStep[] = SPINE_SOURCE.map((source) => ({
  number: source.number,
  slug: source.slug,
  title: source.title,
  outcome: source.outcome,
  start: source.start,
  trackDirs: trackDirsOf(source),
  entries: entriesForSpineStep(source),
  hours: source.hours,
}));

const STEP_BY_ENTRY = new Map<string, SpineStep>();
for (const step of SPINE) {
  for (const entry of step.entries) {
    if (!STEP_BY_ENTRY.has(entry.id)) STEP_BY_ENTRY.set(entry.id, step);
  }
}

/** The spine step an entry serves, or null when the registry has no step for it. */
export function spineStepForEntry(lessonId: string): SpineStep | null {
  return STEP_BY_ENTRY.get(lessonId) ?? null;
}

/** The depth whose modules include this entry: 1..3, or 0 for the on-ramp's own entries. */
export function depthForEntry(lessonId: string): ActiveTierPass | null {
  for (const pass of ['tier1', 'tier2', 'tier3'] as ActiveTierPass[]) {
    const found = ALL_PASS_STEPS.find(
      (candidate) => candidate.pass === pass && entriesForStep(candidate.step).some((e) => e.id === lessonId)
    );
    if (found) return pass;
  }
  return null;
}

/** The milestones a step asks for, one per depth (empty for steps 1 and 2). */
export function milestonesForStep(step: SpineStep): PassStep[] {
  return (['tier1', 'tier2', 'tier3'] as ActiveTierPass[])
    .map((pass) => passStep(step.number, pass))
    .filter((found): found is PassStep => found !== null);
}

/** The roadmap step for one depth of this spine step, or null on the on-ramp. */
export function stepAtDepth(step: SpineStep | number, pass: ActiveTierPass): PassStep | null {
  const number = typeof step === 'number' ? step : step.number;
  return passStep(number, pass);
}

/** The entries this step asks for at one depth (all of them on the on-ramp). */
export function entriesAtDepth(step: SpineStep, pass: ActiveTierPass): PythonLessonItem[] {
  const at = stepAtDepth(step, pass);
  if (!at) return step.entries;
  return entriesForStep(at.step);
}

/**
 * A step is complete at a depth when every entry that depth lists has been executed and passed
 * here. No tick can make it complete, which is the point: the number on the step is evidence.
 */
export function stepCompleteAtDepth(
  step: SpineStep,
  pass: ActiveTierPass,
  verifiedLessons: Record<string, boolean>
): boolean {
  const entries = entriesAtDepth(step, pass);
  return entries.length > 0 && entries.every((entry) => !!verifiedLessons[entry.id]);
}

export function stepsCompleteAtDepth(
  pass: ActiveTierPass,
  verifiedLessons: Record<string, boolean>
): number {
  return SPINE.filter((step) => stepCompleteAtDepth(step, pass, verifiedLessons)).length;
}

/** The step's own name for a breadcrumb: `Step 6 of 10 · Measure the joint`. */
export function stepLabel(step: SpineStep): string {
  return `Step ${step.number} of ${SPINE_STEP_COUNT} · ${step.title}`;
}

/** `17–21 h`, or `34.5 h` where the pages give one value rather than a range. */
export function hoursRange(range: HourRange): string {
  return range.low === range.high ? `${range.low} h` : `${range.low}–${range.high} h`;
}

/**
 * The cost line the step card, the runner header and the matrix row all print, from the same
 * sums: `17–21 h · arm 6.5–10.5 h · depth 10.5 h`. Steps 1-2 are the on-ramp and have no depth
 * layer, so they say that plainly instead of printing `depth 0 h`. The number, not a zero in
 * the depth sum, decides that: Step 10's capstone is all arm work and is not an on-ramp.
 */
export function stepCostLabel(step: SpineStep): string {
  if (step.number <= ONRAMP_LAST_STEP) {
    return `${hoursRange(step.hours.total)} · on-ramp, one layer`;
  }
  return costLabel(step.hours);
}

/** The same line from sums that are not one step's: a table footer totals them. */
export function costLabel(hours: SpineStep['hours']): string {
  return `${hoursRange(hours.total)} · ${layerLabel(hours)}`;
}

/**
 * The arm/depth split on its own, for a narrow cell where the total sits on its own line.
 * Step 10 has no depth layer and says so by saying nothing about one.
 */
export function layerLabel(hours: SpineStep['hours']): string {
  if (hours.depth.high === 0) return `arm ${hoursRange(hours.arm)}`;
  return `arm ${hoursRange(hours.arm)} · depth ${hoursRange(hours.depth)}`;
}

/** Printed precision, so a footer does not show `169.84999999999997 h`. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The rows' own sums, added up. A matrix footer typed by hand is a second total that can
 * disagree with the rows above it; this one cannot.
 */
export function sumHours(steps: SpineStep[]): SpineStep['hours'] {
  const add = (pick: (hours: SpineStep['hours']) => HourRange): HourRange => ({
    low: round2(steps.reduce((sum, step) => sum + pick(step.hours).low, 0)),
    high: round2(steps.reduce((sum, step) => sum + pick(step.hours).high, 0)),
  });
  return {
    arm: add((hours) => hours.arm),
    depth2: add((hours) => hours.depth2),
    depth3: add((hours) => hours.depth3),
    depth: add((hours) => hours.depth),
    total: add((hours) => hours.total),
  };
}

/**
 * A matrix cell: the hours, or an em dash where the step asks for nothing at that depth.
 * Printing `0 h` would read as a free column rather than an empty one.
 */
export function columnHours(range: HourRange): string {
  return range.high === 0 ? '—' : hoursRange(range);
}

const DEPTH_ORDER: ActiveTierPass[] = ['tier1', 'tier2', 'tier3'];

/**
 * The short breadcrumb any surface prints for a depth's roadmap step: `Step 6 of 10 · Depth 2`.
 *
 * It reads the spine, not the step's own `stepNumber`, because a second spelling of the same
 * position ("T2 · Step 6 / 8") is exactly the drift this file exists to end: the eight is a
 * position inside one depth, and a learner who sees it beside a page that says "Step 6 of 10"
 * cannot tell which of the two numbers to write down.
 */
export function stepBreadcrumb(at: PassStep): string {
  const spineStep = stepForMilestone(at.step.milestoneId);
  const depth = DEPTH_ORDER.indexOf(at.pass) + 1;
  if (!spineStep) return `Depth ${depth}`;
  return `Step ${spineStep.number} of ${SPINE_STEP_COUNT} · Depth ${depth}`;
}

export function passOfMilestone(milestoneId: string): ActiveTierPass | null {
  const found = ALL_PASS_STEPS.find((candidate) => candidate.step.milestoneId === milestoneId);
  return found ? found.pass : null;
}

export function stepForMilestone(milestoneId: string): SpineStep | null {
  for (const step of SPINE) {
    if (milestonesForStep(step).some((found) => found.step.milestoneId === milestoneId)) return step;
  }
  return null;
}

/** The page a step starts on, for a "read the page" link that does not repeat a path. */
export function startEntryForStep(step: SpineStep): PythonLessonItem | null {
  return (
    PYTHON_LESSONS.find((entry) => entry.path === step.start) ??
    step.entries[0] ??
    null
  );
}

export type { ActiveTierPass, PassStep };
