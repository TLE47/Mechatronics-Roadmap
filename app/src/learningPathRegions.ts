/**
 * The Learning Path's five region identities (`app/src/learningPathRegions.ts`).
 *
 * The brief names five subjects — Python, electronics, robotics, CAD and mathematics — but the
 * curriculum does not carry a `subject` field: it carries a `track`, and the tracks are
 * `track-p`, `ramp`, `stage-0`, the nine route tracks and `modules`. This module is the one place
 * that table lives, so the page never invents a subject per lesson and Phase 7 can widen the mapping
 * without touching a component.
 *
 * CAD and mathematics have no authored track in this build. They stay declared because the world
 * they draw is planned, and an unknown track must still land somewhere honest (the programming
 * labs), not on a blank platform.
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
    note: 'The observatory end of the city, where estimates, transforms and proofs are drawn.',
  },
};

/** Every real track in today's curriculum, mapped once. */
const BY_TRACK: Record<string, PathRegionId> = {
  'track-p': 'programming',
  ramp: 'programming',
  'stage-0': 'programming',
  '00-foundations': 'electronics',
  '01-electronics-and-power': 'electronics',
  '02-mechanics-kinematics-dynamics': 'robotics',
  '03-sensors-and-actuators': 'robotics',
  '04-embedded-and-realtime': 'robotics',
  '05-control-and-estimation': 'robotics',
  '06-robotics-and-autonomy': 'robotics',
  '07-systems-hil-and-production': 'robotics',
  '08-capstone-projects': 'robotics',
  modules: 'robotics',
};

/** The region a lesson belongs to. An unknown track is programming, never a blank. */
export function regionForTrack(track: string | null | undefined): PathRegionId {
  return BY_TRACK[String(track ?? '').trim()] ?? 'programming';
}

/** The region's record, for a component that already has an id. */
export function regionOf(id: PathRegionId): PathRegion {
  return PATH_REGIONS[id];
}
