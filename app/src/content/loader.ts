/**
 * The one door to the content bundle (`app/src/content/loader.ts`).
 *
 * `content/` is the source of truth and `scripts/build_content.py` copies it into
 * `data/contentBundle.ts`; nothing in the app hard-codes a mission, a recording or a reward. This
 * module is the only place that imports the bundle, so a later move to a fetched bundle (from
 * `public/content/manifest.json`) changes one file and not thirty.
 *
 * It is a plain TypeScript module with no React, so the unit suites can read the story the same way
 * the site does — which is what lets `scripts/test_content.mjs` prove the bundle is what it claims.
 */
// The recordings are deliberately *not* imported here: their prose lives in `contentRecordings.ts`
// and is reached through `content/recordings.ts`, so the engine's chunk does not carry the story.
import {
  ALIASES,
  CONTENT_MANIFEST,
  CONTENT_VERSION,
  MISSIONS,
  PARTS,
  REWARDS,
  type IdAliases,
  type LevelPerk,
  type Mission,
  type ProofMarkRule,
  type RewardLevel,
  type RewardRules,
  type RobotPart,
  type StreetCredRule,
} from '../data/contentBundle.ts';

export type {
  IdAliases,
  LevelPerk,
  Mission,
  ProofMarkRule,
  RewardLevel,
  RewardRules,
  RobotPart,
  StreetCredRule,
};

export { CONTENT_MANIFEST, CONTENT_VERSION, MISSIONS, PARTS, REWARDS };

/** Resolve an id through `content/aliases.yaml`, following a chain at most this many hops. */
const MAX_ALIAS_HOPS = 8;

function resolveLessonAlias(id: string): string {
  let current = id;
  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
    const row = ALIASES.lessons.find((alias) => alias.from === current);
    if (!row) return current;
    current = row.to;
  }
  return current;
}

function resolveMissionAlias(number: number): number {
  let current = number;
  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
    const row = ALIASES.missions.find((alias) => alias.from === current);
    if (!row) return current;
    current = row.to;
  }
  return current;
}

/** A lesson id as it is stored today, so a rename does not orphan a learner's progress. */
export function resolveLessonId(id: string): string {
  return resolveLessonAlias(id);
}

export function resolveMissionNumber(number: number): number {
  return resolveMissionAlias(number);
}

/** Every stored flag map, keys resolved: a renamed lesson keeps what it earned. */
export function resolveFlags(flags: Record<string, boolean>): Record<string, boolean> {
  const resolved: Record<string, boolean> = {};
  for (const [id, done] of Object.entries(flags)) {
    const target = resolveLessonId(id);
    resolved[target] = resolved[target] || done;
  }
  return resolved;
}

const MISSION_BY_NUMBER = new Map(MISSIONS.map((mission) => [mission.number, mission]));
const MISSION_BY_STEP = new Map(MISSIONS.map((mission) => [mission.spineStep, mission]));
const PART_BY_MISSION = new Map(PARTS.map((part) => [part.mission, part]));

export function missionAt(number: number): Mission | null {
  return MISSION_BY_NUMBER.get(resolveMissionNumber(number)) ?? null;
}

/** The mission that asks for a spine step. The join is the step number, never a copied list. */
export function missionForStep(step: number): Mission | null {
  return MISSION_BY_STEP.get(step) ?? null;
}

export function partForMission(number: number): RobotPart | null {
  return PART_BY_MISSION.get(number) ?? null;
}

/** `content v4b665eb0b8` — printed in the footer so a bug report can name the story it saw. */
export function contentLabel(): string {
  return `content v${CONTENT_VERSION}`;
}
