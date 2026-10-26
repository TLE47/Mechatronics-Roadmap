/**
 * The ladder (`app/src/gamification/levels.ts`).
 *
 * A level is earned by verifying a mission's checks and by nothing else. Neon — the soft meter that
 * relights the street — is deliberately absent from this file: it can be high or low and the level
 * does not move, which is the promise the plan makes to the learner in writing.
 *
 * Every handle, tagline and perk is read from `content/rewards/rules.yaml` through the bundle, so
 * tuning the ladder is a reviewed pull request rather than an app release.
 */
import { REWARDS, type LevelPerk, type RewardLevel } from '../content/loader.ts';

export type Level = RewardLevel;
export type Perk = LevelPerk;

/** 0..10, in order. Level 0 is where a first visit starts. */
export const LEVELS: Level[] = [...REWARDS.levels].sort((a, b) => a.number - b.number);

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].number;

const BY_NUMBER = new Map(LEVELS.map((level) => [level.number, level]));

export function levelAt(number: number): Level {
  return BY_NUMBER.get(clampLevel(number)) ?? LEVELS[0];
}

export function clampLevel(number: number): number {
  if (!Number.isFinite(number)) return 0;
  return Math.min(MAX_LEVEL, Math.max(0, Math.floor(number)));
}

/** The level a run of verified missions earns. Never derived from Neon, time or XP. */
export function earnedLevel(verifiedMissions: number): number {
  return clampLevel(verifiedMissions);
}

export function nextLevel(number: number): Level | null {
  return BY_NUMBER.get(clampLevel(number) + 1) ?? null;
}

/** Every perk unlocked at or below `number`, newest last: what a learner can use right now. */
export function perksUpTo(number: number): Perk[] {
  return LEVELS.filter((level) => level.number <= clampLevel(number)).flatMap((level) => level.perks);
}

/** The perks still locked, with the level that opens them — the Perk panel's "Later" column. */
export function lockedPerks(number: number): { level: Level; perk: Perk }[] {
  return LEVELS.filter((level) => level.number > clampLevel(number)).flatMap((level) =>
    level.perks.map((perk) => ({ level, perk }))
  );
}

export function perkUnlocked(number: number, perkId: string): boolean {
  return perksUpTo(number).some((perk) => perk.id === perkId);
}

export interface LevelProgress {
  level: number;
  /** The mission whose checks fill the bar — verified missions + 1, capped at the last. */
  missionNumber: number;
  /** Verified checks in that mission ÷ its total, 0..1. */
  fraction: number;
  /** How many more checks until the next level. */
  toGo: number;
  next: Level | null;
}

/**
 * The bar: the current mission's verified checks, not a number that can be farmed.
 *
 * At level 10 there is no next level and the bar reads full, because the last mission is done
 * rather than because the meter ran out.
 */
export function levelProgress(
  verifiedMissions: number,
  checkpoints: { verifiedCount: number; total: number } | null
): LevelProgress {
  const level = earnedLevel(verifiedMissions);
  const next = nextLevel(level);
  // No next level: the ladder is finished, so the bar is full because the work is, not because
  // the meter ran out. Otherwise it is the current mission's real checks.
  const fraction = !next
    ? 1
    : !checkpoints || checkpoints.total === 0
      ? 0
      : Math.min(1, Math.max(0, checkpoints.verifiedCount / checkpoints.total));
  return {
    level,
    missionNumber: Math.min(MAX_LEVEL, verifiedMissions + 1),
    fraction,
    toGo:
      level >= MAX_LEVEL
        ? 0
        : Math.max(0, (checkpoints?.total ?? 0) - (checkpoints?.verifiedCount ?? 0)),
    next,
  };
}

/** `LV 3 · RUST WAKER` — the label every surface prints for a level. */
export function levelLabel(number: number): string {
  const level = levelAt(number);
  return `LV ${level.number} · ${level.handle}`;
}
