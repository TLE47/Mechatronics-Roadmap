/**
 * The Learning Path's five region identities (`app/src/learningPathRegions.ts`).
 *
 * The curriculum carries a `track`, not a `subject`. This module is the one place that translates
 * one into the other: the map from track (and from a module exercise's embedded subject) to the
 * five regions the world draws. A new track lands in the right quarter by its number prefix, and
 * an unknown slug still lands somewhere honest (the programming labs) rather than on a blank
 * platform.
 *
 * The fifty module exercises are not one subject: their id names the track they exercise
 * (`EX.02-mechanics.T1.02a`), so a module is drawn in the quarter of the subject it belongs to.
 */

export type PathRegionId = 'programming' | 'electronics' | 'robotics' | 'cad' | 'mathematics';

export interface PathRegion {
  id: PathRegionId;
  /** Printed in the preview and used as the scenery's region label. */
  label: string;
  /** One sentence: what this quarter of the city is for. */
  note: string;
}

export const PATH_REGIONS: Record<PathRegionId, PathRegion> = {
  programming: {
    id: 'programming',
    label: 'Programming labs',
    note: 'Computational buildings, data towers and the editorial desks that turn code into prose.',
  },
  electronics: {
    id: 'electronics',
    label: 'Circuit yards',
    note: 'Power stations, breadboard halls and the traces that carry a signal to the next block.',
  },
  robotics: {
    id: 'robotics',
    label: 'Robotics works',
    note: 'Assembly gantries, sensor rigs and the benches where a mechanism earns its tolerances.',
  },
  cad: {
    id: 'cad',
    label: 'Modelling studios',
    note: 'Drafting towers and geometric scaffolds for parts that only exist as numbers so far.',
  },
  mathematics: {
    id: 'mathematics',
    label: 'Analysis quarter',
    note: 'The observatory end of the city, where rates, estimates, transforms and proofs are drawn.',
  },
};

/** Every real track in today's curriculum, mapped once. */
const BY_TRACK: Record<string, PathRegionId> = {
  'track-p': 'programming',
  // The ramp is rates, accumulation, state vectors and matrix steps: analysis, not syntax.
  ramp: 'mathematics',
  'stage-0': 'electronics',
  // Foundations is the effort/flow and spring-damper modelling quarter.
  '00-foundations': 'mathematics',
  '01-electronics-and-power': 'electronics',
  // Frames, forward/inverse kinematics and mechanisms are the drawing-board quarter.
  '02-mechanics-kinematics-dynamics': 'cad',
  '03-sensors-and-actuators': 'robotics',
  '04-embedded-and-realtime': 'robotics',
  '05-control-and-estimation': 'mathematics',
  '06-robotics-and-autonomy': 'robotics',
  '07-systems-hil-and-production': 'robotics',
  '08-capstone-projects': 'robotics',
  modules: 'robotics',
};

/**
 * A track this build has not met yet still lands by its number: Track 01 is a circuit yard, Track 05
 * is analysis, and so on. Keeping this table here means a new track needs no page change; only a
 * genuinely new subject does.
 */
const BY_PREFIX: Array<[string, PathRegionId]> = [
  ['00-', 'mathematics'],
  ['01-', 'electronics'],
  ['02-', 'cad'],
  ['03-', 'robotics'],
  ['04-', 'robotics'],
  ['05-', 'mathematics'],
  ['06-', 'robotics'],
  ['07-', 'robotics'],
  ['08-', 'robotics'],
];

/** The subject an exercise id names: `EX.02-mechanics.T1.02a` → `02-mechanics`. */
export function moduleSubjectOf(id: string): string | null {
  const match = /^EX\.([^.]+)\./.exec(String(id ?? ''));
  return match ? match[1] : null;
}

/**
 * The real track a module subject maps to. The module slugs shorten the folder names (`01-electronics`
 * exercises live in `01-electronics-and-power`), so the translation is explicit rather than guessed.
 */
const MODULE_SUBJECT_TRACK: Record<string, string> = {
  '00-foundations': '00-foundations',
  '01-electronics': '01-electronics-and-power',
  '02-mechanics': '02-mechanics-kinematics-dynamics',
  '03-sensors': '03-sensors-and-actuators',
  '04-embedded': '04-embedded-and-realtime',
  '05-control': '05-control-and-estimation',
  '06-robotics': '06-robotics-and-autonomy',
  '07-systems': '07-systems-hil-and-production',
  '08-capstones': '08-capstone-projects',
};

/** The track behind a module subject slug, or the slug itself for a subject this build has not met. */
export function subjectTrackOf(subject: string): string {
  return MODULE_SUBJECT_TRACK[subject] ?? subject;
}

/** The region a lesson belongs to, resolving a module's subject from its id first. */
export function regionForLesson(lesson: { id: string; track: string }): PathRegionId {
  if (lesson.track !== 'modules') return regionForTrack(lesson.track);
  const subject = moduleSubjectOf(lesson.id);
  return regionForTrack(subject ? subjectTrackOf(subject) : 'modules');
}

/** The region a track belongs to. An unknown track is programming, never a blank. */
export function regionForTrack(track: string | null | undefined): PathRegionId {
  const key = String(track ?? '').trim();
  const direct = BY_TRACK[key];
  if (direct) return direct;
  for (const [prefix, region] of BY_PREFIX) if (key.startsWith(prefix)) return region;
  return 'programming';
}

/** The region's record, for a component that already has an id. */
export function regionOf(id: PathRegionId): PathRegion {
  return PATH_REGIONS[id];
}
