/**
 * What a verification was taken against (`app/src/gamification/verifyStamp.ts`).
 *
 * A "verified" flag on its own cannot answer the question that matters when a lesson changes: was
 * this passed against the checks that exist now? So each verification records two fingerprints:
 *
 *  * `v` — the content version, the hash `scripts/build_content.py` puts in the bundle;
 *  * `g` — the grader's fingerprint: a hash of the lesson's starter, solution, expected output and
 *    instructor tests, which is exactly the contract a run is judged by.
 *
 * When either has moved, the app offers a **gentle re-verify** — the lesson is still verified, the
 * learner is told the checks changed, and nothing is reset. A store that silently un-verifies work
 * after a typo fix is worse than one that asks.
 *
 * Old flags with no stamp are left alone on purpose: they were verified before stamps existed, and
 * flagging every one of them on upgrade would be a wall of noise, not a prompt.
 */
import { CONTENT_VERSION, resolveLessonId } from '../content/loader.ts';
import type { PythonLessonItem } from '../data/pythonLessonsData.ts';

export const VERIFY_STAMPS_KEY = 'mechalab_verify_stamps_v1';

export interface VerifyStamp {
  /** Content version the verification was taken against. */
  v: string;
  /** Grader fingerprint: the lesson's own checks. */
  g: string;
  /** When, ms since the epoch. */
  at: number;
}

/** 32-bit FNV-1a: small, stable across engines, and not a cryptographic claim. */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The lesson's grading contract, in one string: what a run is judged against. */
export function graderFingerprint(
  lesson: Pick<PythonLessonItem, 'starterCode' | 'fullSolution' | 'expectedOutput' | 'instructorTests'>
): string {
  return fingerprint(
    [lesson.starterCode, lesson.fullSolution, lesson.expectedOutput, lesson.instructorTests].join('\u0000')
  );
}

export function readStamps(): Record<string, VerifyStamp> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(VERIFY_STAMPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<VerifyStamp>>;
    const stamps: Record<string, VerifyStamp> = {};
    for (const [id, stamp] of Object.entries(parsed ?? {})) {
      if (
        stamp &&
        typeof stamp.v === 'string' &&
        typeof stamp.g === 'string' &&
        typeof stamp.at === 'number'
      ) {
        stamps[resolveLessonId(id)] = { v: stamp.v, g: stamp.g, at: stamp.at };
      }
    }
    return stamps;
  } catch {
    return {};
  }
}

function writeStamps(stamps: Record<string, VerifyStamp>): void {
  try {
    localStorage.setItem(VERIFY_STAMPS_KEY, JSON.stringify(stamps));
  } catch {
    // Storage disabled: the flag the learner sees is still right for this session.
  }
}

export function writeStamp(lessonId: string, grader: string, at = Date.now()): void {
  const stamps = readStamps();
  stamps[resolveLessonId(lessonId)] = { v: CONTENT_VERSION, g: grader, at };
  writeStamps(stamps);
}

export function stampFor(lessonId: string): VerifyStamp | null {
  return readStamps()[resolveLessonId(lessonId)] ?? null;
}

/**
 * Verified lessons whose checks have moved since they were passed. Newest content first, because a
 * learner with a dozen of these should start where the change actually landed.
 *
 * `graders` maps a lesson id to the fingerprint of the lesson as it is now; an id it does not know
 * is skipped rather than guessed at.
 */
export function reverifyNeeded(
  verified: Record<string, boolean>,
  stamps: Record<string, VerifyStamp>,
  graders: Record<string, string>,
  contentVersion = CONTENT_VERSION
): string[] {
  const out: string[] = [];
  for (const [id, done] of Object.entries(verified)) {
    if (!done) continue;
    const stamp = stamps[id];
    if (!stamp) continue;
    const grader = graders[id];
    if (grader === undefined) continue;
    if (stamp.v !== contentVersion || stamp.g !== grader) out.push(id);
  }
  return out.sort();
}
