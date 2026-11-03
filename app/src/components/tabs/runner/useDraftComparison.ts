/**
 * The versions behind the draft, and what the editor is compared against
 * (`runner/useDraftComparison.ts`).
 *
 * Two panels, one subject: the diff answers "what did I change, and against what", and the history
 * panel answers "which of the runs before this one should I get back". They share a read of the same
 * snapshot list, the same five-version cap, the same earned-solution rule and the same lesson reset,
 * which is why they are one hook rather than two. The tab used to hold five cells and three memos for
 * it, plus a restore handler that also clears the run's verdict.
 *
 * Everything that is a *view* of a run — the verdict, the output checks, the editor — stays in the
 * tab: `onRestore` is passed in, because putting text back is the editor's business.
 */
import { useEffect, useMemo, useState } from 'react';
import { clearHistory, snapshotsFor, type DraftSnapshot } from '../../../draftHistory';
import { diffLines, type CodeDiff } from '../../../codeDiff';
import {
  resolveDiffReference,
  type DiffReference,
  type DiffTarget,
} from '../../../diffReference';
import type { PythonLessonItem } from '../../../data/pythonLessonsData';

export interface DraftComparison {
  /** The filed versions of this lesson's draft, newest first, capped at five. */
  history: DraftSnapshot[];
  historyOpen: boolean;
  toggleHistory: () => void;
  /** Forget this lesson's versions, and redraw the panel. */
  clear: () => void;
  /**
   * A run just filed a version. The panel reads the store through a memo, and the render that
   * reported the verdict read it *before* the snapshot existed, so the version the learner just made
   * would be invisible until the lesson changed without this bump.
   */
  fileVersion: () => void;
  /** Put a version back in the editor. The tab owns what else a restore clears. */
  restore: (code: string) => void;
  /** Whether the solution may be read: opened for this lesson in this visit, or the lesson is passed. */
  solutionUnlocked: boolean;
  /** The solution was opened, which is what earns it as a diff reference. */
  useSolution: () => void;
  diffOpen: boolean;
  toggleDiff: () => void;
  target: DiffTarget;
  chooseTarget: (target: DiffTarget) => void;
  /** Starter, the earned solution, or the code a filed run started from — with its fallbacks. */
  reference: DiffReference;
  /** Null unless the panel is open: a closed diff costs no work. */
  diff: CodeDiff | null;
}

interface UseDraftComparisonInput {
  lesson: PythonLessonItem;
  code: string;
  /** The lesson is verified: a passed lesson has earned its solution reference. */
  verified: boolean;
  onRestore: (code: string) => void;
}

export function useDraftComparison({
  lesson,
  code,
  verified,
  onRestore,
}: UseDraftComparisonInput): DraftComparison {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [diffOpen, setDiffOpen] = useState(false);
  const [target, setTarget] = useState<DiffTarget>('starter');
  const [solutionUsed, setSolutionUsed] = useState<Record<string, boolean>>({});

  const history = useMemo(() => snapshotsFor(lesson.id), [lesson.id, historyVersion]);
  const solutionUnlocked = verified || Boolean(solutionUsed[lesson.id]);
  const reference = useMemo(
    () =>
      resolveDiffReference(target, {
        starter: lesson.starterCode,
        solution: lesson.fullSolution,
        solutionUnlocked,
        history,
      }),
    [target, lesson, solutionUnlocked, history]
  );
  const diff = useMemo(
    () => (diffOpen ? diffLines(reference.code, code) : null),
    // `code` is in the deps because this is a view of the buffer: typing is the thing being diffed.
    [diffOpen, reference.code, code]
  );

  // A filed version belongs to one lesson, so the panel goes back to the starter when the lesson
  // changes: carrying `run:2` across a switch would describe another lesson's work.
  useEffect(() => {
    setTarget('starter');
  }, [lesson.id]);

  return {
    history,
    historyOpen,
    toggleHistory: () => setHistoryOpen((open) => !open),
    clear: () => {
      clearHistory(lesson.id);
      setHistoryVersion((version) => version + 1);
    },
    fileVersion: () => setHistoryVersion((version) => version + 1),
    restore: onRestore,
    solutionUnlocked,
    useSolution: () => setSolutionUsed((used) => ({ ...used, [lesson.id]: true })),
    diffOpen,
    toggleDiff: () => setDiffOpen((open) => !open),
    target,
    chooseTarget: setTarget,
    reference,
    diff,
  };
}
