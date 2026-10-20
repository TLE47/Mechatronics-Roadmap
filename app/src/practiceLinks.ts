// Explicit `.ts` so the mapping can also be run by Node's type stripping
// (`scripts/test_practice_links.mjs`) without a bundler, and `import type` so the stripped run
// never asks the module for a name it does not export at runtime.
import { PYTHON_LESSONS } from './data/pythonLessonsData.ts';
import type { PythonLessonItem } from './data/pythonLessonsData.ts';
import {
  LEVEL_0_STEPS,
  TIER_1_LINEAR_PASS,
  TIER_2_LINEAR_PASS,
  TIER_3_LINEAR_PASS,
} from './curriculumData.ts';
import type { ActiveTierPass, LinearTrackStep } from './curriculumData.ts';

/**
 * The one link between the roadmap, the workbench and progress.
 *
 * The roadmap used to show a prose "Hands-On Exercise (1/10)" and a checkbox that only recorded a
 * click, while the runner listed the same work under its own numbering ("Step 1", "Steps 3-5").
 * Three numberings, no join. This module derives the join from the two registries that already
 * exist, so it cannot drift: a roadmap step's practice is the set of workbench entries carrying the
 * same track and pass, and every entry can name the roadmap step it serves.
 */

export const TRACK_DIRS = [
  '00-foundations',
  '01-electronics-and-power',
  '02-mechanics-kinematics-dynamics',
  '03-sensors-and-actuators',
  '04-embedded-and-realtime',
  '05-control-and-estimation',
  '06-robotics-and-autonomy',
  '07-systems-hil-and-production',
  '08-capstone-projects',
] as const;

export interface PassStep {
  pass: ActiveTierPass;
  step: LinearTrackStep;
}

export const ALL_PASS_STEPS: PassStep[] = [
  ...LEVEL_0_STEPS.map((step) => ({ pass: 'level0' as ActiveTierPass, step })),
  ...TIER_1_LINEAR_PASS.map((step) => ({ pass: 'tier1' as ActiveTierPass, step })),
  ...TIER_2_LINEAR_PASS.map((step) => ({ pass: 'tier2' as ActiveTierPass, step })),
  ...TIER_3_LINEAR_PASS.map((step) => ({ pass: 'tier3' as ActiveTierPass, step })),
];

/** `t2_tr05` -> 2; `l0_m1` -> 0 (the bench on-ramp is its own pass). */
function tierOf(milestoneId: string): number {
  const match = /^t(\d)_/.exec(milestoneId);
  return match ? Number(match[1]) : 0;
}

const PASS_STEPS: Record<ActiveTierPass, LinearTrackStep[]> = {
  level0: LEVEL_0_STEPS,
  tier1: TIER_1_LINEAR_PASS,
  tier2: TIER_2_LINEAR_PASS,
  tier3: TIER_3_LINEAR_PASS,
};

function passOf(milestoneId: string): ActiveTierPass {
  if (milestoneId.startsWith('t1_')) return 'tier1';
  if (milestoneId.startsWith('t2_')) return 'tier2';
  if (milestoneId.startsWith('t3_')) return 'tier3';
  return 'level0';
}

/**
 * The track folders a step covers, by position in its pass - not by the milestone id.
 *
 * Each pass has eight steps, but step 7 is written as "Track 06 & 07" and the eighth step is
 * Track 08, whose milestone id happens to end in `tr08`. Reading the number out of the id would
 * leave Track 07 unclaimed and hand its entries to the capstone step.
 */
function trackIndicesForStep(step: LinearTrackStep): number[] {
  const steps = PASS_STEPS[passOf(step.milestoneId)];
  const position = steps.findIndex((candidate) => candidate.milestoneId === step.milestoneId);
  if (position < 0) return [];
  if (position === 6) return [6, 7];
  if (position === 7) return [8];
  return [position];
}

/**
 * The workbench entries a roadmap step asks the learner to run.
 *
 * - A pass step takes that track's reading lessons (tier 1 only: they are written once) and the
 *   graded modules for its own pass, `EX.<track>.T<pass>.<n>`.
 * - The bench on-ramp has a single Stage 0 entry, so the first step claims it and the rest say
 *   plainly that there is nothing to load.
 */
export function entriesForStep(step: LinearTrackStep): PythonLessonItem[] {
  if (step.milestoneId.startsWith('l0_')) {
    const index = Number(/^l0_m(\d+)$/.exec(step.milestoneId)?.[1] ?? 0) - 1;
    return PYTHON_LESSONS.filter((entry) => entry.id.startsWith('S0.')).slice(index, index + 1);
  }
  const tier = tierOf(step.milestoneId);
  const trackIndices = trackIndicesForStep(step);
  if (tier < 1 || trackIndices.length === 0) return [];
  const trackDirs: string[] = trackIndices.map((index) => TRACK_DIRS[index]);
  return PYTHON_LESSONS.filter((entry) => {
    if (tier === 1 && trackDirs.includes(entry.track) && /^\d\d\.\d+$/.test(entry.id)) return true;
    const module = /^EX\.(\d\d)-[a-z-]+\.T(\d)\./.exec(entry.id);
    return !!module && trackIndices.includes(Number(module[1])) && Number(module[2]) === tier;
  });
}

/**
 * The Python on-ramp: every `P.` lesson that sits before the roadmap's Level 0. It is not a pass
 * milestone, and the roadmap said nothing about it, so the first fourteen entries a learner meets
 * had no step to belong to.
 */
export const ONRAMP_ENTRIES = PYTHON_LESSONS.filter((entry) => entry.track === 'track-p');

export function onrampVerified(verifiedLessons: Record<string, boolean>): number {
  return ONRAMP_ENTRIES.filter((entry) => verifiedLessons[entry.id]).length;
}

export function firstUnverifiedOnrampEntry(
  verifiedLessons: Record<string, boolean>
): PythonLessonItem | null {
  return ONRAMP_ENTRIES.find((entry) => !verifiedLessons[entry.id]) ?? ONRAMP_ENTRIES[0] ?? null;
}

const STEP_BY_ENTRY = new Map<string, PassStep>();
for (const passStep of ALL_PASS_STEPS) {
  for (const entry of entriesForStep(passStep.step)) {
    // An exercise id belongs to exactly one step; a second claim would mean the track/pass split
    // is wrong and the runner's breadcrumb could name the wrong step.
    if (!STEP_BY_ENTRY.has(entry.id)) STEP_BY_ENTRY.set(entry.id, passStep);
  }
}

/** The roadmap step whose practice includes this entry, or null for the Python on-ramp. */
export function roadmapStepForLesson(lessonId: string): PassStep | null {
  return STEP_BY_ENTRY.get(lessonId) ?? null;
}

/** How many of a step's entries the browser has actually executed and passed. */
export function verifiedForStep(
  step: LinearTrackStep,
  verifiedLessons: Record<string, boolean>
): number {
  return entriesForStep(step).filter((entry) => verifiedLessons[entry.id]).length;
}

/** The first entry the learner has not passed, so "open" lands on work that is still open. */
export function firstUnverifiedEntry(
  step: LinearTrackStep,
  verifiedLessons: Record<string, boolean>
): PythonLessonItem | null {
  const entries = entriesForStep(step);
  return entries.find((entry) => !verifiedLessons[entry.id]) ?? entries[0] ?? null;
}
