/**
 * The network half of cloud sync: one row per learner in `mechalab_progress`.
 *
 * `snapshot` is a single JSON document rather than a table of flags on purpose — the workbench's
 * progress is a handful of maps plus an append-only log, it is rewritten whole on every change, and a
 * document keeps the merge in `progressMerge.ts` the only place that has to understand its shape.
 * Row-level security (see `docs/ACCOUNTS.md`) is what keeps one learner out of another's row.
 */

import { getClient } from './accounts';
import { isProgressSnapshot, type ProgressSnapshot } from './progressMerge';

const TABLE = 'mechalab_progress';

export async function loadProgress(userId: string): Promise<ProgressSnapshot | null> {
  const supabase = await getClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from(TABLE).select('snapshot').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  const snapshot: unknown = data?.snapshot;
  return isProgressSnapshot(snapshot) ? snapshot : null;
}

export async function saveProgress(userId: string, snapshot: ProgressSnapshot): Promise<void> {
  const supabase = await getClient();
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      snapshot,
      updated_at: new Date(snapshot.updatedAt || Date.now()).toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);
}
