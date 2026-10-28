import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PYTHON_LESSONS, PythonLessonItem } from '../../data/pythonLessonsData';
import { MECHALAB_PLANT_FILENAME, MECHALAB_PLANT_PY } from '../../data/mechalabPlant';
import { asOutputMatchMode, compareStdout, OutputMatchMode } from '../../outputMatch';
import { coachForLesson, starterHoles } from '../../lessonCoach';
import { failingChecks, hintCountFor, hintLock, nextRung, rungAnswersCheck } from '../../checkHints';
import { entryHeadline, matchError } from '../../errorIndex';
import { failureSummary, isAssertionFailure, parseFailure } from '../../traceback';
import { TracebackCard } from '../TracebackCard';
import { HelpSheet } from '../HelpSheet';
import type { HelpReportInput } from '../../helpReport';
import { PairSheet } from '../PairSheet';
import { usePairSession } from '../../usePairSession';
import { attemptLines, lessonLabel } from '../../pairing';
import { COLLAB_MAX_TEXT, CollabText, fromWire, type CollabOp } from '../../collab';
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
import { LessonReader } from '../LessonReader';
import { LessonChooser, type TrackFilter } from '../LessonChooser';
import { FirstRunTour } from '../FirstRunTour';
import {
  layoutForStep,
  reduceTour,
  stepAt,
  type TourFacts,
  type TourSignal,
  type TourState,
} from '../../tour';
import { readTour, resumeLabel, tourOffer, writeTour } from '../../tourState';
import { playCue } from '../../audio/facade';
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
import { isEdited, readDraft, readDrafts, saveDraft } from '../../lessonDraft';
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
  diffSameMessage,
  resolveDiffReference,
  runTarget,
  type DiffTarget,
} from '../../diffReference';
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
import { VIM_LABEL, readVim, vimHint, vimModeLabel, writeVim } from '../../vimMode';
import { runAnnouncement } from '../../announce';
import { MAX_SHARE_URL, shareUrl, type SharedAttempt } from '../../shareLink';
import { inlineValuesFor, readRunValues } from '../../inlineValues';
import {
  TRACE_NAME_CAP,
  TRACE_STEP_CAP,
  TRACE_VALUE_CHARS,
  readTrace,
  type TraceSnapshot,
} from '../../runTrace';
import { TracePanel } from '../TracePanel';
import { MAIN_FILE_NAME, helperFilesForLesson } from '../../lessonFiles';
import { findDefinition } from '../../symbolIndex';
import { cellPrefix } from '../../editor/cells';
import {
  DEFAULT_SPLIT_RATIO,
  LAYOUTS,
  SPLIT_MIN_RATIO,
  SPLIT_MAX_RATIO,
  dockControl,
  flippedDock,
  layoutArrangement,
  layoutShortcutFor,
  layoutShows,
  readDock,
  readLayout,
  readResultsSplit,
  readSplitRatio,
  splitGridTemplate,
  splitRatioAfterKey,
  splitRatioAt,
  splitRatioPercent,
  writeDock,
  writeLayout,
  writeResultsSplit,
  writeSplitRatio,
  type WorkspaceDock,
  type WorkspaceLayout,
} from '../../workspaceLayout';
import { actionForEvent, type Keymap } from '../../keymap';
import { useKeymap } from '../../useKeymap';
import { markPaintReady } from '../../paintTiming';
import { parseSliders } from '../../editor/sliderModel';
import {
  MAX_CONDITION_CHARS,
  breakpointsForRun,
  readBreakpoints,
  setBreakpointCondition,
  toggleBreakpoint,
  writeBreakpoints,
  type Breakpoint,
} from '../../editor/breakpoints';
import {
  MAX_WATCHES_PER_LESSON,
  addWatch,
  normalizeWatch,
  normalizeWatches,
  readWatches,
  removeWatch,
  writeWatches,
} from '../../editor/watches';
import type { LessonFile } from '../../lessonFiles';
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
  Pause,
  RefreshCw,
  ShieldCheck,
  Lock,
  Loader2,
  History,
  GitCompare,
  Activity,
  Share2,
  LifeBuoy,
  Users,
  Keyboard,
  CircleDot,
  Wand2,
  MoreHorizontal,
  Columns2,
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


/**
 * The text a parked line is quoted from.
 *
 * A park names its own file because a Step in can land in a helper tab or the shared plant: quoting
 * main.py's line 116 for a line of the plant would be a sentence about a different program. The
 * learner's file is the text the run executed (so an edit made while parked cannot rewrite the
 * quote), while a helper and the plant are quoted from the same copies their tabs show.
 */
function sourceForPark(
  file: string | undefined,
  runCode: string,
  helperFiles: readonly LessonFile[]
): string {
  if (!file || file === '<lesson_editor>') return runCode;
  const helper = helperFiles.find((entry) => entry.name === file);
  if (helper) return helper.content;
  // The plant is written into every run, whether or not this lesson's own text mentions it, so a
  // learner can import it anywhere and step into it there.
  return file === MECHALAB_PLANT_FILENAME ? MECHALAB_PLANT_PY : '';
}

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

/**
 * The line the interpreter is parked on, as the worker reports it.
 *
 * The values are the frame's own, formatted in the worker (`_trace_values`) exactly as the recorded
 * trace's are, so a paused line and the replay read the same way.
 */
interface PausedStep {
  line: number;
  fn: string;
  depth: number;
  values: { name: string; value: string }[];
  /** Why the interpreter parked: a gutter breakpoint, a Step, or the Pause button. */
  reason?: 'breakpoint' | 'step' | 'pause';
  /** A frame edit that was refused, in the interpreter's own words; absent when it landed. */
  edit_error?: string;
  /**
   * The file the parked line is in: `<lesson_editor>` for the learner's own document, a helper tab's
   * name, or the plant's filename. Absent from an older worker, which only ever parked in one file.
   */
  file?: string;
  /**
   * Why a conditional breakpoint would not evaluate, in the interpreter's own words.
   *
   * A condition is the learner's expression, and one that raises is a mistake in it — not a reason to
   * skip the park or to end the run. The bar says what the interpreter said, on the line it stopped
   * on, so the fix is one look away.
   */
  condition_error?: string;
  /**
   * The expressions the learner pinned, answered in this frame (`app/src/editor/watches.ts`).
   *
   * Absent when nothing is pinned. Each entry is the expression the learner wrote and either the
   * value the interpreter gave it here or the sentence it raised: a watch that cannot be evaluated in
   * this frame is a question this frame cannot answer, not a reason to end the run.
   */
  watches?: { expression: string; value?: string; error?: string }[];
  /** A watch that could not be pinned (a full bar), in the interpreter's own words. */
  watch_error?: string;
}

/**
 * How large a frame edit may be, in UTF-8 bytes.
 *
 * The shared buffer is 8 bytes of `[state, length]` plus this many bytes of payload: an expression a
 * learner types into one line, with room to spare, and small enough that the copy is never a pause.
 */
const FRAME_EDIT_BYTES = 2000;

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
  // The first-run tour (`app/src/tour.ts`, `app/src/tourState.ts`). Read once at mount: it records
  // what this browser has already been shown, and only this screen writes it back.
  const [tourState, setTourState] = useState<TourState>(() => readTour());
  // Whether *this visit* draws the coach mark, which is not the same question as what the record says.
  // A record left on step 4 means the learner closed the page mid-tour: that gets the chip, and the
  // card only comes back when they take it. Only a fresh record on step one opens by itself.
  const [tourOpen, setTourOpen] = useState<boolean>(() => {
    const stored = readTour();
    return stored.status === 'active' && stored.stepIndex === 0;
  });
  // The chip is either "new here" or "you were at step 4": the same control, two honest labels.
  const [tourChip, setTourChip] = useState<{ resume: boolean } | null>(null);
  const [isPhone, setIsPhone] = useState<boolean>(() => {
    try {
      return window.matchMedia('(max-width: 767px)').matches;
    } catch {
      return false;
    }
  });
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
  // Which of the three regions the screen gives its width to (`workspaceLayout.ts`). Read once at
  // mount: it is a preference, and a reload is the only thing that changes it from outside.
  const [layout, setLayout] = useState<WorkspaceLayout>(() => readLayout());
  // Which edge the chooser (Study) and the results (Split) sit on (`workspaceLayout.ts`). Read once
  // at mount, like the preset: it is the same kind of preference, and only this screen changes it.
  const [dock, setDock] = useState<WorkspaceDock>(() => readDock());
  const dockChoice = dockControl(dock, layout);
  const resultsSide = dock.results;
  // Split's divider, as the share of the work area the editor gets (`workspaceLayout.ts`). Read once
  // at mount like the preset itself: a drag is the only thing that changes it from outside storage.
  const [splitRatio, setSplitRatio] = useState<number>(() => readSplitRatio());
  // Whether the run's output sits beside the code or under it, inside the editor's own card. Read
  // once at mount for the same reason the preset is: this screen is the only one that changes it.
  const [resultsSplit, setResultsSplit] = useState<boolean>(() => readResultsSplit());
  const splitRatioRef = useRef<number>(splitRatio);
  splitRatioRef.current = splitRatio;
  const [draggingSplit, setDraggingSplit] = useState(false);
  /** The pointer whose drag is in flight, so a second finger on a trackpad cannot drag both ways. */
  const splitDragRef = useRef<number | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
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
  const [runAttempts, setRunAttempts] = useState<Record<string, number>>({});
  // The attempt count at the moment rung 1 was opened, per lesson. Rung 2 is the near-solution, so
  // it is earned by an attempt *after* the nudge (`checkHints.hintLock`), not by the run that was
  // already on screen when the nudge was read.
  const [hintOpenedAt, setHintOpenedAt] = useState<Record<string, number>>({});
  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
  const [shareStatus, setShareStatus] = useState<ShareStatus>({ kind: 'idle' });
  // Ask for help (`app/src/components/HelpSheet.tsx`): one report built from the run on screen.
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  // Pair study (`app/src/components/PairSheet.tsx`): a direct session with another workbench, and the
  // attempt that arrived from it. The attempt is state, never an edit — the card below asks first.
  const [pairOpen, setPairOpen] = useState<boolean>(false);
  const [pairAttempt, setPairAttempt] = useState<{ lesson: string; code: string } | null>(null);
  // Live co-editing (`app/src/collab.ts`): both pages hold the same document, and only the text that
  // changed crosses the channel. `remote` counts the edits that arrived, which is what the status
  // strip prints — a session with someone typing in it should look like one.
  const [coEdit, setCoEdit] = useState<{ lesson: string; role: 'host' | 'guest'; remote: number } | null>(null);
  // Their offer to co-edit: the text becomes the document only when this learner accepts, because
  // accepting replaces what is in their editor (`offered-never-applied`, the rule the share link and
  // the attempt card already follow).
  const [collabInvite, setCollabInvite] = useState<{ lesson: string; text: string } | null>(null);
  // Why co-editing is not running any more, when it was. One line above the editor, not a toast.
  const [collabNotice, setCollabNotice] = useState<string | null>(null);
  // The shared document itself, and the flag that keeps a peer's edit from being read as this
  // workbench's own op to broadcast back at them.
  const coEditRef = useRef<{ doc: CollabText; lesson: string } | null>(null);
  const applyingPeerRef = useRef<boolean>(false);
  const pair = usePairSession((message) => {
    if (message.kind === 'attempt') {
      setPairAttempt({ lesson: message.lesson, code: message.code });
      // Close the sheet so the card is what the learner sees: an arriving attempt is a decision, and a
      // modal in front of it would hide the thing being decided about.
      setPairOpen(false);
      return;
    }
    if (message.kind === 'collab-start') {
      setCollabInvite({ lesson: message.lesson, text: message.text });
      setCollabNotice(null);
      // The other way round from an attempt: an offer to co-edit is a decision about the editor
      // itself, and the sentence that says so belongs in the sheet that made it possible.
      setPairOpen(true);
      return;
    }
    if (message.kind === 'collab-ops') {
      const ops = fromWire(message.ops);
      if (ops) applyPeerOps(ops);
      return;
    }
    if (message.kind === 'collab-stop') {
      // Their decision, so no stop is sent back: the two sides would keep telling each other it is
      // over. Just the sentence that names what happened.
      coEditRef.current = null;
      setCoEdit(null);
      setCollabInvite(null);
      setCollabNotice(
        message.reason === 'lesson'
          ? 'Co-editing ended: they moved to another lesson.'
          : message.reason === 'declined'
            ? 'They are not co-editing this lesson right now. Your editor was not touched.'
            : 'They stopped co-editing. Your editor is yours again.'
      );
    }
  });
  const [instructorError, setInstructorError] = useState<string>('');
  // What a capstone harness grades: the metrics the learner's own functions produce.
  const [harnessReport, setHarnessReport] = useState<HarnessReport | null>(null);
  const [behaviorCheck, setBehaviorCheck] = useState<'untested' | 'passed' | 'failed'>('untested');
  const [outputCheck, setOutputCheck] = useState<'untested' | 'matched' | 'differs'>('untested');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  // Where the interpreter is parked, or null when it is not. The worker posts the step and then
  // blocks; Step, Continue and Stop are the three answers it is waiting for.
  const [pausedStep, setPausedStep] = useState<PausedStep | null>(null);
  // The value being changed while the interpreter is parked, and why the last change was refused.
  // Both belong to the park: they are dropped when it ends or when the run moves on.
  const [frameEdit, setFrameEdit] = useState<{ name: string; expression: string } | null>(null);
  const [frameEditError, setFrameEditError] = useState<string>('');
  // The lines the gutter has armed for this lesson (`app/src/editor/breakpoints.ts`). Read at mount,
  // re-read on a lesson switch, and written on every click: the store, not this state, is what a
  // reload reads back.
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>(() =>
    readBreakpoints(initialLessonId || PYTHON_LESSONS[0].id)
  );
  // The Breakpoints panel: on request only. A dot alone does not say what it is waiting for, so the
  // conditions live in one place the toolbar can open, titled with the count the gutter is drawing.
  const [breakpointsOpen, setBreakpointsOpen] = useState(false);
  // The expressions pinned in the paused bar, per lesson like the dots above: `total` is one
  // lesson's variable, so the list travels with the file it was written for.
  const [watches, setWatches] = useState<string[]>(() =>
    readWatches(initialLessonId || PYTHON_LESSONS[0].id)
  );
  // The expression being typed, and why the last one was refused: a bar already at its cap says so
  // instead of silently dropping a watch nobody asked it to drop.
  const [watchDraft, setWatchDraft] = useState<string>('');
  const [watchError, setWatchError] = useState<string>('');
  // Whether this page got a shared command word, which is what makes a park possible at all. State,
  // not `pauseRef.current`: the buffer is created when the worker is, and a ref would not re-render
  // the toolbar — the button would exist only after the learner pressed something else.
  const [pauseCapable, setPauseCapable] = useState(false);
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
  // Pause: two shared words, because a message cannot reach a worker that is parked inside Python.
  // Word 0 is the command this page writes, word 1 the status the worker sets (see the worker's
  // `pauseAt`). Null means the browser gave no SharedArrayBuffer, and then Pause is simply absent —
  // a button that cannot work is worse than one that is not offered.
  const pauseRef = useRef<SharedArrayBuffer | null>(null);
  // A change to a parked frame's values. The command word decides, the payload rides here: the same
  // `[length, bytes]` shape stdin uses, for the same reason — a message queues behind the park.
  const frameEditRef = useRef<SharedArrayBuffer | null>(null);
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
    editorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => guideEditorRef.current?.focus(), 0);
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
  // Re-read when the lesson changes, when a run ends, or when the learner forgets the list - the
  // three moments it can differ from what is on screen. Never on a keystroke: the editor's own text
  // is not what this list holds.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  // The diff panel and what it compares against. The solution is a spoiler: the view unlocks once the
  // learner has opened the solution for this lesson in this visit, or has passed the lesson.
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffTarget, setDiffTarget] = useState<DiffTarget>('starter');
  const [solutionUsed, setSolutionUsed] = useState<Record<string, boolean>>({});
  // The secondary half of the toolbar, folded away by default (`docs/PLAN-2.1a.md` §3). Closed is
  // the first screen a beginner sees; a control that is opened on purpose is read before it is used.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const draftHistory = useMemo(
    () => snapshotsFor(selectedId),
    [selectedId, passStatus, historyVersion]
  );
  // What the diff compares the editor against. A solution reference is only reachable once it is
  // earned (opened here, or the lesson is verified), so the panel cannot be used to read the answer.
  const solutionUnlocked = Boolean(verifiedLessons[selectedId]) || Boolean(solutionUsed[selectedId]);
  // Starter, the earned solution, or the code one of this lesson's filed runs started from. The module
  // owns the fallbacks: a version that a restore or the cap removed reads as the starter, and the
  // solution stays unreadable until it is earned (`app/src/diffReference.ts`).
  const diffReference = useMemo(
    () =>
      resolveDiffReference(diffTarget, {
        starter: currentLesson.starterCode,
        solution: currentLesson.fullSolution,
        solutionUnlocked,
        history: draftHistory,
      }),
    [diffTarget, currentLesson, solutionUnlocked, draftHistory]
  );
  const codeDiff = useMemo(
    () => (diffOpen ? diffLines(diffReference.code, code) : null),
    // `code` is in the deps because this is a view of the buffer: typing is the thing being diffed.
    [diffOpen, diffReference.code, code]
  );
  // A filed version belongs to one lesson, so the panel goes back to the starter when the lesson
  // changes: carrying `run:2` across a switch would describe another lesson's work.
  useEffect(() => {
    setDiffTarget('starter');
  }, [selectedId]);
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
  // Vim keys (see `app/src/vimMode.ts`): a remembered opt-in, and the mode the editor is reading keys
  // in while it is on — a badge with no mode would be the one question normal mode always raises.
  const [vimOn, setVimOn] = useState<boolean>(() => readVim());
  const [vimMode, setVimMode] = useState<string>('normal');
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
  // The run trace and the step on screen (`app/src/runTrace.ts`): a recording of the last run, replayed
  // rather than paused. Reset with the run, read from the outcome that ended it.
  const [trace, setTrace] = useState<TraceSnapshot | null>(null);
  const [traceStep, setTraceStep] = useState(0);
  // The run pinned as A: its traces stay on the axes while the next run draws over them as B, which
  // is how a parameter change is read - one `t`, both values, on the same pair of axes. Cleared when
  // the lesson changes, because a trace from another lesson is not the baseline for this one.
  const [pinnedScope, setPinnedScope] = useState<ScopeSeries[] | null>(null);


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
  const codeRef = useRef<string>(code);
  const lessonIdRef = useRef<string>(initialLessonId || PYTHON_LESSONS[0].id);
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
    // thing — "the text is now this" — and `localOps` is what turns that into characters to send.
    const shared = coEditRef.current;
    if (shared && !applyingPeerRef.current) {
      if (next.length > COLLAB_MAX_TEXT) {
        stopCoEditLocally('too-long');
      } else {
        const ops = shared.doc.localOps(next);
        if (ops.length > 0) pair.sendCollabOps(shared.lesson, ops);
      }
    }
    codeRef.current = next;
    setCode(next);
  };
  useEffect(() => {
    codeRef.current = code;
  }, [code]);
  useEffect(() => {
    lessonIdRef.current = selectedId;
  }, [selectedId]);

  /**
   * Stop co-editing on this side, and tell the other one why.
   *
   * Only a local decision sends a message — a stop that arrived is answered by clearing the state, or
   * the two sides would keep telling each other it is over. The session's own `bye` covers leaving.
   */
  const stopCoEditLocally = (reason: 'lesson' | 'left' | 'declined' | 'offline' | 'too-long') => {
    const shared = coEditRef.current;
    coEditRef.current = null;
    setCoEdit(null);
    setCollabInvite(null);
    if (shared && (reason === 'lesson' || reason === 'left')) {
      pair.sendCollabStop(shared.lesson, reason);
    }
    setCollabNotice(
      reason === 'lesson'
        ? 'Co-editing ended: this workbench moved to another lesson.'
        : reason === 'left'
          ? 'You stopped co-editing. Your editor is yours again.'
          : reason === 'declined'
            ? 'You turned down co-editing. Your editor was not touched.'
            : reason === 'too-long'
              ? `Co-editing stopped: the file passed ${COLLAB_MAX_TEXT.toLocaleString()} characters.`
              : 'The session ended, so co-editing stopped.'
    );
  };

  /**
   * Apply the other workbench's edit.
   *
   * The ops go into the shared document first, and the editor is handed the text that results: that
   * is the one write a peer's keystroke makes, and it is applied outside the undo history, so ⌘Z still
   * means "undo what I typed". A batch that changes nothing here (a duplicate the channel delivered
   * twice) does not touch the editor at all.
   */
  const applyPeerOps = (ops: CollabOp[]) => {
    const shared = coEditRef.current;
    if (!shared) return;
    let changed = 0;
    for (const op of ops) if (shared.doc.apply(op)) changed += 1;
    if (changed === 0) return;
    const next = shared.doc.text;
    if (next.length > COLLAB_MAX_TEXT) {
      stopCoEditLocally('too-long');
      return;
    }
    applyingPeerRef.current = true;
    try {
      guideEditorRef.current?.applyWithoutHistory(next);
      codeRef.current = next;
      setCode(next);
    } finally {
      applyingPeerRef.current = false;
    }
    setCoEdit((current) => (current ? { ...current, remote: current.remote + changed } : current));
  };

  /** Offer this lesson and this text as the document both of us edit — the host's side of it. */
  const startCoEdit = () => {
    if (pair.state !== 'connected' || pair.role !== 'host' || coEditRef.current) return;
    if (codeRef.current.length > COLLAB_MAX_TEXT) {
      setCollabNotice(`Co-editing needs a file under ${COLLAB_MAX_TEXT.toLocaleString()} characters.`);
      return;
    }
    if (pair.sendCollabStart(selectedId, codeRef.current) !== 'sent') {
      setCollabNotice('The offer to co-edit did not reach them — the session is not open.');
      return;
    }
    coEditRef.current = { doc: CollabText.seed(codeRef.current, 0), lesson: selectedId };
    setCoEdit({ lesson: selectedId, role: 'host', remote: 0 });
    setCollabNotice(null);
  };

  /** Take up their offer: their text becomes this document, and this editor becomes a shared one. */
  const acceptCoEdit = () => {
    const invite = collabInvite;
    if (!invite) return;
    if (invite.text.length > COLLAB_MAX_TEXT) {
      setCollabInvite(null);
      setCollabNotice(`That file is over ${COLLAB_MAX_TEXT.toLocaleString()} characters, which co-editing will not carry.`);
      return;
    }
    // The lesson first: `selectLesson` loads that lesson's draft, and doing it while a shared document
    // is live would broadcast the draft as an edit of theirs.
    if (invite.lesson !== selectedId) selectLesson(invite.lesson);
    coEditRef.current = { doc: CollabText.seed(invite.text, 1), lesson: invite.lesson };
    applyingPeerRef.current = true;
    try {
      guideEditorRef.current?.applyWithoutHistory(invite.text);
      codeRef.current = invite.text;
      setCode(invite.text);
    } finally {
      applyingPeerRef.current = false;
    }
    saveDraft(invite.lesson, invite.text);
    setCoEdit({ lesson: invite.lesson, role: 'guest', remote: 0 });
    setCollabInvite(null);
    setCollabNotice(null);
    setPairOpen(false);
  };

  /** Turn down an offer without the editor moving, and let them know rather than leave them waiting. */
  const declineCoEdit = () => {
    const lesson = collabInvite?.lesson ?? selectedId;
    setCollabInvite(null);
    pair.sendCollabStop(lesson, 'declined');
    setCollabNotice('You turned down co-editing. Your editor was not touched.');
  };

  // A shared document belongs to one lesson. Moving this workbench elsewhere ends it — and says so on
  // both screens — rather than writing the next lesson's text into a document about another one.
  useEffect(() => {
    const shared = coEditRef.current;
    if (!shared || shared.lesson === selectedId) return;
    stopCoEditLocally('lesson');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the lesson is the trigger
  }, [selectedId]);

  // A session that ends takes co-editing with it: there is no channel left to move text over, and a
  // document that still says it is shared while nothing moves is worse than a sentence saying it
  // stopped.
  useEffect(() => {
    if (pair.state === 'connected' || !coEditRef.current) return;
    stopCoEditLocally('offline');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the session state is the trigger
  }, [pair.state]);

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
        pauseRef.current = new SharedArrayBuffer(8);
        frameEditRef.current = new SharedArrayBuffer(8 + FRAME_EDIT_BYTES);
        setPauseCapable(true);
        worker.postMessage({
          type: 'init',
          interruptBuffer: interruptRef.current,
          stdinBuffer: stdinCtrlRef.current,
          pauseBuffer: pauseRef.current,
          editBuffer: frameEditRef.current,
        });
      }
    } catch {
      interruptRef.current = null;
      stdinCtrlRef.current = null;
      pauseRef.current = null;
      frameEditRef.current = null;
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

  /** Re-arms the run's watchdog when a pause is answered: the clock belongs to execution. */
  const resumeWatchdogRef = useRef<(() => void) | null>(null);

  /**
   * Ask the interpreter to stop at the next line of the learner's file.
   *
   * A request, not a command: a line boundary is the only place a `settrace` hook can park, so the
   * pause lands on the next executed line — the answer to "where is my loop now?" is the line it is
   * about to run, which is the line the learner is reading.
   */
  const pauseExecution = () => {
    const buffer = pauseRef.current;
    if (!buffer || !isRunning || pausedStep) return;
    const view = new Int32Array(buffer, 0, 2);
    Atomics.store(view, 0, 1);
    Atomics.notify(view, 0);
  };

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

  /**
   * Change one of the parked frame's values, and stay parked.
   *
   * The expression is evaluated by the worker **in the frame it is stopped in** and written back to
   * the frame, so the next line runs with the value the learner chose. The run does not move: the page
   * gets the same line back with the frame's new values, so "what if it were 41" is answered before
   * the learner decides to continue. A refused expression comes back as `edit_error` on that bar.
   */
  const applyFrameEdit = () => {
    const buffer = frameEditRef.current;
    const pause = pauseRef.current;
    if (!buffer || !pause || !pausedStep || !frameEdit) return;
    const payload = new TextEncoder().encode(
      JSON.stringify({ name: frameEdit.name, expression: frameEdit.expression })
    );
    if (!payload.length || payload.length > FRAME_EDIT_BYTES) {
      setFrameEditError(`An edit must be between 1 and ${FRAME_EDIT_BYTES} bytes of UTF-8.`);
      return;
    }
    // Bytes first, then the command that tells the worker to read them: it is parked on the command
    // word and will not look at the buffer until that word changes.
    new Uint8Array(buffer, 8, payload.length).set(payload);
    Atomics.store(new Int32Array(buffer, 0, 2), 1, payload.length);
    const command = new Int32Array(pause, 0, 2);
    Atomics.store(command, 0, 5);
    Atomics.notify(command, 0);
    setFrameEditError('');
  };

  /**
   * Ask the parked interpreter to pin (or unpin) an expression, without moving the run.
   *
   * The request rides the frame-edit buffer, which is only ever read between two parks: the worker is
   * blocked on the command word, so the bytes are in place before it looks. Python answers by posting
   * the same line again with the expression evaluated in that frame — which is why a watch shows its
   * value the moment it is pinned rather than one Step later.
   */
  const askWorkerWatch = (request: { add?: string; remove?: string }) => {
    const buffer = frameEditRef.current;
    const pause = pauseRef.current;
    if (!buffer || !pause) return;
    const payload = new TextEncoder().encode(JSON.stringify(request));
    if (!payload.length || payload.length > FRAME_EDIT_BYTES) return;
    new Uint8Array(buffer, 8, payload.length).set(payload);
    Atomics.store(new Int32Array(buffer, 0, 2), 1, payload.length);
    const command = new Int32Array(pause, 0, 2);
    Atomics.store(command, 0, 8);
    Atomics.notify(command, 0);
  };

  /**
   * Pin the typed expression.
   *
   * Stored per lesson first, then sent to the parked worker so the value appears beside it: a bar that
   * showed a watch with nothing next to it, one Step before its first answer, would look broken. A bar
   * at its cap refuses here, in words — evicting a watch the learner chose would be a silent edit to
   * their list.
   */
  const submitWatch = () => {
    const id = lessonIdRef.current || selectedId;
    const wanted = normalizeWatch(watchDraft);
    if (!wanted) {
      setWatchDraft('');
      return;
    }
    setWatchDraft('');
    if (watches.includes(wanted)) {
      setWatchError('');
      return;
    }
    const next = addWatch(watches, wanted);
    if (next.length === watches.length) {
      setWatchError(`Watch up to ${MAX_WATCHES_PER_LESSON} expressions; remove one to pin another.`);
      return;
    }
    setWatches(writeWatches(id, next));
    setWatchError('');
    if (pausedStep) askWorkerWatch({ add: wanted });
  };

  /** Unpin one expression. The parked bar is posted again without it, so the chips follow the list. */
  const removeWatched = (expression: string) => {
    const id = lessonIdRef.current || selectedId;
    setWatches(writeWatches(id, removeWatch(watches, expression)));
    setWatchError('');
    if (pausedStep) askWorkerWatch({ remove: expression });
  };

  /**
   * Answer a parked interpreter: 2 continue, 3 step, 4 stop, 6 step into the call.
   *
   * The command is a shared word because a message would queue behind the very call it is meant to
   * steer. Step leaves the worker's hook armed for the next line, so holding the button walks the
   * program one line at a time; Step in arms it for the next line of *any* file the learner can open,
   * which is where a call's own body starts.
   */
  const answerPause = (command: 2 | 3 | 4 | 6 | 7) => {
    const buffer = pauseRef.current;
    if (!buffer) return;
    const view = new Int32Array(buffer, 0, 2);
    Atomics.store(view, 0, command);
    Atomics.notify(view, 0);
    if (command === 4) {
      stopExecution();
      return;
    }
    setPausedStep(null);
    setFrameEdit(null);
    setFrameEditError('');
    // The expression being typed survives a Step (it is still about to be pinned); the sentence a
    // full bar gave belongs to the park that is ending.
    setWatchError('');
    resumeWatchdogRef.current?.();
  };

  const stopExecution = (customMessage?: string) => {
    const runId = activeRunIdRef.current;
    // A parked interpreter is not on the interrupt word's clock: it is waiting on the pause word,
    // so wake that wait with a stop of its own.
    if (pauseRef.current) {
      const pause = new Int32Array(pauseRef.current, 0, 2);
      Atomics.store(pause, 0, 4);
      Atomics.notify(pause, 0);
      setPausedStep(null);
      setFrameEdit(null);
      setFrameEditError('');
    }
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

  // `lesson` defaults to the rendered lesson; Run passes the one selected at click time. `grade`
  // defaults to true; a cell's **Run to here** passes false, because a prefix of the program is not an
  // attempt at the lesson and must never verify it (`app/src/editor/cells.ts`). Scratch is the third
  // case and the simplest: a page's snippet is not an attempt either, so every run in scratch is
  // ungraded however it was started - the button, the shortcut, the palette, watch or a slider.
  const runPythonCode = async (
    sourceCode: string,
    lesson: PythonLessonItem = currentLesson,
    options: { grade?: boolean } = {}
  ) => {
    const grade = options.grade !== false && !scratchRef.current;
    const matchMode: OutputMatchMode = asOutputMatchMode(lesson.outputMatch);
    const attemptLessonId = lesson.id;
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;

    setIsRunning(true);
    // A new run is not paused: a bar left over from the previous one would describe a worker that
    // has already been replaced by this run.
    setPausedStep(null);
    setFrameEdit(null);
    setFrameEditError('');
    setStdout('');
    setStderr('');
    setInstructorError('');
    // A trace belongs to the run that produced it: the panel starts empty, and the worker's first
    // batch replaces it (a run that traces nothing leaves no stale curve on screen).
    setScopeSeries([]);
    // The same rule for the replay: the previous run's steps describe a program that is gone.
    setTrace(null);
    setTraceStep(0);
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
          // What Step and Continue call: the same watchdog, on the run's own timeout, from whatever
          // thread of execution the page is on when it answers.
          resumeWatchdogRef.current = () => armExecutionWatchdog(timeoutMs, 'Python execution');
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
          // A pause is not an outcome: the worker is parked and this page holds the key. The
          // watchdog is cleared here - a paused run is not a slow run - and re-armed by Step or
          // Continue when the interpreter starts moving again.
          if (data.type === 'paused') {
            if (data.runId !== runId) return;
            clearRunWatchdog();
            const step = (data.step as PausedStep) ?? null;
            setPausedStep(step);
            // An edit that landed re-posts this park with the frame's new values: the form closes and
            // the chips show what the program will use. One that was refused keeps the form open and
            // says why, in the interpreter's own words.
            if (step?.edit_error) setFrameEditError(step.edit_error);
            else {
              setFrameEditError('');
              setFrameEdit(null);
            }
            // A re-post is also the answer to a watch request: whatever the page was saying about
            // the last one is stale, and the chips now show what this frame says.
            setWatchError('');
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
          // Nothing to grade with: an ungraded run must not execute the appended self-check or the
          // capstone bench, because a half-written program would fail checks it was never meant to
          // meet and the failure would look like a verdict.
          instructorTests: grade ? lesson.instructorTests : '',
          benchSource: grade ? harnessSourceForLesson(lesson.id) : '',
          cdnUrl,
          maxSteps,
          timeoutSec: Math.max(0.5, (timeoutMs - 500) / 1000),
          // The trace's caps travel with the request: the worker records with the page's numbers, so
          // "300 of 12,431" and the 300 on screen cannot mean two different things.
          trace: { cap: TRACE_STEP_CAP, names: TRACE_NAME_CAP, chars: TRACE_VALUE_CHARS },
          // The lines to park on, checked against the text this run executes: a stored line past the
          // end of the document, or one that is blank, cannot be a breakpoint on this program. They
          // travel with the request because a message cannot reach a worker inside Python — a dot
          // added mid-run is therefore for the next run, which the paused bar's title says.
          breakpoints: breakpointsForRun(sourceCode, breakpoints),
          // The pinned expressions travel with the request, like the dots: the worker evaluates them
          // in whichever frame it parks in, so a watch added mid-run is for the next run.
          watches: normalizeWatches(watches),
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
        // A stop still leaves the lines it reached: "where was my loop when I stopped it" is the
        // question Stop is pressed to answer.
        setTrace(readTrace(workerOutcome?.trace));
        setTraceStep(0);
        setBehaviorCheck('failed');
        setPassStatus('stopped');
        return;
      }

      if (workerOutcome?.watchdogTimedOut || workerOutcome?.timedOut) {
        guideEditorRef.current?.setInlineValues([]);
        if (workerOutcome?.stdout) setStdout(workerOutcome.stdout);
        setStderr(workerOutcome.message || workerOutcome.stderr || 'Execution timed out.');
        // The lines that ran before the budget ran out: the tail is exactly where the loop turned.
        setTrace(readTrace(workerOutcome?.trace));
        setTraceStep(0);
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
      // The replay: every line this run executed, kept by the worker's own trace hook. Validated here
      // because it crossed a thread boundary as JSON (`app/src/runTrace.ts`).
      setTrace(readTrace(workerOutcome?.trace));
      setTraceStep(0);
      if (!grade) {
        // A cell run is a look at what the program does so far. An exception is still a report — a
        // prefix that raises should say so — but no check is graded and no lesson is verified.
        setBehaviorCheck('untested');
        setOutputCheck('untested');
        setPassStatus(workerOutcome?.runtimeError ? 'error' : 'untested');
        return;
      }
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
      // A cell run is not an attempt: it runs part of the program, and Hint 2 is the reward for
      // trying the exercise.
      if (grade) {
        setRunAttempts((prev) => ({
          ...prev,
          [attemptLessonId]: (prev[attemptLessonId] ?? 0) + 1,
        }));
      }
      if (activeRunIdRef.current === runId) {
        setIsRunning(false);
        setPausedStep(null);
        resumeWatchdogRef.current = null;
      }
    }
  };

  /**
   * A `# %%` cell's **Run to here**: the document through the end of that cell, ungraded.
   *
   * Through the cell, not just the cell, because the worker runs each program in a fresh namespace —
   * a later cell on its own would `NameError` on everything the earlier ones bound (`cells.ts`). The
   * predict gate is skipped on purpose: it asks what the *lesson* will print, and a prefix is not the
   * lesson. Nothing is graded, so nothing is verified and Hint 2 is not unlocked.
   */
  const runCellTo = (index: number) => {
    if (isRunning) return;
    const prefix = cellPrefix(codeRef.current, index);
    if (!prefix || !prefix.trim()) return;
    void runPythonCode(prefix, currentLesson, { grade: false });
  };

  /**
   * Every run the learner asks for by name goes through here, so the predict-first gate cannot be
   * walked around by using the keyboard instead of the button.
   */
  const requestRun = (sourceCode: string, lesson: PythonLessonItem = currentLesson) => {
    if (isRunning) return;
    // The gate asks what the *lesson* will print. A page's snippet is not the lesson, and a guess
    // about a loop the reader has not read yet is a quiz nobody asked for.
    if (scratchRef.current) {
      void runPythonCode(sourceCode, lesson);
      return;
    }
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

  // ⌥1–⌥4 pick a layout, from anywhere including inside the editor. The buttons in the editor's
  // header are the discoverable path; this is the shortcut the buttons print.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.altKey || event.metaKey || event.ctrlKey) return;
      // The code first: ⌥2 is `™` in `key` on a Mac, and the shortcut is the physical key.
      const next = layoutShortcutFor(event.code) ?? layoutShortcutFor(event.key);
      if (!next) return;
      event.preventDefault();
      setLayout(writeLayout(next));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------------------------------------------------------------------------------------------
  // The Split divider.
  //
  // A pointer drag, captured by the handle itself: with pointer capture the moves keep arriving at
  // the handle even when the pointer is over the editor or the page, so there are no window listeners
  // to leak and no way to end a drag by letting go outside the window.
  // ---------------------------------------------------------------------------------------------
  const commitSplitRatio = (ratio: number) => setSplitRatio(writeSplitRatio(ratio));

  const beginSplitDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    // The primary button only: a right click on the handle must not capture the pointer.
    if (event.button !== 0) return;
    splitDragRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingSplit(true);
    event.preventDefault();
  };

  const moveSplitDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (splitDragRef.current !== event.pointerId) return;
    const container = splitContainerRef.current;
    const box = container?.getBoundingClientRect();
    if (!container || !box) return;
    // The tracks share what the gap leaves, so the boundary is at `left + free * ratio`. Measuring
    // against the full width would leave the divider half a gap behind the pointer.
    const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 0;
    const next = splitRatioAt(event.clientX, box.left, box.width - gap, resultsSide);
    // No write while dragging: a pointer emits a move per pixel, and a stored key per pixel is a
    // write per pixel. The drag ends with one.
    if (next !== null) setSplitRatio(next);
  };

  const endSplitDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (splitDragRef.current !== event.pointerId) return;
    splitDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingSplit(false);
    // The release position, not the last ratio that was rendered. A pointermove is a continuous
    // event, so its setState can still be queued when the release arrives (the browser coalesces
    // moves under load); committing the ref then writes one move behind where the learner let go,
    // and the boundary stays a step off — CI caught exactly that, 39% after a drag to 35%. The
    // pointerup carries the position the drag ended at, so it is authoritative. A cancel carries
    // none, and commits what it has.
    const container = splitContainerRef.current;
    const box = container?.getBoundingClientRect();
    const gap = container ? Number.parseFloat(getComputedStyle(container).columnGap) || 0 : 0;
    const released =
      event.type === 'pointerup' && box
        ? splitRatioAt(event.clientX, box.left, box.width - gap, resultsSide)
        : null;
    setSplitRatio(writeSplitRatio(released ?? splitRatioRef.current));
  };

  // A preset change can unmount the handle mid-drag (⌥1 while holding it). Pointer capture dies with
  // the element, so the release never arrives and the "dragging" branch would stay on.
  useEffect(() => {
    if (layoutArrangement(layout) !== 'columns') setDraggingSplit(false);
  }, [layout]);

  // ⌘↵ / Ctrl+↵ runs from anywhere on this screen, including inside the editor. The button stays
  // the discoverable path; this is the one keyboard habit a code editor trains. The key is read from
  // the sheet's keymap (`app/src/keymap.ts`), so a learner who rebinds Run is not left with the old
  // chord still running the lesson and the new one doing nothing.
  const runShortcutRef = useRef<() => void>(() => {});
  runShortcutRef.current = () => {
    if (isRunning) return;
    const lesson = PYTHON_LESSONS.find((l) => l.id === lessonIdRef.current) || PYTHON_LESSONS[0];
    requestRun(codeRef.current, lesson);
  };
  const keymap = useKeymap();
  const keymapRef = useRef<Keymap>(keymap);
  keymapRef.current = keymap;
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

  /* ---- The first-run tour --------------------------------------------------------------------
   * The gate is the app's own state, never a click: step 3 moves when the editor text differs from
   * the text the tour found, and step 4 moves when a run has ended with a verdict. `reduceTour` owns
   * those rules; this block only measures and forwards, so a rule lives in one place to be tested.
   */
  const tourStep = stepAt(tourState.stepIndex);
  const tourActive = tourOpen && tourState.status === 'active';
  // What the document was when the tour reached the editor step. A draft restored from storage is not
  // an edit the learner made in this visit, and must not satisfy a step that asks them to type.
  const tourBaselineRef = useRef<string | null>(null);
  // Runs already counted when the tour started: a run from before it does not satisfy step 4.
  const tourRunBaselineRef = useRef<number>(0);
  const runButtonRef = useRef<HTMLButtonElement | null>(null);
  const attemptsHereNow = runAttempts[selectedId] ?? 0;
  const tourFacts: TourFacts = {
    edited: tourBaselineRef.current !== null && code !== tourBaselineRef.current,
    runFinished: !isRunning && attemptsHereNow > tourRunBaselineRef.current,
    passed: passStatus === 'passed',
  };
  const tourFactsRef = useRef<TourFacts>(tourFacts);
  tourFactsRef.current = tourFacts;

  // A mirror of the record for the click handlers: the reducer is pure, but writing the record and
  // closing the card are two updates, and doing them inside a `setTourState` updater would run both
  // twice under StrictMode's double-invoke.
  const tourStateRef = useRef<TourState>(tourState);
  tourStateRef.current = tourState;

  const signalTour = (signal: TourSignal) => {
    const previous = tourStateRef.current;
    const next = reduceTour(previous, signal, tourFactsRef.current);
    if (next === previous) return;
    // Local only, like every other log line: this is how a pilot tells "walked it" from "closed it at
    // step two" without watching anyone (`learningLog.ts`).
    logEvent({
      kind: 'tour',
      action: next.status === 'completed' ? 'completed' : next.status === 'dismissed' ? 'skipped' : 'step',
      level: next.stepIndex + 1,
    });
    setTourState(writeTour(next));
    // Anything but "still walking" puts the card away: a dismissed and a finished tour look the same
    // on the page, and the record is what remembers which one it was.
    if (next.status !== 'active') setTourOpen(false);
  };

  /**
   * Start (or restart) the tour, with both baselines taken now.
   *
   * `resume` continues at the step the record left off at; `restart` is the replay the palette and the
   * `?` sheet ask for, which begins at step one because that is what "replay" means.
   */
  const startTour = (mode: 'restart' | 'resume' = 'restart') => {
    tourBaselineRef.current = null;
    tourRunBaselineRef.current = runAttempts[selectedId] ?? 0;
    setTourChip(null);
    setTourOpen(true);
    const previous = readTour();
    const next: TourState =
      mode === 'resume'
        ? { ...previous, status: 'active', chipShown: true, updatedAt: Date.now() }
        : reduceTour(previous, 'replay', tourFactsRef.current);
    logEvent({
      kind: 'tour',
      action: mode === 'resume' ? 'resume' : 'shown',
      level: next.stepIndex + 1,
    });
    setTourState(writeTour(next));
  };

  // Which surface to offer. Judged against the lesson actually open, so a deep link into a later
  // entry gets the chip rather than a tour of six steps about someone else's lesson.
  useEffect(() => {
    const current = readTour();
    const offer = tourOffer(current, {
      onFirstLesson: selectedId === PYTHON_LESSONS[0].id,
      hasProgress:
        Object.keys(verifiedLessons).length > 0 ||
        Object.keys(completedLessons).length > 0 ||
        Object.keys(readDrafts()).length > 0,
    });
    if (offer === 'none') return;
    if (offer === 'tour') {
      tourBaselineRef.current = null;
      tourRunBaselineRef.current = runAttempts[selectedId] ?? 0;
      setTourOpen(true);
      // A record that is already open on step one is this effect running again (StrictMode's
      // double-invoke in development), not a second time the learner was shown it.
      if (!(current.status === 'active' && current.stepIndex === 0)) {
        logEvent({ kind: 'tour', action: 'shown', level: 1 });
      }
      setTourState(writeTour({ ...current, status: 'active', stepIndex: 0, updatedAt: Date.now() }));
      return;
    }
    // Someone who left the tour at step 4 gets the step, not the welcome: `active` is the record that
    // says where they were.
    setTourChip({ resume: current.status === 'active' });
    setTourState(writeTour({ ...current, chipShown: true, updatedAt: Date.now() }));
    // Deliberately keyed on the lesson: the counts are read once per visit, so the run that finishes
    // during the tour cannot close the tour it is part of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Home's Review button asks the Study panel for attention with a nonce, the same way the palette
  // asks for a run. The deck is already mounted; this scrolls it into view and puts the keyboard on
  // its first control, and a mount never fires a request nobody made this visit.
  const lastReviewRequestRef = useRef<number>(reviewRequest ?? 0);
  useEffect(() => {
    if ((reviewRequest ?? 0) === lastReviewRequestRef.current) return;
    lastReviewRequestRef.current = reviewRequest ?? 0;
    const deck = document.getElementById('study-deck');
    if (!deck) return;
    deck.scrollIntoView({ behavior: 'smooth', block: 'center' });
    deck.focus({ preventScroll: true });
  }, [reviewRequest]);

  // The palette and the `?` sheet ask for a replay with a nonce, the same way they ask for a run.
  const lastTourRequestRef = useRef<number>(tourRequest ?? 0);
  useEffect(() => {
    if ((tourRequest ?? 0) === lastTourRequestRef.current) return;
    lastTourRequestRef.current = tourRequest ?? 0;
    startTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourRequest]);

  // Step 3's gate: the editor now holds text that is not the text the tour found.
  useEffect(() => {
    if (!tourActive) return;
    if (tourStep.gate === 'edited') {
      if (tourBaselineRef.current === null) {
        tourBaselineRef.current = code;
        return;
      }
      if (tourFactsRef.current.edited) signalTour('edited');
    }
  }, [tourActive, tourStep.gate, code]);

  // Step 4's gate: a run that finished while the tour was on screen.
  useEffect(() => {
    if (!tourActive) return;
    if (tourStep.gate === 'run-finished' && tourFactsRef.current.runFinished) {
      signalTour('run-finished');
    }
  }, [tourActive, tourStep.gate, tourFacts.runFinished]);

  // Focus follows the kind of step: the editor for the typing one, Run for the press one. A card that
  // keeps focus while asking the learner to type is a card they have to fight.
  useEffect(() => {
    if (!tourActive) return;
    if (tourStep.id === 'editor') guideEditorRef.current?.focus();
    else if (tourStep.id === 'run') runButtonRef.current?.focus();
  }, [tourActive, tourStep.id]);

  // Esc closes the tour — unless a sheet is open, in which case that press was meant for the sheet.
  useEffect(() => {
    if (!tourActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (moreOpen || helpOpen || pairOpen) return;
      signalTour('dismiss');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, moreOpen, helpOpen, pairOpen]);

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
  /** Debug already puts the editor and the results side by side; it needs no second split. */
  const columnsArrangement = layoutArrangement(shownLayout) === 'columns';

  const resultsPanel = (
<div
  data-testid="results-panel"
  // Write hides the last run's output: while drafting, it describes code that has changed.
  style={{ display: layoutShows(shownLayout, 'results') ? undefined : 'none' }}
  // Split already spends half the screen on this block: two cards inside one column of it
  // would be two 20-character panels. They stack there and sit side by side everywhere else.
  className={
    columnsArrangement || (resultsSplit && !columnsArrangement)
      ? 'grid grid-cols-1 gap-4'
      : 'grid grid-cols-1 md:grid-cols-2 gap-4'
  }
>
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
    {/* The one affordance for a learner who is stuck rather than wrong yet: a failed run
        becomes a message a person can answer. It sits under the verdict, because that is
        the moment it is needed, and it is absent after a pass — a report about a run that
        worked is not a question. */}
    {passStatus !== 'untested' && passStatus !== 'passed' && (
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-mono">
        <span style={{ color: 'var(--dim)' }}>
          Stuck on this one? Turn the run into a message you can send.
        </span>
        <button
          onClick={() => setHelpOpen(true)}
          data-testid="btn-ask-help"
          title="Build a report of this run — the lesson, your code, what the check said and the error — to copy or file as an issue"
          className="px-2 py-1 rounded-lg bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer"
        >
          <LifeBuoy className="w-3.5 h-3.5" />
          <span>Ask for help</span>
        </button>
      </div>
    )}
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
  );

  const runnerToolbar = (
<div data-testid="runner-toolbar" className="flex flex-wrap items-center gap-2">
  {/* The presets live on this card, not in the editor's own header: Read hides that
      header, and a control that disappears with the panel it governs is a trap. A
      shortcut with no control is a feature only its author knows, so the shortcut is
      printed on the button. */}
  <div
    role="group"
    aria-label="Layout"
    data-testid="layout-presets"
    className="flex items-center gap-1 mr-1"
  >
    {LAYOUTS.map((option) => (
      <button
        key={option.id}
        type="button"
        aria-pressed={layout === option.id}
        title={option.title}
        data-testid={`layout-${option.id}`}
        onClick={() => setLayout(writeLayout(option.id))}
        className={`px-2 py-1 rounded text-[13px] font-mono cursor-pointer border transition-colors ${
          layout === option.id
            ? 'bg-accent text-inverse border-accent font-bold'
            : 'bg-canvas text-muted hover:text-ink border-line-soft'
        }`}
      >
        {option.label}
        {/* 90%, not 70%: at 70% the shortcut measured 3.28:1 on the light canvas and
            4.0:1 on the pressed accent, so the de-emphasis broke the 4.5:1 floor. */}
        <span className="ml-1 opacity-90">{option.shortcut}</span>
      </button>
    ))}
  </div>
  {/* Docking's one control, named for the panel it moves in the preset in force:
      "List → Right" in Study, "Results → Left" in Split. Write and Read show no
      button, because neither has a panel beside anything to move. */}
  {dockChoice && (
    <button
      type="button"
      data-testid="btn-dock-toggle"
      onClick={() => setDock(writeDock(flippedDock(dock, layout)))}
      title={dockChoice.title}
      // The visible words come first, then the sentence: a name that only describes what
      // is drawn fails WCAG 2.5.3, which is what Lighthouse's
      // `label-content-name-mismatch` audit named here.
      aria-label={`${dockChoice.label}: ${dockChoice.title}`}
      className="px-2 py-1 rounded text-[13px] font-mono cursor-pointer border transition-colors bg-canvas text-muted hover:text-ink border-line-soft"
    >
      {dockChoice.label}
    </button>
  )}
  {/* The first screen keeps only what a learner does next: Pause and Stop while a
      program runs, More for the rest, and Run as the single primary action. §3 of
      `docs/PLAN-2.1a.md` is the list; `scripts/check_label_sizes.mjs` is the gate
      that keeps the folded controls legible once they are open. */}
  {isRunning && pauseCapable && !pausedStep && (
    <button
      onClick={() => pauseExecution()}
      data-testid="btn-pause-execution"
      title="Stop at the next line of your file, without losing the session"
      className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer"
    >
      <Pause className="w-3.5 h-3.5" />
      <span>Pause</span>
    </button>
  )}
  {isRunning && (
    <button
      onClick={() => stopExecution()}
      data-testid="btn-stop-execution"
      className="px-3 py-1.5 rounded-lg text-[13px] font-mono font-bold bg-rose hover:bg-rose-strong text-inverse flex items-center gap-1.5 cursor-pointer"
    >
      <OctagonX className="w-3.5 h-3.5" />
      <span>Stop</span>
    </button>
  )}
  <button
    type="button"
    ref={moreButtonRef}
    onClick={() => setMoreOpen((open) => !open)}
    aria-expanded={moreOpen}
    aria-controls="toolbar-more"
    data-testid="btn-more"
    title="Format with Black, history, diff, reset, sharing, pairing and editor preferences"
    className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono border flex items-center gap-1.5 cursor-pointer transition-colors ${
      moreOpen
        ? 'text-accent border-accent/60 bg-canvas'
        : 'text-body border-line bg-canvas hover:bg-raise'
    }`}
  >
    <MoreHorizontal className="w-3.5 h-3.5" />
    <span>More ⋯</span>
  </button>
  {/* The terminal split, beside the code it splits: output under the editor by default, beside it
      when the learner asks. A narrow window keeps one column and the button says so. */}
  {editorShown && !columnsArrangement && (
    <button
      type="button"
      data-testid="btn-results-split"
      aria-pressed={resultsSplit}
      onClick={() => setResultsSplit(writeResultsSplit(!resultsSplit))}
      title={
        resultsSplit
          ? 'Put the run output back under the code'
          : 'Split the run output beside the code, like a terminal'
      }
      className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono border flex items-center gap-1.5 cursor-pointer ${
        resultsSplit ? 'text-accent border-accent/60 bg-canvas' : 'text-body border-line bg-canvas hover:bg-raise'
      }`}
    >
      <Columns2 className="w-3.5 h-3.5" />
      <span>{resultsSplit ? 'Stack output' : 'Split output'}</span>
    </button>
  )}
  <button
    onClick={() => {
      const lesson =
        PYTHON_LESSONS.find((l) => l.id === lessonIdRef.current) || PYTHON_LESSONS[0];
      requestRun(codeRef.current, lesson);
    }}
    disabled={isRunning}
    ref={runButtonRef}
    data-testid="btn-run-verify"
    data-sound="primary"
    data-tour="run-button"
    title="Run & Verify Output — ⌘↵ / Ctrl+↵ runs from anywhere on this screen"
    className="btn btn-primary ml-1 px-3.5 py-2 text-[13px] font-bold"
  >
    {isRunning ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
    ) : (
      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
    )}
    <span>{isRunning ? 'Running in Worker...' : 'Run & Verify Output'}</span>
    {!isRunning && <span className="kbd ml-0.5">⌘↵</span>}
  </button>
  <div
    id="toolbar-more"
    role="group"
    aria-label="More actions"
    data-testid="toolbar-more"
    hidden={!moreOpen}
    onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      setMoreOpen(false);
      // `preventScroll`: a control that folds itself away must not scroll the page
      // back to the toolbar when the learner had scrolled down to read a result.
      moreButtonRef.current?.focus({ preventScroll: true });
    }}
    // One press is one action, so the panel folds itself away: leaving it open would
    // shift the editor down while the learner is reading the answer to what they
    // pressed, and would hide the row they came from. Focus goes back to More, so a
    // keyboard user is never dropped into the document.
    onClick={(event) => {
      if (!(event.target as HTMLElement).closest('button')) return;
      setMoreOpen(false);
      moreButtonRef.current?.focus({ preventScroll: true });
    }}
    className="order-last w-full rounded-xl border border-line bg-panel p-2.5"
  >
    <p className="px-1 pb-2 text-[11px] font-mono uppercase tracking-[0.08em] text-faint">
      More actions
    </p>
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => toggleLessonSelfMarked(currentLesson.id)}
        data-testid="btn-toggle-lesson-complete"
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono border flex items-center gap-1.5 cursor-pointer ${
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
        className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Reset Starter</span>
      </button>
      <button
        onClick={resetRuntime}
        data-testid="btn-reset-runtime"
        title="Terminate and restart the background Python Web Worker without losing editor code"
        className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-accent border border-accent/40 flex items-center gap-1.5 cursor-pointer"
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
        className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-amber border border-amber/40 flex items-center gap-1.5 cursor-pointer"
      >
        <Eye className="w-3.5 h-3.5" />
        <span>Load Solution</span>
      </button>
      {/* Format is a text action, not a run one: it tidies the file in place, and the
          interpreter installs the formatter on the first press. Disabled while a program
          is running or parked, because the worker is one thread. */}
      <button
        onClick={() => void formatCode()}
        disabled={isRunning || Boolean(pausedStep)}
        data-testid="btn-format"
        title="Re-indent and tidy this file with Black (installs on the first press, then stays in this session)"
        className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Wand2 className="w-3.5 h-3.5" />
        <span>Format</span>
      </button>
      <button
        onClick={() => setHistoryOpen((open) => !open)}
        aria-expanded={historyOpen}
        aria-controls="draft-history"
        data-testid="btn-draft-history"
        title="Every run files the code it started from, with its verdict, so a version that worked is one click away"
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
          historyOpen ? 'text-accent border-accent/60' : 'text-body border-line'
        }`}
      >
        <History className="w-3.5 h-3.5" />
        <span>History{draftHistory.length ? ` (${draftHistory.length})` : ''}</span>
      </button>
      {/* The dots the gutter is drawing, and the condition each one waits for. Always
          present, not only once something is armed: a learner who has never clicked the
          gutter has no other way to find out that a breakpoint can be narrowed. */}
      <button
        onClick={() => setBreakpointsOpen((open) => !open)}
        aria-expanded={breakpointsOpen}
        aria-controls="breakpoint-panel"
        data-testid="btn-breakpoints"
        title="Every dot on the gutter, with the condition that lets the run stop on it"
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
          breakpointsOpen ? 'text-accent border-accent/60' : 'text-body border-line'
        }`}
      >
        <CircleDot className="w-3.5 h-3.5" />
        <span>
          Breakpoints{breakpoints.length ? ` (${breakpoints.length})` : ''}
        </span>
      </button>
      <button
        onClick={() => setDiffOpen((open) => !open)}
        aria-expanded={diffOpen}
        aria-controls="code-diff"
        data-testid="btn-diff"
        title="What you changed: your code against the starter, line by line"
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
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
        className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer"
      >
        <Share2 className="w-3.5 h-3.5" />
        <span>Share</span>
      </button>
      {/* Pair study, beside the send: one session, two people, no server — the attempt
          travels over a direct channel and arrives as a card, not as an edit. */}
      <button
        onClick={() => setPairOpen(true)}
        data-testid="btn-pair-open"
        title="Pair study: connect to another workbench directly and pass attempts back and forth"
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
          pair.state === 'connected' ? 'text-emerald border-emerald/60' : 'text-body border-line'
        }`}
      >
        <Users className="w-3.5 h-3.5" />
        <span>
          {coEdit
            ? 'Pair · co-editing'
            : `Pair${pair.state === 'connected' && pair.peer ? ` · ${pair.peer}` : ''}`}
        </span>
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
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
          predictOpen ? 'text-amber border-amber/60' : 'text-body border-line'
        }`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>
          Predict
          {predictRecord ? (predictRecord.skipped ? ' · skipped' : ' · answered') : ''}
        </span>
      </button>
      {/* Vim keys: a reading preference like watch mode, remembered the same way. Off by
          default, because normal mode reads a beginner's first `i` as a command and the
          editor would look broken rather than unusual (`app/src/vimMode.ts`). */}
      <button
        onClick={() => {
          const next = writeVim(!vimOn);
          setVimOn(next);
          setVimMode('normal');
        }}
        aria-pressed={vimOn}
        data-testid="btn-vim"
        title={vimHint(vimOn)}
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
          vimOn ? 'text-accent border-accent/60' : 'text-body border-line'
        }`}
      >
        <Keyboard className="w-3.5 h-3.5" />
        <span>{VIM_LABEL}</span>
      </button>
      <button
        onClick={() => setWatchOn(setWatch(!watchOn))}
        aria-pressed={watchOn}
        data-testid="btn-watch"
        title="Watch mode: after a failed check, re-run 1.5 s after you stop typing"
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
          watchOn ? 'text-emerald border-emerald/60' : 'text-body border-line'
        }`}
      >
        <Activity className="w-3.5 h-3.5" />
        <span>{watchOn ? 'Watching' : 'Watch'}</span>
      </button>
    </div>
  </div>
</div>
  );

  return (
    <div className="space-y-5">
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
              <p className="mt-0.5 text-[12px]" style={{ color: 'var(--dim)' }}>
                {PYTHON_LESSONS.length} entries · starter code, three hints, behavioural tests
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono tabular-nums">
            <div className="text-right">
              <div className="text-[12px]" style={{ color: 'var(--dim)' }}>
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
              <div className="text-[12px]" style={{ color: 'var(--dim)' }}>
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
              <div className="text-[12px]" style={{ color: 'var(--dim)' }}>
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
                className="mt-0.5 px-2 py-0.5 rounded text-[12.5px] font-mono border cursor-pointer disabled:cursor-wait"
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
                onClick={() => requestRun(codeRef.current, currentLesson)}
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
      <div
        className={`grid grid-cols-1 gap-5 ${
          shownLayout === 'study' ? 'lg:grid-cols-[224px_minmax(0,1fr)]' : ''
        }`}
      >
        {shownLayout === 'study' && (
          <LessonChooser
            lessons={PYTHON_LESSONS}
            filteredLessons={filteredLessons}
            trackFilter={trackFilter}
            onTrackFilter={setTrackFilter}
            searchQuery={searchQuery}
            onSearchQuery={setSearchQuery}
            currentId={selectedId}
            verifiedLessons={verifiedLessons}
            completedLessons={completedLessons}
            onSelect={selectLesson}
          />
        )}

        <div ref={splitContainerRef} data-focus-expand className="space-y-4">

        {/* The lesson text, the editor and everything that reports on it. Only these three are the
            preset's grid: the lesson card above describes all of them, and the run banners
            between belong to the run, not to a column. */}

          {/* Active Lesson Metadata Card. `data-tour` names it for the first-run tour's second step
              (`app/src/tour.ts`), and `scripts/test_tour.mjs` fails if the name goes away. */}
          <div data-tour="lesson-brief" className="bg-panel border border-line rounded-xl p-4">
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
                    title="The lesson text is the pane on this screen. The GitHub page remains for copying, printing and filing an issue; nothing you type is saved there."
                    className="text-muted hover:text-accent underline underline-offset-2 whitespace-nowrap"
                  >
                    View source on GitHub ↗
                  </a>
                  {isCurrentVerified && (
                    <span className="text-emerald font-semibold whitespace-nowrap">
                      Executed &amp; Passed (WASM)
                    </span>
                  )}
                </div>
                <h2 data-testid="lesson-title" className="text-base font-bold text-ink mt-1">
                  {currentLesson.title}
                </h2>
              </div>

              {editorShown ? null : runnerToolbar}
            </div>

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

            {shareStatus.kind !== 'idle' && (
              <p
                role="status"
                data-testid="share-status"
                className="mt-2 rounded-lg border border-line-soft bg-panel px-3 py-2 text-[12px] leading-relaxed"
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

            {/* An attempt from a pair session: the same rule as a shared link — offered, never
                applied. When it is for another lesson, the card says which one and offers the
                switch, so loading can never drop a lesson's code into another lesson's draft. */}
            {pairAttempt && (
              <div
                data-testid="pair-attempt-card"
                className="mt-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2.5"
              >
                <p className="eyebrow">From your pair session</p>
                {pairAttempt.lesson === selectedId ? (
                  <p className="mt-1 text-[12.5px]" style={{ color: 'var(--body)' }}>
                    They sent their attempt for this lesson — {attemptLines(pairAttempt.code)} lines.
                    Loading it replaces the draft in this editor; your own work is here until you
                    press the button.
                  </p>
                ) : (
                  <p className="mt-1 text-[12.5px]" style={{ color: 'var(--body)' }}>
                    They sent {attemptLines(pairAttempt.code)} lines for{' '}
                    {lessonLabel(pairAttempt.lesson)}, and this editor is on {selectedId}. Open their
                    lesson first — their code will not be dropped into yours.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {pairAttempt.lesson === selectedId ? (
                    <button
                      onClick={loadPairAttempt}
                      data-testid="btn-load-pair-attempt"
                      className="btn btn-primary px-2.5 py-1.5 text-[12px]"
                    >
                      Load their code
                    </button>
                  ) : (
                    <button
                      onClick={() => selectLesson(pairAttempt.lesson)}
                      data-testid="btn-open-pair-lesson"
                      className="btn px-2.5 py-1.5 text-[12px]"
                    >
                      Open {lessonLabel(pairAttempt.lesson)}
                    </button>
                  )}
                  <button
                    onClick={() => setPairAttempt(null)}
                    data-testid="btn-dismiss-pair-attempt"
                    className="btn px-2.5 py-1.5 text-[12px]"
                  >
                    Keep mine
                  </button>
                </div>
              </div>
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
                        {gateAsksForFinish
                          ? 'PREDICT FIRST · what will a finished run print?'
                          : 'PREDICT FIRST · what will this print?'}
                      </span>
                      <span className="text-[11px] font-mono text-faint">
                        {heldRun ? 'before the run' : 'before you press Run'}
                      </span>
                    </div>
                    <label htmlFor="predict-input" className="mt-2 block text-xs text-body">
                      Type the output you expect, one line per line of output. It is checked against
                      the lesson&apos;s own expected output when you commit, and the run goes then.
                      {gateAsksForFinish && (
                        <>
                          {' '}
                          This starter stops at its first NotImplementedError, so predict the line a
                          finished file prints — not the traceback.
                        </>
                      )}
                    </label>
                    <textarea
                      id="predict-input"
                      value={predictText}
                      onChange={(event) => setPredictText(event.target.value)}
                      rows={3}
                      spellCheck={false}
                      data-testid="predict-input"
                      // Shape, never content: the old example was P.1's own expected line repeated on
                      // every lesson, which was half the answer to P.1's gate and another lesson's
                      // output everywhere else.
                      placeholder={'one line per line the program prints, e.g.\nLabel: value | Label: value'}
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

            {/* Every dot and the sentence it waits for. The gutter can arm a line but cannot say
                why a park should let a loop pass; this is the one place a condition is written, and
                the input is the stored value rather than a copy of it. */}
            {breakpointsOpen && (
              <div
                id="breakpoint-panel"
                data-testid="breakpoint-panel"
                className="mt-3 rounded-lg border border-line-soft bg-canvas p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-accent">
                    BREAKPOINTS · this lesson
                  </span>
                  <span className="text-[11px] font-mono text-faint">
                    {breakpoints.length
                      ? `${breakpoints.length} armed · read when a run starts`
                      : 'nothing armed'}
                  </span>
                </div>
                {breakpoints.length === 0 ? (
                  <p className="text-xs text-muted mt-2" data-testid="breakpoint-panel-empty">
                    Click the column left of a line number to break there (or press F9 with the
                    cursor on it). A condition narrows the dot to the pass that matters —{' '}
                    <code className="font-mono text-body">n == 3</code> — so a loop is not a stop per
                    turn.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {breakpoints.map((entry) => (
                      <li
                        key={entry.line}
                        data-testid={`breakpoint-row-${entry.line}`}
                        className="flex flex-wrap items-center gap-2 text-xs"
                      >
                        <span className="w-14 shrink-0 font-mono text-muted">line {entry.line}</span>
                        <input
                          data-testid={`breakpoint-condition-${entry.line}`}
                          aria-label={`Condition for the breakpoint on line ${entry.line}, as a Python expression`}
                          placeholder="stop only when… (Python expression)"
                          value={entry.condition}
                          onChange={(event) => setConditionAt(entry.line, event.target.value)}
                          maxLength={MAX_CONDITION_CHARS}
                          spellCheck={false}
                          className="min-w-0 flex-1 rounded border px-1.5 py-0.5 font-mono text-[11px] text-body"
                          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
                        />
                        <button
                          onClick={() => toggleBreakpointAt(entry.line)}
                          data-testid={`btn-clear-breakpoint-${entry.line}`}
                          title={`Remove the breakpoint on line ${entry.line}`}
                          aria-label={`Remove the breakpoint on line ${entry.line}`}
                          className="px-2 py-0.5 rounded text-[11px] font-mono text-muted hover:text-rose border border-line cursor-pointer"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-faint mt-2">
                  A condition is a Python expression the interpreter evaluates with the names that
                  line can see: the run stops only when it is true. A dot that waits is drawn hollow,
                  and one whose expression raises stops anyway — with the interpreter's own words in
                  the bar above. Conditions reach the interpreter with the next run.
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
                    {/* The third reference: the code a filed run started from. Newest first, so the
                        run a learner just made is the first button; the list is the same one the
                        History panel restores from, capped at five. */}
                    {draftHistory.map((version, index) => {
                      const target = runTarget(index);
                      const active = diffTarget === target;
                      return (
                        <button
                          key={target}
                          onClick={() => setDiffTarget(target)}
                          aria-pressed={active}
                          data-testid={`diff-target-run-${index}`}
                          title={`Your code against the code that ran ${snapshotAgeLabel(
                            version.at
                          )} (${verdictLabel(version.outcome)})`}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer ${
                            active
                              ? 'text-accent border-accent/60 bg-accent/10'
                              : 'text-muted border-line'
                          }`}
                        >
                          vs run {index + 1} · {verdictLabel(version.outcome)}
                        </button>
                      );
                    })}
                    <span data-testid="diff-summary" className="text-[11px] font-mono text-muted">
                      {diffSummary(codeDiff)}
                    </span>
                  </div>
                </div>

                {/* The version a restore or the five-version cap removed: the panel says which
                    reference it used rather than drawing an empty diff. */}
                {diffReference.fellBack && diffTarget !== 'starter' && (
                  <p data-testid="diff-fell-back" className="mt-2 text-xs text-muted">
                    That version is gone — the panel is comparing against your starter.
                  </p>
                )}
                {codeDiff.added === 0 && codeDiff.removed === 0 ? (
                  <p data-testid="diff-same" className="mt-2 text-xs text-muted">
                    {diffSameMessage(diffTarget, diffReference)}
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

          {/* Where the interpreter is, while it is there. A parked run is not a slow one, so it says
              what it is doing rather than leaving a spinner: the line it is about to run, quoted
              from the text that ran, and the frame's own values. Step and Continue are the two
              answers the worker is waiting for; Stop stays where it always is, in the toolbar. */}
          {pausedStep && (
            <div
              data-testid="paused-bar"
              data-paused-reason={pausedStep.reason ?? 'pause'}
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--panel)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-accent">
                  {/* Why the interpreter stopped is the first word, because a park the learner
                      placed and one they asked for answer different questions. */}
                  {pausedStep.reason === 'breakpoint' ? 'Breakpoint' : 'Paused'} ·{' '}
                  {pausedStep.fn === '<module>' ? 'top level' : `${pausedStep.fn}()`} · line{' '}
                  {pausedStep.line}
                  {/* A step can land in a file of its own: naming it is what makes the quoted line
                      below a statement about this program rather than the lesson's. */}
                  {pausedStep.file && pausedStep.file !== '<lesson_editor>' && (
                    <>
                      {' · '}
                      <span
                        data-testid="paused-file"
                        className="normal-case tracking-normal text-muted"
                      >
                        {pausedStep.file}
                      </span>
                    </>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <button
                    onClick={() => answerPause(6)}
                    data-testid="btn-step-in"
                    title="Step into the call this line is about to make: stop at its first line, in your file or a helper"
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line cursor-pointer"
                  >
                    Step in
                  </button>
                  <button
                    onClick={() => answerPause(3)}
                    data-testid="btn-step"
                    title="Run this line and stop at the next one of this file (the frame's values come with it)"
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line cursor-pointer"
                  >
                    Step
                  </button>
                  <button
                    onClick={() => answerPause(7)}
                    data-testid="btn-step-out"
                    title="Run the rest of this function and stop in its caller (at top level it runs to the end)"
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line cursor-pointer"
                  >
                    Step out
                  </button>
                  <button
                    onClick={() => answerPause(2)}
                    data-testid="btn-continue"
                    title="Run on to the end, the next breakpoint, or until you pause again"
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line cursor-pointer"
                  >
                    Continue
                  </button>
                </span>
              </div>
              {/* Quoted from the text that ran, not from the editor: a park describes a program,
                  and an edit made while it is parked must not rewrite what it is about to execute.
                  A helper's line is quoted from that helper, which is why the payload names a file. */}
              <code
                data-testid="paused-line"
                className="mt-2 block whitespace-pre overflow-x-auto font-mono text-[11.5px] text-body"
              >
                {sourceForPark(pausedStep.file, runCodeRef.current || code, helperFiles)
                  .split('\n')[pausedStep.line - 1]?.trim() ?? ''}
              </code>
              {/* A condition that raised is a mistake in the condition, not a reason to skip the
                  park or end the run: the interpreter's sentence is shown where the breakpoint is. */}
              {pausedStep.condition_error && (
                <p
                  data-testid="condition-error"
                  role="status"
                  className="mt-1.5 font-mono text-[11px]"
                  style={{ color: 'var(--rose)' }}
                >
                  {pausedStep.condition_error} — the run stopped here because the condition could not
                  be evaluated. Fix it in Breakpoints.
                </p>
              )}
              {pausedStep.values?.length > 0 && (
                <div
                  data-testid="paused-values"
                  className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted"
                >
                  {/* Each name is a button: a value you can read but not try is half a debugger. */}
                  {pausedStep.values.map((value) => (
                    <button
                      key={value.name}
                      type="button"
                      data-testid={`paused-value-${value.name}`}
                      onClick={() => {
                        setFrameEdit({ name: value.name, expression: value.value });
                        setFrameEditError('');
                      }}
                      title={`Change ${value.name} for this run — your code is untouched`}
                      className="cursor-pointer border-0 bg-transparent p-0 text-left font-mono text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-body"
                    >
                      <span className="text-accent">{value.name}</span> = {value.value}
                    </button>
                  ))}
                </div>
              )}
              {/* What the learner pinned: one question asked again at every park, so the same name
                  is answered wherever the run stops rather than only in a frame it happens to be a
                  local of. A watch that raises says so in place - this frame cannot answer it - and
                  the run stays exactly where it is. */}
              <div className="mt-1.5 space-y-1">
                {(pausedStep.watches ?? []).length > 0 && (
                  <div
                    data-testid="paused-watches"
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted"
                  >
                    {pausedStep.watches?.map((watch, index) => (
                      <span
                        key={`watch-${index}`}
                        data-testid={`paused-watch-${index}`}
                        className="inline-flex items-center gap-1"
                      >
                        <span className="text-accent">{watch.expression}</span>
                        <span className="text-muted">=</span>
                        {watch.error ? (
                          <span style={{ color: 'var(--rose)' }} title={watch.error}>
                            {watch.error}
                          </span>
                        ) : (
                          <span>{watch.value}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeWatched(watch.expression)}
                          data-testid={`btn-unwatch-${index}`}
                          title={`Unpin ${watch.expression}`}
                          aria-label={`Unpin ${watch.expression}`}
                          className="cursor-pointer border-0 bg-transparent px-0.5 text-muted hover:text-body"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <form
                  data-testid="watch-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitWatch();
                  }}
                  className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]"
                >
                  <input
                    data-testid="watch-input"
                    aria-label="Pin an expression to show beside every pause, as Python"
                    placeholder="pin an expression…"
                    value={watchDraft}
                    onChange={(event) => setWatchDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setWatchDraft('');
                      }
                    }}
                    spellCheck={false}
                    className="w-44 rounded border px-1.5 py-0.5 font-mono text-[11px] text-body"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
                  />
                  <button
                    type="submit"
                    data-testid="btn-watch"
                    title="Show this expression's value at every pause in this lesson"
                    className="px-2 py-0.5 rounded border border-line bg-canvas text-[11px] text-body cursor-pointer hover:bg-raise"
                  >
                    Watch
                  </button>
                  {(watchError || pausedStep.watch_error) && (
                    <span
                      data-testid="watch-error"
                      role="status"
                      style={{ color: 'var(--rose)' }}
                    >
                      {watchError || pausedStep.watch_error}
                    </span>
                  )}
                </form>
              </div>
              {frameEdit && pauseCapable && (
                <form
                  data-testid="frame-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    applyFrameEdit();
                  }}
                  className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px]"
                >
                  <span className="text-accent">{frameEdit.name}</span>
                  <span className="text-muted">=</span>
                  <input
                    data-testid="frame-edit-expression"
                    aria-label={`New value for ${frameEdit.name}, as a Python expression`}
                    value={frameEdit.expression}
                    onChange={(event) => {
                      const expression = event.target.value;
                      setFrameEdit((current) => (current ? { ...current, expression } : current));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setFrameEdit(null);
                      }
                    }}
                    autoFocus
                    spellCheck={false}
                    className="w-40 rounded border px-1.5 py-0.5 font-mono text-[11px] text-body"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
                  />
                  <button
                    type="submit"
                    data-testid="btn-frame-edit-apply"
                    className="cursor-pointer rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-body hover:bg-raise"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    data-testid="btn-frame-edit-cancel"
                    onClick={() => setFrameEdit(null)}
                    className="cursor-pointer rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-muted hover:bg-raise"
                  >
                    Cancel
                  </button>
                  <span className="text-muted">this run only — your code is untouched</span>
                </form>
              )}
              {frameEditError && (
                <p
                  data-testid="frame-edit-error"
                  role="status"
                  className="mt-1.5 font-mono text-[11px]"
                  style={{ color: 'var(--rose)' }}
                >
                  {frameEditError}
                </p>
              )}
            </div>
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
                onJumpToEditor={editorShown ? jumpToEditor : undefined}
              />
            )}

          {/* Code editor: a small project, not a scratch pad. `main.py` is the learner's; a helper
              the lesson imports is a second, locked tab whose text is the module Pyodide loads. */}
          <div
            ref={editorPanelRef}
            id="python-runner-editor"
            data-testid="editor-panel"
            data-tour="editor"
            // Read hides the editor rather than shrinking it: a traceback is what that preset is for.
            style={{ display: editorShown ? undefined : 'none' }}
            className="bg-panel border border-line rounded-xl overflow-hidden scroll-mt-4"
          >
            <div className="bg-canvas border-b border-line-soft flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
              <div className="flex items-center gap-1" role="tablist" aria-label="Lesson files">
                <button
                  role="tab"
                  aria-selected={openHelper === null}
                  data-testid="editor-tab-main"
                  title="main.py — F12 on a name jumps to the line that defines it"
                  onClick={() => {
                    setPendingJump(null);
                    setOpenHelper(null);
                  }}
                  className="flex items-center gap-1.5 rounded-t px-2.5 py-1.5 text-[12.5px] font-mono cursor-pointer"
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
                    onClick={() => {
                      setPendingJump(null);
                      setOpenHelper(file.name);
                    }}
                    title={`${file.name} is read-only: it is the module the checks import. F12 on a name jumps to its definition.`}
                    className="flex items-center gap-1.5 rounded-t px-2.5 py-1.5 text-[12.5px] font-mono cursor-pointer"
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
                {symbolMiss ? (
                  <span role="status" data-testid="symbol-miss" style={{ color: 'var(--muted)' }}>
                    no definition for <code style={{ color: 'var(--accent)' }}>{symbolMiss}</code>
                  </span>
                ) : openHelperFile ? (
                  `${openHelperFile.content.split('\n').length} lines · read-only`
                ) : (
                  `${code.split('\n').length} lines${sliderCount ? ` · ${sliderCount} slider${sliderCount === 1 ? '' : 's'}` : ''}`
                )}
                {/* Which mode is reading the keys. A live region, not decoration: with Vim on, a
                    keystroke that does nothing is correct behaviour, and this is the only place the
                    screen says which mode it is correct in. */}
                {vimOn && (
                  <span
                    role="status"
                    data-testid="vim-mode"
                    title="The mode the editor is reading keys in — Escape for NORMAL, i for INSERT"
                    className="ml-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em]"
                    style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
                  >
                    {vimModeLabel(vimMode)}
                  </span>
                )}
              </span>
              {/* The run controls live in the editor's own header: a learner's eyes are in the code,
                  and crossing the screen to press Run was the one trip this card can save. Read
                  hides this header, so the toolbar falls back to the top of the page there. */}
              {editorShown && (
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                  {runnerToolbar}
                </div>
              )}
            </div>
            {/* The code and the output are one card, and the run's output sits under the editor or
                beside it (`workspaceLayout.ts` remembers which). Read has no editor, so the output
                falls back to the results column there. */}
            <div
              className={
                editorShown && resultsSplit && !columnsArrangement
                  ? 'lg:flex lg:items-stretch'
                  : undefined
              }
            >
              <div className="min-w-0 flex-1">
            {coEdit && (
              <p
                role="status"
                data-testid="coedit-status"
                className="border-b px-3 py-1.5 text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--emerald, var(--accent))', backgroundColor: 'var(--bg)' }}
              >
                Co-editing {lessonLabel(coEdit.lesson)} with {pair.peer ?? 'the other workbench'} ·{' '}
                {coEdit.remote === 0
                  ? 'no edits from them yet'
                  : `${coEdit.remote} of their edits`}{' '}
                · undo is yours
              </p>
            )}
            {!coEdit && collabNotice && (
              <p
                role="status"
                data-testid="coedit-notice"
                className="border-b px-3 py-1.5 text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', backgroundColor: 'var(--bg)' }}
              >
                {collabNotice}
              </p>
            )}
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
                  ref={helperEditorRef}
                  value={openHelperFile.content}
                  readOnly
                  ariaLabel={`${openHelperFile.name}, read-only lesson helper`}
                  testId="editor-helper"
                  onGoToDefinition={goToDefinition}
                  initialLine={pendingJump?.file === openHelperFile.name ? pendingJump.line : undefined}
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
                onGoToDefinition={goToDefinition}
                onRunCell={runCellTo}
                onToggleBreakpoint={toggleBreakpointAt}
                onBreakpointsMoved={followBreakpointEdits}
                breakpoints={breakpoints}
                vimMode={vimOn}
                onVimMode={setVimMode}
                initialLine={pendingJump?.file === MAIN_FILE_NAME ? pendingJump.line : undefined}
              />
            )}
              </div>
              {editorShown && (
                <div
                  data-testid="editor-results"
                  style={{ display: layoutShows(shownLayout, 'results') ? undefined : 'none' }}
                  className={
                    resultsSplit && !columnsArrangement
                      ? 'border-t border-line-soft lg:w-[46%] lg:border-l lg:border-t-0'
                      : 'border-t border-line-soft'
                  }
                >
                  {resultsPanel}
                </div>
              )}
            </div>
          </div>

          {/* Everything that reports on the editor. One wrapper, because Split's second column is
              exactly this block: the checker, the trace, the scope and the output describe the code,
              and a preset that moved only half of them would put a verdict beside nothing. */}
          {/* The results column is the divider's anchor: the handle sits in the gap on its left
              edge, which is the boundary itself. Dragging it moves the boundary, and the share it
              leaves behind is remembered. Hidden below `lg`, where the two halves stack and there
              is no boundary to drag. */}
          <div className="space-y-4 relative" data-testid="results-column" data-side={resultsSide}>
          {layoutArrangement(layout) === 'columns' && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the editor and results columns"
              aria-valuemin={splitRatioPercent(SPLIT_MIN_RATIO)}
              aria-valuemax={splitRatioPercent(SPLIT_MAX_RATIO)}
              aria-valuenow={splitRatioPercent(splitRatio)}
              aria-valuetext={`${splitRatioPercent(splitRatio)}% editor`}
              data-side={resultsSide}
              title="Drag to resize · double-click for an even split · ←/→ also work"
              data-testid="split-divider"
              tabIndex={0}
              onPointerDown={beginSplitDrag}
              onPointerMove={moveSplitDrag}
              onPointerUp={endSplitDrag}
              onPointerCancel={endSplitDrag}
              onDoubleClick={() => commitSplitRatio(DEFAULT_SPLIT_RATIO)}
              onKeyDown={(event) => {
                const next = splitRatioAfterKey(splitRatio, event.key, event.shiftKey, resultsSide);
                if (next === null) return;
                event.preventDefault();
                commitSplitRatio(next);
              }}
              className={`hidden lg:flex absolute top-0 bottom-0 z-10 w-3 cursor-col-resize touch-none items-center justify-center ${
                resultsSide === 'left' ? '-right-3' : '-left-3'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-10 w-[3px] rounded-full transition-colors ${draggingSplit ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                style={{ background: draggingSplit ? 'var(--accent)' : 'var(--muted)' }}
              />
            </div>
          )}
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
                  Checker · pyflakes + pycodestyle
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
            data-tour="checks-panel"
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
                      className="px-2 py-0.5 rounded bg-amber/15 hover:bg-amber/25 text-amber-strong border border-amber/40 cursor-pointer"
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

          {/* The run trace: the last run replayed step by step, beside the output it explains. A
              recording, so it is gone when an edit makes it describe a program that no longer exists. */}
          <div style={{ display: layoutShows(shownLayout, 'results') ? undefined : 'none' }}>
            <TracePanel
              trace={trace}
              step={traceStep}
              onStep={setTraceStep}
              source={runCodeRef.current || code}
              onReveal={showMainLine}
            />
          </div>

          {/* The Scope: the learner's own traced signal, drawn the moment the first batch lands. */}
          <ScopePanel
            series={scopeSeries}
            pinned={pinnedScope}
            onPin={() => setPinnedScope(scopeSeries)}
            onUnpin={() => setPinnedScope(null)}
          />

          {/* The output lives in the editor's own card (`editor-results`), under the header of the
              code that produced it. There is no results-only preset any more — Read keeps the
              lesson text and Write keeps the editor — so there is no second home for it here. */}
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
