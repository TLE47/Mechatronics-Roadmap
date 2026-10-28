/**
 * Merging this browser's drafts, notes and checklist ticks with the account's copy — the rule that
 * makes opt-in workspace sync safe enough to switch on.
 *
 * Progress sync can be one sentence ("a completion is never lost"). Workspace sync is harder: two
 * devices can hold two genuinely different drafts of the same lesson, and neither is wrong. So the
 * merge never chooses silently:
 *
 *  - **Drafts** — identical text merges to one; a draft on one side only is kept; when both sides
 *    hold different non-empty text, the newer snapshot's draft keeps the lesson's slot and the other
 *    version is kept in `conflicts` with its origin and time. Both versions exist afterwards, and the
 *    dashboard lists them so the learner can copy back the one they wanted.
 *  - **Notes** — a note on one side fills the other; two different notes are the same conflict shape
 *    (newer wins the slot, older is kept).
 *  - **Highlights** — union by quote, because a highlight is identified by its quote. Two comments on
 *    the same quote: the newer `at` wins, the older is preserved as a conflict entry.
 *  - **Checklist ticks** — union by item, exactly as a backup merges them: a tick added on either
 *    device arrives, and neither side can take one away. The merge is shared with the backup path
 *    (`mergeChecks`), so the two cannot drift into different answers.
 *  - The learning-log-style clocks are not invented: `updatedAt` is the later of the two, and a
 *    conflict records the time it came from.
 *
 * Pure: no storage, no network, no `StudyStore` import (that module touches `localStorage`).
 * `scripts/test_accounts.mjs` imports this file directly.
 */

import { mergeChecks, parseCheckStore, type CheckStore } from './lessonChecks.ts';

export const WORKSPACE_SCHEMA = 'mechalab.workspace/1';

/** The parts of a study lesson this merge needs; structurally identical to `LessonStudy`. */
export interface StudyNote {
  note: string;
  highlights: { quote: string; comment: string; at: number }[];
  updatedAt: number;
}

export type StudySnapshot = Record<string, StudyNote>;

/** A version that lost its slot, kept so the learner can still get it back. */
export interface WorkspaceConflict {
  /** The lesson id whose slot this version used to hold. */
  id: string;
  kind: 'draft' | 'note' | 'comment';
  /** The text itself — the whole point of keeping the entry. */
  text: string;
  /** Where it came from, so "which one was mine?" has an answer. */
  from: 'local' | 'account';
  /** The snapshot time that version carried. */
  at: number;
}

export interface WorkspaceDoc {
  schema: typeof WORKSPACE_SCHEMA;
  updatedAt: number;
  drafts: Record<string, string>;
  study: StudySnapshot;
  /**
   * The reading checklists, per lesson. Optional because a row written before checklists existed has
   * no such field: it is an older document, not a corrupt one, so it is read as having no ticks.
   */
  checks?: CheckStore;
  /** Newest first, capped by `MAX_CONFLICTS`. */
  conflicts: WorkspaceConflict[];
}

export const MAX_CONFLICTS = 50;

export function emptyWorkspace(): WorkspaceDoc {
  return { schema: WORKSPACE_SCHEMA, updatedAt: 0, drafts: {}, study: {}, checks: {}, conflicts: [] };
}

/**
 * One slot, two versions. The newer snapshot wins the slot; the other version is returned as a
 * conflict so it is kept rather than overwritten.
 */
function pick(
  local: string,
  remote: string,
  localIsNewer: boolean
): { winner: string; loser: { text: string; from: 'local' | 'account' } | null } {
  if (local === remote) return { winner: local, loser: null };
  if (!local) return { winner: remote, loser: null };
  if (!remote) return { winner: local, loser: null };
  return localIsNewer
    ? { winner: local, loser: { text: remote, from: 'account' } }
    : { winner: remote, loser: { text: local, from: 'local' } };
}

export interface WorkspaceMergeResult {
  doc: WorkspaceDoc;
  /** Counts for the "what arrived" line after the first sign-in. */
  addedDrafts: number;
  addedNotes: number;
  addedHighlights: number;
  addedChecks: number;
  conflicts: number;
}

/**
 * Merge `local` into `remote` (or the other way round — the result is the same apart from which side
 * a conflict is blamed on). Neither input is mutated.
 */
export function mergeWorkspace(local: WorkspaceDoc, remote: WorkspaceDoc): WorkspaceMergeResult {
  const localIsNewer = local.updatedAt >= remote.updatedAt;
  const drafts: Record<string, string> = { ...remote.drafts };
  let addedDrafts = 0;
  const conflicts: WorkspaceConflict[] = [];
  const at = Math.max(local.updatedAt, remote.updatedAt);

  for (const [id, text] of Object.entries(local.drafts)) {
    if (!(id in drafts)) {
      drafts[id] = text;
      addedDrafts += 1;
      continue;
    }
    const { winner, loser } = pick(text, drafts[id], localIsNewer);
    drafts[id] = winner;
    if (loser) conflicts.push({ id, kind: 'draft', text: loser.text, from: loser.from, at });
  }

  const study: StudySnapshot = {};
  for (const [id, lesson] of Object.entries(remote.study)) {
    study[id] = {
      note: lesson.note,
      highlights: lesson.highlights.map((highlight) => ({ ...highlight })),
      updatedAt: lesson.updatedAt,
    };
  }
  let addedNotes = 0;
  let addedHighlights = 0;

  for (const [id, lesson] of Object.entries(local.study)) {
    const here = study[id];
    if (!here) {
      study[id] = {
        note: lesson.note,
        highlights: lesson.highlights.map((highlight) => ({ ...highlight })),
        updatedAt: lesson.updatedAt,
      };
      if (lesson.note) addedNotes += 1;
      addedHighlights += lesson.highlights.length;
      continue;
    }
    if (!here.note && lesson.note) {
      here.note = lesson.note;
      addedNotes += 1;
    } else if (here.note && lesson.note) {
      const { winner, loser } = pick(lesson.note, here.note, localIsNewer);
      here.note = winner;
      if (loser) conflicts.push({ id, kind: 'note', text: loser.text, from: loser.from, at });
    }
    for (const highlight of lesson.highlights) {
      const existing = here.highlights.find((entry) => entry.quote === highlight.quote);
      if (!existing) {
        here.highlights.push({ ...highlight });
        addedHighlights += 1;
        continue;
      }
      if (highlight.comment === existing.comment) continue;
      if (!existing.comment) {
        existing.comment = highlight.comment;
        existing.at = Math.max(existing.at, highlight.at);
        continue;
      }
      if (!highlight.comment) continue;
      // Both explained the same quote differently: the newer comment keeps the quote, the older one
      // is preserved with the quote so it still reads as a comment on something.
      if (highlight.at > existing.at) {
        conflicts.push({ id, kind: 'comment', text: existing.comment, from: 'account', at: existing.at });
        existing.comment = highlight.comment;
        existing.at = highlight.at;
      } else {
        conflicts.push({ id, kind: 'comment', text: highlight.comment, from: 'local', at: highlight.at });
      }
    }
    here.highlights = here.highlights.slice(-20);
    here.updatedAt = Math.max(here.updatedAt, lesson.updatedAt);
  }

  // The same union the backup uses, so the two routes cannot disagree about what a tick is.
  const remoteChecks = parseCheckStore(remote.checks ?? {});
  const mergedChecks = mergeChecks(remoteChecks, parseCheckStore(local.checks ?? {}));
  const checks: CheckStore = mergedChecks.store;

  return {
    doc: {
      schema: WORKSPACE_SCHEMA,
      updatedAt: at,
      drafts,
      study,
      checks,
      // Newest conflicts first; the cap is about the size of one row, not about losing the newest.
      conflicts: [...conflicts, ...remote.conflicts, ...local.conflicts]
        .sort((a, b) => b.at - a.at)
        .slice(0, MAX_CONFLICTS),
    },
    addedDrafts,
    addedNotes,
    addedHighlights,
    addedChecks: mergedChecks.added,
    conflicts: conflicts.length,
  };
}

/** Reject anything that is not a workspace document this build understands. */
export function isWorkspaceDoc(value: unknown): value is WorkspaceDoc {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceDoc>;
  return (
    candidate.schema === WORKSPACE_SCHEMA &&
    typeof candidate.updatedAt === 'number' &&
    typeof candidate.drafts === 'object' &&
    candidate.drafts !== null &&
    typeof candidate.study === 'object' &&
    candidate.study !== null &&
    // Absent on a row written before checklists; present, it must at least be a plain object.
    (candidate.checks === undefined ||
      (typeof candidate.checks === 'object' && candidate.checks !== null && !Array.isArray(candidate.checks))) &&
    Array.isArray(candidate.conflicts)
  );
}

export interface WorkspaceCounts {
  drafts: number;
  notes: number;
  highlights: number;
  checks: number;
  conflicts: number;
}

export function workspaceCounts(doc: WorkspaceDoc): WorkspaceCounts {
  const lessons = Object.values(doc.study);
  return {
    drafts: Object.values(doc.drafts).filter((text) => text.trim().length > 0).length,
    notes: lessons.filter((lesson) => lesson.note.trim().length > 0).length,
    highlights: lessons.reduce((total, lesson) => total + lesson.highlights.length, 0),
    checks: Object.values(doc.checks ?? {}).reduce((total, lesson) => total + lesson.done.length, 0),
    conflicts: doc.conflicts.length,
  };
}
