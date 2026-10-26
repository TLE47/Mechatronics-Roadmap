/**
 * The award ledger (`app/src/gamification/awardStore.ts`).
 *
 * One store, one shape, and an idempotent write: `recordAwards` reads, unions by id and writes.
 * That is the whole defence against a restore, a refresh or a second device granting Cold Boot
 * twice — the same stable id cannot enter the ledger twice, and a union of two ledgers is the same
 * set in either order.
 *
 * The ledger is deliberately its own key rather than a field in the learning log: the log is capped
 * and rotates its oldest events, so a lifetime achievement kept there would eventually fall off.
 *
 * It travels in the backup (`backupBundle.ts`) because Scrap and the achievement wall are work the
 * learner did, not a preference about a screen.
 */
import { hasAward, mergeLedgers, type Award } from './rewards.ts';

export const AWARDS_STORAGE_KEY = 'mechalab_awards_v1';
export const AWARDS_SCHEMA = 'mechalab.awards/1';

interface StoredLedger {
  schema: string;
  awards: Award[];
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isAward(value: unknown): value is Award {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Award>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    (candidate.kind === 'level' || candidate.kind === 'proof-mark' || candidate.kind === 'street-cred') &&
    typeof candidate.label === 'string' &&
    typeof candidate.at === 'number' &&
    Number.isFinite(candidate.at)
  );
}

/** The ledger as stored, or `[]` for a key that is missing, disabled or not JSON. */
export function readAwards(): Award[] {
  try {
    const raw = storage()?.getItem(AWARDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredLedger> | Award[];
    const list = Array.isArray(parsed) ? parsed : parsed?.awards;
    if (!Array.isArray(list)) return [];
    // A malformed row is dropped rather than allowed to poison the ledger on the next write.
    return list.filter(isAward);
  } catch {
    return [];
  }
}

export function writeAwards(awards: readonly Award[]): Award[] {
  const merged = mergeLedgers([], awards);
  try {
    storage()?.setItem(
      AWARDS_STORAGE_KEY,
      JSON.stringify({ schema: AWARDS_SCHEMA, awards: merged } satisfies StoredLedger)
    );
  } catch {
    // Storage disabled or over quota: the caller still has the in-memory copy it shows.
  }
  return merged;
}

/** Read, add only what is missing, write. Returns what was actually new, for the toast. */
export function recordAwards(candidates: readonly Award[]): Award[] {
  const ledger = readAwards();
  const granted = candidates.filter((candidate) => !hasAward(ledger, candidate.id));
  if (granted.length === 0) return [];
  writeAwards([...ledger, ...granted]);
  return granted;
}

/** A backup restore: union, never replace, so an older archive cannot erase a newer award. */
export function mergeAwardsFromBackup(incoming: readonly Award[]): Award[] {
  return writeAwards(mergeLedgers(readAwards(), incoming.filter(isAward)));
}
