/**
 * Opt-in sync for drafts and notes: the storage and network halves.
 *
 * `workspaceMerge.ts` owns the rule (never choose silently; keep both versions). This module reads
 * the browser's stores, talks to the `mechalab_workspace` row, and writes the merged result back to
 * both sides. It is separate so the merge can be tested without IndexedDB, Supabase or a browser.
 *
 * Off by default. A learner who signs in gets progress sync as before; drafts cross devices only when
 * they switch workspace sync on, after the panel has shown what this browser and the account each
 * hold. That choice is remembered per browser, because "sync my half-written code" is a different
 * decision on a shared machine than "sync my completions".
 */

import { getClient } from './accounts';
import { readDrafts, replaceDrafts } from './lessonDraft';
import { readStudy, replaceStudy } from './studyNotes';
import {
  isWorkspaceDoc,
  mergeWorkspace,
  workspaceCounts,
  type WorkspaceCounts,
  type WorkspaceDoc,
} from './workspaceMerge';

const TABLE = 'mechalab_workspace';
export const WORKSPACE_SYNC_KEY = 'mechalab.workspaceSync.v1';

/** True when this browser has opted in. An unreadable store counts as off. */
export function workspaceSyncEnabled(): boolean {
  try {
    return window.localStorage.getItem(WORKSPACE_SYNC_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Remember the choice. Turning it off stops uploads; it never deletes what already synced. */
export function setWorkspaceSyncEnabled(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(WORKSPACE_SYNC_KEY, 'on');
    else window.localStorage.removeItem(WORKSPACE_SYNC_KEY);
  } catch {
    // A blocked store means the choice cannot be remembered; sync stays off, which is the safe side.
  }
}

/** This browser's drafts and study notes as one document, ready to merge. */
export function localWorkspace(now = Date.now()): WorkspaceDoc {
  const study = readStudy();
  return {
    schema: 'mechalab.workspace/1',
    updatedAt: now,
    drafts: { ...readDrafts() },
    study: Object.fromEntries(
      Object.entries(study).map(([id, lesson]) => [
        id,
        {
          note: lesson.note,
          highlights: lesson.highlights.map((highlight) => ({ ...highlight })),
          updatedAt: lesson.updatedAt,
        },
      ])
    ),
    conflicts: [],
  };
}

/** What is in this browser right now, for the pre-sync preview. */
export function localWorkspaceCounts(): WorkspaceCounts {
  return workspaceCounts(localWorkspace());
}

/** Write a merged document back to the browser's stores. Returns false if either write failed. */
export function applyWorkspace(doc: WorkspaceDoc): boolean {
  const draftsOk = replaceDrafts(doc.drafts);
  const study = Object.fromEntries(
    Object.entries(doc.study).map(([id, lesson]) => [
      id,
      {
        note: lesson.note,
        highlights: lesson.highlights.map((highlight) => ({ ...highlight })),
        updatedAt: lesson.updatedAt,
      },
    ])
  );
  replaceStudy(study);
  return draftsOk;
}

/** The account's copy, or null when there is none (or the row is a shape this build does not know). */
export async function loadWorkspace(userId: string): Promise<WorkspaceDoc | null> {
  const supabase = await getClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from(TABLE).select('workspace').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  const document: unknown = data?.workspace;
  return isWorkspaceDoc(document) ? document : null;
}

async function saveWorkspace(userId: string, doc: WorkspaceDoc): Promise<void> {
  const supabase = await getClient();
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      workspace: doc,
      updated_at: new Date(doc.updatedAt || Date.now()).toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);
}

export interface WorkspacePreview {
  local: WorkspaceCounts;
  account: WorkspaceCounts;
}

/** What each side holds, before anything is merged. Shown when workspace sync is switched on. */
export async function previewWorkspace(userId: string): Promise<WorkspacePreview> {
  const remote = await loadWorkspace(userId);
  return {
    local: localWorkspaceCounts(),
    account: workspaceCounts(remote ?? { schema: 'mechalab.workspace/1', updatedAt: 0, drafts: {}, study: {}, conflicts: [] }),
  };
}

export interface WorkspaceSyncReport {
  addedDrafts: number;
  addedNotes: number;
  addedHighlights: number;
  conflicts: number;
  /** Which side the account's copy came from, for the sentence shown afterwards. */
  hadAccountCopy: boolean;
  /** False when the browser refused the merged drafts — the account still has them. */
  stored: boolean;
}

/**
 * Merge this browser with the account, write both sides, and report what arrived.
 *
 * Called on the first sync and on every change while sync is on. Safe to call repeatedly: the merge
 * is idempotent for identical documents, and a conflict that has been recorded once is not recorded
 * again because both sides now hold the same merged document.
 */
export async function mergeAndApplyWorkspace(userId: string): Promise<WorkspaceSyncReport> {
  const remote = await loadWorkspace(userId);
  const local = localWorkspace();
  const result = mergeWorkspace(local, remote ?? { ...local, drafts: {}, study: {}, conflicts: [], updatedAt: 0 });
  const stored = applyWorkspace(result.doc);
  await saveWorkspace(userId, result.doc);
  return {
    addedDrafts: result.addedDrafts,
    addedNotes: result.addedNotes,
    addedHighlights: result.addedHighlights,
    conflicts: result.conflicts,
    hadAccountCopy: remote !== null,
    stored,
  };
}

/**
 * Push this browser's workspace up without pulling anything down — used after edits while sync is on.
 * A failure is thrown so the caller can surface "not saved to your account yet"; the local copy is
 * untouched either way.
 */
export async function pushWorkspace(userId: string): Promise<void> {
  const remote = await loadWorkspace(userId);
  const local = localWorkspace();
  if (!remote) {
    await saveWorkspace(userId, local);
    return;
  }
  // Still merge rather than overwrite: another device may have written since this tab loaded.
  const result = mergeWorkspace(local, remote);
  applyWorkspace(result.doc);
  await saveWorkspace(userId, result.doc);
}
