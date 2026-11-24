/**
 * The Learning Path's data model (`app/src/learningPath.ts`).
 *
 * Pure functions over the real curriculum and the real progress maps, so the page draws exactly what
 * the runner already grades and nothing else. There is no prototype slice, no phase filter and no
 * second curriculum: the path is the generated `PYTHON_LESSONS` registry, in its order, all 97 rows
 * of it. A row added to the registry appears here on the next build with no page change.
 *
 * The registry carries a `track`, not a "phase". The world's **districts** are contiguous runs of
 * that track, and the 50 module exercises are split by the subject embedded in their id
 * (`EX.00-foundations.T1.00a` belongs to the foundations labs, not to a generic "modules" pile).
 * That gives the path the curriculum's own divisions — Python, the math on-ramp, Stage 0, tracks
 * 00–08 and a lab district per track — and a new track becomes a new district automatically.
 *
 * States, with the approved one-step rule:
 *
 * - **completed** — the lesson is verified in this browser (or the account) already.
 * - **current** — the first unverified lesson in the path: the one "Continue" belongs to.
 * - **available** — the lesson immediately after the current one. A learner can step one ahead;
 *   that is what keeps the next platform from looking shut.
 * - **locked** — every later unverified lesson. Locked is preview-only: the platform opens its
 *   card and names the missing prerequisite, and the action is refused. A deep link still opens the
 *   lesson, because the runner's own navigation is not the path's to take away.
 *
 * There is no authored prerequisite graph in this repository (see `docs/PLAN-learning-path.md`):
 * the path's prerequisite is the curriculum row before it, which is the only order the data carries.
 */

import { PYTHON_LESSONS, type PythonLessonItem } from './data/pythonLessonsData.ts';
import {
  moduleSubjectOf,
  regionForLesson,
  regionForTrack,
  subjectTrackOf,
  type PathRegionId,
} from './learningPathRegions.ts';

export type PathState = 'completed' | 'current' | 'available' | 'locked';

export type LandmarkKey =
  | 'storage-tower'
  | 'operator-tower'
  | 'blueprint-tower'
  | 'branch-arch'
  | 'library-ring'
  | 'robot-factory'
  | 'data-vault'
  | 'circuit-yard'
  | 'power-station'
  | 'sensor-rig'
  | 'assembly-gantry'
  | 'control-observatory'
  | 'autonomy-dome'
  | 'capstone-spire'
  | 'model-arch'
  | 'region-tower';

export interface PathAction {
  kind: 'review' | 'continue' | 'start' | 'locked';
  label: string;
}

export interface PathNode {
  lesson: PythonLessonItem;
  /** 1-based position in the whole path, printed on the label. */
  index: number;
  /** 0-based position inside this node's district. */
  indexInDistrict: number;
  /** The district's stable key (`track-p`, `modules:00-foundations`, …). */
  district: string;
  districtLabel: string;
  districtShort: string;
  /** Module exercises carry their authored tier; route lessons do not claim one. */
  tier: number | null;
  region: PathRegionId;
  landmark: LandmarkKey;
  state: PathState;
  action: PathAction;
  /** The lesson whose verification opens this one, named only when it is locked. */
  prerequisite: string | null;
}

export interface PathDistrict {
  key: string;
  label: string;
  short: string;
  region: PathRegionId;
  tier: number | null;
  /** 0-based node indices, inclusive. */
  first: number;
  last: number;
  count: number;
  done: number;
  firstLessonId: string;
  lastLessonId: string;
}

export interface PathInput {
  verified: Record<string, boolean>;
  /** The lesson the learner last opened, for Continue versus Start. */
  lastLessonId?: string | null;
  /** An explicit slice, in order. Defaults to the whole registry. */
  lessonIds?: readonly string[];
  /** The registry to read. Injected so the unit suite can name its own rows. */
  lessons?: readonly PythonLessonItem[];
}

interface DistrictMeta {
  key: string;
  label: string;
  short: string;
  region: PathRegionId;
  tier: number | null;
}

/** The names the page prints for each registry track. */
const TRACK_META: Record<string, { label: string; short: string }> = {
  'track-p': { label: 'Python track', short: 'Python' },
  ramp: { label: 'Math on-ramp', short: 'Ramp' },
  'stage-0': { label: 'Stage 0 — circuits', short: 'S0' },
  '00-foundations': { label: '00 — Foundations', short: '00' },
  '01-electronics-and-power': { label: '01 — Electronics & power', short: '01' },
  '02-mechanics-kinematics-dynamics': { label: '02 — Mechanics & kinematics', short: '02' },
  '03-sensors-and-actuators': { label: '03 — Sensors & actuators', short: '03' },
  '04-embedded-and-realtime': { label: '04 — Embedded & real-time', short: '04' },
  '05-control-and-estimation': { label: '05 — Control & estimation', short: '05' },
  '06-robotics-and-autonomy': { label: '06 — Robotics & autonomy', short: '06' },
  '07-systems-hil-and-production': { label: '07 — Systems & production', short: '07' },
  '08-capstone-projects': { label: '08 — Capstone', short: '08' },
  modules: { label: 'Module labs', short: 'Labs' },
};

/** The module districts, named by the subject embedded in the exercise id. */
const MODULE_META: Record<string, { label: string; short: string }> = {
  '00-foundations': { label: 'Foundations labs', short: '00 lab' },
  '01-electronics': { label: 'Electronics labs', short: '01 lab' },
  '02-mechanics': { label: 'Mechanics labs', short: '02 lab' },
  '03-sensors': { label: 'Sensors labs', short: '03 lab' },
  '04-embedded': { label: 'Embedded labs', short: '04 lab' },
  '05-control': { label: 'Control labs', short: '05 lab' },
  '06-robotics': { label: 'Robotics labs', short: '06 lab' },
  '07-systems': { label: 'Systems labs', short: '07 lab' },
  '08-capstones': { label: 'Capstone labs', short: '08 lab' },
};

function humanize(slug: string): string {
  const words = slug.replace(/^\d+-/, '').replace(/[-_]+/g, ' ').trim();
  return words ? words.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Module';
}

/** A track the table has not met yet still gets a readable district, not a blank one. */
function trackMeta(track: string): { label: string; short: string } {
  const known = TRACK_META[track];
  if (known) return known;
  const numbered = /^(\d{2})-/.exec(track);
  const name = humanize(track);
  return numbered ? { label: `${numbered[1]} — ${name}`, short: numbered[1] } : { label: name, short: name };
}

function moduleMeta(slug: string): { label: string; short: string } {
  const known = MODULE_META[slug];
  if (known) return known;
  const name = humanize(slug);
  return { label: `${name} labs`, short: `${name} lab` };
}

/** The tier an exercise id carries (`EX.00-foundations.T2.00c`), or null for prose lessons. */
export function tierOf(lesson: Pick<PythonLessonItem, 'id' | 'track'>): number | null {
  if (lesson.track !== 'modules') return null;
  const match = /\.T(\d)\./.exec(lesson.id);
  return match ? Number(match[1]) : null;
}

function districtOf(lesson: PythonLessonItem): DistrictMeta {
  if (lesson.track === 'modules') {
    const slug = moduleSubjectOf(lesson.id) ?? 'modules';
    return {
      key: `modules:${slug}`,
      ...moduleMeta(slug),
      region: regionForTrack(subjectTrackOf(slug)),
      tier: tierOf(lesson),
    };
  }
  return {
    key: lesson.track,
    ...trackMeta(lesson.track),
    region: regionForTrack(lesson.track),
    tier: null,
  };
}

/**
 * The landmarks a region may raise. A lesson's title picks one inside its region's pool, and a
 * district's position seeds the fallback, so every district has more than one silhouette and no
 * lesson ever gets a blank platform.
 */
export const LANDMARK_POOLS: Record<PathRegionId, readonly LandmarkKey[]> = {
  programming: [
    'storage-tower',
    'operator-tower',
    'blueprint-tower',
    'branch-arch',
    'library-ring',
    'robot-factory',
    'data-vault',
  ],
  electronics: ['circuit-yard', 'power-station', 'sensor-rig'],
  robotics: ['assembly-gantry', 'robot-factory', 'autonomy-dome', 'capstone-spire', 'sensor-rig'],
  cad: ['model-arch', 'assembly-gantry', 'region-tower'],
  mathematics: ['control-observatory', 'operator-tower', 'region-tower'],
};

/** The per-lesson landmark, so a new lesson needs a mapping, not a layout edit. */
const LANDMARK_BY_ID: Record<string, LandmarkKey> = {
  'P.1': 'storage-tower',
  'P.2': 'operator-tower',
  'P.2.5': 'blueprint-tower',
  'P.3': 'branch-arch',
  'P.4': 'library-ring',
  'P.5': 'robot-factory',
};

const LANDMARK_RULES: Array<[RegExp, LandmarkKey]> = [
  [/variable|data type|store|storage/i, 'storage-tower'],
  [/arithmetic|order of operations|operator/i, 'operator-tower'],
  [/comment|document|docstring/i, 'blueprint-tower'],
  [/decision|condition|clamp|branch|truth/i, 'branch-arch'],
  [/list|loop|iteration|for-loop|while-loop/i, 'library-ring'],
  [/circuit|mosfet|diode|filter|ground|trace/i, 'circuit-yard'],
  [/power|battery|regulator|voltage|capacitor|current/i, 'power-station'],
  [/sensor|encoder|gyro|accelerometer|imu|magnet/i, 'sensor-rig'],
  [/gear|joint|torque|kinematic|inertia|gantry/i, 'assembly-gantry'],
  [/control|pid|estim|observer|complementary/i, 'control-observatory'],
  [/trajectory|autonom|planning|dome/i, 'autonomy-dome'],
  [/capstone|bring-up|hil|production|system identification|smoke/i, 'capstone-spire'],
  [/model|cad|draft|geometry|discipline/i, 'model-arch'],
  [/function|assert|factory|robot/i, 'robot-factory'],
];

export interface LandmarkPlacement {
  region: PathRegionId;
  indexInDistrict?: number;
}

/**
 * The structure a lesson raises. The title's keyword is used only when that structure belongs to the
 * lesson's region; otherwise the region's pool is cycled by the lesson's place in its district.
 */
export function landmarkFor(
  lesson: Pick<PythonLessonItem, 'id' | 'title' | 'track'>,
  placement?: LandmarkPlacement
): LandmarkKey {
  const region = placement?.region ?? regionForLesson(lesson);
  const pool = LANDMARK_POOLS[region];
  const known = LANDMARK_BY_ID[lesson.id];
  if (known) return known;
  for (const [pattern, key] of LANDMARK_RULES) {
    if (pool.includes(key) && pattern.test(lesson.title)) return key;
  }
  return pool[(placement?.indexInDistrict ?? 0) % pool.length];
}

/**
 * Build the path: one node per lesson, in registry order, with its district, state and the one
 * action it allows. No clock, randomness or storage; the same inputs always draw the same city.
 */
export function buildLearningPath(input: PathInput): PathNode[] {
  const all = input.lessons ?? PYTHON_LESSONS;
  let lessons: PythonLessonItem[];
  if (input.lessonIds) {
    const byId = new Map(all.map((lesson) => [lesson.id, lesson]));
    lessons = input.lessonIds
      .map((id) => byId.get(id))
      .filter((lesson): lesson is PythonLessonItem => Boolean(lesson));
  } else {
    lessons = [...all];
  }

  const metas = lessons.map(districtOf);
  const seen = new Map<string, number>();
  const indexInDistrict = metas.map((meta) => {
    const count = seen.get(meta.key) ?? 0;
    seen.set(meta.key, count + 1);
    return count;
  });

  const verified = input.verified ?? {};
  const firstUnverified = lessons.findIndex((lesson) => !verified[lesson.id]);
  const lastId = input.lastLessonId ?? null;

  return lessons.map((lesson, index) => {
    let state: PathState;
    if (verified[lesson.id]) state = 'completed';
    else if (firstUnverified === -1) state = 'completed';
    else if (index === firstUnverified) state = 'current';
    else if (index === firstUnverified + 1) state = 'available';
    else state = 'locked';

    const previous = index > 0 ? lessons[index - 1] : null;
    const prerequisite = state === 'locked' && previous ? previous.title : null;

    const action: PathAction =
      state === 'completed'
        ? { kind: 'review', label: 'Review lesson' }
        : state === 'current'
          ? lastId === lesson.id
            ? { kind: 'continue', label: 'Continue lesson' }
            : { kind: 'start', label: 'Start lesson' }
          : state === 'available'
            ? { kind: 'start', label: 'Start lesson' }
            : { kind: 'locked', label: 'Locked' };

    const meta = metas[index];
    return {
      lesson,
      index: index + 1,
      indexInDistrict: indexInDistrict[index],
      district: meta.key,
      districtLabel: meta.label,
      districtShort: meta.short,
      tier: meta.tier,
      region: meta.region,
      landmark: landmarkFor(lesson, {
        region: meta.region,
        indexInDistrict: indexInDistrict[index],
      }),
      state,
      action,
      prerequisite,
    };
  });
}

/** The districts, as consecutive runs of the same track or module subject. */
export function pathDistricts(nodes: readonly PathNode[]): PathDistrict[] {
  const districts: PathDistrict[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const current = districts[districts.length - 1];
    if (current && current.key === node.district) {
      current.last = index;
      current.count += 1;
      current.done += node.state === 'completed' ? 1 : 0;
      current.lastLessonId = node.lesson.id;
      continue;
    }
    districts.push({
      key: node.district,
      label: node.districtLabel,
      short: node.districtShort,
      region: node.region,
      tier: node.tier,
      first: index,
      last: index,
      count: 1,
      done: node.state === 'completed' ? 1 : 0,
      firstLessonId: node.lesson.id,
      lastLessonId: node.lesson.id,
    });
  }
  return districts;
}

/** How much of the slice is verified, for the header's meter. */
export function pathSummary(nodes: readonly PathNode[]): { done: number; total: number } {
  return {
    done: nodes.filter((node) => node.state === 'completed').length,
    total: nodes.length,
  };
}

/** The words a platform announces, including its state: the label is never colour alone. */
export function stateLabel(state: PathState): string {
  switch (state) {
    case 'completed':
      return 'Completed';
    case 'current':
      return 'Current lesson';
    case 'available':
      return 'Available';
    case 'locked':
      return 'Locked';
  }
}
