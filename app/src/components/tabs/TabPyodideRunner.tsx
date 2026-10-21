import React, { useState, useEffect, useRef } from 'react';
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

async function ensurePyodideLoaded(cdnUrl) {
  if (pyodideInstance && loadedCdnUrl === cdnUrl) {
    return pyodideInstance;
  }
  self.postMessage({ type: 'status', status: 'loading' });
  try {
    importScripts(cdnUrl + 'pyodide.js');
    if (typeof self.loadPyodide !== 'function') {
      throw new Error('loadPyodide not exposed by pyodide.js');
    }
    pyodideInstance = await self.loadPyodide({ indexURL: cdnUrl });
    loadedCdnUrl = cdnUrl;
    self.postMessage({ type: 'status', status: 'ready' });
    return pyodideInstance;
  } catch (err) {
    self.postMessage({ type: 'status', status: 'error' });
    throw new Error(
      'Pyodide WebAssembly runtime could not be loaded from CDN (' +
        (err && err.message ? err.message : String(err)) +
        '). Execution verification requires Pyodide WASM.'
    );
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
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
    } = msg;

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
      const capturedOut = [];
      const capturedErr = [];
      let captureEnabled = true;

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
    try:
        compiled_student = compile(__mechalab_student_code__, "<lesson_editor>", "exec")
        sys.settrace(_trace_guard)
        exec(compiled_student, ns)
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

    return ns, student_err, timed_out

__mechalab_ns__, __mechalab_student_err__, __mechalab_timed_out__ = __mechalab_execute()
\`;

      await py.runPythonAsync(runnerHarness);
      const studentErr = py.globals.get('__mechalab_student_err__') || '';
      const timedOut = Boolean(py.globals.get('__mechalab_timed_out__'));

      captureEnabled = false;
      const stdoutText = capturedOut.join('\\n').trim();
      const stderrText = capturedErr.join('\\n').trim();

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
      self.postMessage({
        type: 'error',
        runId,
        error: err && err.message ? err.message : String(err),
      });
    }
  }
};
`;

interface TabPyodideRunnerProps {
  initialLessonId?: string;
  verifiedLessons?: Record<string, boolean>;
  completedLessons?: Record<string, boolean>;
  onMarkLessonVerified?: (lessonId: string) => void;
  onToggleLessonCompleted?: (lessonId: string, forceValue?: boolean) => void;
  /** Opens the roadmap at the pass the open entry belongs to. */
  onOpenRoadmap?: (pass: ActiveTierPass, milestoneId: string) => void;
}

export const TabPyodideRunner: React.FC<TabPyodideRunnerProps> = ({
  initialLessonId,
  verifiedLessons: externalVerified,
  completedLessons: externalCompleted,
  onMarkLessonVerified,
  onToggleLessonCompleted,
  onOpenRoadmap,
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
  const guideEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const guideAssessmentRef = useRef<HTMLDivElement | null>(null);
  // Named groups the roadmap also uses; the old "Step 1 / Steps 3-5 / Steps 6-10" numbering was a
  // third scheme, belonging to neither the roadmap's passes nor any tab the learner can open.
  const [trackFilter, setTrackFilter] = useState<'all' | 'onramp' | 'lessons' | 'modules'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [code, setCode] = useState<string>(PYTHON_LESSONS[0].starterCode);
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

  const clearRunWatchdog = () => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  };

  const destroyWorker = () => {
    clearRunWatchdog();
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

  const currentLesson: PythonLessonItem =
    PYTHON_LESSONS.find((l) => l.id === selectedId) || PYTHON_LESSONS[0];
  // What the lesson's harness says about the code on screen now; a `null` report is a failed gate
  // (unproven), never a pass.
  const currentHarness = harnessForLesson(currentLesson.id);
  const harnessResult = currentHarness ? harnessGate(currentHarness, harnessReport) : null;
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
  useEffect(() => {
    if (isRunning) {
      pendingRunRef.current = true;
      runStartedAtRef.current = performance.now();
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
    setSelectedId(id);
    lessonIdRef.current = id;
    if (remember) rememberLessonInUrl(id);
    commitCode(found.starterCode);
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
    workerRef.current = worker;
    return worker;
  };

  const stopExecution = (customMessage?: string) => {
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
              armExecutionWatchdog(timeoutMs, 'Python execution');
            } else if (data.status === 'error') {
              setPyodideStatus('error');
            }
            return;
          }
          if (data.runId !== runId) return;
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
        });
      });

      activeResolveRef.current = null;
      if (activeRunIdRef.current !== runId) return;

      if (workerOutcome?.stopped) {
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
      {/* Header Banner */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-[#34d399] flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5" />
            <span>
              Isolated Web Worker Python 3.12 Runner · {PYTHON_LESSONS.length} lessons &amp;
              exercises
            </span>
          </div>
          <h2 className="text-lg font-bold text-[#f1f5f9] mt-0.5">
            Every lesson and graded module in one place: the Python on-ramp, then the practice each
            roadmap step asks for, with starter code, progressive hints and behavioural tests
          </h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Complete the `TODO` lines, unlock hints one step at a time, and click <b>Run &amp; Verify Output</b>. Code executes inside an isolated <b>Web Worker</b> with infinite-loop protection and is graded by <b>Instructor Behavioral Tests</b> (multi-input &amp; boundary checks) plus output presentation.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-[#0b0f19] border border-[#1e293b] px-4 py-2.5 rounded-lg font-mono tabular-nums">
          <div>
            <div className="text-[11px] text-[#94a3b8]">Executed &amp; Passed (WASM)</div>
            <div className="text-sm font-bold text-[#34d399]" data-testid="runner-verified-count">
              {`${verifiedCount} / ${PYTHON_LESSONS.length} Verified`}
            </div>
          </div>
          <div className="h-7 w-[1px] bg-[#1e293b]" />
          <div>
            <div className="text-[11px] text-[#94a3b8]">Self-Marked</div>
            <div className="text-sm font-bold text-[#cbd5e1]" data-testid="runner-self-marked-count">
              {`${completedCount} / ${PYTHON_LESSONS.length} Marked`}
            </div>
          </div>
          <div className="h-7 w-[1px] bg-[#1e293b]" />
          <div>
            <div className="text-[11px] text-[#94a3b8]">Worker Runtime</div>
            <div className="text-xs font-semibold text-[#38bdf8]" data-testid="runner-runtime-status">
              {pyodideStatus === 'ready'
                ? 'Ready (Worker WASM)'
                : pyodideStatus === 'loading'
                ? 'Loading WASM...'
                : pyodideStatus === 'error'
                ? 'WASM Load Error'
                : 'Isolated Worker Ready'}
            </div>
          </div>
        </div>
      </div>

      {showFirstGuide && (
        <section
          data-testid="first-lesson-guide"
          className="bg-[#06281f] border border-[#34d399]/50 rounded-xl p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-mono text-[#34d399] flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {currentLesson.id === 'P.1'
                    ? 'Lesson P.1 · start of the Python on-ramp · open and ready below'
                    : `First run · Lesson ${currentLesson.id} · ${
                        currentLesson.track === 'modules' ? 'graded exercise' : currentLesson.title
                      }`}
                </span>
              </div>
              <h3 className="text-base font-bold text-[#f1f5f9] mt-1">
                {currentLesson.id === 'P.1'
                  ? 'One editor, one button, one red line.'
                  : 'This starter, its first check, and the finish line.'}
              </h3>
              <p className="text-xs text-[#cbd5e1] mt-1 max-w-3xl">
                {currentLesson.id === 'P.1'
                  ? 'This page is the whole lesson. Nothing to install and nothing else to read: change a line, press Run, and let the red line tell you what to fix.'
                  : `This brief is only for ${currentLesson.id}. It names the first hole, the first check, and what a finished run prints; the editor and the red line do the rest.`}
              </p>
            </div>
            <button
              onClick={dismissFirstGuide}
              data-testid="btn-guide-dismiss"
              className="px-2.5 py-1 rounded text-[11px] font-mono text-[#94a3b8] hover:text-[#f1f5f9] border border-[#334155] cursor-pointer"
            >
              {currentLesson.id === 'P.1'
                ? 'I have done this before — hide'
                : "Hide this lesson's guide"}
            </button>
          </div>

          <ol className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <li className="bg-[#0b0f19] border border-[#1e293b] rounded-lg p-3">
              <div className="text-[11px] font-mono text-[#38bdf8]">1 · THE STARTER</div>
              <p className="text-xs text-[#cbd5e1] mt-1.5 break-words">
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
                  guideEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  guideEditorRef.current?.focus();
                }}
                data-testid="btn-guide-editor"
                className="mt-2 px-2.5 py-1 rounded text-[11px] font-mono bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 text-[#38bdf8] border border-[#38bdf8]/40 cursor-pointer"
              >
                Show me the editor
              </button>
            </li>

            <li className="bg-[#0b0f19] border border-[#1e293b] rounded-lg p-3">
              <div className="text-[11px] font-mono text-[#34d399]">2 · THE FIRST FAILURE</div>
              <p className="text-xs text-[#cbd5e1] mt-1.5 break-words">
                Run it untouched. The first check is: <b>{coach.check}</b>
              </p>
              <p className="text-[11px] text-[#94a3b8] mt-1">
                The red line names the value it expected and the value your code produced.
              </p>
              <button
                onClick={() => runPythonCode(codeRef.current, currentLesson)}
                disabled={isRunning}
                data-testid="btn-guide-run"
                className="mt-2 px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-[#34d399] hover:bg-[#10b981] text-[#0b0f19] disabled:opacity-50 cursor-pointer"
              >
                {isRunning
                  ? pyodideStatus === 'loading'
                    ? 'Loading Python (first run takes a few seconds)…'
                    : 'Running…'
                  : 'Run the starter'}
              </button>
            </li>

            <li className="bg-[#0b0f19] border border-[#1e293b] rounded-lg p-3">
              <div className="text-[11px] font-mono text-[#fbbf24]">3 · THE FINISH LINE</div>
              <p className="text-xs text-[#cbd5e1] mt-1.5 break-words">
                When every check passes, it prints: <code>{coach.finish}</code>
              </p>
              <p className="text-[11px] text-[#94a3b8] mt-1">
                Hint 1 is a nudge; it never gives the answer.
              </p>
              <button
                onClick={() => {
                  setRevealedHints((h) => Math.max(h, 1));
                  guideAssessmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                disabled={currentLesson.hints.length === 0}
                data-testid="btn-guide-hint"
                className="mt-2 px-2.5 py-1 rounded text-[11px] font-mono bg-[#fbbf24]/15 hover:bg-[#fbbf24]/25 text-[#fbbf24] border border-[#fbbf24]/40 disabled:opacity-50 cursor-pointer"
              >
                {revealedHints > 0 ? 'Hint 1 is open below' : 'Reveal Hint 1'}
              </button>
            </li>
          </ol>

          {guideFailed && guideFixLine && (
            <div
              data-testid="guide-what-to-fix"
              aria-live="polite"
              className="mt-3 p-3 rounded-lg bg-[#0b0f19] border border-[#f43f5e]/50"
            >
              <div className="text-[11px] font-mono text-[#f43f5e]">WHAT TO FIX</div>
              <code className="block mt-1 text-xs text-[#fecdd3] break-words">{guideFixLine}</code>
              <p className="text-[11px] text-[#cbd5e1] mt-1">
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
              className="mt-3 p-3 rounded-lg bg-[#0b0f19] border border-[#34d399]/50 text-xs text-[#cbd5e1]"
            >
              <b className="text-[#34d399]">That is the whole loop.</b> You read a failure, changed
              the code, and proved it. The next lesson opens with its own starter brief.
              {nextLesson && (
                <button
                  onClick={() => selectLesson(nextLesson.id)}
                  className="ml-2 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-[#34d399] text-[#0b0f19] cursor-pointer"
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
          className="lg:col-span-4 bg-[#111827] border border-[#334155] rounded-xl p-4 flex flex-col max-h-[760px]"
        >
          {/* Search Input */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${PYTHON_LESSONS.length} lessons and exercises by ID, title, or topic...`}
              data-testid="input-lesson-search"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0b0f19] border border-[#334155] text-xs text-[#f1f5f9] placeholder-[#64748b] focus:outline-none focus:border-[#38bdf8]"
            />
          </div>

          {/* The five filter chips cannot share one line with the count in a 4/12 column: they
              used to run ~200px past the card and sit under the editor's opaque background, so a
              chip was readable only after resizing the window. The count gets its own line and
              the chips wrap inside the card. */}
          <div className="mb-3">
            <span className="block text-xs font-mono text-[#94a3b8] tabular-nums mb-1.5">
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
                      ? 'bg-[#38bdf8] text-[#0b0f19] font-bold'
                      : 'bg-[#0b0f19] text-[#94a3b8] hover:text-white border border-[#1e293b]'
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
                      ? 'bg-[#1e293b] border-[#38bdf8] text-white'
                      : 'bg-[#0b0f19]/70 border-[#1e293b] text-[#cbd5e1] hover:border-[#475569]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      <span className="font-bold text-[#38bdf8]">{lesson.id}</span>
                      <span aria-hidden="true" className="text-[#475569]">·</span>
                      <span className="text-[#94a3b8] truncate">
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
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#34d399]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified</span>
                      </span>
                    ) : isSelfMarked ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#38bdf8]">
                        <Check className="w-3.5 h-3.5" />
                        <span>Marked</span>
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#475569]" />
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
          <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {/* Whole items wrap; none of them breaks inside a word. Before this, the row was a
                    single nowrap flex line whose spans could shrink, so at tablet width "Lesson
                    P.1" split across two lines and the pass badge read "Executed & Passed
                    (WASM)" on three. Each chip is nowrap and the separators went with them: a
                    dotted separator cannot dangle at the start of a wrapped line. */}
                <div
                  data-testid="lesson-meta"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-[#94a3b8]"
                >
                  <span className="text-[#38bdf8] font-bold whitespace-nowrap">
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
                      className="whitespace-nowrap text-[#38bdf8] hover:underline cursor-pointer"
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
                      className="whitespace-nowrap tabular-nums text-[#cbd5e1]"
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
                    className="text-[#38bdf8] hover:text-[#7dd3fc] underline underline-offset-2 whitespace-nowrap"
                  >
                    Read this page on GitHub ↗
                  </a>
                  {isCurrentVerified && (
                    <span className="text-[#34d399] font-semibold whitespace-nowrap">
                      Executed &amp; Passed (WASM)
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-[#f1f5f9] mt-1">{currentLesson.title}</h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => toggleLessonSelfMarked(currentLesson.id)}
                  data-testid="btn-toggle-lesson-complete"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border flex items-center gap-1.5 cursor-pointer ${
                    isCurrentSelfMarked
                      ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8]'
                      : 'bg-[#0b0f19] border-[#334155] text-[#cbd5e1] hover:border-[#38bdf8]'
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
                    setPassStatus('untested');
                    setBehaviorCheck('untested');
                    setOutputCheck('untested');
                    setInstructorError('');
                  }}
                  data-testid="btn-reset-starter"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#0b0f19] hover:bg-[#1e293b] text-[#cbd5e1] border border-[#334155] flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Starter</span>
                </button>
                <button
                  onClick={resetRuntime}
                  data-testid="btn-reset-runtime"
                  title="Terminate and restart the background Python Web Worker without losing editor code"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#0b0f19] hover:bg-[#1e293b] text-[#38bdf8] border border-[#38bdf8]/40 flex items-center gap-1.5 cursor-pointer"
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
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#0b0f19] hover:bg-[#1e293b] text-[#fbbf24] border border-[#fbbf24]/40 flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Load Solution</span>
                </button>
                {isRunning && (
                  <button
                    onClick={() => stopExecution()}
                    data-testid="btn-stop-execution"
                    className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-[#f43f5e] hover:bg-[#e11d48] text-white flex items-center gap-1.5 cursor-pointer"
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
                  className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-[#34d399] hover:bg-[#10b981] text-[#0b0f19] flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isRunning ? 'Running in Worker...' : 'Run & Verify Output'}</span>
                </button>
              </div>
            </div>

            {/* <= 2 Ideas Unboxed Metadata List */}
            <div className="mt-3 pt-3 border-t border-[#1e293b] flex flex-wrap items-center gap-2 text-xs text-[#cbd5e1]">
              <span className="font-mono text-[#94a3b8] flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span>New Ideas (≤2 rule):</span>
              </span>
              {currentLesson.ideas.map((idea, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span aria-hidden="true" className="text-[#475569]">·</span>}
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
            <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono text-[#fbbf24] flex items-center gap-1.5">
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
                    className="px-2.5 py-1 rounded text-xs font-mono bg-[#fbbf24]/15 hover:bg-[#fbbf24]/25 text-[#fbbf24] border border-[#fbbf24]/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="p-2.5 rounded-lg bg-[#0b0f19] border border-[#334155] text-xs text-[#e2e8f0]"
                    >
                      <span className="font-mono font-bold text-[#fbbf24] mr-1.5">
                        Hint {idx + 1}:
                      </span>
                      <span dangerouslySetInnerHTML={{ __html: hint }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Code Editor */}
          <div className="bg-[#111827] border border-[#334155] rounded-xl overflow-hidden">
            <div className="bg-[#0b0f19] px-4 py-2 border-b border-[#1e293b] flex items-center justify-between">
              <span className="text-xs font-mono text-[#94a3b8]">
                Python 3 Editor — Edit TODOs and press &quot;Run &amp; Verify Output&quot; (Web Worker Isolated)
              </span>
              <span className="text-[11px] font-mono text-[#64748b] tabular-nums">
                {code.split('\n').length} lines
              </span>
            </div>
            <textarea
              ref={guideEditorRef}
              value={code}
              onChange={(e) => commitCode(e.target.value)}
              spellCheck={false}
              data-testid="textarea-python-code"
              className="w-full h-72 p-4 bg-[#0b0f19] text-[#f1f5f9] font-mono text-xs leading-relaxed focus:outline-none resize-y"
            />
          </div>

          {/* Instructor Behavioral Assessment Panel */}
          <div
            ref={guideAssessmentRef}
            data-testid="panel-instructor-tests"
            className="bg-[#111827] border border-[#334155] rounded-xl p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-mono text-[#38bdf8] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Instructor Behavioral Assessment (Multi-Input, Boundary &amp; Tolerance Checks)</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span
                  data-testid="badge-behavior-check"
                  className={
                    behaviorCheck === 'passed'
                      ? 'text-[#34d399] font-bold'
                      : behaviorCheck === 'failed'
                      ? 'text-[#f43f5e] font-bold'
                      : 'text-[#94a3b8]'
                  }
                >
                  Behavior Tests:{' '}
                  {behaviorCheck === 'passed'
                    ? 'PASSED'
                    : behaviorCheck === 'failed'
                    ? 'FAILED'
                    : 'UNTESTED'}
                </span>
                <span aria-hidden="true" className="text-[#475569]">·</span>
                <span
                  data-testid="badge-output-check"
                  className={
                    outputCheck === 'matched'
                      ? 'text-[#34d399] font-bold'
                      : outputCheck === 'differs'
                      ? 'text-[#fbbf24] font-bold'
                      : 'text-[#94a3b8]'
                  }
                >
                  Presentation (`stdout`, {outputMatchMode} match):{' '}
                  {outputCheck === 'matched'
                    ? 'MATCHED'
                    : outputCheck === 'differs'
                    ? 'DIFFERS'
                    : 'UNTESTED'}
                </span>
                <span aria-hidden="true" className="text-[#475569]">·</span>
                <span data-testid="note-output-match-mode" className="text-[11px] text-[#94a3b8]">
                  {lessonDowngradesFormatting
                    ? 'Formatting is ignored: indentation, column padding and blank lines cannot block a correct solution.'
                    : 'This lesson grades exact formatting: its table columns are part of the answer.'}
                </span>
              </div>
            </div>
            <ul className="mt-2.5 space-y-1 text-xs text-[#cbd5e1] font-mono">
              {(currentLesson.instructorTestSummary || []).map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#38bdf8]">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {instructorError && (
              <div
                data-testid="pre-instructor-error"
                className="mt-2.5 p-2.5 rounded-lg bg-[#0b0f19] border border-[#f43f5e]/50 font-mono text-xs text-[#f43f5e]"
              >
                {instructorError}
              </div>
            )}
            {passStatus === 'harness_failed' && harnessResult && harnessResult.failures.length > 0 && (
              <div
                data-testid="pre-harness-error"
                className="mt-2.5 p-2.5 rounded-lg bg-[#0b0f19] border border-[#f43f5e]/50 font-mono text-xs text-[#f43f5e] space-y-1"
              >
                <div className="text-[11px] text-[#fbbf24]">
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
            <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-[#94a3b8]">
                  Actual Python Output (`stdout` / `assert`)
                </span>
                {passStatus === 'passed' && (
                  <span
                    data-testid="status-assert-passed"
                    className="text-xs font-mono font-bold text-[#34d399] flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>PASS · Behavior &amp; Output Verified</span>
                  </span>
                )}
                {passStatus === 'harness_failed' && (
                  <span
                    data-testid="status-harness-failed"
                    className="text-xs font-mono font-bold text-[#f43f5e] flex items-center gap-1"
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
                    className="text-xs font-mono font-bold text-[#f43f5e] flex items-center gap-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>BEHAVIOR FAILED · Instructor Tests Failed</span>
                  </span>
                )}
                {passStatus === 'mismatch' && (
                  <span
                    data-testid="status-output-mismatch"
                    className="text-xs font-mono font-bold text-[#fbbf24] flex items-center gap-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>BEHAVIOR PASSED · Output Format Differs</span>
                  </span>
                )}
                {passStatus === 'stopped' && (
                  <span
                    data-testid="status-execution-stopped"
                    className="text-xs font-mono font-bold text-[#fbbf24] flex items-center gap-1"
                  >
                    <OctagonX className="w-3.5 h-3.5" />
                    <span>STOPPED · Loop Limit / Cancelled</span>
                  </span>
                )}
                {passStatus === 'error' && (
                  <span
                    data-testid="status-execution-error"
                    className="text-xs font-mono font-bold text-[#f43f5e] flex items-center gap-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>ERROR · Syntax / Runtime Error</span>
                  </span>
                )}
              </div>
              <pre
                data-testid="pre-actual-stdout"
                className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b] font-mono text-xs text-[#e2e8f0] whitespace-pre-wrap min-h-[120px]"
              >
                {stdout || (stderr ? '' : 'Click "Run & Verify Output" to execute this lesson.')}
                {stderr && <span className="text-rose-400 block mt-1">{stderr}</span>}
              </pre>
            </div>

            <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-[#94a3b8]">
                  Expected Output (Presentation Check)
                </span>
                {passStatus === 'passed' && nextLesson && (
                  <button
                    onClick={() => selectLesson(nextLesson.id)}
                    className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-[#38bdf8] text-[#0b0f19] flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Next: Lesson {nextLesson.id} →</span>
                  </button>
                )}
              </div>
              <pre
                data-testid="pre-expected-stdout"
                className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b] font-mono text-xs text-[#34d399] whitespace-pre-wrap min-h-[120px]"
              >
                {currentLesson.expectedOutput}
              </pre>
              {outputCheck === 'matched' && outputComparison.formattingDiffers && (
                <p
                  data-testid="note-formatting-normalized"
                  className="mt-2 text-[11px] font-mono text-[#34d399]"
                >
                  Matched with formatting ignored — your numbers and words are identical to the
                  Expected Output; only whitespace differs, and this lesson does not grade it.
                </p>
              )}
              {outputCheck === 'differs' && outputComparison.firstDiffLine !== null && (
                <p
                  data-testid="note-output-diff-line"
                  className="mt-2 text-[11px] font-mono text-[#fbbf24]"
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
    </div>
  );
};
