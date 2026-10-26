/**
 * The reward engine (`app/src/gamification/rewards.ts`).
 *
 * Pure functions over the ledger and a snapshot of what the learner actually did, so every rule can
 * be tested with plain objects and no browser. The rules themselves live in
 * `content/rewards/rules.yaml`; this file only decides *when* one of them is true.
 *
 * Two properties the plan treats as non-negotiable, and how they are kept:
 *
 *  * **Nothing from idle time, speed or randomness.** Every candidate below reads a count of
 *    verified work, a count of a behaviour, or verified missions. There is no clock and no `Math.random`.
 *  * **Granted once.** An award's `id` is stable (`level:8`, `cred:cold-boot`, `mark:predicted`), and
 *    `grantAwards` adds only ids the ledger does not already hold. A restore, a replay or a second
 *    device can therefore never duplicate one, and the union is order-independent.
 */
import { REWARDS, type ProofMarkRule, type StreetCredRule } from '../content/loader.ts';
import { LEVELS } from './levels.ts';

export type AwardKind = 'level' | 'proof-mark' | 'street-cred';

export interface Award {
  /** Stable, never reused: the ledger's identity. */
  id: string;
  kind: AwardKind;
  /** What the toast and the achievement wall print. */
  label: string;
  /** When it was earned, ms since the epoch. Kept as data so the wall can date it. */
  at: number;
  /** The mission it celebrates, when it is one. */
  mission?: number;
  /** Scrap dropped by a Street Cred award. */
  scrap?: number;
}

/** Everything a rule may read. Counts, never a stopwatch. */
export interface AwardContext {
  /** Verified checkpoints anywhere in the curriculum. */
  checkpoints: number;
  /** Missions verified in an unbroken run (the level's own number). */
  missionsVerified: number;
  /** Matched predictions. */
  predictions: number;
  /** Failures fixed after opening the diagnostic card. */
  diagnosticFixes: number;
  /** Faults repaired in a fault call. */
  faultRepairs: number;
  /** Practice days, counted as night shifts, over the last four weeks. */
  practiceWeeks: number;
  /** Behaviour stamps, by rule id: what the lesson's own evidence recorded. */
  marks: Record<string, number>;
}

export const EMPTY_CONTEXT: AwardContext = {
  checkpoints: 0,
  missionsVerified: 0,
  predictions: 0,
  diagnosticFixes: 0,
  faultRepairs: 0,
  practiceWeeks: 0,
  marks: {},
};

export const PROOF_MARK_RULES: ProofMarkRule[] = REWARDS.proofMarks;
export const STREET_CRED_RULES: StreetCredRule[] = REWARDS.streetCred;

/** Which behaviour a proof mark's own id is earned by, and how many. */
const MARK_THRESHOLD: Record<string, (context: AwardContext) => number> = {
  predicted: (context) => context.predictions,
  'read-the-evidence': (context) => context.diagnosticFixes,
  'second-opinion': (context) => context.marks['second-opinion'] ?? 0,
  'different-input': (context) => context.marks['different-input'] ?? 0,
  'before-and-after': (context) => context.marks['before-and-after'] ?? 0,
  'field-repair': (context) => context.faultRepairs,
};

function triggerMet(trigger: StreetCredRule['trigger'], context: AwardContext): boolean {
  switch (trigger) {
    case 'first-verified':
      return context.checkpoints >= 1;
    case 'three-predictions':
      return context.predictions >= 3;
    case 'five-diagnostic-fixes':
      return context.diagnosticFixes >= 5;
    case 'hold-steady-verified':
      return context.missionsVerified >= 8;
    case 'first-fault-repair':
      return context.faultRepairs >= 1;
    case 'four-days-four-weeks':
      return context.practiceWeeks >= 4;
    case 'ten-missions':
      return context.missionsVerified >= 10;
    default:
      return false;
  }
}

/** Every award the context has earned, whether or not the ledger already holds it. */
export function candidateAwards(context: AwardContext, at = Date.now()): Award[] {
  const awards: Award[] = [];

  for (const level of LEVELS) {
    if (level.number === 0) continue;
    if (context.missionsVerified < level.number) continue;
    awards.push({
      id: `level:${level.number}`,
      kind: 'level',
      label: level.handle,
      at,
      mission: level.number,
    });
  }

  for (const rule of PROOF_MARK_RULES) {
    const count = MARK_THRESHOLD[rule.id]?.(context) ?? 0;
    if (count < 1) continue;
    awards.push({ id: `mark:${rule.id}`, kind: 'proof-mark', label: rule.label, at });
  }

  for (const rule of STREET_CRED_RULES) {
    if (!triggerMet(rule.trigger, context)) continue;
    awards.push({
      id: `cred:${rule.id}`,
      kind: 'street-cred',
      label: rule.label,
      at,
      scrap: rule.scrap,
    });
  }

  return awards;
}

/** The ledger plus the candidates it does not hold, in that order. Idempotent by construction. */
export function grantAwards(
  ledger: readonly Award[],
  candidates: readonly Award[],
  at = Date.now()
): { ledger: Award[]; granted: Award[] } {
  const held = new Set(ledger.map((award) => award.id));
  const granted: Award[] = [];
  for (const candidate of candidates) {
    if (held.has(candidate.id)) continue;
    held.add(candidate.id);
    granted.push({ ...candidate, at: candidate.at || at });
  }
  return { ledger: [...ledger, ...granted], granted };
}

/** Union of two ledgers, by id: the restore and second-device rule, order-independent. */
export function mergeLedgers(left: readonly Award[], right: readonly Award[]): Award[] {
  const byId = new Map<string, Award>();
  for (const award of [...left, ...right]) {
    const seen = byId.get(award.id);
    // The earlier timestamp wins, so a merge cannot make an award look newer than it was.
    if (!seen || award.at < seen.at) byId.set(award.id, award);
  }
  return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function hasAward(ledger: readonly Award[], id: string): boolean {
  return ledger.some((award) => award.id === id);
}

export function scrapTotal(ledger: readonly Award[]): number {
  return ledger.reduce((sum, award) => sum + (award.scrap ?? 0), 0);
}

export function awardsOfKind(ledger: readonly Award[], kind: AwardKind): Award[] {
  return ledger.filter((award) => award.kind === kind);
}

/** The Scrap the wardrobe owns: one entry per Street Cred award, in rule order. */
export function scrapShelf(ledger: readonly Award[]): { id: string; label: string; kind: string }[] {
  const held = new Set(ledger.map((award) => award.id));
  return STREET_CRED_RULES.filter((rule) => held.has(`cred:${rule.id}`)).map((rule) => ({
    id: rule.reward.id,
    label: rule.reward.label,
    kind: rule.reward.kind,
  }));
}

const NEON = REWARDS.neon;

/**
 * Neon: the soft meter that relights the street. It never moves a level, never expires, and a hint
 * cannot take any of it away — `neon.hints` is 0 in the rules file on purpose.
 */
export function neonMeter(parts: { firstVerified: number; reviews: number; integrations: number }): number {
  return (
    parts.firstVerified * NEON.firstVerified +
    Math.max(0, parts.reviews) * NEON.review +
    Math.max(0, parts.integrations) * NEON.integration
  );
}

/** How brightly the street is lit, 0..1, for a given Neon total. */
export function neonLevel(total: number): number {
  const perSign = NEON.integration || 10;
  return Math.min(1, Math.max(0, total / (perSign * 10)));
}
