/**
 * Missions, joined to the curriculum without copying it (`app/src/gamification/missions.ts`).
 *
 * A mission names a spine step; the spine names the lessons. That is the whole join, and it is why
 * `content/missions/*.yaml` never lists a lesson id: a second copy of the curriculum is a second
 * thing that can disagree with the first.
 *
 * "Verified" is the arm pass (Tier 1) of the step, which is the pass the pages ask every reader to
 * work through first. A mission is verified when every entry that pass lists has been executed and
 * passed here — no tick, no XP, no time on page can make it verified.
 */
import { entriesAtDepth, SPINE, type SpineStep } from '../spine.ts';
import type { PythonLessonItem } from '../data/pythonLessonsData.ts';
import { MISSIONS, type Mission } from '../content/loader.ts';

export interface MissionProgress {
  mission: Mission;
  step: SpineStep;
  entries: PythonLessonItem[];
  verifiedCount: number;
  total: number;
  /** Every entry the mission asks for has been verified here. */
  verified: boolean;
  /** Verified entries ÷ total, 0..1. The LV bar's notches and the Rebuild meter both read it. */
  fraction: number;
}

const STEP_BY_NUMBER = new Map(SPINE.map((step) => [step.number, step]));

export function missionProgress(
  mission: Mission,
  verifiedLessons: Record<string, boolean>
): MissionProgress {
  const step = STEP_BY_NUMBER.get(mission.spineStep);
  const entries = step ? entriesAtDepth(step, 'tier1') : [];
  const verifiedCount = entries.filter((entry) => !!verifiedLessons[entry.id]).length;
  const total = entries.length;
  return {
    mission,
    step: step ?? SPINE[SPINE.length - 1],
    entries,
    verifiedCount,
    total,
    verified: total > 0 && verifiedCount === total,
    fraction: total === 0 ? 0 : verifiedCount / total,
  };
}

/** All ten, in mission order. */
export function missionProgressForAll(verifiedLessons: Record<string, boolean>): MissionProgress[] {
  return [...MISSIONS]
    .sort((a, b) => a.number - b.number)
    .map((mission) => missionProgress(mission, verifiedLessons));
}

/**
 * How many missions are verified in an unbroken run from Mission 1.
 *
 * Contiguity is deliberate: a level says "you finished the chapters before this one", and skipping
 * a chapter would make the ladder a score rather than a record. Because a verification is never
 * removed by this app, the number can only grow.
 */
export function verifiedMissionCount(verifiedLessons: Record<string, boolean>): number {
  const progress = missionProgressForAll(verifiedLessons);
  let count = 0;
  for (const mission of progress) {
    if (!mission.verified) break;
    count += 1;
  }
  return count;
}

/** The earliest mission not yet verified: what "Continue" means. */
export function nextMission(verifiedLessons: Record<string, boolean>): MissionProgress | null {
  return missionProgressForAll(verifiedLessons).find((mission) => !mission.verified) ?? null;
}

/** The mission a lesson counts toward, by the spine step that lists it. */
export function missionForEntry(lessonId: string, verifiedLessons: Record<string, boolean>): MissionProgress | null {
  for (const mission of missionProgressForAll(verifiedLessons)) {
    if (mission.entries.some((entry) => entry.id === lessonId)) return mission;
  }
  return null;
}

/** A headline the door card and Mission Control share: `3 of 21 checks`. */
export function missionCheckLabel(progress: MissionProgress): string {
  if (progress.total === 0) return 'No checks listed yet';
  if (progress.verified) return `${progress.total} of ${progress.total} checks`;
  return `${progress.verifiedCount} of ${progress.total} checks`;
}
