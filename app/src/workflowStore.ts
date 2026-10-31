/**
 * Where a learner's workflow lives (`app/src/workflowStore.ts`).
 *
 * One workflow per lesson, keyed by the lesson id, in the same bucket as notes and drafts. It is
 * authored work, not a view preference: it goes into the backup zip and is merged on restore, and a
 * lesson whose workflow was cleared has no entry rather than an empty one.
 *
 * The store is written through `bulkStorage()`, which is IndexedDB where the browser has it and
 * `localStorage` otherwise, so a large bucket does not evict a month of diagrams. Every reader here
 * validates: a backup from a hand-edited file, or a store written by an older build, must produce
 * cards the panel can render or no workflow at all — never half a document.
 *
 * A refused write returns `false`, the same contract as `saveNote`: private mode and a full bucket
 * both throw, and the panel says "Not saved" rather than the learner discovering it after a reload.
 */

import { bulkStorage } from './bulkStorage.ts';
import { STEP_KINDS, normalizeWorkflow, type StepKind, type WorkflowDoc } from './workflow.ts';

export const STORAGE_KEY_WORKFLOW = 'mechalab_workflow_v1';
/** Whether the three-line how-to has been dismissed once, so it does not open on every lesson. */
export const WORKFLOW_GUIDE_KEY = 'mechalab_workflow_seen_v1';

/** Lesson id -> that lesson's workflow. */
export type WorkflowStore = Record<string, WorkflowDoc>;

function storage(): Storage | null {
  return bulkStorage();
}

function bucket(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const MAX_LESSON_ID_CHARS = 64;

function asLessonId(value: string): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_LESSON_ID_CHARS) : '';
}

/** A store from an already-parsed value: junk entries are dropped, not repaired into placeholders. */
export function asWorkflowStore(value: unknown): WorkflowStore {
  const store: WorkflowStore = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return store;
  for (const [lessonId, raw] of Object.entries(value as Record<string, unknown>)) {
    const id = asLessonId(lessonId);
    if (!id) continue;
    const doc = normalizeWorkflow(raw);
    if (doc) store[id] = doc;
  }
  return store;
}

export function parseWorkflowStore(raw: string | null): WorkflowStore {
  if (!raw) return {};
  try {
    return asWorkflowStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function readWorkflowStore(): WorkflowStore {
  const store = storage();
  if (!store) return {};
  try {
    return parseWorkflowStore(store.getItem(STORAGE_KEY_WORKFLOW));
  } catch {
    return {};
  }
}

export function readWorkflow(lessonId: string): WorkflowDoc | null {
  const id = asLessonId(lessonId);
  if (!id) return null;
  return readWorkflowStore()[id] ?? null;
}

/**
 * Write one lesson's workflow and return whether the bytes landed.
 *
 * The timestamp is set here rather than trusted from the caller, because it is the merge's only
 * ordering rule: a restore must not replace a diagram edited a minute ago with one from last week.
 * An empty document clears the entry instead — a workflow with no cards is not a diagram.
 */
export function saveWorkflow(
  lessonId: string,
  doc: WorkflowDoc,
  now: number = Date.now()
): boolean {
  const id = asLessonId(lessonId);
  if (!id) return false;
  const store = storage();
  if (!store) return false;
  const all = readWorkflowStore();
  const next = normalizeWorkflow({ ...doc, updatedAt: now });
  if (next) all[id] = next;
  else delete all[id];
  try {
    store.setItem(STORAGE_KEY_WORKFLOW, JSON.stringify(all));
  } catch {
    return false;
  }
  return true;
}

export function clearWorkflow(lessonId: string): void {
  const id = asLessonId(lessonId);
  if (!id) return;
  const store = storage();
  if (!store) return;
  const all = readWorkflowStore();
  if (!(id in all)) return;
  delete all[id];
  try {
    store.setItem(STORAGE_KEY_WORKFLOW, JSON.stringify(all));
  } catch {
    // The caller has nothing to do with a failed clear; the entry stays until the next write lands.
  }
}

/** Replace the whole store, used by a restore after it has merged in memory. */
export function replaceWorkflows(store: WorkflowStore): boolean {
  const target = storage();
  if (!target) return false;
  try {
    target.setItem(STORAGE_KEY_WORKFLOW, JSON.stringify(asWorkflowStore(store)));
  } catch {
    return false;
  }
  return true;
}

/**
 * Merge a restored store in: a lesson this browser has nothing for is added, and a lesson it has is
 * replaced only by a newer document. Nothing is ever deleted, so a restore is safe to repeat.
 */
export function mergeWorkflows(
  local: WorkflowStore,
  incoming: WorkflowStore
): { store: WorkflowStore; added: number; updated: number } {
  const store: WorkflowStore = { ...local };
  let added = 0;
  let updated = 0;
  for (const [lessonId, doc] of Object.entries(incoming)) {
    const existing = store[lessonId];
    if (!existing) {
      store[lessonId] = doc;
      added += 1;
      continue;
    }
    if (doc.updatedAt > existing.updatedAt) {
      store[lessonId] = doc;
      updated += 1;
    }
  }
  return { store, added, updated };
}

export function workflowCounts(store: WorkflowStore = readWorkflowStore()): {
  workflows: number;
  cards: number;
} {
  const docs = Object.values(store);
  return {
    workflows: docs.length,
    cards: docs.reduce((total, doc) => total + doc.nodes.length, 0),
  };
}

/** Whether the how-to has been dismissed; a first visit opens it, later ones keep it shut. */
export function readWorkflowGuideSeen(): boolean {
  const store = bucket();
  if (!store) return false;
  try {
    return store.getItem(WORKFLOW_GUIDE_KEY) === 'seen';
  } catch {
    return false;
  }
}

export function markWorkflowGuideSeen(): void {
  const store = bucket();
  if (!store) return;
  try {
    store.setItem(WORKFLOW_GUIDE_KEY, 'seen');
  } catch {
    // A blocked bucket leaves the how-to open next time, which is the harmless direction.
  }
}

/**
 * What a dragged arrow creates on bare paper: one card kind, or `ask` (the picker).
 *
 * It is a canvas preference, not part of the document, so it lives beside the how-to flag; a value
 * that is not a kind this build knows reads as `ask`, which is the direction that cannot create the
 * wrong card.
 */
export const DROP_DEFAULT_KEY = 'mechalab_workflow_drop_default_v1';

export function readDropDefault(): StepKind | 'ask' {
  const store = bucket();
  if (!store) return 'ask';
  try {
    const raw = store.getItem(DROP_DEFAULT_KEY);
    return raw && (STEP_KINDS as readonly string[]).includes(raw) ? (raw as StepKind) : 'ask';
  } catch {
    return 'ask';
  }
}

/** `ask` removes the entry instead of storing it, so a learner who never chose has no setting. */
export function saveDropDefault(kind: StepKind | 'ask'): void {
  const store = bucket();
  if (!store) return;
  try {
    if (kind === 'ask') store.removeItem(DROP_DEFAULT_KEY);
    else store.setItem(DROP_DEFAULT_KEY, kind);
  } catch {
    // A blocked bucket just means the next drag asks again.
  }
}
