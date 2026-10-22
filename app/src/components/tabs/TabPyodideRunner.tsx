import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PYTHON_LESSONS, PythonLessonItem } from '../../data/pythonLessonsData';
import { MECHALAB_PLANT_FILENAME, MECHALAB_PLANT_PY } from '../../data/mechalabPlant';
import { asOutputMatchMode, compareStdout, OutputMatchMode } from '../../outputMatch';
import { coachForLesson } from '../../lessonCoach';
import { failingChecks, hintCountFor, hintLock, nextRung, rungAnswersCheck } from '../../checkHints';
import { matchError } from '../../errorIndex';
import { failureSummary, isAssertionFailure, parseFailure } from '../../traceback';
import { TracebackCard } from '../TracebackCard';
import { lessonPageUrl } from '../../startHere';
import {
  assetUrlsFromDocument,
  cacheInventory,
  offlineReportLine,
  offlineWarmSupported,
  warmWithServiceWorker,
  type OfflineCacheReport,
} from '../../offlineTakeAlong';
import { FaultBench08 } from '../FaultBench08';
import { StudyPanel } from '../StudyPanel';
import type { HarnessReport } from '../../harnessGrading.ts';
import { harnessGate, parseHarnessReport } from '../../harnessGrading.ts';
import { harnessForLesson, harnessSourceForLesson } from '../../lessonHarnesses.ts';
import { LessonHarnessPanel } from '../LessonHarnessPanel';
import { logEvent } from '../../learningLog';
import { recordSittingEvent } from '../../sittingClock';
import {
  AnalysisSession,
  noteLabel,
  sameNotes,
  type LintNote,
} from '../../analysisClient';
import { rememberLessonInUrl } from '../../lessonRoute';
import { rememberLastLesson } from '../../lastLesson';
import { isEdited, readDraft, saveDraft } from '../../lessonDraft';
import { STORAGE_KEY_COMPLETED, STORAGE_KEY_VERIFIED } from '../../progressKeys';
import {
  clearHistory,
  recordSnapshot,
  snapshotAgeLabel,
  snapshotsFor,
  verdictLabel,
} from '../../draftHistory';
import { diffLines, diffSummary } from '../../codeDiff';
import {
  checkPrediction,
  clearPrediction,
  describeCheck,
  predictionFor,
  savePrediction,
  type PredictionRecord,
} from '../../predictGate';
import {
  WATCH_DEBOUNCE_MS,
  readWatch,
  setWatch,
  watchDecision,
  type WatchVerdict,
} from '../../watchMode';
import { runAnnouncement } from '../../announce';
import { MAX_SHARE_URL, shareUrl, type SharedAttempt } from '../../shareLink';
import { inlineValuesFor, readRunValues } from '../../inlineValues';
import { MAIN_FILE_NAME, helperFilesForLesson } from '../../lessonFiles';
import { markPaintReady } from '../../paintTiming';
import { parseSliders } from '../../editor/sliderModel';
import { PythonEditor, type PythonEditorHandle } from '../PythonEditor';
import { ScopePanel } from '../ScopePanel';
import { normalizeScopeSeries, type ScopeSeries } from '../../scopeModel';
import { roadmapStepForLesson } from '../../practiceLinks';
import { stepBreadcrumb, stepCostLabel, stepForMilestone } from '../../spine';
import { PYTHON_TAB_NAME } from '../../tabNames';
import type { ActiveTierPass } from '../../curriculumData';
import {
  Play,
  RotateCcw,
  Eye,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  BookOpen,
  Sparkles,
  Check,
  ChevronRight,
  Search,
  CheckSquare,
  Square,
  OctagonX,
  RefreshCw,
  ShieldCheck,
  Lock,
  Loader2,
  History,
  GitCompare,
  Activity,
  Share2,
} from 'lucide-react';

declare global {
  interface Window {
    __mechalabPyodideCdnUrl?: string;
    __mechalabExecutionTimeoutMs?: number;
    __mechalabMaxTraceSteps?: number;
    /** `false` turns the predict-first gate off — a suite's switch, never a learner's. */
    __mechalabPredictFirst?: boolean;
  }
}

const DEFAULT_PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const DEFAULT_EXECUTION_TIMEOUT_MS = 6000;
const DEFAULT_MAX_TRACE_STEPS = 400000;

// The keys live in `progressKeys.ts`, because the backup reads the same stores without importing
// React; re-exported here so the existing importers keep their names.
export { STORAGE_KEY_COMPLETED, STORAGE_KEY_VERIFIED };
// A JSON array of lesson ids whose first-run coach the learner hid. The old P.1-only key stored
// '1', which means P.1 was hidden, not that every lesson's later brief should be.
export const STORAGE_KEY_FIRST_GUIDE = 'mechalab_first_guide_dismissed_v1';

// The runtime worker lives in its own module (`src/runtime/pythonWorker.ts`) so the service worker
// can cache what it fetches; this component only owns the messages it sends.


/** The last palette run request this page has acted on; see the effect near the keyboard shortcut. */
let LAST_RUN_REQUEST_HANDLED = 0;

interface TabPyodideRunnerProps {
  initialLessonId?: string;
  verifiedLessons?: Record<string, boolean>;
  completedLessons?: Record<string, boolean>;
  onMarkLessonVerified?: (lessonId: string) => void;
  onToggleLessonCompleted?: (lessonId: string, forceValue?: boolean) => void;
  /** Opens the roadmap at the pass the open entry belongs to. */
  onOpenRoadmap?: (pass: ActiveTierPass, milestoneId: string) => void;
  /**
   * A counter the palette bumps when "Run the lesson" is chosen. A nonce, not a callback: the
   * palette outlives this component (it is mounted whatever tab is open), so it cannot hold the
   * run function, and a mount must never fire a run the learner asked for on an earlier visit.
   */
  runRequest?: number;
  /**
   * An explicit "open this entry" request. The id alone cannot express it: choosing the lesson a
   * deep link already named leaves `initialLessonId` unchanged, so nothing would fire.
   */
  lessonRequest?: { id: string; nonce: number } | null;
  /**
   * Code that arrived in a share link (`#share=…`). Offered, never applied: it is someone else's
   * attempt and the learner's own draft is behind it.
   */
  sharedAttempt?: SharedAttempt | null;
  /** Clear the offer once it has been used or dismissed. */
  onDismissShared?: () => void;
}

/** What the Share button last did, so the line under the toolbar can say it. */
type ShareStatus =
  | { kind: 'idle' }
  | { kind: 'copied'; characters: number }
  | { kind: 'no-code' }
  | { kind: 'too-long'; characters: number }
  | { kind: 'failed'; url: string }
  | { kind: 'loaded' };

export const TabPyodideRunner: React.FC<TabPyodideRunnerProps> = ({
  initialLessonId,
  verifiedLessons: externalVerified,
  completedLessons: externalCompleted,
  onMarkLessonVerified,
  onToggleLessonCompleted,
  onOpenRoadmap,
  runRequest,
  lessonRequest,
  sharedAttempt,
  onDismissShared,
}) => {
  const [selectedId, setSelectedId] = useState<string>(initialLessonId || PYTHON_LESSONS[0].id);
  const [dismissedGuides, setDismissedGuides] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_FIRST_GUIDE);
      if (!raw) return [];
      if (raw === '1') return ['P.1'];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const guideEditorRef = useRef<PythonEditorHandle | null>(null);
  const editorPanelRef = useRef<HTMLDivElement | null>(null);
  // Which tab of the lesson's small project is open: null is `main.py`, a string is a read-only
  // helper. Reset on every lesson change, because a helper from the previous lesson is not this one.
  const [openHelper, setOpenHelper] = useState<string | null>(null);
  const guideAssessmentRef = useRef<HTMLDivElement | null>(null);
  // Named groups the roadmap also uses; the old "Step 1 / Steps 3-5 / Steps 6-10" numbering was a
  // third scheme, belonging to neither the roadmap's passes nor any tab the learner can open.
  const [trackFilter, setTrackFilter] = useState<'all' | 'onramp' | 'lessons' | 'modules'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // The editor opens on the learner's own unfinished work when there is any (`src/lessonDraft.ts`),
  // and on the lesson's starter when there is not. Without this, "Continue P.4" on the roadmap would
  // open a fresh starter - the card would be naming work it had already thrown away.
  const [code, setCode] = useState<string>(() => {
    const id = initialLessonId || PYTHON_LESSONS[0].id;
    return (
      readDraft(id) ??
      PYTHON_LESSONS.find((lesson) => lesson.id === id)?.starterCode ??
      PYTHON_LESSONS[0].starterCode
    );
  });
  const [revealedHints, setRevealedHints] = useState<number>(0);
  // Runs completed per lesson: Hint 2 waits for one, so the ladder is not a table of contents.
  // Kept per lesson, not reset on selection, because an earlier attempt on that lesson counts.
  const [runAttempts, setRunAttempts] = useState<Record<string, number>>({});
  // The attempt count at the moment rung 1 was opened, per lesson. Rung 2 is the near-solution, so
  // it is earned by an attempt *after* the nudge (`checkHints.hintLock`), not by the run that was
  // already on screen when the nudge was read.
  const [hintOpenedAt, setHintOpenedAt] = useState<Record<string, number>>({});
  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
  const [shareStatus, setShareStatus] = useState<ShareStatus>({ kind: 'idle' });
  const [instructorError, setInstructorError] = useState<string>('');
  // What a capstone harness grades: the metrics the learner's own functions produce.
  const [harnessReport, setHarnessReport] = useState<HarnessReport | null>(null);
  const [behaviorCheck, setBehaviorCheck] = useState<'untested' | 'passed' | 'failed'>('untested');
  const [outputCheck, setOutputCheck] = useState<'untested' | 'matched' | 'differs'>('untested');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  // The pass toast is short and dismissable by time alone: it exists to carry the learner into
  // the next lesson while the win is fresh, not to become another panel to close.
  const [showPassToast, setShowPassToast] = useState<boolean>(false);
  const [pyodideStatus, setPyodideStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  // The "take this step offline" press: what it found, what it measured, and whether the runtime
  // came along. `ready` requires the interpreter's own files, not just the shell - a cached page that
  // cannot run Python is not offline-ready for this app.
  const [offline, setOffline] = useState<{
    state: 'idle' | 'working' | 'ready' | 'partial' | 'unsupported';
    report: OfflineCacheReport | null;
  }>({ state: 'idle', report: null });
  const [passStatus, setPassStatus] = useState<
    'untested' | 'passed' | 'harness_failed' | 'behavior_failed' | 'mismatch' | 'stopped' | 'error'
  >('untested');

  const [localVerified, setLocalVerified] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_VERIFIED);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [localCompleted, setLocalCompleted] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_COMPLETED);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const verifiedLessons = externalVerified || localVerified;
  const completedLessons = externalCompleted || localCompleted;

  const markLessonVerified = (lessonId: string) => {
    if (onMarkLessonVerified) {
      onMarkLessonVerified(lessonId);
    } else {
      const next = { ...localVerified, [lessonId]: true };
      setLocalVerified(next);
      try {
        localStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
    }
  };

  const toggleLessonSelfMarked = (lessonId: string, forceValue?: boolean) => {
    if (onToggleLessonCompleted) {
      onToggleLessonCompleted(lessonId, forceValue);
    } else {
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
    }
  };

  const workerRef = useRef<Worker | null>(null);
  // One analysis channel per page, bound to whichever worker is current (Reset Runtime replaces it).
  const analysisRef = useRef<AnalysisSession | null>(null);
  const activeRunIdRef = useRef<number>(0);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeResolveRef = useRef<((val: any) => void) | null>(null);
  // Shared memory between the page and the interpreter: [interrupt] and [state, length, bytes].
  // Both are null when the page is not cross-origin isolated, and Stop falls back to terminating.
  const interruptRef = useRef<SharedArrayBuffer | null>(null);
  const stdinCtrlRef = useRef<SharedArrayBuffer | null>(null);
  const stopFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stdinPrompt, setStdinPrompt] = useState<string | null>(null);
  const [stdinValue, setStdinValue] = useState<string>('');
  const [readyMs, setReadyMs] = useState<number | null>(null);
  // Changes only when the worker is replaced. A Stop that interrupts keeps it; a Stop that had to
  // terminate shows a new one, which is exactly the distinction the runtime suite checks.
  const [runtimeBoot, setRuntimeBoot] = useState<string | null>(null);

  const clearRunWatchdog = () => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  };

  const destroyWorker = () => {
    clearRunWatchdog();
    if (stopFallbackRef.current) {
      clearTimeout(stopFallbackRef.current);
      stopFallbackRef.current = null;
    }
    if (workerRef.current) {
      try {
        workerRef.current.terminate();
      } catch {
        // ignore termination errors
      }
      workerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      destroyWorker();
    };
  }, []);

  // The paint reading's fourth moment: this tab has committed, which is when the Run button is on
  // screen and clickable. Once per visit, not once per lesson (`paintTiming.ts`).
  useEffect(() => {
    markPaintReady('run');
  }, []);

  // The first pass restores a deep link and must not rewrite the address (a plain visit keeps a
  // clean URL). A later pass is the learner picking a different entry in-app - from a roadmap step's
  // practice chip, say - and then the address has to follow, or it keeps naming the old lesson.
  const initialLessonApplied = useRef<boolean>(false);
  useEffect(() => {
    if (initialLessonId && PYTHON_LESSONS.some((l) => l.id === initialLessonId)) {
      selectLesson(initialLessonId, initialLessonApplied.current);
      initialLessonApplied.current = true;
    }
  }, [initialLessonId]);

  // A palette pick (or a roadmap practice chip) is an instruction, not a prop sync: the nonce is
  // what makes it land even when it names the entry already in `initialLessonId`, and the address
  // bar follows because a learner's own pick is what a copied URL should reopen.
  const lastLessonRequest = useRef<number>(0);
  useEffect(() => {
    if (!lessonRequest || lessonRequest.nonce <= lastLessonRequest.current) return;
    lastLessonRequest.current = lessonRequest.nonce;
    selectLesson(lessonRequest.id, true);
  }, [lessonRequest]);

  const currentLesson: PythonLessonItem =
    PYTHON_LESSONS.find((l) => l.id === selectedId) || PYTHON_LESSONS[0];
  // The lesson's read-only helpers. The plant is 400 lines a learner can read but not edit; the
  // worker writes the same text into Pyodide, so `from mechalab_plant import ...` works unchanged.
  const helperFiles = React.useMemo(
    () => helperFilesForLesson(currentLesson, { filename: MECHALAB_PLANT_FILENAME, source: MECHALAB_PLANT_PY }),
    [currentLesson]
  );
  const sliderCount = React.useMemo(() => parseSliders(code).length, [code]);
  const openHelperFile = helperFiles.find((file) => file.name === openHelper) ?? null;
  useEffect(() => {
    setOpenHelper(null);
  }, [selectedId]);
  // What the lesson's harness says about the code on screen now; a `null` report is a failed gate
  // (unproven), never a pass.
  const currentHarness = harnessForLesson(currentLesson.id);
  const harnessResult = currentHarness ? harnessGate(currentHarness, harnessReport) : null;
  // Re-read when the lesson changes, when a run ends, or when the learner forgets the list - the
  // three moments it can differ from what is on screen. Never on a keystroke: the editor's own text
  // is not what this list holds.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  // The diff panel and what it compares against. The solution is a spoiler: the view unlocks once the
  // learner has opened the solution for this lesson in this visit, or has passed the lesson.
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffTarget, setDiffTarget] = useState<'starter' | 'solution'>('starter');
  const [solutionUsed, setSolutionUsed] = useState<Record<string, boolean>>({});
  const draftHistory = useMemo(
    () => snapshotsFor(selectedId),
    [selectedId, passStatus, historyVersion]
  );
  // What the diff compares the editor against. A solution reference is only reachable once it is
  // earned (opened here, or the lesson is verified), so the panel cannot be used to read the answer.
  const solutionUnlocked = Boolean(verifiedLessons[selectedId]) || Boolean(solutionUsed[selectedId]);
  const diffReference =
    diffTarget === 'solution' && solutionUnlocked ? currentLesson.fullSolution : currentLesson.starterCode;
  const codeDiff = useMemo(
    () => (diffOpen ? diffLines(diffReference, code) : null),
    // `code` is in the deps because this is a view of the buffer: typing is the thing being diffed.
    [diffOpen, diffReference, code]
  );
  // Predict first (see `app/src/predictGate.ts`). The first Run of a lesson asks what it will print
  // and holds the run until the learner commits or skips; the record is per lesson and per store.
  const [predictRecord, setPredictRecord] = useState<PredictionRecord | null>(null);
  const [predictOpen, setPredictOpen] = useState(false);
  const [predictText, setPredictText] = useState('');
  /** The run the gate is holding: set when Run was pressed before a prediction was made. */
  const [heldRun, setHeldRun] = useState<{ code: string; lesson: PythonLessonItem } | null>(null);
  // Watch mode (see `app/src/watchMode.ts`): after a graded failure, a pause in typing re-runs the
  // checks. Off unless the learner asked for it.
  const [watchOn, setWatchOn] = useState<boolean>(() => readWatch());
  /** Set for the one run watch mode starts, so the log and the filed versions know it was automatic. */
  const watchRunRef = useRef(false);
  // A new lesson is a new question: the panel closes, the half-typed guess goes, and the record is
  // read for the lesson now on screen rather than the one just left.
  useEffect(() => {
    setPredictRecord(predictionFor(selectedId));
    setPredictOpen(false);
    setPredictText('');
    setHeldRun(null);
  }, [selectedId]);
  // The run's traced signals. Empty means the run drew nothing, which is the normal case for a
  // lesson that only prints, so the panel renders nothing at all rather than an empty frame.
  const [scopeSeries, setScopeSeries] = useState<ScopeSeries[]>([]);
  // The run pinned as A: its traces stay on the axes while the next run draws over them as B, which
  // is how a parameter change is read - one `t`, both values, on the same pair of axes. Cleared when
  // the lesson changes, because a trace from another lesson is not the baseline for this one.
  const [pinnedScope, setPinnedScope] = useState<ScopeSeries[] | null>(null);


  // One `lesson_open` per visit, including the first render: it is the denominator for abandon rate.
  // The sitting clock takes the same event, because it is the moment the learner is here: it opens a
  // sitting, or extends the one they were already in when they switched lesson without a break.
  useEffect(() => {
    logEvent({ kind: 'lesson_open', lesson: selectedId });
    recordSittingEvent({ at: Date.now(), kind: 'open', lesson: selectedId });
  }, [selectedId]);

  // One `run` per execution, recorded where every path converges — the result state — rather than in
  // each of the six branches that can set it. `pendingRun` stops a re-render from logging twice.
  const pendingRunRef = useRef<boolean>(false);
  const runStartedAtRef = useRef<number>(0);
  // The text this run started from, captured before the worker is even asked: a learner who keeps
  // typing while it runs would otherwise file their in-progress edit under the old run's verdict.
  const runCodeRef = useRef<string>('');
  useEffect(() => {
    if (isRunning) {
      pendingRunRef.current = true;
      runStartedAtRef.current = performance.now();
      runCodeRef.current = codeRef.current;
    }
  }, [isRunning]);
  useEffect(() => {
    if (isRunning || !pendingRunRef.current || passStatus === 'untested') return;
    pendingRunRef.current = false;
    // A watch run is the machine repeating a check on the learner's behalf: it must not file a
    // version (it would evict the attempts they actually made) and must not count as a run the learner
    // started (it would inflate the friction report's denominators). It does still extend the sitting
    // and still records a pass, because both are facts about the learner's work.
    const watched = watchRunRef.current;
    watchRunRef.current = false;
    const failed =
      passStatus === 'harness_failed' && harnessResult
        ? harnessResult.summary
        : // A runtime error's first line is now `Traceback (most recent call last):` (the worker sends
          // the whole traceback so the card can read the frames); the exception line is the record.
          passStatus === 'error'
          ? failureSummary(stderr) || (instructorError || stderr || '').split('\n')[0]
          : (instructorError || stderr || '').split('\n')[0];
    if (!watched) {
      logEvent({
        kind: 'run',
        lesson: selectedId,
        outcome: passStatus,
        fail: failed || undefined,
        ms: Math.round(performance.now() - runStartedAtRef.current),
      });
    }
    if (passStatus === 'passed') logEvent({ kind: 'verified', lesson: selectedId });
    // A run is the clearest sign of work in a sitting, and the one that stretches it: the clock counts
    // to the last run, so an hour spent debugging is an hour, not a gap after the lesson opened.
    recordSittingEvent({ at: Date.now(), kind: 'run', lesson: selectedId });
    // The half of the draft store a learner cannot get from a single latest version: what each run
    // started from, filed with the verdict it got. Taken here because every path that ends a run
    // converges on this state, and the text is read from the ref so it is the code that ran.
    if (!watched) recordSnapshot(selectedId, runCodeRef.current || codeRef.current, passStatus);
    // The panel is read through a memo keyed on the lesson, the verdict and this counter. The verdict
    // this run reports is already rendered by the time this effect runs - that render read the store
    // *before* the snapshot above was filed - so without the bump the version the learner just made
    // would be invisible until the lesson changed or the panel was cleared.
    setHistoryVersion((version) => version + 1);
    // `harnessReport` is the identity that changes when the gate's verdict can: a fresh gate object
    // every render would re-run this effect on every keystroke, which `pendingRunRef` would swallow.
  }, [isRunning, passStatus, selectedId, instructorError, stderr, harnessReport]);

  // Formatting and behaviour are graded separately: the lesson declares how strictly its `stdout` is
  // compared (`normalized` unless its Expected Output is a column-aligned table), and the note under
  // the Expected Output panel always describes the verdict that is on screen.
  const outputMatchMode: OutputMatchMode = asOutputMatchMode(currentLesson.outputMatch);
  const outputComparison = compareStdout(stdout, currentLesson.expectedOutput, outputMatchMode);
  const lessonDowngradesFormatting = outputMatchMode !== 'exact';

  // The ladder, joined to the checks. A failed run names the rung that answers it (`checkHints`),
  // and rung 2 is earned by an attempt after the nudge rather than by the run that was already on
  // screen - the same rule for the ladder's own button and for a check's card.
  const hintCount = hintCountFor(currentLesson);
  const attemptsHere = runAttempts[currentLesson.id] ?? 0;
  const hintGate = {
    revealed: revealedHints,
    hintCount,
    attempts: attemptsHere,
    openedAt: hintOpenedAt[currentLesson.id] ?? null,
  };
  const hintLockState = hintLock(hintGate);
  const nextHintNumber = nextRung(hintGate);
  const nextHintNeedsAttempt = hintLockState !== 'none';
  const nextHintLabel =
    hintLockState === 'no-attempt'
      ? `Run to unlock Hint ${nextHintNumber}`
      : hintLockState === 'stale-attempt'
        ? `Run again to unlock Hint ${nextHintNumber}`
        : `Reveal Hint ${nextHintNumber}`;
  // The failure read, not only printed: the parse names the line in the learner's own file, and the
  // index names the habit the page documents for it. Only a `error` run has Python's own words to
  // read - a failed check has an assertion message, and a stopped run has none.
  const parsedFailure = useMemo(
    () => (passStatus === 'error' ? parseFailure(stderr) : null),
    [passStatus, stderr]
  );
  const errorEntry = useMemo(() => matchError(parsedFailure), [parsedFailure]);
  const checkFailures = failingChecks({
    passStatus,
    instructorError,
    firstDiffLine: outputComparison.firstDiffLine,
    hintCount,
  });

  /**
   * Open one rung, never a cascade.
   *
   * Rung 1 also starts the clock for rung 2: the attempt on screen when it was opened does not
   * count as having tried the nudge, so the near-solution waits for the next run. Recorded once per
   * lesson, because a learner who reopens Hint 1 after three attempts has already tried.
   */
  const revealHint = (rung: number) => {
    if (rung <= 0 || rung > hintCount) return;
    setRevealedHints((open) => (open >= rung ? open : rung));
    if (rung === 1) {
      setHintOpenedAt((prev) =>
        prev[selectedId] === undefined ? { ...prev, [selectedId]: attemptsHere } : prev
      );
    }
    logEvent({ kind: 'hint', lesson: selectedId, level: rung });
  };

  // What Run executes is the editor's text *now*, not the text the button was rendered with. `code`
  // and `selectedId` are what renders; these refs are written synchronously by the handlers that
  // change them, so Load Solution followed by Run in the same task runs the reference instead of
  // the starter both handlers were rendered with. The effects re-confirm the refs after each
  // commit, which is the same value whenever the handlers are the only writers.
  const codeRef = useRef<string>(code);
  const lessonIdRef = useRef<string>(initialLessonId || PYTHON_LESSONS[0].id);
  // What pyflakes last said about this buffer, and the one sentence to show when it could not be
  // installed at all. Both are cleared on a lesson change: a note about another file is noise.
  const [lintNotes, setLintNotes] = useState<LintNote[]>([]);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  const commitCode = (next: string) => {
    codeRef.current = next;
    setCode(next);
  };
  useEffect(() => {
    codeRef.current = code;
  }, [code]);
  useEffect(() => {
    lessonIdRef.current = selectedId;
  }, [selectedId]);

  // Typing is the draft. Written once the learner pauses rather than on every keystroke, so the
  // store sees one write per thought instead of one per character; `saveDraft` itself is what
  // decides that a lesson back on its starter keeps nothing.
  useEffect(() => {
    const timer = setTimeout(() => saveDraft(selectedId, code), 400);
    return () => clearTimeout(timer);
  }, [selectedId, code]);

  /**
   * Open a lesson in the editor.
   *
   * `remember` is false for the mount-time sync from `initialLessonId`: a plain visit should keep the
   * clean address it arrived on, while a learner's own pick makes the address bar name that entry so
   * a copied URL reopens it.
   */
  const selectLesson = (id: string, remember = true) => {
    const found = PYTHON_LESSONS.find((l) => l.id === id);
    if (!found) return;
    // The lesson being left gets one last write before the editor is replaced: the debounce below
    // may not have fired for the keystrokes typed just before the switch.
    if (lessonIdRef.current !== id) saveDraft(lessonIdRef.current, codeRef.current);
    setSelectedId(id);
    lessonIdRef.current = id;
    // Always recorded, unlike the address bar: a plain visit keeps its clean URL and still reopens
    // here next time, which is the difference between a bookmark that resumes and one that resets.
    rememberLastLesson(id);
    if (remember) rememberLessonInUrl(id);
    commitCode(readDraft(id) ?? found.starterCode);
    setRevealedHints(0);
    setPinnedScope(null);
    setStdout('');
    setStderr('');
    setInstructorError('');
    setHarnessReport(null);
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setPassStatus('untested');
    setShareStatus({ kind: 'idle' });
  };

  /**
   * Copy a link to this lesson with the editor's text in it.
   *
   * The codec decides whether a link is possible at all (`shareLink.ts`): an empty editor has nothing
   * to send, and a program that would make a 2,000+ character URL is refused here rather than pasted
   * into a chat that will cut it in half. The line under the toolbar says which of those happened —
   * and, when the clipboard refuses, prints the URL so it can still be copied by hand.
   */
  const shareAttempt = async () => {
    const result = shareUrl(window.location.href, { lesson: selectedId, code: codeRef.current });
    if (!result.ok) {
      setShareStatus(
        result.reason === 'too-long'
          ? { kind: 'too-long', characters: result.characters }
          : { kind: 'no-code' },
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      setShareStatus({ kind: 'copied', characters: result.characters });
    } catch {
      setShareStatus({ kind: 'failed', url: result.url });
    }
  };

  /** Adopt a shared attempt: the one click that replaces the draft, said plainly on the card. */
  const loadSharedAttempt = () => {
    if (!sharedAttempt) return;
    commitCode(sharedAttempt.code);
    saveDraft(selectedId, sharedAttempt.code);
    setPassStatus('untested');
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setInstructorError('');
    setShareStatus({ kind: 'loaded' });
    onDismissShared?.();
  };

  const getOrCreateWorker = (): Worker => {
    if (workerRef.current) {
      return workerRef.current;
    }
    // A real module URL, not a blob: the service worker controls this worker, so the Pyodide wheels it
    // fetches can be cached and served with the network off. `type: 'module'` is what lets the worker
    // use a dynamic `import()` for the ESM runtime instead of `importScripts`.
    const worker = new Worker(new URL('../../runtime/pythonWorker.js', import.meta.url), {
      type: 'module',
    });
    // Cross-origin isolation is what makes SharedArrayBuffer exist. With it, Stop raises
    // KeyboardInterrupt in the running program and the session survives; without it, Stop still
    // works, by terminating the worker (the old behaviour).
    try {
      if (typeof SharedArrayBuffer !== 'undefined') {
        interruptRef.current = new SharedArrayBuffer(4);
        stdinCtrlRef.current = new SharedArrayBuffer(8 * 1024);
        worker.postMessage({
          type: 'init',
          interruptBuffer: interruptRef.current,
          stdinBuffer: stdinCtrlRef.current,
        });
      }
    } catch {
      interruptRef.current = null;
      stdinCtrlRef.current = null;
    }
    // A brand-new worker has not loaded Python, so the status has to stop saying it has. A tab switch
    // terminates the worker while this component's state survives it, and the next mount warms a new
    // one - without this, the chip reads "Python ready" for the whole re-download, and every request
    // gated on readiness (completions, hover, signature, lint) believes it too.
    //
    // The ref is set here rather than waiting for the render below: it is what the analysis gate
    // reads, and it exists to answer without a render.
    setPyodideStatus('idle');
    pyodideStatusRef.current = 'idle';
    workerRef.current = worker;
    // Analysis answers carry a request id and no run id. The session claims them here, so the run
    // path's own `onmessage` handler can never mistake a completion list for a verdict.
    worker.addEventListener('message', (event: MessageEvent) => {
      analysisRef.current?.handleMessage(event.data);
    });
    return worker;
  };

  // The status the warm-up promise below has to know about without re-rendering: a worker that is
  // already loaded answers a second `warm` with silence (it has nothing new to report), so the page
  // has to remember for itself that Python is up.
  const pyodideStatusRef = useRef<'idle' | 'loading' | 'ready' | 'error'>('idle');
  useEffect(() => {
    pyodideStatusRef.current = pyodideStatus;
  }, [pyodideStatus]);

  /** The analysis channel, created on first use and posted to whichever worker is current. */
  const analysisSession = (): AnalysisSession => {
    if (!analysisRef.current) {
      analysisRef.current = new AnalysisSession((message) =>
        getOrCreateWorker().postMessage(message)
      );
    }
    return analysisRef.current;
  };

  /**
   * The session, but only once the interpreter is up.
   *
   * Before that a completion request would queue behind the 10 MB load and arrive long after the
   * learner moved on; the keyword completions answer immediately instead, which is what the editor
   * shipped with. The analyzers themselves install on the first request, so a learner who never
   * types never pays for them.
   *
   * A run is the other thing that blocks this worker: a hover, a signature or a completion asked
   * while Python is running would wait in the queue until the run ended and then answer a request
   * whose keystroke is long gone - so nothing is asked at all, and the card simply does not open.
   */
  const getReadyAnalysis = () =>
    pyodideStatusRef.current === 'ready' && !isRunning ? analysisSession() : null;

  useEffect(() => {
    setLintNotes([]);
    setAnalysisNotice(null);
  }, [selectedId]);

  // Lint as the buffer settles. Not on every keystroke: the worker is one thread and a Run must never
  // queue behind a lint, so this waits for a pause, for a loaded interpreter, and for an idle runner.
  //
  // Only the learner's own text is checked. A lesson's starter is the scaffold the lesson ships, and
  // pyflakes notes about it would read as the app complaining about its own exercise - while the one
  // thing a note is good for is the code somebody just wrote.
  useEffect(() => {
    if (pyodideStatus !== 'ready' || isRunning) return;
    if (!isEdited(code, currentLesson.starterCode)) {
      setLintNotes([]);
      setAnalysisNotice(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const session = getReadyAnalysis();
      if (!session) return;
      const source = codeRef.current;
      void session.lint({ code: source }).then((reply) => {
        // The buffer moved on while pyflakes was working: that answer describes text nobody is
        // looking at, and the effect has already scheduled the next one.
        if (codeRef.current !== source) return;
        if (!reply.ok) {
          setAnalysisNotice(
            'The checker could not load — it installs on one online visit, then stays in this browser session.'
          );
          setLintNotes([]);
          return;
        }
        setAnalysisNotice(null);
        setLintNotes((previous) => (sameNotes(previous, reply.value) ? previous : reply.value));
      });
    }, 700);
    return () => window.clearTimeout(timer);
    // `getReadyAnalysis` is a render-local function; the inputs it reads are in this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, pyodideStatus, isRunning, selectedId]);

  // What the caches already hold. A learner who has run a lesson is offline-ready by accident, and the
  // strip should say so without waiting for a press - but only the interpreter's own files make it
  // "ready": a cached shell that cannot run Python is a half answer, and says so.
  useEffect(() => {
    let cancelled = false;
    cacheInventory()
      .then((report) => {
        if (cancelled || !report.entries) return;
        setOffline({ state: report.runtimeFiles > 0 ? 'ready' : 'partial', report });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Load the interpreter for the offline copy, resolving when it is ready or when it never becomes so.
   *
   * A listener rather than an `onmessage` handler: the run path owns `worker.onmessage`, and taking it
   * over here would swallow a verdict if a Run landed while the button was still working.
   */
  const warmRuntimeForOffline = (timeoutMs = 180_000): Promise<boolean> =>
    new Promise((resolve) => {
      if (pyodideStatusRef.current === 'ready') {
        resolve(true);
        return;
      }
      let worker: Worker | null = null;
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        worker?.removeEventListener('message', onMessage);
        resolve(ok);
      };
      const onMessage = (event: MessageEvent) => {
        const data = event.data || {};
        if (data.type !== 'status' || data.status !== 'ready') return;
        setPyodideStatus('ready');
        if (typeof data.ms === 'number') setReadyMs(data.ms);
        finish(true);
      };
      const timer = window.setTimeout(() => finish(false), timeoutMs);
      try {
        worker = getOrCreateWorker();
      } catch {
        finish(false);
        return;
      }
      worker.addEventListener('message', onMessage);
      const cdnUrl =
        (typeof window !== 'undefined' && window.__mechalabPyodideCdnUrl) || DEFAULT_PYODIDE_CDN;
      worker.postMessage({ type: 'warm', cdnUrl });
    });

  /**
   * Take this step offline: cache what this document is running, load Python, then measure the result.
   *
   * The order matters. The worker caches the shell and the bundle, the runtime's own CDN files are
   * cached by the module worker as it loads them, and only then is the inventory read - so the number
   * on the button is what the machine actually holds, not an estimate of what it will.
   */
  const takeOffline = async () => {
    if (offline.state === 'working') return;
    if (!offlineWarmSupported()) {
      setOffline({ state: 'unsupported', report: offline.report });
      return;
    }
    setOffline({ state: 'working', report: offline.report });
    const urls = assetUrlsFromDocument();
    const shell = await warmWithServiceWorker(urls);
    if (!shell) {
      setOffline({ state: 'unsupported', report: offline.report });
      return;
    }
    await warmRuntimeForOffline();
    const report = await cacheInventory();
    setOffline({ state: report.runtimeFiles > 0 ? 'ready' : 'partial', report });
  };

  /** Hand a line to a program blocked in `input()`, and unblock the worker's wait. */
  const submitStdin = (line: string) => {
    const buffer = stdinCtrlRef.current;
    setStdinPrompt(null);
    setStdinValue('');
    if (!buffer) return;
    const ctrl = new Int32Array(buffer, 0, 2);
    const limit = buffer.byteLength - 8;
    const bytes = new TextEncoder().encode(line).subarray(0, limit);
    new Uint8Array(buffer, 8, bytes.length).set(bytes);
    Atomics.store(ctrl, 1, bytes.length);
    Atomics.store(ctrl, 0, 1);
    Atomics.notify(ctrl, 0);
  };

  // Warm the interpreter while the learner reads. Pyodide is ~10 MB from a CDN, and paying that
  // inside the first Run is what makes Run look broken; the worker now starts downloading as soon
  // as the screen is idle, and the first click is a warm run (the worker keeps one load promise, so
  // a Run that arrives mid-download joins it instead of starting a second).
  //
  // On a metered or 2G connection the download waits until the learner actually asks to run: a
  // study site should not spend someone's data on a program they may never write.
  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
      return;
    }
    const cdnUrl =
      (typeof window !== 'undefined' && window.__mechalabPyodideCdnUrl) || DEFAULT_PYODIDE_CDN;
    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      try {
        const worker = getOrCreateWorker();
        const previousHandler = worker.onmessage;
        worker.onmessage = (event: MessageEvent) => {
          const data = event.data || {};
          if (data.type === 'status' && (data.status === 'loading' || data.status === 'ready')) {
            setPyodideStatus(data.status);
            // The warm-up is how most learners meet the runtime, so its measured time is the one the
            // status line reports; the run handler sets this too, for a cold first Run.
            if (data.status === 'ready' && typeof data.ms === 'number') setReadyMs(data.ms);
            if (data.status === 'ready' && data.boot) setRuntimeBoot(String(data.boot));
          }
          if (data.type === 'status' && data.status === 'ready') {
            worker.onmessage = previousHandler;
          }
        };
        worker.postMessage({ type: 'warm', cdnUrl });
      } catch {
        // A warm-up that cannot start is not something to report: the Run that needs it will.
      }
    };
    const idleCallback = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    const handle = idleCallback ? idleCallback(warm, { timeout: 2500 }) : window.setTimeout(warm, 1200);
    return () => {
      cancelled = true;
      if (!idleCallback) window.clearTimeout(handle as number);
    };
  }, []);

  const stopExecution = (customMessage?: string) => {
    const runId = activeRunIdRef.current;
    // With shared memory, stop in place: the interpreter raises KeyboardInterrupt inside the
    // running program, so imports, variables and the loaded runtime all survive. A worker that
    // cannot unwind within the grace period is terminated by the fallback below.
    if (workerRef.current && interruptRef.current) {
      // The word has to be written from THIS thread. `postMessage` to a worker that is inside a
      // Python loop queues behind the loop it is meant to stop, which is why the buffer is shared:
      // CPython polls it between bytecodes and raises KeyboardInterrupt in the running program.
      const interrupt = new Int32Array(interruptRef.current);
      Atomics.store(interrupt, 0, 2);
      Atomics.notify(interrupt, 0);
      // A program parked in input() is not on the interpreter's clock; wake that wait too.
      if (stdinCtrlRef.current) {
        const stdin = new Int32Array(stdinCtrlRef.current, 0, 2);
        Atomics.store(stdin, 0, -1);
        Atomics.notify(stdin, 0);
      }
      setStderr('Stopping…');
      setStdinPrompt(null);
      if (stopFallbackRef.current) clearTimeout(stopFallbackRef.current);
      stopFallbackRef.current = setTimeout(() => {
        stopFallbackRef.current = null;
        if (activeRunIdRef.current !== runId || !activeResolveRef.current) return;
        destroyWorker();
        setIsRunning(false);
        setPyodideStatus('idle');
        setBehaviorCheck('failed');
        setPassStatus('stopped');
        setStderr(
          'Execution stopped: the interpreter did not unwind, so the worker was restarted. Your editor code is preserved.'
        );
        if (activeResolveRef.current) {
          activeResolveRef.current({ stopped: true });
          activeResolveRef.current = null;
        }
      }, 1500);
      return;
    }
    activeRunIdRef.current += 1;
    destroyWorker();
    setIsRunning(false);
    setPyodideStatus('idle');
    setBehaviorCheck('failed');
    setPassStatus('stopped');
    const stopMsg =
      customMessage ||
      'Execution stopped by user. Background Python Web Worker was terminated and your editor code is preserved.';
    setStderr(stopMsg);
    if (activeResolveRef.current) {
      activeResolveRef.current({ stopped: true, message: stopMsg });
      activeResolveRef.current = null;
    }
  };

  const resetRuntime = () => {
    activeRunIdRef.current += 1;
    destroyWorker();
    setIsRunning(false);
    setPyodideStatus('idle');
    setStdout('');
    setStderr('Python Web Worker runtime reset. Your editor code is preserved — click "Run & Verify" to start a fresh session.');
    setInstructorError('');
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setPassStatus('untested');
    if (activeResolveRef.current) {
      activeResolveRef.current({ stopped: true, message: 'Runtime reset' });
      activeResolveRef.current = null;
    }
  };

  // `lesson` defaults to the rendered lesson; Run passes the one selected at click time.
  const runPythonCode = async (sourceCode: string, lesson: PythonLessonItem = currentLesson) => {
    const matchMode: OutputMatchMode = asOutputMatchMode(lesson.outputMatch);
    const attemptLessonId = lesson.id;
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;

    setIsRunning(true);
    setStdout('');
    setStderr('');
    setInstructorError('');
    // A trace belongs to the run that produced it: the panel starts empty, and the worker's first
    // batch replaces it (a run that traces nothing leaves no stale curve on screen).
    setScopeSeries([]);
    // A report describes the code that produced it: a run that never reaches the harness (a syntax
    // error, a timeout) must not leave the previous run's green cards on screen.
    setHarnessReport(null);
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setPassStatus('untested');

    const cdnUrl =
      (typeof window !== 'undefined' && window.__mechalabPyodideCdnUrl) || DEFAULT_PYODIDE_CDN;
    const timeoutMs =
      (typeof window !== 'undefined' && window.__mechalabExecutionTimeoutMs) ||
      DEFAULT_EXECUTION_TIMEOUT_MS;
    const maxSteps =
      (typeof window !== 'undefined' && window.__mechalabMaxTraceSteps) || DEFAULT_MAX_TRACE_STEPS;

    try {
      const worker = getOrCreateWorker();

      const workerOutcome: any = await new Promise((resolve) => {
        activeResolveRef.current = resolve;

        const armExecutionWatchdog = (ms: number, label: string) => {
          clearRunWatchdog();
          timeoutIdRef.current = setTimeout(() => {
            if (activeRunIdRef.current === runId) {
              destroyWorker();
              resolve({
                watchdogTimedOut: true,
                message: `ExecutionTimeoutError: ${label} exceeded ${(ms / 1000).toFixed(
                  1
                )}s limit and the background Web Worker was terminated (possible infinite loop such as 'while True:'). Your editor code is preserved — fix the loop condition or click Reset Runtime.`,
              });
            }
          }, ms);
        };

        // Initial watchdog allows up to 45s for first-time CDN WASM download, then switches to timeoutMs once ready
        armExecutionWatchdog(Math.max(timeoutMs, 45000), 'Initial WASM load + execution');

        worker.onmessage = (ev: MessageEvent) => {
          const data = ev.data || {};
          if (data.type === 'status') {
            if (data.status === 'loading') {
              setPyodideStatus('loading');
            } else if (data.status === 'ready') {
              setPyodideStatus('ready');
              if (typeof data.ms === 'number') setReadyMs(data.ms);
              if (data.boot) setRuntimeBoot(String(data.boot));
              armExecutionWatchdog(timeoutMs, 'Python execution');
            } else if (data.status === 'error') {
              setPyodideStatus('error');
            }
            return;
          }
          // The learner's `input()` is waiting on a line; the run is still alive, so this is not
          // an outcome — answer it and keep waiting.
          if (data.type === 'stdin-request') {
            setStdinPrompt(String(data.prompt || ''));
            setStdinValue('');
            return;
          }
          // Batched scope points, not an outcome: handle them and keep waiting for the verdict. This
          // has to sit above the runId gate below, which resolves the run on any message.
          if (data.type === 'scope') {
            if (data.runId === runId) setScopeSeries(normalizeScopeSeries(data.series));
            return;
          }
          if (data.runId !== runId) return;
          if (stopFallbackRef.current) {
            clearTimeout(stopFallbackRef.current);
            stopFallbackRef.current = null;
          }
          clearRunWatchdog();
          resolve(data);
        };

        worker.onerror = (err: ErrorEvent) => {
          clearRunWatchdog();
          destroyWorker();
          setPyodideStatus('error');
          resolve({
            type: 'error',
            error:
              err?.message ||
              'Pyodide Web Worker failed to initialize or load from CDN. Execution verification requires Pyodide WASM.',
          });
        };

        worker.postMessage({
          type: 'run',
          runId,
          studentCode: sourceCode,
          instructorTests: lesson.instructorTests,
          benchSource: harnessSourceForLesson(lesson.id),
          cdnUrl,
          maxSteps,
          timeoutSec: Math.max(0.5, (timeoutMs - 500) / 1000),
          plantSource: MECHALAB_PLANT_PY,
          plantFilename: MECHALAB_PLANT_FILENAME,
          helperFiles: helperFiles.map((file) => ({ name: file.name, content: file.content })),
        });
      });

      activeResolveRef.current = null;
      if (activeRunIdRef.current !== runId) return;

      if (workerOutcome?.stopped) {
        // The interpreter was interrupted, not killed: it is still loaded for the next Run.
        setStdinPrompt(null);
        // No values: a stopped run is not a finished one, and a half-filled namespace drawn as if it
        // were an answer is worse than no answer.
        guideEditorRef.current?.setInlineValues([]);
        if (workerOutcome?.stdout) setStdout(String(workerOutcome.stdout));
        setStderr(String(workerOutcome.stderr || 'Execution stopped by user.'));
        setBehaviorCheck('failed');
        setPassStatus('stopped');
        return;
      }

      if (workerOutcome?.watchdogTimedOut || workerOutcome?.timedOut) {
        guideEditorRef.current?.setInlineValues([]);
        if (workerOutcome?.stdout) setStdout(workerOutcome.stdout);
        setStderr(workerOutcome.message || workerOutcome.stderr || 'Execution timed out.');
        setBehaviorCheck('failed');
        setPassStatus('stopped');
        return;
      }

      if (workerOutcome?.type === 'error') {
        setPyodideStatus('error');
        setStderr(workerOutcome.error || 'Execution error');
        setBehaviorCheck('failed');
        setPassStatus('error');
        return;
      }

      const actualOut: string = String(workerOutcome?.stdout || '').trim();
      const actualErr: string = String(workerOutcome?.stderr || '').trim();
      setStdout(actualOut);
      setStderr(actualErr);
      // Inline values: what this run left each top-level name holding, drawn beside the line that
      // bound it. Joined against `sourceCode` — the text the run executed, a snapshot — because the
      // editor may have changed since, and a value must sit next to the line that produced it.
      guideEditorRef.current?.setInlineValues(
        inlineValuesFor(sourceCode, readRunValues(workerOutcome?.inlineValues)),
      );
      // A capstone is graded by its harness, not only by its printed lines. A number that misses its
      // target keeps its real value on the card *and* keeps the lesson unverified; `null` means the
      // harness never reported, which is unproven rather than a pass.
      const lessonHarness = harnessForLesson(lesson.id);
      const parsedHarness = lessonHarness
        ? parseHarnessReport(workerOutcome?.bench, lessonHarness)
        : null;
      setHarnessReport(parsedHarness);
      const harness = lessonHarness ? harnessGate(lessonHarness, parsedHarness) : null;

      if (workerOutcome?.runtimeError) {
        setBehaviorCheck('failed');
        // The class, not the prefix: the worker sends the whole traceback now, so this reads the
        // exception out of it rather than checking what the text starts with.
        if (isAssertionFailure(actualErr)) {
          setInstructorError(actualErr);
          // The learner's own check fired; if the harness names a number behind it, that metric is
          // the thing to fix, so it outranks the assertion line. A syntax error or a NameError keeps
          // its own verdict: the program never got far enough for a metric to be the story.
          if (harness && !harness.passed) {
            setPassStatus('harness_failed');
            return;
          }
          setPassStatus('behavior_failed');
        } else {
          setPassStatus('error');
        }
        return;
      }

      const isOutputMatched =
        !actualErr &&
        compareStdout(actualOut, lesson.expectedOutput, matchMode).matched;
      const isBehaviorPassed = Boolean(workerOutcome?.instructorPassed);

      setOutputCheck(isOutputMatched ? 'matched' : 'differs');
      setBehaviorCheck(isBehaviorPassed ? 'passed' : 'failed');

      if (!isBehaviorPassed) {
        setInstructorError(
          workerOutcome?.instructorError ||
            'Instructor behavioral tests failed on unseen or boundary inputs.'
        );
      }

      // The harness outranks the other verdicts on a capstone: its graded metrics are the pass
      // condition, so a card left off its target reports that number instead of a logged assertion.
      if (harness && !harness.passed) {
        setPassStatus('harness_failed');
        return;
      }

      if (!isBehaviorPassed) {
        setPassStatus('behavior_failed');
        return;
      }

      if (isBehaviorPassed && isOutputMatched) {
        setPassStatus('passed');
        markLessonVerified(lesson.id);
      } else {
        setPassStatus('mismatch');
      }
    } catch (err: any) {
      setStderr(err?.message || String(err));
      setPassStatus('error');
    } finally {
      // A finished run counts as the attempt that unlocks Hint 2, even if it failed or was
      // stopped - the point is that the learner tried before asking for the next nudge. The
      // count is keyed by the lesson that ran, so leaving mid-run cannot unlock another lesson.
      setRunAttempts((prev) => ({
        ...prev,
        [attemptLessonId]: (prev[attemptLessonId] ?? 0) + 1,
      }));
      if (activeRunIdRef.current === runId) {
        setIsRunning(false);
      }
    }
  };

  /**
   * Every run the learner asks for by name goes through here, so the predict-first gate cannot be
   * walked around by using the keyboard instead of the button.
   */
  const requestRun = (sourceCode: string, lesson: PythonLessonItem = currentLesson) => {
    if (isRunning) return;
    // A suite that drives hundreds of runs sets this once; the gate keeps its own browser step, so
    // what is switched off here is a prompt, not a check.
    if (typeof window !== 'undefined' && window.__mechalabPredictFirst === false) {
      void runPythonCode(sourceCode, lesson);
      return;
    }
    const existing = predictionFor(lesson.id);
    setPredictRecord(existing);
    if (!existing) {
      setHeldRun({ code: sourceCode, lesson });
      setPredictText('');
      setPredictOpen(true);
      return;
    }
    void runPythonCode(sourceCode, lesson);
  };

  /** Commit the guess and let the held run go; the verdict stays on screen beside the output. */
  const commitPrediction = () => {
    const pending = heldRun;
    const lesson = pending?.lesson ?? currentLesson;
    const text = predictText.trim();
    if (!text) return;
    const check = checkPrediction(text, lesson.expectedOutput);
    const record = savePrediction({
      lessonId: lesson.id,
      text,
      verdict: check.verdict,
      matchedLines: check.matchedLines,
      predictedLines: check.predictedLines,
      skipped: false,
      at: Date.now(),
    });
    setPredictRecord(record);
    setHeldRun(null);
    // A run was waiting on the answer, so it goes now; a prediction made from the toolbar (no run
    // held) is just filed.
    if (pending) void runPythonCode(pending.code, lesson);
  };

  /** Skip is a recorded decision, not a loophole: nothing is blocked, and "skipped" is stored. */
  const skipPrediction = () => {
    const pending = heldRun;
    const lesson = pending?.lesson ?? currentLesson;
    const record = savePrediction({
      lessonId: lesson.id,
      text: '',
      verdict: 'miss',
      matchedLines: 0,
      predictedLines: 0,
      skipped: true,
      at: Date.now(),
    });
    setPredictRecord(record);
    setHeldRun(null);
    if (pending) void runPythonCode(pending.code, lesson);
  };

  /** Forget this lesson's commit so the question is asked again (a second attempt, not a reset). */
  const predictAgain = () => {
    clearPrediction(selectedId);
    setPredictRecord(null);
    setPredictText('');
    setHeldRun(null);
  };

  // ⌘↵ / Ctrl+↵ runs from anywhere on this screen, including inside the editor. The button stays
  // the discoverable path; this is the one keyboard habit a code editor trains.
  const runShortcutRef = useRef<() => void>(() => {});
  runShortcutRef.current = () => {
    if (isRunning) return;
    const lesson = PYTHON_LESSONS.find((l) => l.id === lessonIdRef.current) || PYTHON_LESSONS[0];
    requestRun(codeRef.current, lesson);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        runShortcutRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Watch mode: one run per pause in typing, and only when there is something to watch — a graded
  // failure whose buffer has changed since the run that produced it. `watchDecision` holds the rules.
  const watchTimerRef = useRef<number | null>(null);
  const directRunRef = useRef<(lesson: PythonLessonItem) => void>(() => {});
  directRunRef.current = (lesson) => {
    void runPythonCode(codeRef.current, lesson);
  };
  useEffect(() => {
    if (watchTimerRef.current !== null) {
      window.clearTimeout(watchTimerRef.current);
      watchTimerRef.current = null;
    }
    const decision = watchDecision({
      enabled: watchOn,
      lastVerdict: passStatus as WatchVerdict,
      running: isRunning,
      // The gate owns the next run while it waits on a guess: a re-run here would be the one path
      // around it.
      gateHolding: predictOpen && !predictRecord,
      editedSinceRun: code !== runCodeRef.current,
    });
    if (decision !== 'run') return;
    watchTimerRef.current = window.setTimeout(() => {
      watchTimerRef.current = null;
      watchRunRef.current = true;
      directRunRef.current(currentLesson);
    }, WATCH_DEBOUNCE_MS);
    return () => {
      if (watchTimerRef.current !== null) {
        window.clearTimeout(watchTimerRef.current);
        watchTimerRef.current = null;
      }
    };
  }, [watchOn, code, passStatus, isRunning, predictOpen, predictRecord, selectedId, currentLesson]);

  // A slider drag is a parameter change, so the answer is a fresh run - but one run per drag, not
  // one per pixel. The timer is cleared on unmount so a removed tab cannot run in the background.
  const sliderTimerRef = useRef<number | null>(null);
  const handleSliderCommit = () => {
    if (sliderTimerRef.current !== null) window.clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = window.setTimeout(() => {
      sliderTimerRef.current = null;
      // A drag is a parameter change, not a new question: it re-runs what the learner is already
      // looking at, so it does not open the predict gate mid-drag.
      const lesson = PYTHON_LESSONS.find((l) => l.id === lessonIdRef.current) || PYTHON_LESSONS[0];
      void runPythonCode(codeRef.current, lesson);
    }, 450);
  };
  useEffect(
    () => () => {
      if (sliderTimerRef.current !== null) window.clearTimeout(sliderTimerRef.current);
    },
    []
  );

  // The palette's "Run the lesson" command. The highest nonce ever acted on lives outside the
  // component: the palette can be used from another tab, and this component only mounts when the
  // learner lands here, by which time the bump has already happened. Recording it on mount instead
  // would swallow exactly the request that brought them here.
  useEffect(() => {
    if (!runRequest || runRequest <= LAST_RUN_REQUEST_HANDLED) return;
    LAST_RUN_REQUEST_HANDLED = runRequest;
    runShortcutRef.current();
  }, [runRequest]);

  // A verdict earns a toast once. Leaving the lesson or running again clears it, so the same pass
  // cannot stack three copies on screen.
  useEffect(() => {
    if (passStatus !== 'passed') {
      setShowPassToast(false);
      return;
    }
    setShowPassToast(true);
    const timer = window.setTimeout(() => setShowPassToast(false), 6000);
    return () => window.clearTimeout(timer);
  }, [passStatus, selectedId]);

  const filteredLessons = PYTHON_LESSONS.filter((l) => {
    const matchesTrack =
      trackFilter === 'all' ||
      (trackFilter === 'modules' && l.track === 'modules') ||
      (trackFilter === 'onramp' && (l.track === 'track-p' || l.track === 'ramp')) ||
      (trackFilter === 'lessons' &&
        l.track !== 'modules' && l.track !== 'track-p' && l.track !== 'ramp');

    if (!matchesTrack) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      l.id.toLowerCase().includes(q) ||
      l.title.toLowerCase().includes(q) ||
      l.track.toLowerCase().includes(q) ||
      l.ideas.some((idea) => idea.toLowerCase().includes(q))
    );
  });

  const currentIdx = PYTHON_LESSONS.findIndex((l) => l.id === currentLesson.id);
  const nextLesson =
    currentIdx >= 0 && currentIdx < PYTHON_LESSONS.length - 1
      ? PYTHON_LESSONS[currentIdx + 1]
      : null;

  const verifiedCount = PYTHON_LESSONS.filter((l) => verifiedLessons[l.id]).length;
  const completedCount = PYTHON_LESSONS.filter((l) => completedLessons[l.id]).length;
  const isCurrentVerified = !!verifiedLessons[currentLesson.id];
  const isCurrentSelfMarked = !!completedLessons[currentLesson.id];
  // The same derived join the roadmap uses in the other direction: every entry names the step it
  // serves, and the button switches the roadmap to that step's pass.
  const currentRoadmapStep = roadmapStepForLesson(currentLesson.id);
  // The step's focused hours come from the same generated spine the cards read, so the header and
  // the roadmap cannot cost the same step differently.
  const currentSpineStep = currentRoadmapStep
    ? stepForMilestone(currentRoadmapStep.step.milestoneId)
    : null;

  // Every unverified lesson gets its own first-run brief: the starter's marked holes, the first
  // check, and the output that means finished. Hiding one lesson's brief does not hide the next's.
  const coach = coachForLesson(currentLesson);
  const guideDismissed =
    dismissedGuides.includes('*') || dismissedGuides.includes(currentLesson.id);
  // Keep the brief up for the run that earns verification, so its "that is the whole loop" line is
  // actually seen instead of unmounting the moment the lesson is marked verified.
  const showFirstGuide = (!isCurrentVerified || passStatus === 'passed') && !guideDismissed;
  const dismissFirstGuide = () => {
    if (guideDismissed) return;
    const next = [...dismissedGuides, currentLesson.id];
    setDismissedGuides(next);
    try {
      localStorage.setItem(STORAGE_KEY_FIRST_GUIDE, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };
  const guideFailed =
    passStatus === 'harness_failed' ||
    passStatus === 'behavior_failed' ||
    passStatus === 'mismatch' ||
    passStatus === 'error' ||
    passStatus === 'stopped';
  const guideLines = (instructorError || stderr || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  // An assertion puts its expected/got line first; a traceback puts the useful SyntaxError or
  // NameError last. The guide should show the line a beginner can act on in either case.
  const guideFixLine =
    passStatus === 'harness_failed'
      ? harnessResult?.failures[0] || 'The harness found a number that misses its graded target.'
      : passStatus === 'mismatch'
        ? 'Output differs from the lesson\'s expected output.'
        : passStatus === 'behavior_failed'
          ? guideLines[0] || ''
          : guideLines[guideLines.length - 1] || '';
  const guideShowsExpectedGot =
    passStatus === 'behavior_failed' && guideFixLine.startsWith('AssertionError');

  return (
    <div className="space-y-5">
      {/* Runtime strip. The three numbers that move, the interpreter, and one line about what
          this screen is. The long explanation now lives in the first-lesson guide below, so a
          learner reaches the editor a screen sooner. */}
      <div
        className="rounded-[var(--r-md)] border"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--panel)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border"
              style={{ borderColor: 'var(--border)', color: 'var(--emerald)', backgroundColor: 'var(--bg)' }}
              aria-hidden="true"
            >
              <Terminal className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>
                <span>Python 3.12 in an isolated Web Worker</span>
                <span
                  data-testid="runner-runtime-status"
                  data-runtime-status={pyodideStatus}
                  data-runtime-boot={runtimeBoot ?? undefined}
                  className="chip"
                  style={{ color: pyodideStatus === 'error' ? 'var(--rose)' : 'var(--accent)' }}
                >
                  {pyodideStatus === 'ready'
                    ? readyMs !== null
                      ? `Python ready in ${(readyMs / 1000).toFixed(1)} s`
                      : 'Python ready (Worker WASM)'
                    : pyodideStatus === 'loading'
                    ? 'Loading WASM...'
                    : pyodideStatus === 'error'
                    ? 'WASM Load Error'
                    : // The worker exists and the warm-up is in flight; say so, because "Ready"
                      // here would claim a runtime that has not finished downloading.
                      'Warming Python (once, ~10 MB)…'}
                </span>
              </p>
              <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--dim)' }}>
                {PYTHON_LESSONS.length} entries · starter code, three hints, behavioural tests
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono tabular-nums">
            <div className="text-right">
              <div className="text-[10.5px]" style={{ color: 'var(--dim)' }}>
                Executed &amp; Passed (WASM)
              </div>
              <div
                className="text-[13px] font-bold"
                data-testid="runner-verified-count"
                style={{ color: 'var(--emerald)' }}
              >
                {`${verifiedCount} / ${PYTHON_LESSONS.length} Verified`}
              </div>
            </div>
            <div className="h-8 w-px" style={{ backgroundColor: 'var(--border)' }} />
            <div className="text-right">
              <div className="text-[10.5px]" style={{ color: 'var(--dim)' }}>
                Self-Marked
              </div>
              <div
                className="text-[13px] font-bold"
                data-testid="runner-self-marked-count"
                style={{ color: 'var(--muted)' }}
              >
                {`${completedCount} / ${PYTHON_LESSONS.length} Marked`}
              </div>
            </div>
            <div className="h-8 w-px" style={{ backgroundColor: 'var(--border)' }} />
            {/* Take this step offline. The size is on the button because "ready offline" without a
                number is a claim; the state is on a data attribute so the browser suite reads the same
                thing a learner does. */}
            <div className="text-right">
              <div className="text-[10.5px]" style={{ color: 'var(--dim)' }}>
                Offline
              </div>
              <button
                onClick={takeOffline}
                data-testid="btn-offline-takealong"
                data-offline-state={offline.state}
                disabled={offline.state === 'working'}
                title={
                  offline.state === 'unsupported'
                    ? 'This host sends its own isolation headers (dev server or preview), so it has no service worker to cache with - the built site on Pages does.'
                    : offline.state === 'ready'
                      ? 'The page, its bundle and Python are cached: this step opens and runs with the network off'
                      : 'Cache this page, its bundle and the Python runtime, then report how much that took'
                }
                className="mt-0.5 px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer disabled:cursor-wait"
                style={{
                  color:
                    offline.state === 'ready'
                      ? 'var(--emerald)'
                      : offline.state === 'unsupported'
                        ? 'var(--dim)'
                        : 'var(--accent)',
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--bg)',
                }}
              >
                {offline.state === 'working'
                  ? 'Caching… Python is loading'
                  : offline.state === 'unsupported'
                    ? 'Offline: built site only'
                    : offline.state === 'ready'
                      ? `Offline ready · ${offline.report ? offlineReportLine(offline.report) : 'checking'}`
                      : offline.state === 'partial'
                        ? `Take Python offline · ${offline.report ? offlineReportLine(offline.report) : ''}`
                        : 'Take this step offline'}
              </button>
              {offline.state === 'partial' && (
                <div
                  data-testid="offline-partial-note"
                  className="text-[10px] font-mono"
                  style={{ color: 'var(--amber)' }}
                >
                  the shell is cached; press again for Python
                </div>
              )}
            </div>
          </div>
        </div>

        {/* One thin bar for the one number a learner is trying to move. */}
        <div className="h-1 w-full overflow-hidden rounded-b-[var(--r-md)]" style={{ backgroundColor: 'var(--border-soft)' }}>
          <div
            className="h-full transition-[width] duration-500"
            style={{
              width: `${PYTHON_LESSONS.length ? Math.round((verifiedCount / PYTHON_LESSONS.length) * 100) : 0}%`,
              background: 'linear-gradient(90deg, var(--accent), var(--emerald))',
            }}
          />
        </div>
      </div>

      {showFirstGuide && (
        <section
          data-testid="first-lesson-guide"
          className="bg-emerald/10 border border-emerald/50 rounded-xl p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-mono text-emerald flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {currentLesson.id === 'P.1'
                    ? 'Lesson P.1 · start of the Python on-ramp · open and ready below'
                    : `First run · Lesson ${currentLesson.id} · ${
                        currentLesson.track === 'modules' ? 'graded exercise' : currentLesson.title
                      }`}
                </span>
              </div>
              <h3 className="text-base font-bold text-ink mt-1">
                {currentLesson.id === 'P.1'
                  ? 'One editor, one button, one red line.'
                  : 'This starter, its first check, and the finish line.'}
              </h3>
              <p className="text-xs text-body mt-1 max-w-3xl">
                {currentLesson.id === 'P.1'
                  ? 'This page is the whole lesson. Nothing to install and nothing else to read: change a line, press Run, and let the red line tell you what to fix.'
                  : `This brief is only for ${currentLesson.id}. It names the first hole, the first check, and what a finished run prints; the editor and the red line do the rest.`}
              </p>
            </div>
            <button
              onClick={dismissFirstGuide}
              data-testid="btn-guide-dismiss"
              className="px-2.5 py-1 rounded text-[11px] font-mono text-muted hover:text-ink border border-line cursor-pointer"
            >
              {currentLesson.id === 'P.1'
                ? 'I have done this before — hide'
                : "Hide this lesson's guide"}
            </button>
          </div>

          <ol className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <li className="bg-canvas border border-line-soft rounded-lg p-3">
              <div className="text-[11px] font-mono text-accent">1 · THE STARTER</div>
              <p className="text-xs text-body mt-1.5 break-words">
                {coach.holeCount > 0 ? (
                  <>
                    This starter leaves{' '}
                    <b>
                      {coach.holeCount}{' '}
                      {coach.isExercise
                        ? `NotImplementedError ${coach.holeCount === 1 ? 'hole' : 'holes'}`
                        : `TODO ${coach.holeCount === 1 ? 'line' : 'lines'}`}
                    </b>
                    . Start with: <code>{coach.firstHole}</code>
                  </>
                ) : (
                  <>The starter is complete; the checks decide whether its behaviour is right.</>
                )}
              </p>
              <button
                onClick={() => {
                  // The reader may be looking at a helper tab; the guide points at their code.
                  setOpenHelper(null);
                  editorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  window.setTimeout(() => guideEditorRef.current?.focus(), 0);
                }}
                data-testid="btn-guide-editor"
                className="mt-2 px-2.5 py-1 rounded text-[11px] font-mono bg-accent/15 hover:bg-accent/25 text-accent border border-accent/40 cursor-pointer"
              >
                Show me the editor
              </button>
            </li>

            <li className="bg-canvas border border-line-soft rounded-lg p-3">
              <div className="text-[11px] font-mono text-emerald">2 · THE FIRST FAILURE</div>
              <p className="text-xs text-body mt-1.5 break-words">
                Run it untouched. The first check is: <b>{coach.check}</b>
              </p>
              <p className="text-[11px] text-muted mt-1">
                The red line names the value it expected and the value your code produced.
              </p>
              <button
                onClick={() => requestRun(codeRef.current, currentLesson)}
                disabled={isRunning}
                data-testid="btn-guide-run"
                className="mt-2 px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-emerald hover:bg-emerald-strong text-inverse disabled:opacity-50 cursor-pointer"
              >
                {isRunning
                  ? pyodideStatus === 'loading'
                    ? 'Loading Python (first run takes a few seconds)…'
                    : 'Running…'
                  : 'Run the starter'}
              </button>
            </li>

            <li className="bg-canvas border border-line-soft rounded-lg p-3">
              <div className="text-[11px] font-mono text-amber">3 · THE FINISH LINE</div>
              <p className="text-xs text-body mt-1.5 break-words">
                When every check passes, it prints: <code>{coach.finish}</code>
              </p>
              <p className="text-[11px] text-muted mt-1">
                Hint 1 is a nudge; it never gives the answer.
              </p>
              <button
                onClick={() => {
                  revealHint(1);
                  guideAssessmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                disabled={currentLesson.hints.length === 0}
                data-testid="btn-guide-hint"
                className="mt-2 px-2.5 py-1 rounded text-[11px] font-mono bg-amber/15 hover:bg-amber/25 text-amber border border-amber/40 disabled:opacity-50 cursor-pointer"
              >
                {revealedHints > 0 ? 'Hint 1 is open below' : 'Reveal Hint 1'}
              </button>
            </li>
          </ol>

          {guideFailed && guideFixLine && (
            <div
              data-testid="guide-what-to-fix"
              aria-live="polite"
              className="mt-3 p-3 rounded-lg bg-canvas border border-rose/50"
            >
              <div className="text-[11px] font-mono text-rose">WHAT TO FIX</div>
              <code className="block mt-1 text-xs text-rose break-words">{guideFixLine}</code>
              <p className="text-[11px] text-body mt-1">
                {passStatus === 'harness_failed' ? (
                  <>
                    That is the harness measuring what your own functions compute, not reading a
                    printed line. The capstone passes only when every graded metric is at target, so
                    change that function and press <b>Run &amp; Verify Output</b> again.
                  </>
                ) : guideShowsExpectedGot ? (
                  <>
                    That is the check explaining itself: expected value first, what your code
                    produced second. Read it, change one marked line, and press{' '}
                    <b>Run &amp; Verify Output</b> again.
                  </>
                ) : passStatus === 'mismatch' ? (
                  <>
                    Compare that with the expected output in the panel below, then change one marked
                    line and press <b>Run &amp; Verify Output</b> again.
                  </>
                ) : (
                  <>
                    That line is Python's own error, naming what it could not do. Fix that line and
                    press <b>Run &amp; Verify Output</b> again.
                  </>
                )}
              </p>
            </div>
          )}

          {passStatus === 'passed' && (
            <div
              data-testid="guide-passed"
              className="mt-3 p-3 rounded-lg bg-canvas border border-emerald/50 text-xs text-body"
            >
              <b className="text-emerald">That is the whole loop.</b> You read a failure, changed
              the code, and proved it. The next lesson opens with its own starter brief.
              {nextLesson && (
                <button
                  onClick={() => selectLesson(nextLesson.id)}
                  className="ml-2 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald text-inverse cursor-pointer"
                >
                  Next: Lesson {nextLesson.id} →
                </button>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Sidebar: exercise search and selector */}
        <div
          data-testid="lesson-list-card"
          // Focus mode hides the list: choosing a different lesson while working on this one is the
          // other task the mode exists to keep out. `data-focus-expand` on the pane gives it the row.
          data-chrome="lesson-list"
          className="lg:col-span-4 bg-panel border border-line rounded-xl p-4 flex flex-col max-h-[760px]"
        >
          {/* Search Input */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${PYTHON_LESSONS.length} lessons and exercises by ID, title, or topic...`}
              data-testid="input-lesson-search"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-canvas border border-line text-xs text-ink placeholder-faint focus:outline-none focus:border-accent"
            />
          </div>

          {/* The five filter chips cannot share one line with the count in a 4/12 column: they
              used to run ~200px past the card and sit under the editor's opaque background, so a
              chip was readable only after resizing the window. The count gets its own line and
              the chips wrap inside the card. */}
          <div className="mb-3">
            <span className="block text-xs font-mono text-muted tabular-nums mb-1.5">
              Lessons &amp; exercises ({filteredLessons.length})
            </span>
            <div className="flex flex-wrap gap-1" data-testid="track-filters">
              {[
                { id: 'all', label: `All (${PYTHON_LESSONS.length})` },
                {
                  id: 'modules',
                  label: `Graded modules (${PYTHON_LESSONS.filter((l) => l.track === 'modules').length})`,
                },
                {
                  id: 'lessons',
                  label: `Track lessons (${PYTHON_LESSONS.filter(
                    (l) => l.track !== 'modules' && l.track !== 'track-p' && l.track !== 'ramp'
                  ).length})`,
                },
                {
                  id: 'onramp',
                  label: `Python on-ramp (${PYTHON_LESSONS.filter(
                    (l) => l.track === 'track-p' || l.track === 'ramp'
                  ).length})`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTrackFilter(tab.id as any)}
                  className={`px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    trackFilter === tab.id
                      ? 'bg-accent text-inverse font-bold'
                      : 'bg-canvas text-muted hover:text-ink border border-line-soft'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto space-y-1.5 pr-1 flex-1">
            {filteredLessons.map((lesson) => {
              const isSelected = lesson.id === currentLesson.id;
              const isVerified = !!verifiedLessons[lesson.id];
              const isSelfMarked = !!completedLessons[lesson.id];
              return (
                <button
                  key={lesson.id}
                  data-testid={`lesson-item-${lesson.id}`}
                  onClick={() => selectLesson(lesson.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-start justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-raise border-accent text-ink'
                      : 'bg-canvas/70 border-line-soft text-body hover:border-line-strong'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      <span className="font-bold text-accent">{lesson.id}</span>
                      <span aria-hidden="true" className="text-faint">·</span>
                      <span className="text-muted truncate">
                        {roadmapStepForLesson(lesson.id)
                          ? stepBreadcrumb(roadmapStepForLesson(lesson.id)!)
                          : lesson.track === 'track-p'
                            ? 'Python on-ramp'
                            : lesson.track === 'ramp'
                              ? 'School-maths ramp'
                              : 'Stage 0 on-ramp'}
                      </span>
                    </div>
                    <div className="text-xs font-medium mt-0.5 line-clamp-1">{lesson.title}</div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified</span>
                      </span>
                    ) : isSelfMarked ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-accent">
                        <Check className="w-3.5 h-3.5" />
                        <span>Marked</span>
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-faint" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Main Area: Lesson Ideas, Code Editor, Hints & Output Diff */}
        <div data-focus-expand className="lg:col-span-8 space-y-4">
          {/* Active Lesson Metadata Card */}
          <div className="bg-panel border border-line rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {/* Whole items wrap; none of them breaks inside a word. Before this, the row was a
                    single nowrap flex line whose spans could shrink, so at tablet width "Lesson
                    P.1" split across two lines and the pass badge read "Executed & Passed
                    (WASM)" on three. Each chip is nowrap and the separators went with them: a
                    dotted separator cannot dangle at the start of a wrapped line. */}
                <div
                  data-testid="lesson-meta"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-muted"
                >
                  <span className="text-accent font-bold whitespace-nowrap">
                    Lesson {currentLesson.id}
                  </span>
                  <span className="truncate max-w-[16rem] sm:max-w-[22rem]" title={currentLesson.path}>
                    {currentLesson.path}
                  </span>
                  {currentRoadmapStep ? (
                    <button
                      onClick={() =>
                        onOpenRoadmap?.(
                          currentRoadmapStep.pass,
                          currentRoadmapStep.step.milestoneId
                        )
                      }
                      data-testid="lesson-roadmap-step"
                      title="Show the roadmap step this entry practises"
                      className="whitespace-nowrap text-accent hover:underline cursor-pointer"
                    >
                      Roadmap: {stepBreadcrumb(currentRoadmapStep)} ↗
                    </button>
                  ) : (
                    <span className="whitespace-nowrap" data-testid="lesson-roadmap-step">
                      Python on-ramp — before the roadmap
                    </span>
                  )}
                  {currentSpineStep && (
                    <span
                      data-testid="lesson-step-cost"
                      title="Focused hours from each page's own metadata: the arm pass you are in, and the depth pass after Step 10"
                      className="whitespace-nowrap tabular-nums text-body"
                    >
                      {stepCostLabel(currentSpineStep)}
                    </span>
                  )}
                  <a
                    data-testid="link-lesson-page"
                    href={lessonPageUrl(currentLesson.path)}
                    target="_blank"
                    rel="noreferrer"
                    title="The GitHub page is the reading copy. This editor is where you type, run and verify; nothing is saved on GitHub."
                    className="text-accent hover:text-accent underline underline-offset-2 whitespace-nowrap"
                  >
                    Read this page on GitHub ↗
                  </a>
                  {isCurrentVerified && (
                    <span className="text-emerald font-semibold whitespace-nowrap">
                      Executed &amp; Passed (WASM)
                    </span>
                  )}
                </div>
                <h3 data-testid="lesson-title" className="text-base font-bold text-ink mt-1">
                  {currentLesson.title}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => toggleLessonSelfMarked(currentLesson.id)}
                  data-testid="btn-toggle-lesson-complete"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border flex items-center gap-1.5 cursor-pointer ${
                    isCurrentSelfMarked
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-canvas border-line text-body hover:border-accent'
                  }`}
                >
                  {isCurrentSelfMarked ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  <span>{isCurrentSelfMarked ? 'Self-Marked Complete' : 'Self-Mark Complete'}</span>
                </button>
                <button
                  onClick={() => {
                    commitCode(currentLesson.starterCode);
                    // Back on the starter is the one edit that means "forget this one".
                    saveDraft(currentLesson.id, currentLesson.starterCode);
                    setPassStatus('untested');
                    setBehaviorCheck('untested');
                    setOutputCheck('untested');
                    setInstructorError('');
                  }}
                  data-testid="btn-reset-starter"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Starter</span>
                </button>
                <button
                  onClick={resetRuntime}
                  data-testid="btn-reset-runtime"
                  title="Terminate and restart the background Python Web Worker without losing editor code"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-accent border border-accent/40 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Runtime</span>
                </button>
                <button
                  onClick={() => {
                    commitCode(currentLesson.fullSolution);
                    logEvent({ kind: 'solution_open', lesson: selectedId });
                    // The diff's solution reference is earned by opening it (or by passing), so this
                    // is the moment it becomes reachable for this lesson.
                    setSolutionUsed((used) => ({ ...used, [selectedId]: true }));
                  }}
                  data-testid="btn-load-solution"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-amber border border-amber/40 flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Load Solution</span>
                </button>
                <button
                  onClick={() => setHistoryOpen((open) => !open)}
                  aria-expanded={historyOpen}
                  aria-controls="draft-history"
                  data-testid="btn-draft-history"
                  title="Every run files the code it started from, with its verdict, so a version that worked is one click away"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
                    historyOpen ? 'text-accent border-accent/60' : 'text-body border-line'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>History{draftHistory.length ? ` (${draftHistory.length})` : ''}</span>
                </button>
                {isRunning && (
                  <button
                    onClick={() => stopExecution()}
                    data-testid="btn-stop-execution"
                    className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-rose hover:bg-rose-strong text-inverse flex items-center gap-1.5 cursor-pointer"
                  >
                    <OctagonX className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </button>
                )}
                <button
                  onClick={() => setDiffOpen((open) => !open)}
                  aria-expanded={diffOpen}
                  aria-controls="code-diff"
                  data-testid="btn-diff"
                  title="What you changed: your code against the starter, line by line"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
                    diffOpen ? 'text-accent border-accent/60' : 'text-body border-line'
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>Diff</span>
                </button>
                {/* The one thing a stuck learner can send a person: this lesson and this code. The
                    code rides in the URL fragment, so it never reaches the host — and it is base64,
                    not encryption, which the title says rather than implying a privacy it lacks. */}
                <button
                  onClick={() => void shareAttempt()}
                  data-testid="btn-share-attempt"
                  title={`Copy a link to this lesson with your code in it (${MAX_SHARE_URL} characters max). The code rides in the link's fragment, encoded — not encrypted — so send it only where you would send the file.`}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>
                {/* The gate's own door. The question also opens by itself on a lesson's first Run;
                    this is how a learner rereads the verdict, or predicts before pressing Run. */}
                <button
                  onClick={() => {
                    const next = !predictOpen;
                    setPredictRecord(predictionFor(selectedId));
                    setPredictOpen(next);
                    if (next) setHeldRun(null);
                  }}
                  aria-expanded={predictOpen}
                  aria-controls="predict-gate"
                  data-testid="btn-predict"
                  title="Predict first: commit to what the code will print, then run it"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
                    predictOpen ? 'text-amber border-amber/60' : 'text-body border-line'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    Predict
                    {predictRecord ? (predictRecord.skipped ? ' · skipped' : ' · answered') : ''}
                  </span>
                </button>
                <button
                  onClick={() => setWatchOn(setWatch(!watchOn))}
                  aria-pressed={watchOn}
                  data-testid="btn-watch"
                  title="Watch mode: after a failed check, re-run 1.5 s after you stop typing"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
                    watchOn ? 'text-emerald border-emerald/60' : 'text-body border-line'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>{watchOn ? 'Watching' : 'Watch'}</span>
                </button>
                <button
                  onClick={() => {
                    const lesson =
                      PYTHON_LESSONS.find((l) => l.id === lessonIdRef.current) || PYTHON_LESSONS[0];
                    requestRun(codeRef.current, lesson);
                  }}
                  disabled={isRunning}
                  data-testid="btn-run-verify"
                  title="Run & Verify Output — ⌘↵ / Ctrl+↵ runs from anywhere on this screen"
                  className="btn btn-primary ml-1 px-3.5 py-2 text-[12.5px] font-bold"
                >
                  {isRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  )}
                  <span>{isRunning ? 'Running in Worker...' : 'Run & Verify Output'}</span>
                  {!isRunning && <span className="kbd ml-0.5">⌘↵</span>}
                </button>
              </div>
            </div>

            {/* The Share button's answer. A polite status, not an alert: it is a confirmation of
                something the learner just asked for, and pressing Share twice must not trap them. */}
            {shareStatus.kind !== 'idle' && (
              <p
                role="status"
                data-testid="share-status"
                className="mt-2 rounded-lg border border-line-soft bg-panel px-3 py-2 text-[11.5px] leading-relaxed"
                style={{ color: 'var(--body)' }}
              >
                {shareStatus.kind === 'copied' && (
                  <>
                    Link copied — {shareStatus.characters} characters, this lesson and your code. It is
                    encoded in the link, not encrypted: send it only where you would send the file.
                  </>
                )}
                {shareStatus.kind === 'no-code' && (
                  <>The editor matches nothing yet, so there is nothing to send. Type your attempt first.</>
                )}
                {shareStatus.kind === 'too-long' && (
                  <>
                    This link would be {shareStatus.characters} characters, and chat and mail cut off
                    around {MAX_SHARE_URL}. Trim the file (or share the Diff) and press Share again.
                  </>
                )}
                {shareStatus.kind === 'loaded' && <>Loaded the shared code into the editor.</>}
                {shareStatus.kind === 'failed' && (
                  <>
                    Could not copy automatically. Select this link instead:{' '}
                    <code className="break-all" data-testid="share-url">
                      {shareStatus.url}
                    </code>
                  </>
                )}
              </p>
            )}

            {/* A shared attempt is offered, never applied. The learner's own draft is the work; the
                card says what the button replaces before it replaces it. */}
            {sharedAttempt && sharedAttempt.lesson === selectedId && (
              <div
                data-testid="shared-attempt-card"
                className="mt-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2.5"
              >
                <p className="eyebrow">Shared attempt</p>
                <p className="mt-1 text-[12.5px]" style={{ color: 'var(--body)' }}>
                  Someone sent you their code for this lesson —{' '}
                  {sharedAttempt.code.split('\n').length} lines. Loading it replaces the draft in
                  this editor; your own work is here until you press the button.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={loadSharedAttempt}
                    data-testid="btn-load-shared-attempt"
                    className="btn btn-primary px-2.5 py-1.5 text-[12px]"
                  >
                    Load their code
                  </button>
                  <button
                    onClick={() => onDismissShared?.()}
                    data-testid="btn-keep-own-code"
                    className="btn px-2.5 py-1.5 text-[12px]"
                  >
                    Keep mine
                  </button>
                </div>
              </div>
            )}

            {/* Predict first — the ladder's third move, and the one place the workbench could skip
                it: press Run on the starter, read the answer off the screen, learn nothing. The run
                is held until the guess is committed (or deliberately skipped and recorded). */}
            {predictOpen && (
              <div
                id="predict-gate"
                data-testid="predict-gate"
                data-predict-state={predictRecord ? (predictRecord.skipped ? 'skipped' : 'judged') : 'asking'}
                className="mt-3 rounded-lg border border-amber/40 bg-canvas p-3"
              >
                {predictRecord ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-amber">
                        PREDICT · {predictRecord.skipped ? 'skipped' : describeCheck(predictRecord)}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={predictAgain}
                          data-testid="btn-predict-again"
                          className="px-2 py-0.5 rounded text-[11px] font-mono text-muted hover:text-accent border border-line cursor-pointer"
                        >
                          Predict again
                        </button>
                        <button
                          onClick={() => setPredictOpen(false)}
                          data-testid="btn-predict-close"
                          className="px-2 py-0.5 rounded text-[11px] font-mono text-muted hover:text-body border border-line cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    {predictRecord.skipped ? (
                      <p data-testid="predict-skipped-text" className="mt-2 text-xs text-muted">
                        You ran this one without predicting. The run went through; nothing was
                        blocked.
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 text-[11px] font-mono text-faint">You wrote</p>
                        <pre
                          data-testid="predict-recorded"
                          className="mt-1 overflow-auto rounded border border-line-soft bg-panel p-2 font-mono text-[11.5px] text-body whitespace-pre-wrap"
                        >
                          {predictRecord.text}
                        </pre>
                        <p
                          data-testid="predict-verdict-text"
                          className={`mt-1.5 text-xs ${
                            predictRecord.verdict === 'match'
                              ? 'text-emerald'
                              : predictRecord.verdict === 'miss'
                                ? 'text-rose'
                                : 'text-amber'
                          }`}
                        >
                          {predictRecord.verdict === 'match'
                            ? 'You called it: the output matched, line for line.'
                            : predictRecord.verdict === 'reordered'
                              ? 'The right lines, in a different order: the program prints them in its own sequence, and that sequence is the lesson.'
                              : predictRecord.verdict === 'partial'
                                ? `Your guess and the output share ${predictRecord.matchedLines} of ${predictRecord.predictedLines} lines. The rest are the ones worth reading twice.`
                                : 'None of your lines are in the output. That is the useful part: the screen just told you something you did not expect.'}
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[11px] font-mono text-amber">
                        PREDICT FIRST · what will this print?
                      </span>
                      <span className="text-[11px] font-mono text-faint">
                        {heldRun ? 'before the run' : 'before you press Run'}
                      </span>
                    </div>
                    <label htmlFor="predict-input" className="mt-2 block text-xs text-body">
                      Type the output you expect, one line per line of output. It is checked against
                      the lesson&apos;s own expected output when you commit, and the run goes then.
                    </label>
                    <textarea
                      id="predict-input"
                      value={predictText}
                      onChange={(event) => setPredictText(event.target.value)}
                      rows={3}
                      spellCheck={false}
                      data-testid="predict-input"
                      placeholder={'e.g.\nEncoder Ticks: 425 | Battery: 12.15 V'}
                      className="mt-1.5 w-full rounded border border-line bg-panel p-2 font-mono text-[12px] text-body resize-y"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        onClick={commitPrediction}
                        disabled={!predictText.trim() || isRunning}
                        data-testid="btn-predict-run"
                        className="btn btn-primary px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
                      >
                        {heldRun ? 'Predict & Run' : 'Save prediction'}
                      </button>
                      <button
                        onClick={skipPrediction}
                        disabled={isRunning}
                        data-testid="btn-predict-skip"
                        title="Run without predicting. The skip is recorded, so it is not counted as a prediction."
                        className="px-2.5 py-1.5 rounded-lg text-xs font-mono text-muted hover:text-body border border-line cursor-pointer disabled:opacity-50"
                      >
                        Skip and run
                      </button>
                      <span className="text-[11px] text-faint">
                        A missed guess is what makes the result stick.
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* The versions behind the draft. A draft is one latest text; this is the run that
                worked before the last edit, which is the thing a learner actually wants back. */}
            {historyOpen && (
              <div
                id="draft-history"
                data-testid="draft-history"
                className="mt-3 rounded-lg border border-line-soft bg-canvas p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-accent">
                    RUN HISTORY · this lesson
                  </span>
                  {draftHistory.length > 0 && (
                    <button
                      onClick={() => {
                        clearHistory(selectedId);
                        setHistoryVersion((version) => version + 1);
                      }}
                      data-testid="btn-clear-history"
                      className="px-2 py-0.5 rounded text-[11px] font-mono text-muted hover:text-rose border border-line cursor-pointer"
                    >
                      Forget these
                    </button>
                  )}
                </div>
                {draftHistory.length === 0 ? (
                  <p className="text-xs text-muted mt-2" data-testid="draft-history-empty">
                    Every run files the code it started from, so a version that worked is one click
                    away. Nothing filed yet — press Run.
                  </p>
                ) : (
                  <ol className="mt-2 space-y-1.5">
                    {draftHistory.map((snapshot, index) => (
                      <li
                        key={`${snapshot.at}-${index}`}
                        data-testid={`history-entry-${index}`}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs border border-line-soft rounded px-2 py-1"
                      >
                        <span className="font-mono text-muted">
                          {snapshotAgeLabel(snapshot.at)}
                        </span>
                        <span
                          data-testid={`history-entry-${index}-verdict`}
                          className={`font-mono ${
                            snapshot.outcome === 'verified' || snapshot.outcome === 'passed'
                              ? 'text-emerald'
                              : 'text-amber'
                          }`}
                        >
                          {verdictLabel(snapshot.outcome)}
                        </span>
                        <button
                          onClick={() => {
                            // The same text, back in the editor, and the badges cleared: they
                            // described the code that was there a moment ago, not this one.
                            commitCode(snapshot.code);
                            saveDraft(selectedId, snapshot.code);
                            setPassStatus('untested');
                            setBehaviorCheck('untested');
                            setOutputCheck('untested');
                            setInstructorError('');
                          }}
                          data-testid={`btn-restore-history-${index}`}
                          className="px-2 py-0.5 rounded text-[11px] font-mono bg-accent/15 hover:bg-accent/25 text-accent border border-accent/40 cursor-pointer"
                        >
                          Restore
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="text-[11px] text-faint mt-2">
                  Five attempts per lesson, kept locally. Restoring puts that code back in the editor
                  — press Run to grade it again.
                </p>
              </div>
            )}

            {/* The learner's own change, line by line. The roadmap card could say how many lines moved;
                this says which ones, and where. */}
            {diffOpen && codeDiff && (
              <div
                id="code-diff"
                data-testid="code-diff"
                data-diff-added={codeDiff.added}
                data-diff-removed={codeDiff.removed}
                data-diff-target={diffTarget}
                className="mt-3 rounded-lg border border-line-soft bg-canvas p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-accent">DIFF · your code</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setDiffTarget('starter')}
                      aria-pressed={diffTarget === 'starter'}
                      data-testid="diff-target-starter"
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer ${
                        diffTarget === 'starter'
                          ? 'text-accent border-accent/60 bg-accent/10'
                          : 'text-muted border-line'
                      }`}
                    >
                      vs starter
                    </button>
                    <button
                      onClick={() => setDiffTarget('solution')}
                      aria-pressed={diffTarget === 'solution'}
                      disabled={!solutionUnlocked}
                      data-testid="diff-target-solution"
                      title={
                        solutionUnlocked
                          ? 'Your code against the lesson solution'
                          : 'Open the solution, or pass the lesson, to compare against it'
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                        diffTarget === 'solution'
                          ? 'text-accent border-accent/60 bg-accent/10 cursor-pointer'
                          : solutionUnlocked
                            ? 'text-muted border-line cursor-pointer'
                            : 'text-faint border-line-soft cursor-not-allowed'
                      }`}
                    >
                      vs solution
                    </button>
                    <span data-testid="diff-summary" className="text-[11px] font-mono text-muted">
                      {diffSummary(codeDiff)}
                    </span>
                  </div>
                </div>

                {codeDiff.added === 0 && codeDiff.removed === 0 ? (
                  <p data-testid="diff-same" className="mt-2 text-xs text-muted">
                    {diffTarget === 'solution'
                      ? 'The solution, unchanged.'
                      : 'The starter, unchanged — nothing written yet.'}
                  </p>
                ) : (
                  <div
                    data-testid="diff-body"
                    className="mt-2 max-h-72 overflow-auto rounded border border-line-soft"
                  >
                    {codeDiff.blocks.map((block, blockIndex) => (
                      <div key={`block-${blockIndex}`}>
                        {block.gap > 0 && (
                          <div
                            data-testid="diff-gap"
                            className="px-2 py-0.5 font-mono text-[11px] text-faint"
                          >
                            … {block.gap} unchanged
                          </div>
                        )}
                        {block.rows.map((row, rowIndex) => (
                          <div
                            key={`row-${blockIndex}-${rowIndex}`}
                            data-testid="diff-row"
                            data-kind={row.kind}
                            className={`flex gap-2 px-2 font-mono text-[11.5px] leading-[1.55] ${
                              row.kind === 'added'
                                ? 'text-emerald bg-emerald/10'
                                : row.kind === 'removed'
                                  ? 'text-rose bg-rose/10'
                                  : 'text-muted'
                            }`}
                          >
                            <span className="w-7 shrink-0 text-right tabular-nums text-faint">
                              {row.left ?? ''}
                            </span>
                            <span className="w-7 shrink-0 text-right tabular-nums text-faint">
                              {row.right ?? ''}
                            </span>
                            <span className="w-3 shrink-0">
                              {row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}
                            </span>
                            <span className="whitespace-pre">{row.text || ' '}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    {codeDiff.truncated && (
                      <div
                        data-testid="diff-truncated"
                        className="px-2 py-1 font-mono text-[11px] text-faint"
                      >
                        … the rest of this change is not drawn here.
                      </div>
                    )}
                  </div>
                )}
                <p className="mt-1.5 text-[11px] text-faint">
                  Whitespace counts: this is your file against the reference, not the lenient output
                  comparison the checks use.
                  {codeDiff.coarse
                    ? ' The file is large, so only its unchanged head and tail are matched.'
                    : ''}
                </p>
              </div>
            )}

            {/* A program blocked in input() is waiting on this box. The run is alive, not stuck:
                the worker is parked on the shared word until a line arrives. */}
            {stdinPrompt !== null && (
              <div
                className="mt-3 rounded-lg border p-3"
                style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg)' }}
                data-testid="stdin-prompt"
              >
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitStdin(stdinValue);
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <label
                    htmlFor="stdin-line"
                    className="font-mono text-xs"
                    style={{ color: 'var(--accent)' }}
                  >
                    {stdinPrompt || 'input()'}
                  </label>
                  <input
                    id="stdin-line"
                    data-testid="input-stdin"
                    autoFocus
                    value={stdinValue}
                    onChange={(event) => setStdinValue(event.target.value)}
                    className="min-w-[12rem] flex-1 rounded-lg border px-2 py-1.5 font-mono text-xs outline-none"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--panel)',
                      color: 'var(--text)',
                    }}
                  />
                  <button type="submit" className="btn btn-primary" data-testid="btn-stdin-submit">
                    Send ⏎
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => stopExecution()}
                  >
                    Stop
                  </button>
                </form>
              </div>
            )}

            {/* <= 2 Ideas Unboxed Metadata List */}
            <div className="mt-3 pt-3 border-t border-line-soft flex flex-wrap items-center gap-2 text-xs text-body">
              <span className="font-mono text-muted flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                <span>New Ideas (≤2 rule):</span>
              </span>
              {currentLesson.ideas.map((idea, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span aria-hidden="true" className="text-faint">·</span>}
                  <span>
                    {idx + 1}. {idea}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {currentHarness && currentLesson.id === '08.1' && (
            <FaultBench08
              report={harnessReport}
              grading={isRunning}
              onGrade={() => requestRun(codeRef.current, currentLesson)}
            />
          )}
          {currentHarness && currentLesson.id !== '08.1' && (
            <LessonHarnessPanel
              harness={currentHarness}
              report={harnessReport}
              grading={isRunning}
              onGrade={() => requestRun(codeRef.current, currentLesson)}
            />
          )}

          {/* Progressive 3-Step Hint Ladder */}
          {currentLesson.hints.length > 0 && (
            <div className="bg-panel border border-line rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono text-amber flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4" />
                  <span>
                    Progressive 3-Step Hint Ladder ({revealedHints} / {currentLesson.hints.length} unlocked)
                  </span>
                </div>
                {revealedHints < currentLesson.hints.length && (
                  <button
                    onClick={() => {
                      if (nextHintNeedsAttempt) return;
                      revealHint(nextHintNumber);
                    }}
                    disabled={nextHintNeedsAttempt}
                    title={
                      hintLockState === 'no-attempt'
                        ? 'Run & Verify once to unlock the next hint'
                        : hintLockState === 'stale-attempt'
                          ? 'Run again after reading Hint 1 to unlock Hint 2'
                          : undefined
                    }
                    data-testid="btn-reveal-hint"
                    className="px-2.5 py-1 rounded text-xs font-mono bg-amber/15 hover:bg-amber/25 text-amber border border-amber/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {nextHintLabel}
                  </button>
                )}
              </div>
              {revealedHints > 0 && (
                <div className="mt-3 space-y-2">
                  {currentLesson.hints.slice(0, revealedHints).map((hint, idx) => {
                    // The rung the failing check points at says so where the hint is read, not only
                    // on the card that sent the learner here.
                    const answersCheck = rungAnswersCheck(idx + 1, checkFailures);
                    return (
                      <div
                        key={idx}
                        data-testid={answersCheck ? 'hint-for-check' : undefined}
                        className={
                          answersCheck
                            ? 'p-2.5 rounded-lg bg-canvas border border-amber/50 text-xs text-ink'
                            : 'p-2.5 rounded-lg bg-canvas border border-line text-xs text-ink'
                        }
                      >
                        <span className="font-mono font-bold text-amber mr-1.5">
                          Hint {idx + 1}:
                        </span>
                        {answersCheck && (
                          <span className="font-mono text-[10.5px] text-amber mr-1.5">
                            for the failing check
                          </span>
                        )}
                        <span dangerouslySetInnerHTML={{ __html: hint }} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Code editor: a small project, not a scratch pad. `main.py` is the learner's; a helper
              the lesson imports is a second, locked tab whose text is the module Pyodide loads. */}
          <div
            ref={editorPanelRef}
            id="python-runner-editor"
            className="bg-panel border border-line rounded-xl overflow-hidden scroll-mt-4"
          >
            <div className="bg-canvas border-b border-line-soft flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
              <div className="flex items-center gap-1" role="tablist" aria-label="Lesson files">
                <button
                  role="tab"
                  aria-selected={openHelper === null}
                  data-testid="editor-tab-main"
                  onClick={() => setOpenHelper(null)}
                  className="flex items-center gap-1.5 rounded-t px-2.5 py-1.5 text-[11.5px] font-mono cursor-pointer"
                  style={{
                    color: openHelper === null ? 'var(--accent)' : 'var(--muted)',
                    borderBottom: openHelper === null ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {MAIN_FILE_NAME}
                </button>
                {helperFiles.map((file) => (
                  <button
                    key={file.name}
                    role="tab"
                    aria-selected={openHelper === file.name}
                    data-testid={`editor-tab-${file.name}`}
                    onClick={() => setOpenHelper(file.name)}
                    title={`${file.name} is read-only: it is the module the checks import`}
                    className="flex items-center gap-1.5 rounded-t px-2.5 py-1.5 text-[11.5px] font-mono cursor-pointer"
                    style={{
                      color: openHelper === file.name ? 'var(--accent)' : 'var(--muted)',
                      borderBottom: openHelper === file.name ? '2px solid var(--accent)' : '2px solid transparent',
                    }}
                  >
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    {file.name}
                  </button>
                ))}
              </div>
              <span className="text-[11px] font-mono text-faint tabular-nums">
                {openHelperFile
                  ? `${openHelperFile.content.split('\n').length} lines · read-only`
                  : `${code.split('\n').length} lines${sliderCount ? ` · ${sliderCount} slider${sliderCount === 1 ? '' : 's'}` : ''}`}
              </span>
            </div>
            {openHelperFile ? (
              <>
                <p
                  className="border-b px-3 py-1.5 text-[11px]"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)', backgroundColor: 'var(--bg)' }}
                >
                  Read-only helper. Your code imports this file; edit{' '}
                  <span className="font-mono" style={{ color: 'var(--accent)' }}>
                    {MAIN_FILE_NAME}
                  </span>{' '}
                  to change the answer.
                </p>
                <PythonEditor
                  key={`${selectedId}:${openHelperFile.name}`}
                  value={openHelperFile.content}
                  readOnly
                  ariaLabel={`${openHelperFile.name}, read-only lesson helper`}
                  testId="editor-helper"
                />
              </>
            ) : (
              <PythonEditor
                key={`main:${selectedId}`}
                ref={guideEditorRef}
                value={code}
                onChange={commitCode}
                ariaLabel="Python code editor"
                testId="editor-main"
                onSliderCommit={handleSliderCommit}
                getAnalysis={getReadyAnalysis}
              />
            )}
          </div>

          {/* What the checker saw. Absent when there is nothing to say, because a green "0 notes"
              strip under every lesson is furniture, not information. */}
          {(lintNotes.length > 0 || analysisNotice) && (
            <div
              data-testid="analysis-notes"
              data-lint-count={lintNotes.length}
              className="bg-panel border border-line rounded-xl px-3.5 py-2.5 text-[11.5px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
                  Checker · pyflakes
                </span>
                <span className="text-[10.5px] font-mono text-faint">
                  {lintNotes.length
                    ? `${lintNotes.length} note${lintNotes.length === 1 ? '' : 's'}`
                    : 'unavailable'}
                </span>
              </div>
              {analysisNotice ? (
                <p data-testid="analysis-unavailable" className="mt-1.5 text-muted">
                  {analysisNotice}
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {lintNotes.slice(0, 3).map((note, index) => (
                    <li
                      key={`${note.line}:${note.column}:${index}`}
                      data-testid={`lint-note-${index}`}
                      className="font-mono text-[11px] text-muted"
                    >
                      {noteLabel(note)}
                    </li>
                  ))}
                  {lintNotes.length > 3 && (
                    <li className="text-[10.5px] text-faint">+ {lintNotes.length - 3} more</li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* What the learner wrote down about this lesson. It sits between the code and the
              checks because it is about the learner's understanding rather than about the run. */}
          <StudyPanel lessonId={selectedId} />

          {/* Instructor Behavioral Assessment Panel */}
          <div
            ref={guideAssessmentRef}
            data-testid="panel-instructor-tests"
            className="bg-panel border border-line rounded-xl p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-mono text-accent flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Instructor Behavioral Assessment (Multi-Input, Boundary &amp; Tolerance Checks)</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span
                  data-testid="badge-behavior-check"
                  className={
                    behaviorCheck === 'passed'
                      ? 'text-emerald font-bold'
                      : behaviorCheck === 'failed'
                      ? 'text-rose font-bold'
                      : 'text-muted'
                  }
                >
                  Behavior Tests:{' '}
                  {behaviorCheck === 'passed'
                    ? 'PASSED'
                    : behaviorCheck === 'failed'
                    ? 'FAILED'
                    : 'UNTESTED'}
                </span>
                <span aria-hidden="true" className="text-faint">·</span>
                <span
                  data-testid="badge-output-check"
                  className={
                    outputCheck === 'matched'
                      ? 'text-emerald font-bold'
                      : outputCheck === 'differs'
                      ? 'text-amber font-bold'
                      : 'text-muted'
                  }
                >
                  Presentation (`stdout`, {outputMatchMode} match):{' '}
                  {outputCheck === 'matched'
                    ? 'MATCHED'
                    : outputCheck === 'differs'
                    ? 'DIFFERS'
                    : 'UNTESTED'}
                </span>
                <span aria-hidden="true" className="text-faint">·</span>
                <span data-testid="note-output-match-mode" className="text-[11px] text-muted">
                  {lessonDowngradesFormatting
                    ? 'Formatting is ignored: indentation, column padding and blank lines cannot block a correct solution.'
                    : 'This lesson grades exact formatting: its table columns are part of the answer.'}
                </span>
              </div>
            </div>
            <ul className="mt-2.5 space-y-1 text-xs text-body font-mono">
              {(currentLesson.instructorTestSummary || []).map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-accent">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {/* The failing check, named, with the one rung that answers it. The runner reports one
                graded check at a time - a behavioural failure outranks a presentation one - but each
                check owns its card and its own button, so adding the third cannot turn this into a
                single control that guesses which failure the learner meant. */}
            {checkFailures.map((check) => (
              <div
                key={check.id}
                data-testid={`check-failure-${check.id}`}
                aria-live="polite"
                className="mt-2.5 p-2.5 rounded-lg bg-canvas border border-rose/40"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-mono">
                  <span className="font-bold text-rose">{check.title}</span>
                  <span aria-hidden="true" className="text-faint">·</span>
                  <span className="text-body break-words">{check.detail}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                  <span className="text-muted break-words">{check.why}</span>
                  {check.hint > 0 && revealedHints < check.hint && (
                    <button
                      data-testid={`btn-check-hint-${check.id}`}
                      onClick={() => revealHint(check.hint)}
                      title={`Open Hint ${check.hint}, the rung that answers this check - and only that rung`}
                      className="px-2 py-0.5 rounded bg-amber/15 hover:bg-amber/25 text-amber border border-amber/40 cursor-pointer"
                    >
                      Show Hint {check.hint}
                    </button>
                  )}
                  {check.hint > 0 && revealedHints >= check.hint && (
                    <span
                      data-testid={`check-hint-open-${check.id}`}
                      className="text-amber"
                    >
                      {revealedHints < hintCount
                        ? `Hint ${check.hint} is open below · Hint ${revealedHints + 1} waits for your next run`
                        : `Hint ${check.hint} is open below`}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {instructorError && (
              <div
                data-testid="pre-instructor-error"
                className="mt-2.5 p-2.5 rounded-lg bg-canvas border border-rose/50 font-mono text-xs text-rose"
              >
                {instructorError}
              </div>
            )}
            {passStatus === 'harness_failed' && harnessResult && harnessResult.failures.length > 0 && (
              <div
                data-testid="pre-harness-error"
                className="mt-2.5 p-2.5 rounded-lg bg-canvas border border-rose/50 font-mono text-xs text-rose space-y-1"
              >
                <div className="text-[11px] text-amber">
                  Harness: {harnessResult.met} / {harnessResult.total} graded metrics at target
                </div>
                {harnessResult.failures.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
          </div>

          {/* The Scope: the learner's own traced signal, drawn the moment the first batch lands. */}
          <ScopePanel
            series={scopeSeries}
            pinned={pinnedScope}
            onPin={() => setPinnedScope(scopeSeries)}
            onUnpin={() => setPinnedScope(null)}
            className="mt-4"
          />

          {/* Output & Expected Output Side-by-Side Diff */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-panel border border-line rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-muted">
                  Actual Python Output (`stdout` / `assert`)
                </span>
                {passStatus === 'passed' && (
                  <span
                    data-testid="status-assert-passed"
                    className="text-xs font-mono font-bold text-emerald flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>PASS · Behavior &amp; Output Verified</span>
                  </span>
                )}
                {passStatus === 'harness_failed' && (
                  <span
                    data-testid="status-harness-failed"
                    className="text-xs font-mono font-bold text-rose flex items-center gap-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>
                      HARNESS FAILED · {harnessResult?.met ?? 0} / {harnessResult?.total ?? 0}{' '}
                      Metrics At Target
                    </span>
                  </span>
                )}
                {passStatus === 'behavior_failed' && (
                  <span
                    data-testid="status-behavior-failed"
                    className="text-xs font-mono font-bold text-rose flex items-center gap-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>BEHAVIOR FAILED · Instructor Tests Failed</span>
                  </span>
                )}
                {passStatus === 'mismatch' && (
                  <span
                    data-testid="status-output-mismatch"
                    className="text-xs font-mono font-bold text-amber flex items-center gap-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>BEHAVIOR PASSED · Output Format Differs</span>
                  </span>
                )}
                {passStatus === 'stopped' && (
                  <span
                    data-testid="status-execution-stopped"
                    className="text-xs font-mono font-bold text-amber flex items-center gap-1"
                  >
                    <OctagonX className="w-3.5 h-3.5" />
                    <span>STOPPED · Loop Limit / Cancelled</span>
                  </span>
                )}
                {passStatus === 'error' && (
                  <span
                    data-testid="status-execution-error"
                    className="text-xs font-mono font-bold text-rose flex items-center gap-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>ERROR · Syntax / Runtime Error</span>
                  </span>
                )}
              </div>
              <pre
                data-testid="pre-actual-stdout"
                className="p-3 rounded-lg bg-canvas border border-line-soft font-mono text-xs text-ink whitespace-pre-wrap min-h-[120px]"
              >
                {stdout || (stderr ? '' : 'Click "Run & Verify Output" to execute this lesson.')}
                {stderr && <span className="text-rose block mt-1">{stderr}</span>}
              </pre>
              {parsedFailure && (
                <TracebackCard
                  failure={parsedFailure}
                  entry={errorEntry}
                  onRevealLine={(line) => guideEditorRef.current?.revealLine(line)}
                />
              )}
            </div>

            <div className="bg-panel border border-line rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-muted">
                  Expected Output (Presentation Check)
                </span>
                {passStatus === 'passed' && nextLesson && (
                  <button
                    onClick={() => selectLesson(nextLesson.id)}
                    className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-accent text-inverse flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Next: Lesson {nextLesson.id} →</span>
                  </button>
                )}
              </div>
              <pre
                data-testid="pre-expected-stdout"
                className="p-3 rounded-lg bg-canvas border border-line-soft font-mono text-xs text-emerald whitespace-pre-wrap min-h-[120px]"
              >
                {currentLesson.expectedOutput}
              </pre>
              {outputCheck === 'matched' && outputComparison.formattingDiffers && (
                <p
                  data-testid="note-formatting-normalized"
                  className="mt-2 text-[11px] font-mono text-emerald"
                >
                  Matched with formatting ignored — your numbers and words are identical to the
                  Expected Output; only whitespace differs, and this lesson does not grade it.
                </p>
              )}
              {outputCheck === 'differs' && outputComparison.firstDiffLine !== null && (
                <p
                  data-testid="note-output-diff-line"
                  className="mt-2 text-[11px] font-mono text-amber"
                >
                  First difference: line {outputComparison.firstDiffLine}
                  {lessonDowngradesFormatting
                    ? ' (words and numbers are compared here, not spacing)'
                    : ' (this lesson also compares spacing exactly)'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The verdict is announced, not only coloured: a screen reader hears the outcome and the
          failing line itself, rather than an instruction to go and find a coloured one. The words
          come from `app/src/announce.ts`, which is a pure function and pinned by `npm run
          test:announce`. */}
      <p className="sr-only" role="status" aria-live="polite" data-testid="run-announcement">
        {runAnnouncement({
          lessonId: currentLesson.id,
          verdict: passStatus,
          firstDiff: outputComparison.firstDiff,
          harnessSummary: harnessResult?.summary ?? null,
          stderr,
          prediction: predictRecord,
        })}
      </p>

      {showPassToast && passStatus === 'passed' && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
          data-testid="pass-toast"
        >
          <div
            className="pointer-events-auto flex animate-pop items-center gap-3 rounded-[var(--r-full)] border py-2 pl-2.5 pr-2 shadow-[var(--shadow-lg)]"
            style={{
              borderColor: 'color-mix(in srgb, var(--emerald) 45%, transparent)',
              backgroundColor: 'var(--panel-2)',
            }}
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: 'var(--emerald)', color: 'var(--inverse)' }}
              aria-hidden="true"
            >
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <div className="pr-1">
              <p className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>
                Lesson {currentLesson.id} passed
              </p>
              <p className="text-[11px]" style={{ color: 'var(--dim)' }}>
                Behavioural checks and output both green
              </p>
            </div>
            {nextLesson && (
              <button
                onClick={() => selectLesson(nextLesson.id)}
                className="btn btn-primary px-3 py-1.5 text-[12px]"
              >
                Next lesson →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
