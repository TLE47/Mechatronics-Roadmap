/**
 * Which lessons are verified, and which the learner marked done (`runner/useProgressFlags.ts`).
 *
 * Two stores with one rule: the parent may own them, and when it does not, this tab is the store.
 * The local half is read once at mount and written straight to `localStorage`, because it is the
 * fallback for a standalone build — the same shape `progressKeys.ts` defines for the backup, which
 * reads the same keys without React.
 *
 * It lives here rather than in the tab because it is not the tab's state: it is the learner's
 * record, it is read by the toolbar, the roadmap hand-off and the diff's solution rule, and it
 * survives every lesson change. The tab passes it down and asks about it; nobody edits it inline.
 */
import { useState } from 'react';
import {
  readFlagMap,
  STORAGE_KEY_COMPLETED,
  STORAGE_KEY_VERIFIED,
} from '../../../progressKeys';

interface UseProgressFlagsInput {
  externalVerified?: Record<string, boolean>;
  externalCompleted?: Record<string, boolean>;
  onMarkLessonVerified?: (lessonId: string) => void;
  onToggleLessonCompleted?: (lessonId: string, forceValue?: boolean) => void;
}

export interface ProgressFlags {
  verifiedLessons: Record<string, boolean>;
  completedLessons: Record<string, boolean>;
  markLessonVerified: (lessonId: string) => void;
  toggleLessonSelfMarked: (lessonId: string, forceValue?: boolean) => void;
}

export function useProgressFlags({
  externalVerified,
  externalCompleted,
  onMarkLessonVerified,
  onToggleLessonCompleted,
}: UseProgressFlagsInput): ProgressFlags {
  const [localVerified, setLocalVerified] = useState<Record<string, boolean>>(() =>
    readFlagMap(STORAGE_KEY_VERIFIED)
  );
  const [localCompleted, setLocalCompleted] = useState<Record<string, boolean>>(() =>
    readFlagMap(STORAGE_KEY_COMPLETED)
  );

  const verifiedLessons = externalVerified || localVerified;
  const completedLessons = externalCompleted || localCompleted;

  const markLessonVerified = (lessonId: string) => {
    if (onMarkLessonVerified) {
      onMarkLessonVerified(lessonId);
      return;
    }
    const next = { ...localVerified, [lessonId]: true };
    setLocalVerified(next);
    try {
      localStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const toggleLessonSelfMarked = (lessonId: string, forceValue?: boolean) => {
    if (onToggleLessonCompleted) {
      onToggleLessonCompleted(lessonId, forceValue);
      return;
    }
    // Standalone fallback (no parent owning the state): the toggle derives from `prev`, so two
    // same-task clicks compose instead of both reading the render they were drawn with.
    setLocalCompleted((prev) => {
      const nextVal = forceValue !== undefined ? forceValue : !prev[lessonId];
      const next = { ...prev, [lessonId]: nextVal };
      try {
        localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  return { verifiedLessons, completedLessons, markLessonVerified, toggleLessonSelfMarked };
}
