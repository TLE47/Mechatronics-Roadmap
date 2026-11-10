import { useEffect, useRef, useState } from 'react';
import type { RobotCommandMessage, RobotReply, RobotRunApi, RobotScenario } from '../../../robotSim/model';
import { armRobotWait, cancelRobotWait, writeRobotReply } from '../../../robotSim/protocol';
import type { MutableRefObject, RefObject } from 'react';
import { MECHALAB_PLANT_FILENAME, MECHALAB_PLANT_PY } from '../../../data/mechalabPlant';
import type { PythonLessonItem } from '../../../data/pythonLessonsData';
import type { LessonFile } from '../../../lessonFiles';
import type { Breakpoint } from '../../../editor/breakpoints';
import { breakpointsForRun } from '../../../editor/breakpoints';
import { cellPrefix } from '../../../editor/cells';
import type { PythonEditorHandle } from '../../PythonEditor';
import { pyodideCdn } from '../../../runtime/pyodideCdn';
import { asOutputMatchMode, compareStdout, type OutputMatchMode } from '../../../outputMatch';
import { inlineValuesFor, readRunValues } from '../../../inlineValues';
import { readTrace, TRACE_NAME_CAP, TRACE_STEP_CAP, TRACE_VALUE_CHARS } from '../../../runTrace';
import { harnessGate, parseHarnessReport } from '../../../harnessGrading';
import { harnessForLesson, harnessSourceForLesson } from '../../../lessonHarnesses';
import { normalizeScopeSeries } from '../../../scopeModel';
import { isAssertionFailure } from '../../../traceback';
import { PyodideWorkerSession } from '../../../runtime/pyodideWorker';
import type { AnalysisSession } from '../../../analysisClient';
import type { HarnessReport } from '../../../harnessGrading';
import type { PausedStep } from './PausedBar';
import type { TraceSnapshot } from '../../../runTrace';
import type { ScopeSeries } from '../../../scopeModel';
import {
  readWatches,
  writeWatches,
  addWatch,
  removeWatch,
  normalizeWatch,
  normalizeWatches,
  MAX_WATCHES_PER_LESSON,
} from '../../../editor/watches';

/**
 * How large a frame edit may be, in UTF-8 bytes.
 *
 * The shared buffer is 8 bytes of `[state, length]` plus this many bytes of payload: an expression a
 * learner types into one line, with room to spare, and small enough that the copy is never a pause.
 */
export const FRAME_EDIT_BYTES = 2000;

/** The page's own execution budget when a suite has not overridden it in the window. */
export const DEFAULT_EXECUTION_TIMEOUT_MS = 6000;
export const DEFAULT_MAX_TRACE_STEPS = 400000;

export type PassStatus =
  | 'untested'
  | 'passed'
  | 'harness_failed'
  | 'behavior_failed'
  | 'mismatch'
  | 'stopped'
  | 'error';

interface RunnerExecutionInput {
  /** The lesson on screen: watches are stored per lesson, and a park names the file it is in. */
  selectedId: string;
  /** The lesson a run grades when the caller does not name one, read at call time. */
  currentLessonRef: MutableRefObject<PythonLessonItem>;
  /** True while the editor holds a page's snippet: every run then is ungraded. */
  scratchRef: MutableRefObject<boolean>;
  /** The text Run executes now, written synchronously, not the text the button was rendered with. */
  codeRef: MutableRefObject<string>;
  helperFiles: LessonFile[];
  breakpoints: Breakpoint[];
  /** The editor's handle, for inline values, a revealed line and a cell's prefix. */
  editorRef: RefObject<PythonEditorHandle | null>;
  markLessonVerified: (lessonId: string) => void;
  /** The id the run and watch paths read from timers, which outlive a render. */
  lessonIdRef: MutableRefObject<string>;
}

/**
 * The lesson runner's worker session and the state a run writes.
 *
 * The protocol - run identity, kill clock, dispose - has one owner (`runtime/pyodideWorker.ts`). What
 * only a lesson runner has is here: the shared buffers Stop, stdin, Pause and frame edits need, the
 * analysis listener, the status line, and every cell the run's outcome lands in. The tab composes
 * this with the lesson, the editor and the chrome; it no longer owns any of it.
 */
export function useRunnerExecution({
  selectedId,
  lessonIdRef,
  currentLessonRef,
  scratchRef,
  codeRef,
  helperFiles,
  breakpoints,
  editorRef,
  markLessonVerified,
}: RunnerExecutionInput) {
  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
  // Runs completed per lesson: Hint 2 waits for one, so the ladder is not a table of contents.
  const [runAttempts, setRunAttempts] = useState<Record<string, number>>({});
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
  // The expressions pinned in the paused bar, per lesson: `total` is one lesson's variable, so the
  // list travels with the file it was written for.
  const [watches, setWatches] = useState<string[]>(() => readWatches(selectedId));
  // The expression being typed, and why the last one was refused: a bar already at its cap says so
  // instead of silently dropping a watch nobody asked it to drop.
  const [watchDraft, setWatchDraft] = useState<string>('');
  const [watchError, setWatchError] = useState<string>('');
  // Whether this page got a shared command word, which is what makes a park possible at all. State,
  // not `pauseRef.current`: the buffer is created when the worker is, and a ref would not re-render
  // the toolbar - the button would exist only after the learner pressed something else.
  const [pauseCapable, setPauseCapable] = useState(false);
  // The pass toast is short and dismissable by time alone: it exists to carry the learner into the
  // next lesson while the win is fresh, not to become another panel to close.
  const [showPassToast, setShowPassToast] = useState<boolean>(false);
  const [pyodideStatus, setPyodideStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [passStatus, setPassStatus] = useState<PassStatus>('untested');
  const [stdinPrompt, setStdinPrompt] = useState<string | null>(null);
  const [stdinValue, setStdinValue] = useState<string>('');
  const [readyMs, setReadyMs] = useState<number | null>(null);
  // Changes only when the worker is replaced. A Stop that interrupts keeps it; a Stop that had to
  // terminate shows a new one, which is exactly the distinction the runtime suite checks.
  const [runtimeBoot, setRuntimeBoot] = useState<string | null>(null);
  // The run's traced signals. Empty means the run drew nothing, which is the normal case for a
  // lesson that only prints, so the panel renders nothing at all rather than an empty frame.
  const [scopeSeries, setScopeSeries] = useState<ScopeSeries[]>([]);
  // The run trace and the step on screen (`app/src/runTrace.ts`): a recording of the last run,
  // replayed rather than paused. Reset with the run, read from the outcome that ended it.
  const [trace, setTrace] = useState<TraceSnapshot | null>(null);
  const [traceStep, setTraceStep] = useState(0);
  // The run pinned as A: its traces stay on the axes while the next run draws over them as B.
  const [pinnedScope, setPinnedScope] = useState<ScopeSeries[] | null>(null);

  // One analysis channel per page, bound to whichever worker is current (Reset Runtime replaces it).
  const analysisRef = useRef<AnalysisSession | null>(null);
  // The status the warm-up promise has to know about without re-rendering: a worker that is already
  // loaded answers a second `warm` with silence (it has nothing new to report), so the page has to
  // remember for itself that Python is up.
  const pyodideStatusRef = useRef<'idle' | 'loading' | 'ready' | 'error'>('idle');
  // Shared memory between the page and the interpreter: [interrupt] and [state, length, bytes].
  // Both are null when the page is not cross-origin isolated, and Stop falls back to terminating.
  const interruptRef = useRef<SharedArrayBuffer | null>(null);
  const stdinCtrlRef = useRef<SharedArrayBuffer | null>(null);
  // Pause: two shared words, because a message cannot reach a worker that is parked inside Python.
  // Word 0 is the command this page writes, word 1 the status the worker sets (see the worker's
  // `pauseAt`). Null means the browser gave no SharedArrayBuffer, and then Pause is simply absent - a
  // button that cannot work is worse than one that is not offered.
  const pauseRef = useRef<SharedArrayBuffer | null>(null);
  // The robot's command word, waited on by the worker and answered by `onMessage` below.
  const robotBufferRef = useRef<SharedArrayBuffer | null>(null);
  // The exact source the current robot run executed. The pane asks for a line's text while it
  // presents that run, and reading the editor's live draft would describe code that did not run.
  const robotCodeRef = useRef<string>('');
  // Robot Pause is a gate on this side: the worker is blocked on the command word, so parking the
  // next command here is what stops the run at the next robot call instead of between lines of Python.
  const robotPausedRef = useRef(false);
  const robotGateRef = useRef<(() => void) | null>(null);
  const robotStepOnceRef = useRef(false);
  const [robotRunning, setRobotRunning] = useState(false);
  const [robotPaused, setRobotPaused] = useState(false);
  // A change to a parked frame's values. The command word decides, the payload rides here: the same
  // `[length, bytes]` shape stdin uses, for the same reason - a message queues behind the park.
  const frameEditRef = useRef<SharedArrayBuffer | null>(null);
  const stopFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when the worker is replaced: a warm-up that already ran must run again for the new one.
  const warmStartedRef = useRef<boolean>(false);

  const sessionRef = useRef<PyodideWorkerSession | null>(null);
  const session = (sessionRef.current ??= new PyodideWorkerSession({
    onStatus: (data) => {
      if (data.status === 'loading') setPyodideStatus('loading');
      else if (data.status === 'ready') {
        setPyodideStatus('ready');
        if (typeof data.ms === 'number') setReadyMs(data.ms);
        if (data.boot) setRuntimeBoot(String(data.boot));
      } else if (data.status === 'error') setPyodideStatus('error');
    },
    onCreate: (worker) => {
      // Cross-origin isolation is what makes SharedArrayBuffer exist. With it, Stop raises
      // KeyboardInterrupt in the running program and the session survives; without it, Stop still
      // works, by terminating the worker (the old behaviour).
      try {
        if (typeof SharedArrayBuffer !== 'undefined') {
          interruptRef.current = new SharedArrayBuffer(4);
          stdinCtrlRef.current = new SharedArrayBuffer(8 * 1024);
          pauseRef.current = new SharedArrayBuffer(8);
          frameEditRef.current = new SharedArrayBuffer(8 + FRAME_EDIT_BYTES);
          robotBufferRef.current = new SharedArrayBuffer(8 + 64 * 1024);
          setPauseCapable(true);
          worker.postMessage({
            type: 'init',
            interruptBuffer: interruptRef.current,
            stdinBuffer: stdinCtrlRef.current,
            pauseBuffer: pauseRef.current,
            editBuffer: frameEditRef.current,
            robotBuffer: robotBufferRef.current,
          });
        }
      } catch {
        interruptRef.current = null;
        stdinCtrlRef.current = null;
        pauseRef.current = null;
        frameEditRef.current = null;
        robotBufferRef.current = null;
      }
      // A brand-new worker has not loaded Python, so the status has to stop saying it has. A tab
      // switch terminates the worker while this component's state survives it, and the next mount
      // warms a new one - without this, the chip reads "Python ready" for the whole re-download, and
      // every request gated on readiness (completions, hover, signature, lint) believes it too.
      setPyodideStatus('idle');
      pyodideStatusRef.current = 'idle';
      worker.addEventListener('message', (event: MessageEvent) => {
        analysisRef.current?.handleMessage(event.data);
      });
    },
  }));

  useEffect(() => {
    return () => {
      session.dispose();
      if (stopFallbackRef.current) {
        clearTimeout(stopFallbackRef.current);
        stopFallbackRef.current = null;
      }
      // A tab can be taken off screen without this component losing its state (the phone shell and
      // the tab panels keep views mounted), and the worker goes with the effects. Forgetting the warm
      // guard is what lets the next activation warm a new one; forgetting the status is a chip that
      // says "Python ready" about a worker that was terminated.
      warmStartedRef.current = false;
      pyodideStatusRef.current = 'idle';
      setPyodideStatus('idle');
      // A run cannot outlive the worker that was executing it: its promise was abandoned with the
      // effects, so the Run button must not come back disabled as if the program were still going.
      setIsRunning(false);
    };
  }, []);

  /** Ask the interpreter to stop at the next line of the learner's file. */
  const pauseExecution = () => {
    const buffer = pauseRef.current;
    if (!buffer || !isRunning || pausedStep) return;
    const view = new Int32Array(buffer, 0, 2);
    Atomics.store(view, 0, 1);
    Atomics.notify(view, 0);
  };

  /** Answer a parked interpreter: 2 continue, 3 step, 4 stop, 6 step into the call, 7 step out. */
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
    session.resumeClock();
  };

  const stopExecution = (customMessage?: string) => {
    const runId = session.runId;
    // A parked interpreter is not on the interrupt word's clock: it is waiting on the pause word, so
    // wake that wait with a stop of its own.
    if (pauseRef.current) {
      const pause = new Int32Array(pauseRef.current, 0, 2);
      Atomics.store(pause, 0, 4);
      Atomics.notify(pause, 0);
      setPausedStep(null);
      setFrameEdit(null);
      setFrameEditError('');
    }
    // With shared memory, stop in place: the interpreter raises KeyboardInterrupt inside the running
    // program, so imports, variables and the loaded runtime all survive. A worker that cannot unwind
    // within the grace period is terminated by the fallback below.
    if (session.worker && interruptRef.current) {
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
        if (!session.isCurrent(runId) || !session.running) return;
        session.dispose();
        setIsRunning(false);
        setPyodideStatus('idle');
        setBehaviorCheck('failed');
        setPassStatus('stopped');
        setStderr(
          'Execution stopped: the interpreter did not unwind, so the worker was restarted. Your editor code is preserved.'
        );
        session.settle({ stopped: true });
      }, 1500);
      return;
    }
    const stopMsg =
      customMessage ||
      'Execution stopped by user. Background Python Web Worker was terminated and your editor code is preserved.';
    session.cancel({ stopped: true, message: stopMsg });
    setIsRunning(false);
    setPyodideStatus('idle');
    setBehaviorCheck('failed');
    setPassStatus('stopped');
    setStderr(stopMsg);
  };

  const resetRuntime = () => {
    session.cancel({ stopped: true, message: 'Runtime reset' });
    setIsRunning(false);
    setPyodideStatus('idle');
    setStdout('');
    setStderr(
      'Python Web Worker runtime reset. Your editor code is preserved — click "Run & Verify" to start a fresh session.'
    );
    setInstructorError('');
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setPassStatus('untested');
  };

  /** Picking a value is the start of an edit, so the last refusal goes with it. */
  const handleFrameEdit = (edit: { name: string; expression: string } | null) => {
    setFrameEdit(edit);
    setFrameEditError('');
  };

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
   * Pin the typed expression. Stored per lesson first, then sent to the parked worker so the value
   * appears beside it: a bar that showed a watch with nothing next to it, one Step before its first
   * answer, would look broken. A bar at its cap refuses here, in words — evicting a watch the learner
   * chose would be a silent edit to their list.
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

  // `lesson` defaults to the rendered lesson; Run passes the one selected at click time. `grade`
  // defaults to true; a cell's **Run to here** passes false, because a prefix of the program is not an
  // attempt at the lesson and must never verify it (`app/src/editor/cells.ts`). Scratch is the third
  // case and the simplest: a page's snippet is not an attempt either, so every run in scratch is
  // ungraded however it was started - the button, the shortcut, the palette, watch or a slider.
  const runPythonCode = async (
    sourceCode: string,
    lesson: PythonLessonItem = currentLessonRef.current,
    options: {
      grade?: boolean;
      /** A lesson-scoped Python module and the page's answer to each robot command. */
      robot?: {
        python: string;
        /** The last learner line the worker should sample; the appended probe is past this. */
        stepMaxLine?: number;
        onCommand: (message: RobotCommandMessage) => Promise<RobotReply>;
      };
    } = {}
  ) => {
    const grade = options.grade !== false && !scratchRef.current;
    const matchMode: OutputMatchMode = asOutputMatchMode(lesson.outputMatch);
    const attemptLessonId = lesson.id;
    let runId = 0;

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

    const cdnUrl = pyodideCdn();
    const timeoutMs =
      (typeof window !== 'undefined' && window.__mechalabExecutionTimeoutMs) ||
      DEFAULT_EXECUTION_TIMEOUT_MS;
    const maxSteps =
      (typeof window !== 'undefined' && window.__mechalabMaxTraceSteps) || DEFAULT_MAX_TRACE_STEPS;

    try {
      const started = session.run(
        {
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
          robot: options.robot
            ? { python: options.robot.python, stepMaxLine: options.robot.stepMaxLine }
            : undefined,
        },
        // The first load also fetches Pyodide, so it gets the longer clock; once the interpreter
        // reports ready the run's own budget applies.
        { loadKillMs: Math.max(timeoutMs, 45_000), killMs: timeoutMs },
        {
          // Everything that is not a verdict: a waiting `input()`, a scope batch, or a park (whose
          // clock the session has already stopped). A stale run's messages never reach here.
          onMessage: (data) => {
            if (data.type === 'robot') {
              const handling = options.robot;
              if (!handling) return;
              void (async () => {
                try {
                  const reply = await handling.onCommand({
                    command: String(data.command || ''),
                    args: (data.args as Record<string, unknown>) || {},
                    line: Number(data.line) || 0,
                  });
                  writeRobotReply(robotBufferRef.current, reply);
                } catch (error) {
                  writeRobotReply(robotBufferRef.current, {
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
              })();
              return;
            }
            if (data.type === 'stdin-request') {
              setStdinPrompt(String(data.prompt || ''));
              setStdinValue('');
              return;
            }
            if (data.type === 'scope') {
              setScopeSeries(normalizeScopeSeries(data.series));
              return;
            }
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
          },
        }
      );
      runId = session.runId;
      const workerOutcome: any = await started;
      if (!session.isCurrent(runId)) return;

      if (workerOutcome?.stopped) {
        // The interpreter was interrupted, not killed: it is still loaded for the next Run.
        setStdinPrompt(null);
        // No values: a stopped run is not a finished one, and a half-filled namespace drawn as if it
        // were an answer is worse than no answer.
        editorRef.current?.setInlineValues([]);
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

      if (workerOutcome?.timedOut) {
        editorRef.current?.setInlineValues([]);
        if (workerOutcome?.stdout) setStdout(workerOutcome.stdout);
        const label =
          workerOutcome.phase === 'load' ? 'Initial WASM load + execution' : 'Python execution';
        setStderr(
          workerOutcome.type === 'timeout'
            ? `ExecutionTimeoutError: ${label} exceeded ${(Number(workerOutcome.ms) / 1000).toFixed(
                1
              )}s limit and the background Web Worker was terminated (possible infinite loop such as 'while True:'). Your editor code is preserved — fix the loop condition or click Reset Runtime.`
            : workerOutcome.message || workerOutcome.stderr || 'Execution timed out.'
        );
        // The lines that ran before the budget ran out: the tail is exactly where the loop turned.
        setTrace(readTrace(workerOutcome?.trace));
        setTraceStep(0);
        setBehaviorCheck('failed');
        setPassStatus('stopped');
        return;
      }

      if (workerOutcome?.type === 'error') {
        setPyodideStatus('error');
        setStderr(
          workerOutcome.error ||
            (workerOutcome.workerFailed
              ? 'Pyodide Web Worker failed to initialize or load from CDN. Execution verification requires Pyodide WASM.'
              : 'Execution error')
        );
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
      editorRef.current?.setInlineValues(
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
      if (session.isCurrent(runId)) {
        setIsRunning(false);
        setPausedStep(null);
      }
      if (stopFallbackRef.current) {
        clearTimeout(stopFallbackRef.current);
        stopFallbackRef.current = null;
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
    void runPythonCode(prefix, currentLessonRef.current, { grade: false });
  };


  const releaseRobotGate = () => {
    const release = robotGateRef.current;
    robotGateRef.current = null;
    release?.();
  };

  const waitRobotGate = async () => {
    if (!robotPausedRef.current) return;
    if (robotStepOnceRef.current) {
      robotStepOnceRef.current = false;
      return;
    }
    await new Promise<void>((resolve) => {
      robotGateRef.current = resolve;
    });
  };

  const showRobotLine = (line: number | null) => {
    editorRef.current?.setRunLine(line);
  };

  const startRobot = (
    scenario: RobotScenario,
    onCommand: (message: RobotCommandMessage) => Promise<RobotReply>
  ) => {
    if (isRunning) return;
    robotPausedRef.current = false;
    robotStepOnceRef.current = false;
    setRobotPaused(false);
    armRobotWait(robotBufferRef.current);
    setRobotRunning(true);
    showRobotLine(null);
    // The learner's own lesson code, then one read-only probe. The probe is not an example and is
    // never written to the editor: it only asks Python for the names this lesson binds. The line
    // count stops the worker's per-line samples before that appended probe, so its helper lines
    // never put a box on the last line of main.py.
    const learnerCode = codeRef.current.replace(/\s*$/, '');
    robotCodeRef.current = learnerCode;
    const stepMaxLine = learnerCode.trim() ? learnerCode.split('\n').length : 0;
    const source = `${learnerCode}\n\n# Robot view: read this lesson's own values.\n${scenario.probe}\n`;
    void runPythonCode(source, currentLessonRef.current, {
      grade: false,
      robot: {
        python: scenario.python,
        stepMaxLine,
        onCommand: async (message) => {
          await waitRobotGate();
          return onCommand(message);
        },
      },
    }).finally(() => {
      setRobotRunning(false);
      setRobotPaused(false);
      robotPausedRef.current = false;
      // The Robot pane owns the box after the worker finishes: it may still be presenting the
      // sampled lines at the chosen speed. Its final frame, Reset or a failed run clears it.
      releaseRobotGate();
    });
  };

  const pauseRobot = () => {
    if (!robotRunning) return;
    robotPausedRef.current = true;
    setRobotPaused(true);
  };

  const resumeRobot = () => {
    robotPausedRef.current = false;
    robotStepOnceRef.current = false;
    setRobotPaused(false);
    releaseRobotGate();
  };

  const stepRobot = () => {
    if (!robotPausedRef.current) return;
    robotStepOnceRef.current = true;
    releaseRobotGate();
  };

  const stopRobot = () => {
    cancelRobotWait(robotBufferRef.current);
    robotPausedRef.current = false;
    robotStepOnceRef.current = false;
    setRobotPaused(false);
    setRobotRunning(false);
    showRobotLine(null);
    releaseRobotGate();
    stopExecution();
  };

  return {
    session,
    analysisRef,
    pyodideStatusRef,
    interruptRef,
    stdinCtrlRef,
    pauseRef,
    frameEditRef,
    stopFallbackRef,
    warmStartedRef,
    stdout,
    setStdout,
    stderr,
    setStderr,
    runAttempts,
    setRunAttempts,
    instructorError,
    setInstructorError,
    harnessReport,
    setHarnessReport,
    behaviorCheck,
    setBehaviorCheck,
    outputCheck,
    setOutputCheck,
    isRunning,
    setIsRunning,
    robot: {
      start: startRobot,
      pause: pauseRobot,
      resume: resumeRobot,
      step: stepRobot,
      stop: stopRobot,
      isRunning: robotRunning,
      paused: robotPaused,
      pauseCapable,
      showLine: showRobotLine,
      readLine: (line: number) => {
        if (!Number.isInteger(line) || line < 1) return null;
        const text = robotCodeRef.current.split('\n')[line - 1];
        return text === undefined ? null : text.trim() || null;
      },
      readSource: () => robotCodeRef.current,
    } satisfies RobotRunApi,
    pausedStep,
    setPausedStep,
    frameEdit,
    setFrameEdit,
    frameEditError,
    setFrameEditError,
    watches,
    setWatches,
    watchDraft,
    setWatchDraft,
    watchError,
    setWatchError,
    pauseCapable,
    setPauseCapable,
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
    setRuntimeBoot,
    scopeSeries,
    setScopeSeries,
    trace,
    setTrace,
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
  };
}
