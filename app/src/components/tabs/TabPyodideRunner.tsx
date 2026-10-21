import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PYTHON_LESSONS, PythonLessonItem } from '../../data/pythonLessonsData';
import { MECHALAB_PLANT_FILENAME, MECHALAB_PLANT_PY } from '../../data/mechalabPlant';
import { asOutputMatchMode, compareStdout, OutputMatchMode } from '../../outputMatch';
import { coachForLesson } from '../../lessonCoach';
import { lessonPageUrl } from '../../startHere';
import { FaultBench08 } from '../FaultBench08';
import type { HarnessReport } from '../../harnessGrading.ts';
import { harnessGate, parseHarnessReport } from '../../harnessGrading.ts';
import { harnessForLesson, harnessSourceForLesson } from '../../lessonHarnesses.ts';
import { LessonHarnessPanel } from '../LessonHarnessPanel';
import { logEvent } from '../../learningLog';
import { rememberLessonInUrl } from '../../lessonRoute';
import { rememberLastLesson } from '../../lastLesson';
import { readDraft, saveDraft } from '../../lessonDraft';
import {
  clearHistory,
  recordSnapshot,
  snapshotAgeLabel,
  snapshotsFor,
  verdictLabel,
} from '../../draftHistory';
import { MAIN_FILE_NAME, helperFilesForLesson } from '../../lessonFiles';
import { parseSliders } from '../../editor/sliderModel';
import { PythonEditor, type PythonEditorHandle } from '../PythonEditor';
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
} from 'lucide-react';

declare global {
  interface Window {
    __mechalabPyodideCdnUrl?: string;
    __mechalabExecutionTimeoutMs?: number;
    __mechalabMaxTraceSteps?: number;
  }
}

const DEFAULT_PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const DEFAULT_EXECUTION_TIMEOUT_MS = 6000;
const DEFAULT_MAX_TRACE_STEPS = 400000;

export const STORAGE_KEY_VERIFIED = 'mechalab_pyodide_verified_v1';
export const STORAGE_KEY_COMPLETED = 'mechalab_pyodide_completed_v1';
// A JSON array of lesson ids whose first-run coach the learner hid. The old P.1-only key stored
// '1', which means P.1 was hidden, not that every lesson's later brief should be.
export const STORAGE_KEY_FIRST_GUIDE = 'mechalab_first_guide_dismissed_v1';

const PYODIDE_WORKER_SOURCE = `
let pyodideInstance = null;
let loadedCdnUrl = null;
// One load at a time. The page warms the runtime on idle, and the first Run can arrive while that
// download is still in flight; without this promise the run would start a second importScripts.
let loadPromise = null;

// Interrupt + stdin. A SharedArrayBuffer lets the page stop the interpreter in place: setting the
// interrupt word raises KeyboardInterrupt inside the running program, so the session (imports,
// variables, the 10 MB download) survives the Stop. Without cross-origin isolation there is no
// SharedArrayBuffer; the page then falls back to terminating the worker, which still stops the run.
let interruptView = null;
let stdinView = null;
let stdinBytes = null;
let activeRunId = null;
let stopRequested = false;
// One id per worker. Stop must interrupt the interpreter, not replace it; the page can only tell
// those apart by seeing whether this id changed, so it is reported with the ready status.
const BOOT_ID = Math.random().toString(36).slice(2, 10);
const STDIN_STATE = 0;
const STDIN_LENGTH = 1;

// Blocking input(), kept in the worker so the UI never freezes: post the prompt, then wait on the
// shared word until the page writes the line (1) or cancels the run (-1).
function readStdin(prompt) {
  if (!stdinView) return '';
  Atomics.store(stdinView, STDIN_STATE, 0);
  Atomics.store(stdinView, STDIN_LENGTH, 0);
  self.postMessage({ type: 'stdin-request', runId: activeRunId, prompt: String(prompt || '') });
  Atomics.wait(stdinView, STDIN_STATE, 0);
  if (Atomics.load(stdinView, STDIN_STATE) === -1) {
    throw new Error('Execution stopped by user.');
  }
  const length = Atomics.load(stdinView, STDIN_LENGTH);
  const bytes = new Uint8Array(stdinBytes, 8, length).slice();
  return new TextDecoder().decode(bytes);
}

function installStdinBridge(py) {
  if (py.__mechalabStdinInstalled) return;
  py.globals.set('__mechalab_read_stdin__', readStdin);
  py.runPython(
    'import builtins\\n' +
      'def __mechalab_input(prompt=""):\\n' +
      '    return __mechalab_read_stdin__(str(prompt))\\n' +
      'builtins.input = __mechalab_input\\n'
  );
  py.__mechalabStdinInstalled = true;
}

async function ensurePyodideLoaded(cdnUrl) {
  if (pyodideInstance && loadedCdnUrl === cdnUrl) {
    return pyodideInstance;
  }
  // Any in-flight load is the load: Pyodide comes from one CDN, and two importScripts calls in one
  // worker would race the interpreter's global.
  if (loadPromise) {
    return loadPromise;
  }
  loadedCdnUrl = cdnUrl;
  self.postMessage({ type: 'status', status: 'loading' });
  loadPromise = (async () => {
    try {
      importScripts(cdnUrl + 'pyodide.js');
      if (typeof self.loadPyodide !== 'function') {
        throw new Error('loadPyodide not exposed by pyodide.js');
      }
      const startedAt = performance.now();
      pyodideInstance = await self.loadPyodide({ indexURL: cdnUrl });
      if (interruptView) pyodideInstance.setInterruptBuffer(interruptView);
      installStdinBridge(pyodideInstance);
      // The measured load, not a guess: the status line tells a learner what the wait actually was.
      self.postMessage({
        type: 'status',
        status: 'ready',
        boot: BOOT_ID,
        ms: Math.round(performance.now() - startedAt),
      });
      return pyodideInstance;
    } catch (err) {
      loadPromise = null;
      loadedCdnUrl = null;
      self.postMessage({ type: 'status', status: 'error' });
      throw new Error(
        'Pyodide WebAssembly runtime could not be loaded from CDN (' +
          (err && err.message ? err.message : String(err)) +
          '). Execution verification requires Pyodide WASM.'
      );
    }
  })();
  return loadPromise;
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === 'init') {
    interruptView = msg.interruptBuffer ? new Int32Array(msg.interruptBuffer) : null;
    stdinView = msg.stdinBuffer ? new Int32Array(msg.stdinBuffer, 0, 2) : null;
    stdinBytes = msg.stdinBuffer || null;
    if (interruptView && pyodideInstance) pyodideInstance.setInterruptBuffer(interruptView);
    return;
  }
  if (msg.type === 'stop') {
    stopRequested = true;
    if (interruptView) {
      Atomics.store(interruptView, 0, 2);
      Atomics.notify(interruptView, 0);
    }
    // A program waiting for input is not on the interpreter's clock: wake that wait too.
    if (stdinView) {
      Atomics.store(stdinView, STDIN_STATE, -1);
      Atomics.notify(stdinView, STDIN_STATE);
    }
    return;
  }
  // The page warms the runtime while the learner is still reading, so the first Run is a warm run.
  // A failed warm-up is silent: the run that needs the runtime reports the failure itself.
  if (msg.type === 'warm') {
    try {
      await ensurePyodideLoaded(msg.cdnUrl);
    } catch (err) {
      self.postMessage({ type: 'warm', status: 'unavailable' });
    }
    return;
  }
  if (msg.type === 'run') {
    const {
      runId,
      studentCode,
      instructorTests,
      benchSource,
      cdnUrl,
      maxSteps = 400000,
      timeoutSec = 4.0,
      plantSource,
      plantFilename,
      helperFiles = [],
    } = msg;

    // A fresh run starts un-stopped: clear the interrupt word a previous Stop left set.
    stopRequested = false;
    activeRunId = runId;
    if (interruptView) Atomics.store(interruptView, 0, 0);
    const capturedOut = [];
    const capturedErr = [];
    let captureEnabled = true;

    try {
      const py = await ensurePyodideLoaded(cdnUrl);
      // Install the shared plant once per runtime: one file on the Pyodide filesystem and one
      // importable name, so every Tier 2 and Tier 3 exercise works the same arm the Tier 1
      // capstone builds (resources/plants/mechalab_plant.py, embedded by
      // scripts/generate_plant_data.py).
      if (plantSource && plantFilename && py.__mechalabPlantInstalled !== plantFilename) {
        py.FS.writeFile('/' + plantFilename, plantSource);
        py.runPython('import sys\\nif "/" not in sys.path:\\n    sys.path.insert(0, "/")\\n');
        py.__mechalabPlantInstalled = plantFilename;
      }
      // The lesson's read-only files, exactly as the editor shows them. Written once per content
      // revision: a helper the learner can read on screen is the module the import resolves to.
      for (const file of helperFiles) {
        if (!file || !file.name) continue;
        if (!py.__mechalabFiles) py.__mechalabFiles = {};
        if (py.__mechalabFiles[file.name] !== file.content) {
          py.FS.writeFile('/' + file.name, file.content);
          py.__mechalabFiles[file.name] = file.content;
        }
      }
      if (helperFiles.length) {
        py.runPython('import sys\\nif "/" not in sys.path:\\n    sys.path.insert(0, "/")\\n');
      }
      py.setStdout({
        batched: (line) => {
          if (captureEnabled) capturedOut.push(line);
        },
      });
      py.setStderr({
        batched: (line) => {
          if (captureEnabled) capturedErr.push(line);
        },
      });

      py.globals.set('__mechalab_student_code__', studentCode);
      py.globals.set('__mechalab_instructor_code__', instructorTests || '');
      py.globals.set('__mechalab_max_steps__', maxSteps);
      py.globals.set('__mechalab_timeout_sec__', timeoutSec);

      const runnerHarness = \`
import sys, time, traceback

def __mechalab_execute():
    ns = {
        "__name__": "__main__",
        "__mechalab_student_source__": __mechalab_student_code__,
    }
    t0 = time.monotonic()
    steps = 0
    max_s = int(__mechalab_max_steps__)
    max_t = float(__mechalab_timeout_sec__)

    def _trace_guard(frame, event, arg):
        nonlocal steps
        if event == "line":
            steps += 1
            if steps > max_s or (time.monotonic() - t0) > max_t:
                raise TimeoutError(
                    f"ExecutionTimeoutError: Loop exceeded execution limit ({steps} line steps / {max_t:.1f}s). "
                    "Possible infinite loop (such as 'while True:'). Your editor code is preserved — check your loop condition and try again."
                )
        return _trace_guard

    student_err = ""
    timed_out = False
    stopped = False
    try:
        compiled_student = compile(__mechalab_student_code__, "<lesson_editor>", "exec")
        sys.settrace(_trace_guard)
        exec(compiled_student, ns)
    except KeyboardInterrupt:
        # Caught here, not left to escape: a rejection that crosses into JavaScript shows up as an
        # uncaught PythonError in the page console, and a Stop is a normal outcome, not a crash.
        stopped = True
        student_err = "Execution stopped by user. The interpreter kept your session; nothing was reloaded."
    except TimeoutError as te:
        timed_out = True
        student_err = str(te)
    except SyntaxError as se:
        student_err = f"SyntaxError (line {se.lineno}): {se.msg}"
    except Exception as ex:
        tb_lines = traceback.format_exception_only(type(ex), ex)
        student_err = "".join(tb_lines).strip()
    finally:
        sys.settrace(None)

    return ns, student_err, timed_out, stopped

__mechalab_ns__, __mechalab_student_err__, __mechalab_timed_out__, __mechalab_stopped__ = __mechalab_execute()
\`;

      await py.runPythonAsync(runnerHarness);
      const studentErr = py.globals.get('__mechalab_student_err__') || '';
      const timedOut = Boolean(py.globals.get('__mechalab_timed_out__'));
      const stopped = Boolean(py.globals.get('__mechalab_stopped__'));

      captureEnabled = false;
      const stdoutText = capturedOut.join('\\n').trim();
      const stderrText = capturedErr.join('\\n').trim();

      if (stopped) {
        self.postMessage({
          type: 'result',
          runId,
          stdout: stdoutText,
          stderr: studentErr || 'Execution stopped by user.',
          stopped: true,
          timedOut: false,
          runtimeError: false,
          instructorPassed: false,
          instructorError: '',
        });
        return;
      }

      if (timedOut) {
        self.postMessage({
          type: 'result',
          runId,
          stdout: stdoutText,
          stderr: studentErr,
          timedOut: true,
          runtimeError: false,
          instructorPassed: false,
          instructorError: '',
        });
        return;
      }

      if (studentErr) {
        // The bench is an independent grader, not part of the learner's own program: it is still
        // worth running when one of their assertions fired, because that is exactly what a repair
        // that is close but short does. The cards keep their real metric either way.
        let earlyBench = '';
        if (benchSource && benchSource.trim()) {
          try {
            await py.runPythonAsync(benchSource);
            earlyBench = py.globals.get('__mechalab_bench_json__') || '';
          } catch (benchErr) {
            earlyBench = '';
          }
        }
        self.postMessage({
          type: 'result',
          runId,
          stdout: stdoutText,
          stderr: stderrText ? stderrText + '\\n' + studentErr : studentErr,
          timedOut: false,
          runtimeError: true,
          instructorPassed: false,
          instructorError: '',
          bench: earlyBench,
        });
        return;
      }

      const instructorHarness = \`
import builtins, traceback

def __mechalab_instructor_namespace():
    # The grader gets the submission's own names, but not the ones that could rewrite the grade:
    # nothing underscore-prefixed, and no shadow of a builtin the assertions call (abs, len, round,
    # ...). A submission that only prints the expected PASS line exports nothing to assert on, so the
    # instructor tests fail with NameError instead of agreeing with it.
    ns = {
        name: value
        for name, value in __mechalab_ns__.items()
        if not name.startswith("_") and name not in builtins.__dict__
    }
    ns["__name__"] = "__main__"
    ns["__mechalab_student_source__"] = __mechalab_student_code__
    return ns

def __mechalab_run_instructor():
    if not __mechalab_instructor_code__.strip():
        return True, ""
    try:
        compiled_tests = compile(__mechalab_instructor_code__, "<instructor_tests>", "exec")
        exec(compiled_tests, __mechalab_instructor_namespace())
        return True, ""
    except AssertionError as ae:
        msg = str(ae).strip() or "Instructor behavioral test assertion failed on boundary or unseen input."
        return False, f"AssertionError: {msg}"
    except Exception as ex:
        tb_lines = traceback.format_exception_only(type(ex), ex)
        return False, "".join(tb_lines).strip()

__mechalab_inst_ok__, __mechalab_inst_err__ = __mechalab_run_instructor()
\`;

      await py.runPythonAsync(instructorHarness);
      const instructorPassed = Boolean(py.globals.get('__mechalab_inst_ok__'));
      const instructorError = py.globals.get('__mechalab_inst_err__') || '';

      // The 08.1 bench grades the learner's own repair functions against the same numbers the
      // lesson prints. It runs after the instructor tests so a failed attempt still reports the
      // real tip error each repair produces, instead of a card that says broken because a
      // boolean was left alone.
      let benchReport = '';
      if (benchSource && benchSource.trim()) {
        try {
          await py.runPythonAsync(benchSource);
          benchReport = py.globals.get('__mechalab_bench_json__') || '';
        } catch (benchErr) {
          benchReport = '';
        }
      }

      self.postMessage({
        type: 'result',
        runId,
        stdout: stdoutText,
        stderr: stderrText,
        timedOut: false,
        runtimeError: false,
        instructorPassed,
        instructorError,
        bench: benchReport,
      });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      // Stopping is not a crash: the interpreter is still healthy and the next Run reuses it.
      // Pyodide surfaces the interrupt as KeyboardInterrupt (sometimes wrapped in a JS error).
      if (stopRequested || /KeyboardInterrupt/.test(message)) {
        captureEnabled = false;
        self.postMessage({
          type: 'result',
          runId,
          stdout: capturedOut.join('\\n').trim(),
          stderr: 'Execution stopped by user. The session is still loaded — nothing was reloaded.',
          stopped: true,
          timedOut: false,
          runtimeError: false,
          instructorPassed: false,
          instructorError: '',
        });
        return;
      }
      self.postMessage({
        type: 'error',
        runId,
        error: message,
      });
    }
  }
};
`;

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
}

export const TabPyodideRunner: React.FC<TabPyodideRunnerProps> = ({
  initialLessonId,
  verifiedLessons: externalVerified,
  completedLessons: externalCompleted,
  onMarkLessonVerified,
  onToggleLessonCompleted,
  onOpenRoadmap,
  runRequest,
  lessonRequest,
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
  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
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
  const workerBlobUrlRef = useRef<string | null>(null);
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
    if (workerBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(workerBlobUrlRef.current);
      } catch {
        // ignore revoke errors
      }
      workerBlobUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      destroyWorker();
    };
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
  const draftHistory = useMemo(
    () => snapshotsFor(selectedId),
    [selectedId, passStatus, historyVersion]
  );

  const nextHintNumber = revealedHints + 1;
  // Hint 1 is always open. Every hint after it waits for at least one completed run of this
  // lesson, so a learner cannot read the near-solution second hint without trying first.
  const nextHintNeedsAttempt =
    revealedHints > 0 && (runAttempts[currentLesson.id] ?? 0) === 0;

  // One `lesson_open` per visit, including the first render: it is the denominator for abandon rate.
  useEffect(() => {
    logEvent({ kind: 'lesson_open', lesson: selectedId });
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
    const failed =
      passStatus === 'harness_failed' && harnessResult
        ? harnessResult.summary
        : (instructorError || stderr || '').split('\n')[0];
    logEvent({
      kind: 'run',
      lesson: selectedId,
      outcome: passStatus,
      fail: failed || undefined,
      ms: Math.round(performance.now() - runStartedAtRef.current),
    });
    if (passStatus === 'passed') logEvent({ kind: 'verified', lesson: selectedId });
    // The half of the draft store a learner cannot get from a single latest version: what each run
    // started from, filed with the verdict it got. Taken here because every path that ends a run
    // converges on this state, and the text is read from the ref so it is the code that ran.
    recordSnapshot(selectedId, runCodeRef.current || codeRef.current, passStatus);
    // `harnessReport` is the identity that changes when the gate's verdict can: a fresh gate object
    // every render would re-run this effect on every keystroke, which `pendingRunRef` would swallow.
  }, [isRunning, passStatus, selectedId, instructorError, stderr, harnessReport]);

  // Formatting and behaviour are graded separately: the lesson declares how strictly its `stdout` is
  // compared (`normalized` unless its Expected Output is a column-aligned table), and the note under
  // the Expected Output panel always describes the verdict that is on screen.
  const outputMatchMode: OutputMatchMode = asOutputMatchMode(currentLesson.outputMatch);
  const outputComparison = compareStdout(stdout, currentLesson.expectedOutput, outputMatchMode);
  const lessonDowngradesFormatting = outputMatchMode !== 'exact';

  // What Run executes is the editor's text *now*, not the text the button was rendered with. `code`
  // and `selectedId` are what renders; these refs are written synchronously by the handlers that
  // change them, so Load Solution followed by Run in the same task runs the reference instead of
  // the starter both handlers were rendered with. The effects re-confirm the refs after each
  // commit, which is the same value whenever the handlers are the only writers.
  const codeRef = useRef<string>(code);
  const lessonIdRef = useRef<string>(initialLessonId || PYTHON_LESSONS[0].id);
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
    setStdout('');
    setStderr('');
    setInstructorError('');
    setHarnessReport(null);
    setBehaviorCheck('untested');
    setOutputCheck('untested');
    setPassStatus('untested');
  };

  const getOrCreateWorker = (): Worker => {
    if (workerRef.current) {
      return workerRef.current;
    }
    const blob = new Blob([PYODIDE_WORKER_SOURCE], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    workerBlobUrlRef.current = blobUrl;
    const worker = new Worker(blobUrl);
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
    workerRef.current = worker;
    return worker;
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
        if (workerOutcome?.stdout) setStdout(String(workerOutcome.stdout));
        setStderr(String(workerOutcome.stderr || 'Execution stopped by user.'));
        setBehaviorCheck('failed');
        setPassStatus('stopped');
        return;
      }

      if (workerOutcome?.watchdogTimedOut || workerOutcome?.timedOut) {
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
        if (actualErr.startsWith('AssertionError')) {
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

  // ⌘↵ / Ctrl+↵ runs from anywhere on this screen, including inside the editor. The button stays
  // the discoverable path; this is the one keyboard habit a code editor trains.
  const runShortcutRef = useRef<() => void>(() => {});
  runShortcutRef.current = () => {
    if (isRunning) return;
    const lesson = PYTHON_LESSONS.find((l) => l.id === lessonIdRef.current) || PYTHON_LESSONS[0];
    runPythonCode(codeRef.current, lesson);
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

  // A slider drag is a parameter change, so the answer is a fresh run - but one run per drag, not
  // one per pixel. The timer is cleared on unmount so a removed tab cannot run in the background.
  const sliderTimerRef = useRef<number | null>(null);
  const handleSliderCommit = () => {
    if (sliderTimerRef.current !== null) window.clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = window.setTimeout(() => {
      sliderTimerRef.current = null;
      runShortcutRef.current();
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
                onClick={() => runPythonCode(codeRef.current, currentLesson)}
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
                  setRevealedHints((h) => Math.max(h, 1));
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
        <div className="lg:col-span-8 space-y-4">
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
                  onClick={() => {
                    const lesson =
                      PYTHON_LESSONS.find((l) => l.id === lessonIdRef.current) || PYTHON_LESSONS[0];
                    runPythonCode(codeRef.current, lesson);
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
              onGrade={() => runPythonCode(codeRef.current, currentLesson)}
            />
          )}
          {currentHarness && currentLesson.id !== '08.1' && (
            <LessonHarnessPanel
              harness={currentHarness}
              report={harnessReport}
              grading={isRunning}
              onGrade={() => runPythonCode(codeRef.current, currentLesson)}
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
                      setRevealedHints((h) => {
                        logEvent({ kind: 'hint', lesson: selectedId, level: h + 1 });
                        return h + 1;
                      });
                    }}
                    disabled={nextHintNeedsAttempt}
                    title={
                      nextHintNeedsAttempt
                        ? 'Run & Verify once to unlock the next hint'
                        : undefined
                    }
                    data-testid="btn-reveal-hint"
                    className="px-2.5 py-1 rounded text-xs font-mono bg-amber/15 hover:bg-amber/25 text-amber border border-amber/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {nextHintNeedsAttempt ? `Run to unlock Hint ${nextHintNumber}` : `Reveal Hint ${nextHintNumber}`}
                  </button>
                )}
              </div>
              {revealedHints > 0 && (
                <div className="mt-3 space-y-2">
                  {currentLesson.hints.slice(0, revealedHints).map((hint, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-canvas border border-line text-xs text-ink"
                    >
                      <span className="font-mono font-bold text-amber mr-1.5">
                        Hint {idx + 1}:
                      </span>
                      <span dangerouslySetInnerHTML={{ __html: hint }} />
                    </div>
                  ))}
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
              />
            )}
          </div>

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

      {/* The verdict is announced, not only coloured: a screen reader hears the result and the
          next step without moving focus. */}
      <p className="sr-only" role="status" aria-live="polite">
        {passStatus === 'passed'
          ? `Lesson ${currentLesson.id} passed: behavioural checks and output both meet the lesson.`
          : passStatus === 'untested' || passStatus === 'error'
            ? ''
            : `Lesson ${currentLesson.id} has not passed yet. Read the failing line above.`}
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
