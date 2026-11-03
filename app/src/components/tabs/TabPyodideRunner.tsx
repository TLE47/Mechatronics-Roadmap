import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PYTHON_LESSONS, PythonLessonItem } from '../../data/pythonLessonsData';
import { MECHALAB_PLANT_FILENAME, MECHALAB_PLANT_PY } from '../../data/mechalabPlant';
import { pyodideCdn } from '../../runtime/pyodideCdn';

import { asOutputMatchMode, compareStdout, OutputMatchMode } from '../../outputMatch';
import { coachForLesson, exerciseTask, starterHoles } from '../../lessonCoach';
import { failingChecks, hintCountFor, hintLock, nextRung, rungAnswersCheck } from '../../checkHints';
import { entryHeadline, matchError } from '../../errorIndex';
import { failureSummary, parseFailure } from '../../traceback';
import { TracebackCard } from '../TracebackCard';
import { HelpSheet } from '../HelpSheet';
import type { HelpReportInput } from '../../helpReport';
import { PairSheet } from '../PairSheet';
import { usePairSession } from '../../usePairSession';
import { attemptLines, lessonLabel } from '../../pairing';
import { fromWire } from '../../collab';
import { lessonPageUrl } from '../../startHere';
import { assetUrlsFromDocument, cacheInventory, offlineWarmSupported, warmWithServiceWorker, type OfflineCacheReport } from '../../offlineTakeAlong';
import { FaultBench08 } from '../FaultBench08';

import { WorkflowPanel } from '../WorkflowPanel';
import { LessonReader } from '../LessonReader';
import { TracePanel } from '../TracePanel';
import { LessonChooser, type TrackFilter } from '../LessonChooser';
import { Sheet } from '../Sheet';

import {
  readPhoneSurface,
  writePhoneSurface,
  type PhoneSurface,
} from '../../phoneSurface';
import { FirstRunTour } from '../FirstRunTour';
import { layoutForStep } from '../../tour';
import { resumeLabel } from '../../tourState';
import { playCue } from '../../audio/facade';

import { harnessGate } from '../../harnessGrading.ts';
import { harnessForLesson } from '../../lessonHarnesses.ts';
import { LessonHarnessPanel } from '../LessonHarnessPanel';
import { logEvent } from '../../learningLog';
import { recordSittingEvent } from '../../sittingClock';
import { AnalysisSession, sameNotes, type LintNote } from '../../analysisClient';
import { rememberLessonInUrl } from '../../lessonRoute';
import { rememberLastLesson } from '../../lastLesson';
import { isEdited, readDraft, readDrafts, saveDraft } from '../../lessonDraft';
import { STORAGE_KEY_COMPLETED, STORAGE_KEY_VERIFIED } from '../../progressKeys';
import { recordSnapshot } from '../../draftHistory';
import {
  WATCH_DEBOUNCE_MS,
  readWatch,
  setWatch,
  watchDecision,
  type WatchVerdict,
} from '../../watchMode';
import { runAnnouncement } from '../../announce';
import { MAX_SHARE_URL, type SharedAttempt } from '../../shareLink';
import { StudyTimerRow } from '../StudyTimerRow';
import { MAIN_FILE_NAME, helperFilesForLesson } from '../../lessonFiles';
import { findDefinition } from '../../symbolIndex';

import { layoutArrangement, layoutShortcutFor, layoutShows, splitGridTemplate } from '../../workspaceLayout';
import {
  closeView,
  isSplit,
  showView,
  slotFor,
  splitPane,
  visibleViews,
} from '../../editorPanes';
import { actionForEvent } from '../../keymap';
import { useKeymapRef } from '../../useKeymap';
import { STORAGE_KEY_CHOOSER_COLLAPSED, useFold } from '../../fold';
import { LessonChooserRail, studyGridColumns } from './runner/LessonChooserRail';
import { markPaintReady } from '../../paintTiming';
import { parseSliders } from '../../editor/sliderModel';
import { readBreakpoints, setBreakpointCondition, toggleBreakpoint, writeBreakpoints, type Breakpoint } from '../../editor/breakpoints';
import { readWatches } from '../../editor/watches';

import { useRunnerArrangement } from './runner/useRunnerArrangement';
import { usePredictGate } from './runner/usePredictGate';

import { RunnerRuntimeStrip } from './runner/RunnerRuntimeStrip';
import { LessonAmbience } from './runner/LessonAmbience';

import { PausedBar } from './runner/PausedBar';
import { ResultsColumn } from './runner/ResultsColumn';
import { DraftHistoryPanel } from './runner/DraftHistoryPanel';
import { BreakpointPanel } from './runner/BreakpointPanel';
import { RunnerToolbar } from './runner/RunnerToolbar';
import { RunnerEditorCard } from './runner/RunnerEditorCard';
import { useRunnerExecution } from './runner/useRunnerExecution';
import { useFirstRunTour } from './runner/useFirstRunTour';
import { useCollab } from './runner/useCollab';
import { useProgressFlags } from './runner/useProgressFlags';
import { useVimKeys } from './runner/useVimKeys';
import { useShareLink } from './runner/useShareLink';
import { AttemptOffers } from './runner/AttemptOffers';
import { useDraftComparison } from './runner/useDraftComparison';
import { DiffPanel } from './runner/DiffPanel';
import { type PythonEditorHandle } from '../PythonEditor';

import { roadmapStepForLesson } from '../../practiceLinks';
import { stepBreadcrumb, stepCostLabel, stepForMilestone } from '../../spine';

import type { ActiveTierPass } from '../../curriculumData';
import { Play, Lightbulb, BookOpen, Sparkles, Check, ChevronRight, OctagonX, LifeBuoy } from 'lucide-react';

declare global {
  interface Window {
    __mechalabExecutionTimeoutMs?: number;
    __mechalabMaxTraceSteps?: number;
    /** `false` turns the predict-first gate off — a suite's switch, never a learner's. */
    __mechalabPredictFirst?: boolean;
  }
}

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
/** And the last palette Format request, which needs the same record for the same reason. */
let LAST_FORMAT_REQUEST_HANDLED = 0;

interface TabPyodideRunnerProps {
  initialLessonId?: string;
  verifiedLessons?: Record<string, boolean>;
  completedLessons?: Record<string, boolean>;
  onMarkLessonVerified?: (lessonId: string) => void;
  onToggleLessonCompleted?: (lessonId: string, forceValue?: boolean) => void;
  /** Opens the roadmap at the pass the open entry belongs to. */
  onOpenRoadmap?: (pass: ActiveTierPass, milestoneId: string) => void;
  /** The two doors a workflow citation may use; the object's kind declaration chooses one. */
  onOpenProjectPart?: (projectRef: string) => void;
  onOpenRequirement?: (requirementId: string) => void;
  /**
   * A counter the palette bumps when "Run the lesson" is chosen. A nonce, not a callback: the
   * palette outlives this component (it is mounted whatever tab is open), so it cannot hold the
   * run function, and a mount must never fire a run the learner asked for on an earlier visit.
   */
  runRequest?: number;
  /**
   * A counter the palette bumps when "Format with Black" is chosen. Same nonce rule as `runRequest`:
   * the palette outlives this component and must not fire a press nobody made in this visit.
   */
  formatRequest?: number;
  /**
   * A counter the palette and the `?` sheet bump when "Replay the first-lesson tour" is chosen. Same
   * nonce rule as `runRequest`: both outlive this component, and a mount must never open a tour
   * nobody asked for on this visit.
   */
  tourRequest?: number;
  /**
   * Bumped by Home's Review button. The deck is already here (the Study panel); this only brings it
   * into view, because a review opened in a second surface would be a second schedule.
   */
  reviewRequest?: number;
  /**
   * An explicit "open this entry" request. The id alone cannot express it: choosing the lesson a
   * deep link already named leaves `initialLessonId` unchanged, so nothing would fire.
   *
   * `line` is a search hit's line in the lesson's **starter** (`app/src/lessonSearch.ts`): the pick
   * puts the caret there when that number still describes the text on screen, and opens the lesson
   * without a jump when the learner's draft has moved the line.
   */
  lessonRequest?: { id: string; nonce: number; line?: number } | null;
  /**
   * Code that arrived in a share link (`#share=…`). Offered, never applied: it is someone else's
   * attempt and the learner's own draft is behind it.
   */
  sharedAttempt?: SharedAttempt | null;
  /** Clear the offer once it has been used or dismissed. */
  onDismissShared?: () => void;
  /**
   * A lesson page's code block, arrived as `#try=…` (`app/src/tryLink.ts`). Shown in the editor as
   * *scratch*: the page's snippet, not the learner's draft, and never graded against the lesson.
   */
  trySnippet?: SharedAttempt | null;
  /** Forget the snippet once the learner leaves scratch. */
  onDismissTry?: () => void;
}

export const TabPyodideRunner: React.FC<TabPyodideRunnerProps> = ({
  initialLessonId,
  verifiedLessons: externalVerified,
  completedLessons: externalCompleted,
  onMarkLessonVerified,
  onToggleLessonCompleted,
  onOpenRoadmap,
  onOpenProjectPart,
  onOpenRequirement,
  runRequest,
  formatRequest,
  tourRequest,
  reviewRequest,
  lessonRequest,
  sharedAttempt,
  onDismissShared,
  trySnippet,
  onDismissTry,
}) => {
  const [selectedId, setSelectedId] = useState<string>(initialLessonId || PYTHON_LESSONS[0].id);
  // Scratch: the editor holds a page's snippet rather than the learner's draft. The ref is what the
  // run and draft paths read, because those are called from timers and refs that outlive a render.
  const [scratch, setScratch] = useState<boolean>(Boolean(trySnippet));
  const scratchRef = useRef<boolean>(Boolean(trySnippet));
  scratchRef.current = scratch;
  // Set when a run starts, so the result effect can tell a scratch run from an attempt at the lesson
  // even if the learner has already left scratch by the time it finishes.
  const runScratchRef = useRef<boolean>(false);
  // The first-run tour owns its own record and gates (`runner/useFirstRunTour.ts`).
  const [isPhone, setIsPhone] = useState<boolean>(() => {
    try {
      return window.matchMedia('(max-width: 767px)').matches;
    } catch {
      return false;
    }
  });
  // The two halves of Study on a phone (`phoneSurface.ts`): the prose or the code, one at a time.
  // The initial value is read per lesson, so a stored `code` for this entry reopens where the
  // learner left it, and a stored `code` for a different entry does not hide an unread lesson.
  const [phoneSurface, setPhoneSurface] = useState<PhoneSurface>(() =>
    readPhoneSurface(initialLessonId || PYTHON_LESSONS[0].id)
  );
  // Once the phone has opened the editor it stays mounted behind the Lesson surface: switching back
  // and forth should not re-fetch CodeMirror or lose the caret, and the first visit to a lesson's
  // prose should not pay for the editor's chunk at all.
  const [codeOpened, setCodeOpened] = useState<boolean>(
    () => readPhoneSurface(initialLessonId || PYTHON_LESSONS[0].id) === 'code'
  );
  // The lesson chooser is a 760 px rail beside the work area on a desktop and a sheet on a phone;
  // this is the sheet's own open state.
  const [lessonSheetOpen, setLessonSheetOpen] = useState(false);
  // The first-run guide is a page of three cards. On a phone it arrives collapsed behind one line,
  // because the lesson text is what a returning learner came for and the guide is for the first
  // visit only. On a desktop it opens as it always did.
  const [guideOpen, setGuideOpen] = useState<boolean>(() => !isPhone);
  // The full brief is a desktop card: metadata, the clock and the lesson's two new ideas. On a
  // phone it is behind Details, because the paragraph a learner came to read must be the first
  // thing under the strip rather than the fourth.
  const [phoneBriefOpen, setPhoneBriefOpen] = useState(false);
  // One warm-up per page, even if the effect below runs again when the phone opens the code.

  /**
   * Switch the phone's Study surface, and remember it for this lesson.
   *
   * Opening the code also sets `codeOpened`, which is what mounts the editor for the first time:
   * the state is deliberately separate from the surface, because hiding the editor again must not
   * throw away CodeMirror's document, caret or undo history.
   */
  const choosePhoneSurface = (surface: PhoneSurface) => {
    setPhoneSurface(writePhoneSurface(selectedId, surface));
    if (surface === 'code') setCodeOpened(true);
    // The two surfaces are panels in one page, not two pages: move the page to the panel the
    // learner just chose. The offset comes from `scroll-margin-top` in `index.css`, so the sticky
    // header and tab picker do not cover its title.
    if (isPhone && typeof window !== 'undefined') {
      window.setTimeout(() => {
        const target =
          surface === 'code'
            ? document.getElementById('python-runner-editor')
            : document.querySelector<HTMLElement>('[data-testid="lesson-reader"]');
        target?.scrollIntoView({ block: 'start' });
      }, 80);
    }
  };

  // A stored Code surface reopens on the editor, not on the top of the page above it. The delay is
  // for the lazy editor's first mount, which is what gives the card its height.
  useEffect(() => {
    if (!isPhone || phoneSurface !== 'code') return;
    const timer = window.setTimeout(() => {
      document.getElementById('python-runner-editor')?.scrollIntoView({ block: 'start' });
    }, 180);
    return () => window.clearTimeout(timer);
    // Mount only: a later switch is handled by `choosePhoneSurface`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The chooser rail's fold, remembered beside the other folds (`app/src/fold.ts`): Study is the only
  // preset that draws the chooser, so the state is read where the rail is drawn rather than per preset.
  const chooserFold = useFold(STORAGE_KEY_CHOOSER_COLLAPSED);
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
  const helperEditorRef = useRef<PythonEditorHandle | null>(null);
  const editorPanelRef = useRef<HTMLDivElement | null>(null);
  // Which tab of the lesson's small project is open: null is `main.py`, a string is a read-only
  // helper. Reset on every lesson change, because a helper from the previous lesson is not this one.
  const [openHelper, setOpenHelper] = useState<string | null>(null);
  // A jump that landed in the file that is *not* open: the tab switch mounts that editor, so the line
  // rides in with the mount (`PythonEditorProps.initialLine`) instead of being asked of a ref that
  // does not exist yet. `lesson` is which entry the jump was asked for: a line is a position in one
  // lesson's file, and a leftover jump from another one has no line to name here.
  const [pendingJump, setPendingJump] = useState<{ file: string; line: number; lesson: string } | null>(null);
  // The name F12 was pressed on when nothing in the lesson defines it. Said in the file strip, which
  // is already there, rather than in a toast the learner has to dismiss.
  const [symbolMiss, setSymbolMiss] = useState<string | null>(null);
  // The arrangement — preset, dock and the editor's panes — has one owner of its own.
  const {
    layout,
    chooseLayout,
    dock,
    dockChoice,
    flipDock,
    resultsSide,
    splitRatio,
    commitSplitRatio,
    draggingSplit,
    splitContainerRef,
    beginSplitDrag,
    moveSplitDrag,
    endSplitDrag,
    panes,
    commitPanes,
  } = useRunnerArrangement();
  const guideAssessmentRef = useRef<HTMLDivElement | null>(null);
  // Named groups the roadmap also uses; the old "Step 1 / Steps 3-5 / Steps 6-10" numbering was a
  // third scheme, belonging to neither the roadmap's passes nor any tab the learner can open.
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // The editor opens on the learner's own unfinished work when there is any (`src/lessonDraft.ts`),
  // and on the lesson's starter when there is not. Without this, "Continue P.4" on the roadmap would
  // open a fresh starter - the card would be naming work it had already thrown away.
  const [code, setCode] = useState<string>(() => {
    // A try-it link is the text the reader clicked for; the draft is restored when they leave scratch.
    if (trySnippet) return trySnippet.code;
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
  // The attempt count at the moment rung 1 was opened, per lesson. Rung 2 is the near-solution, so
  // it is earned by an attempt *after* the nudge (`checkHints.hintLock`), not by the run that was
  // already on screen when the nudge was read.
  const [hintOpenedAt, setHintOpenedAt] = useState<Record<string, number>>({});
  const share = useShareLink({ lessonId: selectedId, readCode: () => codeRef.current });
  // Ask for help (`app/src/components/HelpSheet.tsx`): one report built from the run on screen.
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  // Pair study (`app/src/components/PairSheet.tsx`): a direct session with another workbench, and the
  // attempt that arrived from it. The attempt is state, never an edit — the card below asks first.
  const [pairOpen, setPairOpen] = useState<boolean>(false);
  const [pairAttempt, setPairAttempt] = useState<{ lesson: string; code: string } | null>(null);
  // The pair session is the transport only (`runner/useCollab.ts` subscribes to it). Handing it no
  // handler is what lets the co-edit session be declared after the lesson functions it needs,
  // instead of the tab holding a ref for messages that arrive before that session exists.
  const pair = usePairSession();
  // The lines the gutter has armed for this lesson (`app/src/editor/breakpoints.ts`). Read at mount,
  // re-read on a lesson switch, and written on every click: the store, not this state, is what a
  // reload reads back.
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>(() =>
    readBreakpoints(initialLessonId || PYTHON_LESSONS[0].id)
  );
  // The Breakpoints panel: on request only. A dot alone does not say what it is waiting for, so the
  // conditions live in one place the toolbar can open, titled with the count the gutter is drawing.
  const [breakpointsOpen, setBreakpointsOpen] = useState(false);

  // The worker session, the state a run writes and the park commands have one home
  // (`runner/useRunnerExecution.ts`); this tab composes them with the lesson and the chrome.
  const lessonIdRef = useRef<string>(initialLessonId || PYTHON_LESSONS[0].id);
  // The "take this step offline" press: what it found, what it measured, and whether the runtime
  // came along. `ready` requires the interpreter's own files, not just the shell - a cached page that
  // cannot run Python is not offline-ready for this app.
  const [offline, setOffline] = useState<{
    state: 'idle' | 'working' | 'ready' | 'partial' | 'unsupported';
    report: OfflineCacheReport | null;
  }>({ state: 'idle', report: null });
  // The learner's record (`runner/useProgressFlags.ts`): the parent may own it, and when it does
  // not this tab is the store. Read by the toolbar, the diff's solution rule and the roadmap hand-off.
  const { verifiedLessons, completedLessons, markLessonVerified, toggleLessonSelfMarked } =
    useProgressFlags({
      externalVerified,
      externalCompleted,
      onMarkLessonVerified,
      onToggleLessonCompleted,
    });

  // The paint reading's fourth moment: this tab has committed, which is when the Run button is on
  // screen and clickable. Once per visit, not once per lesson (`paintTiming.ts`).
  useEffect(() => {
    markPaintReady('run');
  }, []);

  // The first pass restores a deep link and must not rewrite the address (a plain visit keeps a
  // clean URL). A later pass is the learner picking a different entry in-app - from a roadmap step's
  // practice chip, say - and then the address has to follow, or it keeps naming the old lesson.
  const initialLessonApplied = useRef<boolean>(false);
  // The id this effect has already honoured. A mount effect is replayed in development
  // (`React.StrictMode`), and the replay used to re-select the mount default *after* an explicit
  // request had landed — so Home's Continue, which names a lesson other than the one a plain visit
  // would reopen, reopened the wrong one. The same prop is the same instruction; a changed one is
  // a new pick and still applies.
  const appliedInitialId = useRef<string | null>(null);
  useEffect(() => {
    if (!initialLessonId || !PYTHON_LESSONS.some((l) => l.id === initialLessonId)) return;
    if (appliedInitialId.current === initialLessonId) return;
    appliedInitialId.current = initialLessonId;
    selectLesson(initialLessonId, initialLessonApplied.current);
    initialLessonApplied.current = true;
  }, [initialLessonId]);

  // A try-it link lands *after* the draft has been loaded, so it wins: the page's snippet is what the
  // reader clicked for. Declared below the lesson sync for exactly that order, on mount and on a
  // second link arriving without a reload.
  useEffect(() => {
    if (!trySnippet) return;
    setScratch(true);
    scratchRef.current = true;
    commitCode(trySnippet.code);
  }, [trySnippet]);

  // A palette pick (or a roadmap practice chip) is an instruction, not a prop sync: the nonce is
  // what makes it land even when it names the entry already in `initialLessonId`, and the address
  // bar follows because a learner's own pick is what a copied URL should reopen.
  //
  // A search hit may also name a line. A line is counted in a text, so it is only that line while the
  // editor holds the text it was counted in: the starter. Two cases, and they land differently.
  //
  // - **The lesson is already open**: nothing remounts, so the caret can move now.
  // - **The pick switches lessons**: the editor is keyed by the lesson it holds, so a new one mounts.
  //   A reveal asked *now* would land in the text about to be replaced — and would be dropped
  //   entirely by a remount that arrives a moment later (a strict double mount). The line therefore
  //   travels as a mount prop (`pendingJump` → `initialLine`), so whichever editor mounts is born on
  //   that line rather than being told to go there afterwards.
  const lastLessonRequest = useRef<number>(0);
  useEffect(() => {
    if (!lessonRequest || lessonRequest.nonce <= lastLessonRequest.current) return;
    lastLessonRequest.current = lessonRequest.nonce;
    const { id, line } = lessonRequest;
    const sameLesson = id === selectedId;
    const named = line !== undefined && Number.isFinite(line) ? line : null;
    // A lesson that opens on the learner's own draft has its own lines: the pick opens the top.
    if (!sameLesson && named !== null && readDraft(id) === null) {
      setPendingJump({ file: MAIN_FILE_NAME, line: named, lesson: id });
    }
    selectLesson(id, true);
    if (!sameLesson || named === null) return;
    const starter = PYTHON_LESSONS.find((lesson) => lesson.id === id)?.starterCode ?? '';
    if (codeRef.current === starter) showMainLine(named);
    // `showMainLine` is declared below and is only called from the callback, not here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonRequest]);

  const currentLesson: PythonLessonItem =
    PYTHON_LESSONS.find((l) => l.id === selectedId) || PYTHON_LESSONS[0];
  // What the Write preset prints as the question: the functions the starter marks, not the lesson's
  // learning objective and not its Markdown. Pure (`lessonCoach.ts`), so the draft suite pins it.
  const writeQuestion = React.useMemo(
    () => exerciseTask(currentLesson.starterCode, currentLesson.goal),
    [currentLesson]
  );
  // The lesson's read-only helpers. The plant is 400 lines a learner can read but not edit; the
  // worker writes the same text into Pyodide, so `from mechalab_plant import ...` works unchanged.
  const helperFiles = React.useMemo(
    () => helperFilesForLesson(currentLesson, { filename: MECHALAB_PLANT_FILENAME, source: MECHALAB_PLANT_PY }),
    [currentLesson]
  );
  const sliderCount = React.useMemo(() => parseSliders(code).length, [code]);

  const codeRef = useRef<string>(code);
  const currentLessonRef = useRef<PythonLessonItem>(currentLesson);
  const execution = useRunnerExecution({
    selectedId,
    lessonIdRef,
    currentLessonRef,
    scratchRef,
    codeRef,
    helperFiles,
    breakpoints,
    editorRef: guideEditorRef,
    markLessonVerified,
  });
  const {
    session,
    analysisRef,
    pyodideStatusRef,
    stdinCtrlRef,
    warmStartedRef,
    stdout,
    setStdout,
    stderr,
    setStderr,
    runAttempts,
    instructorError,
    setInstructorError,
    harnessReport,
    setHarnessReport,
    behaviorCheck,
    setBehaviorCheck,
    outputCheck,
    setOutputCheck,
    isRunning,
    pausedStep,
    frameEdit,
    frameEditError,
    setWatches,
    watchDraft,
    setWatchDraft,
    watchError,
    setWatchError,
    pauseCapable,
    showPassToast,
    setShowPassToast,
    pyodideStatus,
    setPyodideStatus,
    passStatus,
    setPassStatus,
    stdinPrompt,
    setStdinPrompt,
    stdinValue,
    setStdinValue,
    readyMs,
    setReadyMs,
    runtimeBoot,
    scopeSeries,
    trace,
    traceStep,
    setTraceStep,
    pinnedScope,
    setPinnedScope,
    pauseExecution,
    answerPause,
    stopExecution,
    resetRuntime,
    handleFrameEdit,
    applyFrameEdit,
    submitWatch,
    removeWatched,
    runPythonCode,
    runCellTo,
  } = execution;
  useEffect(() => {
    setOpenHelper(null);
    setSymbolMiss(null);
    // A jump made *for* the lesson that is opening is the one the editor is about to mount with; one
    // left over from another lesson would put this file's caret on that file's line.
    setPendingJump((previous) => (previous && previous.lesson !== selectedId ? null : previous));
  }, [selectedId]);
  // An edit retires a "no definition" line: the name may well be defined now.
  useEffect(() => {
    setSymbolMiss(null);
  }, [code, openHelper]);

  /**
   * F12, or ⌘-click: put the cursor on the line that defines `name`.
   *
   * Three outcomes, and all three are visible: the open file (cursor moves, nothing else changes),
   * the other file (its tab opens on the definition), or neither (the strip says which name it could
   * not find). An attribute — `z.real` — never reaches here: a name after a dot belongs to whatever
   * `z` is, and this lesson's files are not where it is defined.
   */
  const goToDefinition = (name: string) => {
    const files = [
      { name: MAIN_FILE_NAME, text: codeRef.current },
      ...helperFiles.map((file) => ({ name: file.name, text: file.content })),
    ];
    const activeFile = openHelper ?? MAIN_FILE_NAME;
    const hit = findDefinition(name, files, activeFile);
    if (!hit) {
      setSymbolMiss(name);
      return;
    }
    setSymbolMiss(null);
    const targetTab = hit.file === MAIN_FILE_NAME ? null : hit.file;
    if (targetTab === openHelper) {
      const editor = targetTab === null ? guideEditorRef.current : helperEditorRef.current;
      editor?.revealLine(hit.line);
      return;
    }
    setPendingJump({ file: hit.file, line: hit.line, lesson: selectedId });
    setOpenHelper(targetTab);
  };
  /**
   * Put the caret on a line of the learner's own file — what the trace panel's **Show line** asks for.
   *
   * The same two paths `goToDefinition` uses: already open, so the mounted editor can take a jump right
   * now; or the helper tab is open, so `main.py` has to mount first and the line goes with the mount.
   */
  /** The reader's "Go to the editor": the same landing the guide card's own button uses. */
  const jumpToEditor = () => {
    setOpenHelper(null);
    // On a phone the editor is below the prose and can be a screen away; the jump switches the
    // surface instead of scrolling to a hidden panel. The focus waits for the mount, which is why
    // it is a timer rather than the same tick.
    if (isPhone) {
      choosePhoneSurface('code');
      window.setTimeout(() => guideEditorRef.current?.focus(), 60);
      return;
    }
    if (!editorShown) {
      // Read shows the whole page but no editor. Its "Do it yourself" heading is where the jump
      // lives, so take the learner to Write, then scroll once that preset has mounted the panel.
      chooseLayout('write');
      window.setTimeout(() => {
        editorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        guideEditorRef.current?.focus();
      }, 60);
      return;
    }
    editorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => guideEditorRef.current?.focus(), 0);
  };

  /**
   * The study panel's door into the Workflow tab.
   *
   * It chooses the pane first, then lands on it: on a phone that means switching to the code surface
   * before the scroll, or the card the learner asked for is on a surface they cannot see.
   */
  const openWorkflowTab = () => {
    commitPanes(showView(panes, 'workflow'));
    if (isPhone) choosePhoneSurface('code');
    window.setTimeout(
      () => editorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      isPhone ? 60 : 0
    );
  };

  const showMainLine = (line: number) => {
    if (openHelper === null && guideEditorRef.current) {
      guideEditorRef.current.revealLine(line);
      return;
    }
    // The file to land in is not mounted yet: the helper tab is open, or the editor is still
    // arriving. `revealLine` on a ref that does not exist is a no-op by design
    // (`PythonEditor.tsx`), so the line goes with the mount instead — and a request that reaches a
    // mounted editor after the fact is applied as `initialLine` changes.
    setPendingJump({ file: MAIN_FILE_NAME, line, lesson: selectedId });
    if (openHelper !== null) setOpenHelper(null);
  };
  // What the lesson's harness says about the code on screen now; a `null` report is a failed gate
  // (unproven), never a pass.
  const currentHarness = harnessForLesson(currentLesson.id);
  const harnessResult = currentHarness ? harnessGate(currentHarness, harnessReport) : null;
  // The versions behind the draft and what the diff compares against (`runner/useDraftComparison.ts`).
  // Five cells and three memos used to live here; the restore handler stays in the tab, because only
  // the tab may clear a run's verdict.
  const comparison = useDraftComparison({
    lesson: currentLesson,
    code,
    verified: Boolean(verifiedLessons[selectedId]),
    onRestore: (restored) => restoreDraftVersion(restored),
  });
  // The secondary half of the toolbar, folded away by default (`docs/PLAN-2.1a.md` §3). Closed is
  // the first screen a beginner sees; a control that is opened on purpose is read before it is used.
  const [moreOpen, setMoreOpen] = useState(false);
  // One `lesson_open` per visit, including the first render: it is the denominator for abandon rate.
  // The sitting clock takes the same event, because it is the moment the learner is here: it opens a
  // sitting, or extends the one they were already in when they switched lesson without a break.
  //
  // The guard is for the replay, not for the learner. `main.tsx` mounts under `React.StrictMode`, which
  // in development runs every effect a second time on the same instance to surface cleanup bugs — so
  // a dev visit filed two opens 7 ms apart, and a pilot exporting from `npm run dev` read a visit count
  // doubled (`docs/pilot-results.md`, Run 214). A ref survives that replay, so the second pass is a
  // no-op; a real re-open is a *new* instance, whose ref starts empty, so visiting A → B → A still
  // files three opens. Removing StrictMode would hide this and every other effect that cannot be
  // replayed, which is the reason it is on.
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    if (openedRef.current === selectedId) return;
    openedRef.current = selectedId;
    logEvent({ kind: 'lesson_open', lesson: selectedId });
    recordSittingEvent({ at: Date.now(), kind: 'open', lesson: selectedId });
  }, [selectedId]);

  // One `run` per execution, recorded where every path converges — the result state — rather than in
  // each of the six branches that can set it. `pendingRun` stops a re-render from logging twice.
  const pendingRunRef = useRef<boolean>(false);
  const runStartedAtRef = useRef<number>(0);
  // Whether this lesson was already verified *before* this run. Read at the start, because by the
  // time the verdict effect runs the store has usually written the new flag — and a re-run of passed
  // work must not play the stamp's stinger again.
  const verifiedNowRef = useRef(verifiedLessons);
  verifiedNowRef.current = verifiedLessons;
  const runStartedVerifiedRef = useRef<boolean>(false);
  // The text this run started from, captured before the worker is even asked: a learner who keeps
  // typing while it runs would otherwise file their in-progress edit under the old run's verdict.
  const runCodeRef = useRef<string>('');
  useEffect(() => {
    if (isRunning) {
      pendingRunRef.current = true;
      runStartedAtRef.current = performance.now();
      runCodeRef.current = codeRef.current;
      runScratchRef.current = scratchRef.current;
      runStartedVerifiedRef.current = Boolean(verifiedNowRef.current[selectedId]);
      // The bench answering Run, heard: a relay click, and the music bus stepping back so the checks
      // are not talking over a bed. A watch run is the machine repeating a check on the learner's
      // behalf and stays silent — it is `watchRunRef` that says so, set before `isRunning` flips.
      if (!watchRunRef.current) playCue('run-start');
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
    // A scratch run is the page's snippet, not an attempt at the lesson: it files no version and logs
    // no `run`, the same reason a watch run does not. It still extends the sitting - the learner was
    // at the screen, working - which is the one thing that stays true.
    const scratchRun = runScratchRef.current;
    runScratchRef.current = false;
    const failed =
      passStatus === 'harness_failed' && harnessResult
        ? harnessResult.summary
        : // A runtime error's first line is now `Traceback (most recent call last):` (the worker sends
          // the whole traceback so the card can read the frames); the exception line is the record.
          passStatus === 'error'
          ? failureSummary(stderr) || (instructorError || stderr || '').split('\n')[0]
          : (instructorError || stderr || '').split('\n')[0];
    if (!watched && !scratchRun) {
      logEvent({
        kind: 'run',
        lesson: selectedId,
        outcome: passStatus,
        fail: failed || undefined,
        ms: Math.round(performance.now() - runStartedAtRef.current),
      });
    }
    if (passStatus === 'passed') {
      logEvent({ kind: 'verified', lesson: selectedId });
      // The first pass of a lesson earns the stamp's stinger; pressing Run again on work that already
      // passed gets the shorter pip phrase, so the sound never claims a capability twice.
      playCue(runStartedVerifiedRef.current ? 'run-pass' : 'verify');
    } else if (!watched) {
      // A neutral low tick: not this time, never a buzzer. It also lifts the duck the start click set,
      // which is the one thing every finished run must do or the bed stays quiet for good.
      playCue('run-fail');
    }
    // A run is the clearest sign of work in a sitting, and the one that stretches it: the clock counts
    // to the last run, so an hour spent debugging is an hour, not a gap after the lesson opened.
    recordSittingEvent({ at: Date.now(), kind: 'run', lesson: selectedId });
    // The half of the draft store a learner cannot get from a single latest version: what each run
    // started from, filed with the verdict it got. Taken here because every path that ends a run
    // converges on this state, and the text is read from the ref so it is the code that ran.
    if (!watched && !scratchRun) recordSnapshot(selectedId, runCodeRef.current || codeRef.current, passStatus);
    // The panel is read through a memo keyed on the lesson, the verdict and this counter. The verdict
    // this run reports is already rendered by the time this effect runs - that render read the store
    // *before* the snapshot above was filed - so without the bump the version the learner just made
    // would be invisible until the lesson changed or the panel was cleared.
    comparison.fileVersion();
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
   * What a helper would need, from the screen the learner is looking at.
   *
   * Only what a failed run leaves: the lesson, the text that ran, the verdict, and the three places a
   * failure can be described (Python's traceback, the instructor's assertion, a capstone's metrics).
   * The hints are counted, never copied — the ladder is the course's answer, and the report is meant
   * to reach a person, not to route around the pacing.
   */
  const helpInput = useMemo<HelpReportInput>(() => {
    // Guarded on `location`, not on `window`: the smoke suite's SSR pass installs a `window` shim with
    // no `location`, and the URL is a convenience in the report rather than something it depends on.
    const location = typeof window === 'undefined' ? undefined : window.location;
    const pageUrl = location?.origin
      ? `${location.origin}${location.pathname}?lesson=${encodeURIComponent(currentLesson.id)}`
      : '';
    return {
      lesson: { id: currentLesson.id, title: currentLesson.title, path: currentLesson.path },
      code: runCodeRef.current || code,
      stdout,
      stderr,
      verdict: passStatus,
      instructorError,
      harness: harnessResult ? { met: harnessResult.met, total: harnessResult.total, failures: harnessResult.failures } : null,
      failure: parsedFailure
        ? {
            summary: parsedFailure.summary,
            line: parsedFailure.frame?.line ?? null,
            entry: errorEntry ? entryHeadline(errorEntry) : null,
          }
        : null,
      checks: checkFailures.map((check) => ({ title: check.title, detail: check.detail })),
      attempts: attemptsHere,
      hintsRevealed: revealedHints,
      hintCount,
      url: pageUrl,
    };
  }, [
    currentLesson.id,
    currentLesson.title,
    currentLesson.path,
    code,
    stdout,
    stderr,
    passStatus,
    instructorError,
    harnessResult,
    parsedFailure,
    errorEntry,
    checkFailures,
    attemptsHere,
    revealedHints,
    hintCount,
  ]);

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
  // What the checker last said about this buffer, and the one sentence to show when it could not be
  // installed at all. Both are cleared on a lesson change: a note about another file is noise.
  const [lintNotes, setLintNotes] = useState<LintNote[]>([]);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  // What the last Format press did. Black's answer is one of three things — a tidier file, "already
  // tidy", or a sentence about why not — and the learner is told which, under the toolbar, rather
  // than left to diff the file and guess.
  const [formatStatus, setFormatStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'working' }
    | { kind: 'done'; changed: boolean }
    | { kind: 'failed'; message: string }
  >({ kind: 'idle' });
  const commitCode = (next: string) => {
    // A co-editing session turns every local change into ops, and the diff is what makes one code
    // path enough: typing, a paste, Format's rewrite, Load Solution and a slider all say the same
    // thing — "the text is now this" — and `noteLocalEdit` is what turns that into characters to
    // send (`runner/useCoEdit.ts`).
    noteLocalEdit(next);
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
    // Scratch text is the page's snippet: writing it as this lesson's draft would overwrite work the
    // learner never replaced. `readDraft` still holds their own text, and leaving scratch restores it.
    if (scratchRef.current) return;
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
    // may not have fired for the keystrokes typed just before the switch. Not from scratch: that text
    // is the page's snippet, and the learner's own draft is still in the store.
    if (lessonIdRef.current !== id && !scratchRef.current) saveDraft(lessonIdRef.current, codeRef.current);
    // Picking a lesson is leaving scratch: the snippet belonged to the page that sent it.
    setScratch(false);
    scratchRef.current = false;
    setSelectedId(id);
    lessonIdRef.current = id;
    // A phone opens a newly chosen entry on its text unless this entry was left in the code. The
    // record names the lesson, so "code" cannot follow the learner into prose they have not read.
    const surface = readPhoneSurface(id);
    setPhoneSurface(surface);
    if (surface === 'code') setCodeOpened(true);
    setLessonSheetOpen(false);
    // Always recorded, unlike the address bar: a plain visit keeps its clean URL and still reopens
    // here next time, which is the difference between a bookmark that resumes and one that resets.
    rememberLastLesson(id);
    if (remember) rememberLessonInUrl(id);
    commitCode(readDraft(id) ?? found.starterCode);
    // A breakpoint belongs to the file it was placed in: the new lesson reads its own list, and the
    // panel that lists them closes rather than showing another file's lines under this one's title.
    setBreakpoints(readBreakpoints(id));
    setBreakpointsOpen(false);
    // A watch belongs to the program it was written for, for the same reason.
    setWatches(readWatches(id));
    setWatchDraft('');
    setWatchError('');
    setRevealedHints(0);
    setPinnedScope(null);
    setStdout('');
    setStderr('');
    setInstructorError('');
    setHarnessReport(null);
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setPassStatus('untested');
    share.reset();
  };

  // Co-editing (`runner/useCoEdit.ts`): the shared document, the offer that has to be answered
  // before an editor is replaced, and the sentence that says why it stopped. Every local write asks
  // it, so typing, a paste, Format and a slider all reach the peer by one path.
  const coEditSession = useCollab({
    pair,
    lessonId: selectedId,
    readText: () => codeRef.current,
    applyText: (text) => {
      guideEditorRef.current?.applyWithoutHistory(text);
      codeRef.current = text;
      setCode(text);
    },
    selectLesson,
    saveText: saveDraft,
    onAccepted: () => setPairOpen(false),
    onAttempt: (attempt) => {
      setPairAttempt(attempt);
      // Close the sheet so the card is what the learner sees: an arriving attempt is a decision, and a
      // modal in front of it would hide the thing being decided about.
      setPairOpen(false);
    },
    onInvite: () => setPairOpen(true),
  });
  const {
    session: coEdit,
    invite: collabInvite,
    notice: collabNotice,
    start: startCoEdit,
    accept: acceptCoEdit,
    decline: declineCoEdit,
    stop: stopCoEditLocally,
    noteLocalEdit,
  } = coEditSession;

  /**
   * Leave scratch: the editor goes back to the learner's own draft, and the next run is graded again.
   *
   * Nothing from the snippet was written to the store, so there is nothing to undo — the draft is
   * still exactly where the learner left it, and `readDraft` is what fetches it back.
   */
  const endScratch = () => {
    setScratch(false);
    scratchRef.current = false;
    commitCode(readDraft(selectedId) ?? currentLesson.starterCode);
    setStdout('');
    setStderr('');
    setInstructorError('');
    setHarnessReport(null);
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setPassStatus('untested');
    onDismissTry?.();
  };

  /**
   * Keep the session told which lesson this is, whether or not it is connected.
   *
   * The hook records the id even while offline, so the first `hello` after a connection carries the
   * right lesson rather than the placeholder it opened with.
   */
  useEffect(() => {
    pair.announceLesson(selectedId);
  }, [selectedId, pair.state]);

  /** Adopt an attempt that arrived in a pair session: same rule as a shared link, same card. */
  const loadPairAttempt = () => {
    if (!pairAttempt) return;
    commitCode(pairAttempt.code);
    saveDraft(selectedId, pairAttempt.code);
    setPassStatus('untested');
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setInstructorError('');
    setPairAttempt(null);
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
    share.loaded();
    onDismissShared?.();
  };

  useEffect(() => {
    pyodideStatusRef.current = pyodideStatus;
  }, [pyodideStatus]);

  /** The analysis channel, created on first use and posted to whichever worker is current. */
  const analysisSession = (): AnalysisSession => {
    if (!analysisRef.current) {
      analysisRef.current = new AnalysisSession((message) =>
        session.post({
          // Every analysis request carries the CDN, like a run and a format do. The worker needs it
          // to install Jedi on the first request of a worker that has not been warmed yet — a tab
          // switch can keep this component while replacing its worker, and an analysis request may
          // be the first message that worker ever sees. Without it the worker tried to import
          // `undefinedpyodide.mjs` and every completion fell back to keywords silently.
          cdnUrl: pyodideCdn(),
          ...message,
        })
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
  // checker notes about it would read as the app complaining about its own exercise - while the one
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
        worker = session.ensure();
      } catch {
        finish(false);
        return;
      }
      worker.addEventListener('message', onMessage);
      const cdnUrl = pyodideCdn();
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

  /**
   * Tidy the editor's file with Black, in place.
   *
   * The formatter is a pure-Python library inside the same worker, so this is one request: the worker
   * installs Black on first use (its `format-status` stretches the session's clock while it does),
   * formats the text and answers with the file. It refuses instead of queueing while a run is in flight
   * or a park is waiting: the worker is one thread, and a format asked at either moment would wait
   * behind the very program it is meant to tidy.
   *
   * The answer is applied only to the text it was asked about. A learner who typed while the worker
   * worked keeps what they typed and is told to press again — replacing their last sentence with a tidy
   * version of the previous one is the one outcome nobody would forgive.
   */
  const formatCode = async () => {
    if (isRunning) {
      setFormatStatus({
        kind: 'failed',
        message: 'Stop the run first — the formatter shares its thread.',
      });
      return;
    }
    if (pausedStep) {
      setFormatStatus({ kind: 'failed', message: 'Continue or Stop the parked run first.' });
      return;
    }
    if (formatStatus.kind === 'working') return;
    const source = codeRef.current;
    if (!source.trim()) {
      setFormatStatus({ kind: 'failed', message: 'There is nothing to format yet.' });
      return;
    }
    setFormatStatus({ kind: 'working' });
    // The formatter needs the interpreter, and pressing Format is as good a reason to load it as Run
    // is: the button should not be dead for a learner who has written code but not yet run it.
    const ready = pyodideStatusRef.current === 'ready' || (await warmRuntimeForOffline());
    if (!ready) {
      setFormatStatus({ kind: 'failed', message: 'The Python runtime could not be loaded.' });
      return;
    }
    const reply = await analysisSession().format(source);
    if (!reply.ok) {
      setFormatStatus({
        kind: 'failed',
        message: reply.syntax
          ? `Black could not parse this file — ${reply.reason}`
          : 'The formatter could not load — it installs on one online visit, then stays in this browser session.',
      });
      return;
    }
    if (codeRef.current !== source) {
      setFormatStatus({
        kind: 'failed',
        message: 'The file changed while it was being formatted — press Format again.',
      });
      return;
    }
    if (reply.text === source) {
      setFormatStatus({ kind: 'done', changed: false });
      return;
    }
    commitCode(reply.text);
    setFormatStatus({ kind: 'done', changed: true });
  };
  const formatShortcutRef = useRef<() => void>(() => {});
  formatShortcutRef.current = () => void formatCode();
  useEffect(() => {
    if (!formatRequest || formatRequest <= LAST_FORMAT_REQUEST_HANDLED) return;
    LAST_FORMAT_REQUEST_HANDLED = formatRequest;
    formatShortcutRef.current();
  }, [formatRequest]);

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
    // A phone reading the lesson has not asked for code yet: 10 MB of Pyodide and the editor's
    // 149 kB are exactly what the one-surface Study loop exists to postpone. Opening Code (or a
    // preset that shows the editor) flips this and the warm-up starts then.
    if (isPhone && layout === 'study' && !codeOpened) return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
      return;
    }
    const cdnUrl = pyodideCdn();
    let cancelled = false;
    const warm = () => {
      if (cancelled || warmStartedRef.current) return;
      warmStartedRef.current = true;
      try {
        // The session's status handler moves the chip, so a warm-up needs no handler of its own.
        session.post({ type: 'warm', cdnUrl });
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
  }, [codeOpened, isPhone, layout]);

  /**
   * Arm or disarm a line the gutter was clicked on (or `F9` was pressed on).
   *
   * Written through and read back, so the dot the learner sees is the list the next run will carry:
   * a browser that refuses storage leaves this visit's dots working and next visit's empty, and the
   * gutter says exactly that rather than pretending the write landed.
   */
  const toggleBreakpointAt = (line: number) => {
    const id = lessonIdRef.current || selectedId;
    setBreakpoints(writeBreakpoints(id, toggleBreakpoint(breakpoints, line)));
  };

  /**
   * The editor moved a dot with the statement it was placed on, and these are its new lines.
   *
   * The editor holds a breakpoint as a position while it is open, so an edit above one does not leave
   * it pointing at a different statement; the line numbers it lands on are what gets stored and what
   * the next run is sent (`app/src/editor/breakpointState.ts`).
   */
  const followBreakpointEdits = (entries: Breakpoint[]) => {
    const id = lessonIdRef.current || selectedId;
    setBreakpoints(writeBreakpoints(id, entries));
  };

  /**
   * Narrow one armed line to the passes that matter, or widen it again with an empty condition.
   *
   * Written on every keystroke: the input's value is the stored condition, so what the learner reads
   * is what the next run carries. The run in flight is unaffected — conditions travel with the
   * request, like the dots themselves — which is why the panel says so.
   */
  const setConditionAt = (line: number, condition: string) => {
    const id = lessonIdRef.current || selectedId;
    setBreakpoints(writeBreakpoints(id, setBreakpointCondition(breakpoints, line, condition)));
  };

  /** Restoring is the same text, back in the editor, and the badges cleared: they described the
   * code that was there a moment ago, not this one. */
  const restoreDraftVersion = (restored: string) => {
    commitCode(restored);
    saveDraft(selectedId, restored);
    setPassStatus('untested');
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setInstructorError('');
  };

  // Watch mode (see `app/src/watchMode.ts`): after a graded failure, a pause in typing re-runs the
  // checks. Off unless the learner asked for it.
  const [watchOn, setWatchOn] = useState<boolean>(() => readWatch());
  /** Set for the one run watch mode starts, so the log and the filed versions know it was automatic. */
  const watchRunRef = useRef(false);
  // Vim keys (`runner/useVimKeys.ts`): the remembered opt-in and the mode the editor reads keys in.
  const vim = useVimKeys();

  // ⌥1–⌥4 pick a layout, from anywhere including inside the editor. The buttons in the editor's
  // header are the discoverable path; this is the shortcut the buttons print.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.altKey || event.metaKey || event.ctrlKey) return;
      // The code first: ⌥2 is `™` in `key` on a Mac, and the shortcut is the physical key.
      const next = layoutShortcutFor(event.code) ?? layoutShortcutFor(event.key);
      if (!next) return;
      event.preventDefault();
      chooseLayout(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);


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
  // The finish line is held until the first run has landed: the predict gate asks what the lesson
  // will print, so a card that answers that question thirty lines above it hands the answer over and
  // the gate stops being a question (found in the first beginner sitting, 2026-10-23).
  // Built from the draft, not the starter: the card's "start with" and "first check" must name the
  // hole the next run will actually stop at, or they send a learner back to work already done.
  const coach = coachForLesson(currentLesson, code);
  const holeNoun = coach.isExercise
    ? `NotImplementedError ${coach.holeCount === 1 ? 'hole' : 'holes'}`
    : `TODO ${coach.holeCount === 1 ? 'line' : 'lines'}`;
  const hasRunThisSession = stdout.trim().length > 0 || stderr.trim().length > 0;
  // A graded exercise's holes are `raise NotImplementedError(...)`, so its untouched starter prints a
  // traceback and the lesson is graded against the self-check line a finished file prints. Asking
  // "what will this print?" there has one honest answer — the traceback — that can never match, so
  // the gate asks for the finished run instead (found in the first graded-exercise sitting,
  // 2026-10-23). Hand-written pages keep the question, because their starter does print.
  const gateAsksForFinish = currentLesson.track === 'modules';
  const guideHoleUnfilled =
    currentLesson.track === 'modules' && starterHoles(code, true).length > 0;
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

  // The first-run tour owns its own record, gates and baselines (`runner/useFirstRunTour.ts`).
  const {
    tourActive,
    tourStep,
    tourState,
    tourFacts,
    tourChip,
    setTourChip,
    startTour,
    signalTour,
    runButtonRef,
  } = useFirstRunTour({
    selectedId,
    code,
    runAttempts,
    isRunning,
    passStatus,
    tourRequest,
    hasProgress:
      Object.keys(verifiedLessons).length > 0 ||
      Object.keys(completedLessons).length > 0 ||
      Object.keys(readDrafts()).length > 0,
    sheetOpen: moreOpen || helpOpen || pairOpen,
    editorRef: guideEditorRef,
  });

  // A narrower window turns the coach mark into a bottom sheet; the preset the tour leans on follows.
  useEffect(() => {
    const query = (() => {
      try {
        return window.matchMedia('(max-width: 767px)');
      } catch {
        return null;
      }
    })();
    if (!query) return;
    const onChange = () => setIsPhone(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // The preset the tour needs, without touching the learner's remembered one: `writeLayout` is only
  // ever called by the layout buttons, so finishing the tour restores their own choice by itself.
  const shownLayout = tourActive ? layoutForStep(tourState.stepIndex, isPhone) : layout;
  /** Read hides the editor: the run controls and the output fall back to the page in that preset. */
  const editorShown = layoutShows(shownLayout, 'editor');
  /** Write hides the last run's output: while drafting, it describes code that has changed. */
  const resultsAllowed = layoutShows(shownLayout, 'results');
  /**
   * The phone's one-surface Study loop.
   *
   * `phoneStudy` is false on a desktop, in Read/Write/Debug, and during the tour's own preset, so
   * every rule below falls back to the layout the learner chose. `deferPhoneEditor` is the gate
   * that keeps CodeMirror and Pyodide off a first visit's prose: the editor is not merely hidden,
   * its chunk is not requested until the learner asks for the code.
   */
  const phoneStudy = isPhone && shownLayout === 'study';
  const phoneCode = phoneStudy && phoneSurface === 'code';
  const phoneLessonVisible = !phoneStudy || phoneSurface === 'lesson';
  const phoneEditorVisible = !phoneStudy || phoneSurface === 'code';
  const deferPhoneEditor = phoneStudy && !codeOpened;
  /**
   * Open the prediction gate as a pane, beside the code when there is no split yet.
   *
   * A guess is read against the code that has to print it, so the first press splits rather than
   * covering `main.py` with the question; once a split exists the focused pane takes the tab, the
   * same rule every other tab follows. In a preset that hides the editor or its results the pane
   * would be a door into a hidden room, so Study comes back first.
   */
  const openPredictView = () => {
    if (!editorShown || !resultsAllowed) chooseLayout('study');
    if (slotFor(panes, 'predict') !== null) {
      commitPanes(showView(panes, 'predict'));
      return;
    }
    commitPanes(isSplit(panes) ? showView(panes, 'predict') : splitPane(panes, 'predict'));
  };
  // Predict first (see `app/src/predictGate.ts`). The gate owns the question, its store record
  // and the run it holds; every surface asks for a run through it.
  const gate = usePredictGate({
    selectedId,
    currentLesson,
    scratchRef,
    isRunning,
    runPythonCode,
    openPane: openPredictView,
  });

  // ⌘↵ / Ctrl+↵ runs from anywhere on this screen, including inside the editor. The button stays
  // the discoverable path; this is the one keyboard habit a code editor trains. The key is read from
  // the sheet's keymap (`app/src/keymap.ts`), so a learner who rebinds Run is not left with the old
  // chord still running the lesson and the new one doing nothing.
  const runShortcutRef = useRef<() => void>(() => {});
  runShortcutRef.current = () => {
    if (isRunning) return;
    const lesson = PYTHON_LESSONS.find((l) => l.id === lessonIdRef.current) || PYTHON_LESSONS[0];
    gate.requestRun(codeRef.current, lesson);
  };
  const keymapRef = useKeymapRef();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (actionForEvent(keymapRef.current, event) === 'run') {
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
      // The gate owns the next run while a run is actually held for a guess: a re-run here would be
      // the one path around it. The test is `heldRun`, not the pane's existence — the Predict tab
      // can be open before any run has asked, and `panes` used to make that state look like a hold
      // forever (the watch loop then never fired again).
      gateHolding: gate.holding,
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
  }, [watchOn, code, passStatus, isRunning, gate.holding, selectedId, currentLesson]);
  // The phone bar's two actions both open the code first: a run's output and a prediction are
  // about the editor, and starting one from the prose should land on the screen that shows it.
  const phoneRun = () => {
    choosePhoneSurface('code');
    gate.requestRun(codeRef.current, currentLesson);
  };
  const phonePredict = () => {
    choosePhoneSurface('code');
    openPredictView();
  };
  /** The chooser's props, shared by the desktop rail and the phone sheet (`runner/LessonChooserRail.tsx`). */
  const chooser = {
    lessons: PYTHON_LESSONS,
    filteredLessons,
    trackFilter,
    onTrackFilter: setTrackFilter,
    searchQuery,
    onSearchQuery: setSearchQuery,
    currentId: selectedId,
    verifiedLessons,
    completedLessons,
    onSelect: (id: string) => selectLesson(id),
  };

  // The two outputs are panes now, not a block under the code: the tab strip decides whether one is
  // on screen, and the body splits beside the editor when the learner asks for it. Each view is
  // always mounted and a pane that is not showing is `display:none` - that is what keeps exactly one
  // `pre-actual-stdout` in the page, readable by a test or a screen reader, without selecting the tab.
  // The verdict belongs to the run, not to the output tab: it presses Run and needs to see what came
  // back without opening a pane. The six states are the same spans that used to sit in the output
  // card's header; they live beside the run controls now, where every preset that shows the editor
  // can see them (Write included).
  /**
   * The prediction gate, as an editor pane (`predictGate.ts`).
   *
   * It is a view rather than a block above the code because a guess is read against the code
   * that has to print it: side by side or stacked, like the run output and the expected text.
   * Pressing Predict opens it; a first Run with no commit opens it and holds the run.
   */
  // The learner's own plan for this problem (`workflow.ts`), drawn as ordered cards. It is an
  // output view like Run output: one tab press away, splittable beside the code, and mounted only
  // while the editor shows, so the Read preset pays nothing for it.
  const workflowPane = (
    <WorkflowPanel
      lessonId={selectedId}
      lessonTitle={currentLesson.title}
      onOpenLesson={selectLesson}
      onOpenProjectPart={onOpenProjectPart}
      onOpenRequirement={onOpenRequirement}
    />
  );

  const actualOutputPane = (
<div data-testid="results-panel" className="flex h-full min-h-0 flex-col bg-panel border border-line rounded-xl p-4">
    <div className="mb-2 flex items-center justify-between">
      <span className="text-xs font-mono text-muted">
        Actual Python Output (`stdout` / `assert`)
      </span>
    </div>
    <pre
      data-testid="pre-actual-stdout"
      className="p-3 rounded-lg bg-canvas border border-line-soft font-mono text-xs text-ink whitespace-pre-wrap min-h-[120px]"
    >
      {stdout || (stderr ? '' : 'Click "Run & Verify Output" to execute this lesson.')}
      {stderr && <span className="text-rose block mt-1">{stderr}</span>}
    </pre>
  </div>
  );

  // A failed run's diagnosis sits under the panes, not inside one: pressing Run should show why the
  // program broke without a tab hunt, and the card pays for this height only when a run failed. The
  // one affordance for a learner who is stuck rather than wrong yet is the same block — a message a
  // person can answer — and it is absent after a pass, because a report about a run that worked is
  // not a question.
  const runFeedback =
    passStatus !== 'untested' && passStatus !== 'passed' ? (
      <div data-testid="run-feedback" className="space-y-2 border-t border-line-soft px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span style={{ color: 'var(--dim)' }}>
            Stuck on this one? Turn the run into a message you can send.
          </span>
          <button
            onClick={() => setHelpOpen(true)}
            data-testid="btn-ask-help"
            title="Build a report of this run — the lesson, your code, what the check said and the error — to copy or file as an issue"
            className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2 py-1 text-body hover:bg-raise cursor-pointer"
          >
            <LifeBuoy className="h-3.5 w-3.5" />
            <span>Ask for help</span>
          </button>
        </div>
        {parsedFailure && (
          <TracebackCard
            failure={parsedFailure}
            entry={errorEntry}
            onRevealLine={(line) => guideEditorRef.current?.revealLine(line)}
          />
        )}
      </div>
    ) : null;

  const expectedOutputPane = (
<div data-testid="expected-panel" className="flex h-full min-h-0 flex-col bg-panel border border-line rounded-xl p-4">
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
  );

  const runnerToolbar = (
    <RunnerToolbar
      layout={layout}
      onChooseLayout={chooseLayout}
      dockChoice={dockChoice}
      onFlipDock={flipDock}
      isRunning={isRunning}
      pauseCapable={pauseCapable}
      paused={Boolean(pausedStep)}
      onPause={pauseExecution}
      onStop={() => stopExecution()}
      onMoreOpenChange={setMoreOpen}
      onShowTrace={() =>
        commitPanes(
          slotFor(panes, 'trace') !== null ? showView(panes, 'trace') : splitPane(panes, 'trace')
        )
      }
      runButtonRef={runButtonRef}
      onRun={() => {
        const lesson =
          PYTHON_LESSONS.find((l) => l.id === lessonIdRef.current) || PYTHON_LESSONS[0];
        gate.requestRun(codeRef.current, lesson);
      }}
      predictRecord={gate.record}
      onPredict={gate.open}
      predictPaneOpen={resultsAllowed && visibleViews(panes).includes('predict')}
      isCurrentSelfMarked={isCurrentSelfMarked}
      onToggleSelfMarked={() => toggleLessonSelfMarked(currentLesson.id)}
      onResetStarter={() => {
        commitCode(currentLesson.starterCode);
        // Back on the starter is the one edit that means "forget this one".
        saveDraft(currentLesson.id, currentLesson.starterCode);
        setPassStatus('untested');
        setBehaviorCheck('untested');
        setOutputCheck('untested');
        setInstructorError('');
      }}
      onResetRuntime={resetRuntime}
      onLoadSolution={() => {
        commitCode(currentLesson.fullSolution);
        logEvent({ kind: 'solution_open', lesson: selectedId });
        // The diff's solution reference is earned by opening it (or by passing), so this is the
        // moment it becomes reachable for this lesson.
        comparison.useSolution();
      }}
      onFormat={() => void formatCode()}
      draftHistory={comparison.history}
      historyOpen={comparison.historyOpen}
      onToggleHistory={comparison.toggleHistory}
      breakpoints={breakpoints}
      breakpointsOpen={breakpointsOpen}
      onToggleBreakpoints={() => setBreakpointsOpen((open) => !open)}
      diffOpen={comparison.diffOpen}
      onToggleDiff={comparison.toggleDiff}
      onShare={share.share}
      onPair={() => setPairOpen(true)}
      pair={pair}
      coEdit={coEdit}
      vimOn={vim.on}
      onToggleVim={vim.toggle}
      watchOn={watchOn}
      onToggleWatch={() => setWatchOn(setWatch(!watchOn))}
    />
  );

  return (
    <div
      className={
        phoneStudy
          ? 'relative isolate space-y-5 pb-[calc(4.75rem+env(safe-area-inset-bottom))]'
          : 'relative isolate space-y-5'
      }
    >
      <LessonAmbience />
      {/* The coach mark, then the chip, before anything else on the page: the tour is about this
          screen, and a card that arrives below the fold is a card that arrives late. */}
      {tourActive && (
        <FirstRunTour
          index={tourState.stepIndex}
          step={tourStep}
          passedFirstTry={tourFacts.runFinished && tourFacts.passed}
          onNext={() => signalTour('next')}
          onSkipStep={() => signalTour('skip-step')}
          onDismiss={() => signalTour('dismiss')}
        />
      )}
      {tourChip && !tourActive && (
        <div
          data-testid="tour-chip"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] border px-3.5 py-2.5 text-[12.5px]"
          style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--panel)', color: 'var(--body)' }}
        >
          <span>
            {tourChip.resume
              ? `${resumeLabel(tourState)} — pick up where you left off.`
              : 'New here? The first-lesson tour is six steps and about two minutes.'}
          </span>
          <button
            type="button"
            onClick={() => startTour(tourChip.resume ? 'resume' : 'restart')}
            data-testid="btn-tour-start"
            className="min-h-[44px] rounded border px-2.5 py-1 text-[12px] font-semibold sm:min-h-0"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)', backgroundColor: 'var(--accent-soft)' }}
          >
            {tourChip.resume ? 'Resume' : 'Take the tour'}
          </button>
          <button
            type="button"
            onClick={() => setTourChip(null)}
            aria-label="Dismiss the tour offer"
            data-testid="btn-tour-chip-dismiss"
            className="ml-auto grid h-11 w-11 place-items-center rounded border sm:h-8 sm:w-8"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            ×
          </button>
        </div>
      )}

      <RunnerRuntimeStrip
        pyodideStatus={pyodideStatus}
        runtimeBoot={runtimeBoot}
        readyMs={readyMs}
        verifiedCount={verifiedCount}
        completedCount={completedCount}
        lessonCount={PYTHON_LESSONS.length}
        offline={offline}
        onTakeOffline={takeOffline}
      />
      {showFirstGuide && isPhone && !guideOpen && (
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          data-testid="btn-guide-open"
          className="flex w-full items-center gap-2 rounded-xl border border-emerald/50 bg-emerald/10 px-3 py-2.5 text-left text-[12.5px] text-body cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            First time here? The loop in three steps — starter, predict, finish line.
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        </button>
      )}

      {showFirstGuide && (!isPhone || guideOpen) && (
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
              {/* An `h2`, not an `h3`: the page's only `h1` is the site title, so a lesson card is the
                  next level down. `h3` skipped a level, which Lighthouse's `heading-order` audits. */}
              <h2 className="text-base font-bold text-ink mt-1">
                {currentLesson.id === 'P.1'
                  ? 'One editor, one button, one red line.'
                  : 'This starter, its first check, and the finish line.'}
              </h2>
              <p className="text-xs text-body mt-1 max-w-3xl">
                {currentLesson.id === 'P.1'
                  ? 'This page is the whole lesson. Nothing to install and nothing else to read: change a line, press Run, and let the red line tell you what to fix.'
                  : `This brief is only for ${currentLesson.id}. It names the first hole, the first check, and what a finished run prints; the editor and the red line do the rest.`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {isPhone && (
                <button
                  onClick={() => setGuideOpen(false)}
                  data-testid="btn-guide-collapse"
                  className="px-2.5 py-1 rounded text-[12.5px] font-mono text-muted hover:text-ink border border-line cursor-pointer"
                >
                  Hide steps
                </button>
              )}
              <button
                onClick={dismissFirstGuide}
                data-testid="btn-guide-dismiss"
                className="px-2.5 py-1 rounded text-[12.5px] font-mono text-muted hover:text-ink border border-line cursor-pointer"
              >
                {currentLesson.id === 'P.1'
                  ? 'I have done this before — hide'
                  : "Hide this lesson's guide"}
              </button>
            </div>
          </div>

          <ol className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <li className="bg-canvas border border-line-soft rounded-lg p-3">
              <div className="text-[11px] font-mono text-accent">1 · THE STARTER</div>
              <p className="text-xs text-body mt-1.5 break-words">
                {coach.holeCount === 0 ? (
                  <>The starter is complete; the checks decide whether its behaviour is right.</>
                ) : coach.openHole ? (
                  <>
                    This starter leaves{' '}
                    <b>
                      {coach.holeCount} {holeNoun}
                    </b>
                    . Start with: <code>{coach.openHole}</code>
                  </>
                ) : (
                  <>
                    All <b>{coach.holeCount} {holeNoun}</b> are written. The checks decide whether the
                    behaviour is right.
                  </>
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
                className="mt-2 px-2.5 py-1 rounded text-[12.5px] font-mono bg-accent/15 hover:bg-accent/25 text-accent border border-accent/40 cursor-pointer"
              >
                Show me the editor
              </button>
            </li>

            <li className="bg-canvas border border-line-soft rounded-lg p-3">
              <div className="text-[11px] font-mono text-emerald">2 · PREDICT, THEN RUN</div>
              <p className="text-xs text-body mt-1.5 break-words">
                Run it untouched. The first Run asks what {coach.isExercise ? 'a finished run' : 'it'}{' '}
                will print — a guess is enough, and <b>Skip and run</b> is allowed. The first check is:{' '}
                <b>{coach.check}</b>
              </p>
              <p className="text-[11px] text-muted mt-1">
                The red line names the value it expected and the value your code produced.
              </p>
              <button
                onClick={() => gate.requestRun(codeRef.current, currentLesson)}
                disabled={isRunning}
                data-testid="btn-guide-run"
                className="mt-2 px-2.5 py-1 rounded text-[12.5px] font-mono font-bold bg-emerald hover:bg-emerald-strong text-inverse disabled:opacity-50 cursor-pointer"
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
              <p className="text-xs text-body mt-1.5 break-words" data-testid="guide-finish">
                {hasRunThisSession ? (
                  <>
                    When every check passes, it prints: <code>{coach.finish}</code>
                  </>
                ) : (
                  <>
                    The finish line is the <b>Expected Output</b> beside your run: reach it and every
                    check passes. It stays out of this card until you have run, because the gate is
                    about to ask you what it says.
                  </>
                )}
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
                className="mt-2 px-2.5 py-1 rounded text-[12.5px] font-mono bg-amber/15 hover:bg-amber/25 text-amber-strong border border-amber/40 disabled:opacity-50 cursor-pointer"
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
                ) : guideHoleUnfilled ? (
                  <>
                    That is the hole the starter leaves — the <code>raise</code> is its marker, not a
                    mistake you wrote. Replace it with the code the message describes and press{' '}
                    <b>Run &amp; Verify Output</b> again.
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

      {/* The chooser is a rail, not a third column of the work area: the entries stay one click
          away while the lesson text and the editor share the width the chooser used to take. Read,
          Write and Debug hide it, because each of them is about one panel and nothing else. */}
      <div className={`grid grid-cols-1 gap-5 ${shownLayout === 'study' ? studyGridColumns(chooserFold.folded) : ''}`}>
        {shownLayout === 'study' && (
          <LessonChooserRail
            chooser={chooser}
            folded={chooserFold.folded}
            onToggle={chooserFold.toggle}
            count={filteredLessons.length}
          />
        )}

        <div ref={splitContainerRef} data-focus-expand className="space-y-4">
          {/* The phone's lesson strip: the title, the two doors (Lessons, Details) and the study
              clock, in about a tenth of the card the desktop brief takes. The full brief is still
              one tap away; it is not the first thing between a learner and the paragraph. */}
          {isPhone && !phoneCode && (
            <div
              data-tour="lesson-brief"
              data-testid="phone-lesson-strip"
              className="space-y-2 rounded-xl border border-line bg-panel p-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-accent">Lesson {currentLesson.id}</div>
                  <h2
                    data-testid="lesson-title"
                    className="truncate text-[14px] font-bold text-ink"
                    title={currentLesson.title}
                  >
                    {currentLesson.title}
                  </h2>
                </div>
                {currentSpineStep && (
                  <span className="shrink-0 font-mono text-[10.5px] text-muted">
                    {stepCostLabel(currentSpineStep)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLessonSheetOpen(true)}
                  data-testid="btn-lessons"
                  className="btn min-h-[44px] min-w-0 flex-1 justify-between gap-2 px-2.5 text-[12.5px]"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <BookOpen className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="truncate">Lessons</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">
                      {filteredLessons.length}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhoneBriefOpen((open) => !open)}
                  data-testid="btn-brief-toggle"
                  aria-expanded={phoneBriefOpen}
                  className="btn min-h-[44px] shrink-0 px-2.5 text-[12.5px]"
                >
                  {phoneBriefOpen ? 'Hide' : 'Details'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <StudyTimerRow lessonId={selectedId} compact />
              </div>
            </div>
          )}

        {/* The lesson text, the editor and everything that reports on it. Only these three are the
            preset's grid: the lesson card above describes all of them, and the run banners
            between belong to the run, not to a column. */}

          {/* The phone's Code surface has no room for the full brief above the editor. This strip
              keeps the two things a coder needs there — the lesson chooser and the study clock —
              and leaves the prose one tap away. */}
          {phoneCode && (
            <div data-testid="phone-code-strip" className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLessonSheetOpen(true)}
                  data-testid="btn-lessons-code"
                  className="btn min-h-[44px] min-w-0 flex-1 justify-between gap-2 px-3 text-[13px]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <BookOpen className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="truncate">Lessons · {selectedId}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => choosePhoneSurface('lesson')}
                  data-testid="btn-read-lesson"
                  className="btn min-h-[44px] shrink-0 px-3 text-[13px]"
                >
                  Read lesson
                </button>
              </div>
              <details
                data-testid="phone-clock-details"
                className="rounded-xl border border-line bg-panel px-3 py-2"
              >
                <summary className="cursor-pointer font-mono text-[12px] text-muted">
                  Study clock &amp; hours
                </summary>
                <StudyTimerRow lessonId={selectedId} />
              </details>
            </div>
          )}

          {/* Active Lesson Metadata Card. `data-tour` names it for the first-run tour's second step
              (`app/src/tour.ts`), and `scripts/test_tour.mjs` fails if the name goes away. */}
          <div
            data-tour={isPhone ? undefined : 'lesson-brief'}
            data-testid="lesson-brief"
            className={`bg-panel border border-line rounded-xl p-4 ${
              phoneCode || (isPhone && !phoneBriefOpen) ? 'hidden' : ''
            }`}
          >
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
                  <span
                    className="hidden max-w-[16rem] truncate sm:inline sm:max-w-[22rem]"
                    title={currentLesson.path}
                  >
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
                    title="The lesson text is the pane on this screen. The GitHub page remains for copying, printing and filing an issue; nothing you type is saved there."
                    className="hidden whitespace-nowrap text-muted underline underline-offset-2 hover:text-accent sm:inline"
                  >
                    View source on GitHub ↗
                  </a>
                  {isCurrentVerified && (
                    <span className="text-emerald font-semibold whitespace-nowrap">
                      Executed &amp; Passed (WASM)
                    </span>
                  )}
                  {/* The 224 px chooser rail needs `lg`, and a phone's strip needs `md` to be
                      absent: between them a tablet had no door to the lesson list at all. This is
                      that door, and it opens the same sheet the phone uses. */}
                  <button
                    type="button"
                    onClick={() => setLessonSheetOpen(true)}
                    data-testid="btn-lessons-tablet"
                    className="hidden items-center gap-1 whitespace-nowrap rounded border border-line bg-canvas px-2 py-0.5 text-[11px] font-semibold text-body hover:text-ink cursor-pointer md:inline-flex lg:hidden"
                  >
                    <BookOpen className="h-3 w-3" aria-hidden="true" />
                    Lessons
                  </button>
                </div>
                <h2
                  data-testid={isPhone ? undefined : 'lesson-title'}
                  className="text-base font-bold text-ink mt-1"
                >
                  {currentLesson.title}
                </h2>
              </div>

              {editorShown ? null : runnerToolbar}
            </div>

            {/* The visible half of the sitting clock: Start/Resume and Log & reset, so an hour of
                reading the lesson is something the learner can file on purpose instead of hoping
                the automatic sitting caught it. The hours land in the same store Today reads. On a
                phone the compact strip above this card already carries it, and two clocks on one
                screen would count the same stretch twice. */}
            {!isPhone && <StudyTimerRow lessonId={selectedId} />}

            {/* The Share button's answer. A polite status, not an alert: it is a confirmation of
                something the learner just asked for, and pressing Share twice must not trap them. */}
            {/* Format's answer: the file was tidied, it already was, or why not. A formatter that
                silently did nothing would leave the learner diffing their own file to find out. */}
            {formatStatus.kind !== 'idle' && (
              <p
                role="status"
                data-testid="format-status"
                data-format-state={formatStatus.kind}
                className="mt-2 text-[12px] leading-relaxed"
                style={{
                  color: formatStatus.kind === 'failed' ? 'var(--rose)' : 'var(--body)',
                }}
              >
                {formatStatus.kind === 'working' && 'Formatting with Black… (it installs once)'}
                {formatStatus.kind === 'done' &&
                  (formatStatus.changed
                    ? 'Formatted with Black — ⌘Z puts it back.'
                    : 'Already tidy: Black changed nothing.')}
                {formatStatus.kind === 'failed' && formatStatus.message}
              </p>
            )}

            {share.status.kind !== 'idle' && (
              <p
                role="status"
                data-testid="share-status"
                className="mt-2 rounded-lg border border-line-soft bg-panel px-3 py-2 text-[12px] leading-relaxed"
                style={{ color: 'var(--body)' }}
              >
                {share.status.kind === 'copied' && (
                  <>
                    Link copied — {share.status.characters} characters, this lesson and your code. It is
                    encoded in the link, not encrypted: send it only where you would send the file.
                  </>
                )}
                {share.status.kind === 'no-code' && (
                  <>The editor matches nothing yet, so there is nothing to send. Type your attempt first.</>
                )}
                {share.status.kind === 'too-long' && (
                  <>
                    This link would be {share.status.characters} characters, and chat and mail cut off
                    around {MAX_SHARE_URL}. Trim the file (or share the Diff) and press Share again.
                  </>
                )}
                {share.status.kind === 'loaded' && <>Loaded the shared code into the editor.</>}
                {share.status.kind === 'failed' && (
                  <>
                    Could not copy automatically. Select this link instead:{' '}
                    <code className="break-all" data-testid="share-url">
                      {share.status.url}
                    </code>
                  </>
                )}
              </p>
            )}

            {/* Scratch: a lesson page's block, opened from its **Try this in the workbench** link. It
                is not the learner's draft and it is never graded, and the card says both before they
                press Run - a snippet that quietly counted as an attempt would be a verdict on code
                they did not write. `bg-canvas` rather than a tint of the amber, because body text on
                the canvas is a pair the theme suite already measures in all four palettes. */}
            {scratch && (
              <div
                data-testid="scratch-banner"
                className="mt-2 rounded-lg border border-amber/40 bg-canvas px-3 py-2.5"
              >
                <p className="eyebrow">Scratch · the page's snippet</p>
                <p className="mt-1 text-[12.5px]" style={{ color: 'var(--body)' }}>
                  This is the block from the lesson page, not your draft for {selectedId}. Runs here
                  are ungraded: nothing is verified and nothing is saved, and your own draft is still
                  where you left it — so anything you type here is discarded when you go back.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={endScratch}
                    data-testid="btn-end-scratch"
                    className="btn px-2.5 py-1.5 text-[12px]"
                  >
                    Back to my draft
                  </button>
                </div>
              </div>
            )}

            {/* An attempt from a pair session, or a shared link: offered, never applied. */}
            <AttemptOffers
              lessonId={selectedId}
              pairAttempt={pairAttempt}
              sharedAttempt={sharedAttempt}
              onLoadPair={loadPairAttempt}
              onOpenPairLesson={selectLesson}
              onDismissPair={() => setPairAttempt(null)}
              onLoadShared={loadSharedAttempt}
              onDismissShared={onDismissShared}
            />
            {/* The versions behind the draft (`runner/DraftHistoryPanel.tsx`). */}
            <DraftHistoryPanel
              open={comparison.historyOpen}
              history={comparison.history}
              onClear={comparison.clear}
              onRestore={comparison.restore}
            />
            {/* The dots and their conditions (`runner/BreakpointPanel.tsx`). */}
            <BreakpointPanel
              open={breakpointsOpen}
              breakpoints={breakpoints}
              onSetCondition={setConditionAt}
              onToggle={toggleBreakpointAt}
            />

            {/* The learner's own change, line by line (`runner/DiffPanel.tsx`). */}
            <DiffPanel comparison={comparison} />

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
              onGrade={() => gate.requestRun(codeRef.current, currentLesson)}
            />
          )}
          {currentHarness && currentLesson.id !== '08.1' && (
            <LessonHarnessPanel
              harness={currentHarness}
              report={harnessReport}
              grading={isRunning}
              onGrade={() => gate.requestRun(codeRef.current, currentLesson)}
            />
          )}

          {/* Progressive 3-Step Hint Ladder */}
          {currentLesson.hints.length > 0 && (
            <div data-tour="hint-ladder" className="bg-panel border border-line rounded-xl p-4">
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
                    className="px-2.5 py-1 rounded text-xs font-mono bg-amber/15 hover:bg-amber/25 text-amber-strong border border-amber/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
          {/* Where the interpreter is, while it is there (`runner/PausedBar.tsx`). */}
          {pausedStep && (
            <PausedBar
              step={pausedStep}
              runSource={runCodeRef.current || code}
              helperFiles={helperFiles}
              pauseCapable={pauseCapable}
              onAnswer={answerPause}
              watchDraft={watchDraft}
              onWatchDraft={setWatchDraft}
              onSubmitWatch={submitWatch}
              watchError={watchError}
              onRemoveWatch={removeWatched}
              frameEdit={frameEdit}
              onFrameEdit={handleFrameEdit}
              frameEditError={frameEditError}
              onApplyFrameEdit={applyFrameEdit}
            />
          )}

          <div
            data-layout={shownLayout}
            // Which edge the results are on in Debug, and the lesson text in Study. The CSS places
            // the panels by column (`index.css`), because a dock is a side, not a visibility.
            data-dock={dock.results}
            data-lesson-dock={dock.lesson}
            // The split ratio is a custom property, not a `grid-template-columns`, because the
            // column layout only exists from `2xl` up: below it the two panels stack, which is what
            // keeps a 390 px Debug preset from being two 170 px columns and keeps a lesson figure
            // at its full width in Study. `index.css` reads the property inside its own query.
            style={
              layoutArrangement(shownLayout) === 'columns'
                ? ({ '--split-cols': splitGridTemplate(splitRatio, resultsSide) } as React.CSSProperties)
                : undefined
            }
            className={
              layoutArrangement(shownLayout) === 'columns'
                ? 'grid grid-cols-1 gap-4 2xl:grid-cols-2 items-start'
                : layoutArrangement(shownLayout) === 'workbench'
                  ? 'flex flex-col gap-4 2xl:grid 2xl:grid-cols-2 2xl:items-start'
                  : 'space-y-4'
            }
          >
            {/* Code first in the DOM; `2xl` still places the cards by column (`runner/README.md`). */}
            {/* The editor surface, one home (`runner/RunnerEditorCard.tsx`). */}
            <RunnerEditorCard
              surface={{
                panelRef: editorPanelRef,
                phoneCode,
                editorShown,
                resultsAllowed,
                phoneEditorVisible,
                isPhone,
                deferPhoneEditor,
                layout: shownLayout,
              }}
              draft={{
                code,
                commitCode,
                mainEditorRef: guideEditorRef,
                helperEditorRef,
                helperFiles,
                openHelper,
                onOpenHelper: setOpenHelper,
                pendingJump,
                onClearJump: () => setPendingJump(null),
                symbolMiss,
                sliderCount,
                vim: { on: vim.on, mode: vim.mode, onMode: vim.setMode },
                lesson: { id: selectedId, question: writeQuestion, goal: currentLesson.goal },
                onSliderCommit: handleSliderCommit,
                getAnalysis: getReadyAnalysis,
                onGoToDefinition: goToDefinition,
                onRunCell: runCellTo,
                breakpoints: { entries: breakpoints, onToggle: toggleBreakpointAt, onMoved: followBreakpointEdits },
              }}
              panes={{ value: panes, onPanes: commitPanes }}
              gate={gate}
              run={{ isRunning, passStatus, harnessResult, asksForFinish: gateAsksForFinish }}
              slots={{
                toolbar: runnerToolbar,
                feedback: runFeedback,
                actualOutputPane,
                expectedOutputPane,
                workflowPane,
                tracePane: (
                  <TracePanel
                    trace={trace}
                    step={traceStep}
                    onStep={setTraceStep}
                    source={runCodeRef.current || code}
                    onReveal={showMainLine}
                  />
                ),
              }}
              nextChapter={
                nextLesson
                  ? {
                      label: `Next: ${nextLesson.id}`,
                      title: `Go to ${nextLesson.id}: ${nextLesson.title}`,
                      onOpen: () => selectLesson(nextLesson.id),
                    }
                  : null
              }
              collab={{ coEdit, collabNotice, peerLabel: pair.peer }}
              onClosePredict={() => commitPanes(closeView(panes, 'predict'))}
            />

            {/* Write and Debug do not read: the pane is not rendered at all there, so a hidden
                preset costs no fetch and no place to lose. Coming back restores the lesson's
                heading from the store, because unmounting flushed it. */}
            {layoutShows(shownLayout, 'lesson') && (
              <LessonReader
                lessonId={selectedId}
                // The registry's own page for this entry: a lesson's Markdown, or the module that
                // set an exercise. '' means the entry has no prose page, and the pane says so.
                path={currentLesson.readerPath}
                tall={shownLayout === 'read'}
                onJumpToEditor={jumpToEditor}
                // Hidden, not unmounted: the phone's Code surface must return to the paragraph the
                // reader was on, and the page's own request is not free.
                hidden={!phoneLessonVisible}
                scope={shownLayout === 'study' ? 'study' : 'full'}
              />
            )}

          {/* Everything that reports on the editor (`runner/ResultsColumn.tsx`). */}
          <ResultsColumn
            split={{
              side: resultsSide,
              visible: phoneEditorVisible,
              columns: layoutArrangement(layout) === 'columns',
              ratio: splitRatio,
              dragging: draggingSplit,
              onBeginDrag: beginSplitDrag,
              onMoveDrag: moveSplitDrag,
              onEndDrag: endSplitDrag,
              onCommitRatio: commitSplitRatio,
            }}
            checks={{
              lintNotes,
              analysisNotice,
              lessonId: selectedId,
              onOpenWorkflow: openWorkflowTab,
              assessmentRef: guideAssessmentRef,
              behaviorCheck,
              outputCheck,
              outputMatchMode,
              exactFormatting: !lessonDowngradesFormatting,
              instructorTestSummary: currentLesson.instructorTestSummary,
              checkFailures,
              revealedHints,
              hintCount,
              onRevealHint: revealHint,
              instructorError,
              passStatus,
              harnessResult,
            }}
            scope={{
              series: scopeSeries,
              pinned: pinnedScope,
              onPin: () => setPinnedScope(scopeSeries),
              onUnpin: () => setPinnedScope(null),
            }}
          />
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
          prediction: gate.record,
        })}
      </p>

      {showPassToast && passStatus === 'passed' && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 sm:bottom-6"
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
              <p className="text-[12px]" style={{ color: 'var(--dim)' }}>
                Behavioural checks and output both green
              </p>
            </div>
            {nextLesson && (                <button
                onClick={() => selectLesson(nextLesson.id)}
                className="btn btn-primary px-3 py-1.5 text-[13px]"
              >
                Next lesson →
              </button>
            )}
          </div>
        </div>
      )}
      {/* The phone's one row of Study controls. Fixed, because the Run button being a scroll away
          is the bug the whole surface split exists to fix; hidden while a sheet is open, because
          the sheet owns the screen (`index.css`). */}
      {phoneStudy && (
        <div
          data-testid="phone-bar"
          data-phone-bar="1"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 shadow-[var(--shadow-lg)] backdrop-blur md:hidden"
        >
          <div className="mx-auto flex max-w-[640px] items-center gap-1.5 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
            <div
              role="group"
              aria-label="Study surface"
              className="flex shrink-0 rounded-lg border border-line bg-canvas p-0.5"
            >
              <button
                type="button"
                data-testid="phone-surface-lesson"
                aria-pressed={phoneSurface === 'lesson'}
                onClick={() => choosePhoneSurface('lesson')}
                className={`min-h-[40px] rounded-md px-2.5 text-[12.5px] font-semibold cursor-pointer ${
                  phoneSurface === 'lesson'
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Lesson
              </button>
              <button
                type="button"
                data-testid="phone-surface-code"
                aria-pressed={phoneSurface === 'code'}
                onClick={() => choosePhoneSurface('code')}
                className={`min-h-[40px] rounded-md px-2.5 text-[12.5px] font-semibold cursor-pointer ${
                  phoneSurface === 'code' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink'
                }`}
              >
                Code
              </button>
            </div>
            {isRunning ? (
              <button
                type="button"
                data-testid="btn-phone-stop"
                onClick={() => stopExecution()}
                className="btn min-h-[44px] flex-1 gap-1.5 border-rose/60 bg-rose/15 px-3 text-[13px] font-bold text-rose"
              >
                <OctagonX className="h-4 w-4" aria-hidden="true" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-phone-run"
                onClick={phoneRun}
                className="btn btn-primary min-h-[44px] flex-1 gap-1.5 px-3 text-[13px] font-bold"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Run
              </button>
            )}
            <button
              type="button"
              data-testid="btn-phone-predict"
              onClick={phonePredict}
              disabled={isRunning}
              aria-label="Predict what this program prints"
              title="Predict first: commit to what this will print, then run it"
              className="btn min-h-[44px] min-w-[44px] shrink-0 gap-1.5 px-2.5 text-[12.5px]"
            >
              <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="hidden min-[380px]:inline">Predict</span>
            </button>
          </div>
        </div>
      )}

      <Sheet
        open={lessonSheetOpen}
        onClose={() => setLessonSheetOpen(false)}
        title="Lessons & exercises"
        testId="lesson-sheet"
        size="lg"
      >
        <div className="p-2"><LessonChooser {...chooser} maxHeight="none" /></div>
      </Sheet>

      {helpOpen && <HelpSheet input={helpInput} onClose={() => setHelpOpen(false)} />}
      {pairOpen && (
        <PairSheet
          session={pair}
          lesson={selectedId}
          code={runCodeRef.current || code}
          coEdit={coEdit}
          collabInvite={collabInvite}
          collabNotice={collabNotice}
          onStartCoEdit={startCoEdit}
          onAcceptCoEdit={acceptCoEdit}
          onDeclineCoEdit={declineCoEdit}
          onStopCoEdit={() => stopCoEditLocally('left')}
          onClose={() => setPairOpen(false)}
        />
      )}
    </div>
  );
};
