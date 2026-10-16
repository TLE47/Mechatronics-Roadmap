import React, { useState, useEffect, useRef } from 'react';
import { PYTHON_LESSONS, PythonLessonItem } from '../../data/pythonLessonsData';
import { MECHALAB_PLANT_FILENAME, MECHALAB_PLANT_PY } from '../../data/mechalabPlant';
import { asOutputMatchMode, compareStdout, OutputMatchMode } from '../../outputMatch';
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
        self.postMessage({
          type: 'result',
          runId,
          stdout: stdoutText,
          stderr: stderrText ? stderrText + '\\n' + studentErr : studentErr,
          timedOut: false,
          runtimeError: true,
          instructorPassed: false,
          instructorError: '',
        });
        return;
      }

      const instructorHarness = \`
import traceback

def __mechalab_run_instructor():
    if not __mechalab_instructor_code__.strip():
        return True, ""
    try:
        compiled_tests = compile(__mechalab_instructor_code__, "<instructor_tests>", "exec")
        exec(compiled_tests, __mechalab_ns__)
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

      self.postMessage({
        type: 'result',
        runId,
        stdout: stdoutText,
        stderr: stderrText,
        timedOut: false,
        runtimeError: false,
        instructorPassed,
        instructorError,
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
}

export const TabPyodideRunner: React.FC<TabPyodideRunnerProps> = ({
  initialLessonId,
  verifiedLessons: externalVerified,
  completedLessons: externalCompleted,
  onMarkLessonVerified,
  onToggleLessonCompleted,
}) => {
  const [selectedId, setSelectedId] = useState<string>(initialLessonId || PYTHON_LESSONS[0].id);
  const [trackFilter, setTrackFilter] = useState<'all' | 'track-p' | 't00-02' | 't03-08'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [code, setCode] = useState<string>(PYTHON_LESSONS[0].starterCode);
  const [revealedHints, setRevealedHints] = useState<number>(0);
  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
  const [instructorError, setInstructorError] = useState<string>('');
  const [behaviorCheck, setBehaviorCheck] = useState<'untested' | 'passed' | 'failed'>('untested');
  const [outputCheck, setOutputCheck] = useState<'untested' | 'matched' | 'differs'>('untested');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [pyodideStatus, setPyodideStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [passStatus, setPassStatus] = useState<
    'untested' | 'passed' | 'behavior_failed' | 'mismatch' | 'stopped' | 'error'
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
      const nextVal = forceValue !== undefined ? forceValue : !localCompleted[lessonId];
      const next = { ...localCompleted, [lessonId]: nextVal };
      setLocalCompleted(next);
      try {
        localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
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

  useEffect(() => {
    if (initialLessonId && PYTHON_LESSONS.some((l) => l.id === initialLessonId)) {
      selectLesson(initialLessonId);
    }
  }, [initialLessonId]);

  const currentLesson: PythonLessonItem =
    PYTHON_LESSONS.find((l) => l.id === selectedId) || PYTHON_LESSONS[0];

  // Formatting and behaviour are graded separately: the lesson declares how strictly its `stdout` is
  // compared (`normalized` unless its Expected Output is a column-aligned table), and the note under
  // the Expected Output panel always describes the verdict that is on screen.
  const outputMatchMode: OutputMatchMode = asOutputMatchMode(currentLesson.outputMatch);
  const outputComparison = compareStdout(stdout, currentLesson.expectedOutput, outputMatchMode);
  const lessonDowngradesFormatting = outputMatchMode !== 'exact';

  const selectLesson = (id: string) => {
    const found = PYTHON_LESSONS.find((l) => l.id === id);
    if (!found) return;
    setSelectedId(id);
    setCode(found.starterCode);
    setRevealedHints(0);
    setStdout('');
    setStderr('');
    setInstructorError('');
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

  const runPythonCode = async (sourceCode: string) => {
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;

    setIsRunning(true);
    setStdout('');
    setStderr('');
    setInstructorError('');
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
          instructorTests: currentLesson.instructorTests,
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

      if (workerOutcome?.runtimeError) {
        setBehaviorCheck('failed');
        if (actualErr.startsWith('AssertionError')) {
          setInstructorError(actualErr);
          setPassStatus('behavior_failed');
        } else {
          setPassStatus('error');
        }
        return;
      }

      const isOutputMatched =
        !actualErr &&
        compareStdout(actualOut, currentLesson.expectedOutput, outputMatchMode).matched;
      const isBehaviorPassed = Boolean(workerOutcome?.instructorPassed);

      setOutputCheck(isOutputMatched ? 'matched' : 'differs');
      setBehaviorCheck(isBehaviorPassed ? 'passed' : 'failed');

      if (!isBehaviorPassed) {
        setInstructorError(
          workerOutcome?.instructorError ||
            'Instructor behavioral tests failed on unseen or boundary inputs.'
        );
        setPassStatus('behavior_failed');
        return;
      }

      if (isBehaviorPassed && isOutputMatched) {
        setPassStatus('passed');
        markLessonVerified(currentLesson.id);
      } else {
        setPassStatus('mismatch');
      }
    } catch (err: any) {
      setStderr(err?.message || String(err));
      setPassStatus('error');
    } finally {
      if (activeRunIdRef.current === runId) {
        setIsRunning(false);
      }
    }
  };

  const filteredLessons = PYTHON_LESSONS.filter((l) => {
    const matchesTrack =
      trackFilter === 'all' ||
      (trackFilter === 'track-p' && l.track === 'track-p') ||
      (trackFilter === 't00-02' &&
        (l.track === '00-foundations' ||
          l.track === '01-electronics-and-power' ||
          l.track === '02-mechanics-kinematics-dynamics')) ||
      (trackFilter === 't03-08' &&
        (l.track === '03-sensors-and-actuators' ||
          l.track === '04-embedded-and-realtime' ||
          l.track === '05-control-and-estimation' ||
          l.track === '06-robotics-and-autonomy' ||
          l.track === '07-systems-hil-and-production' ||
          l.track === '08-capstone-projects'));

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

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-[#34d399] flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5" />
            <span>Isolated Web Worker Python 3.12 Runner · 32 Beginner Lessons</span>
          </div>
          <h2 className="text-lg font-bold text-[#f1f5f9] mt-0.5">
            Run Track P (`P.1–P.M`) &amp; Pass 1 (`00.1–08.1`) Starter Code, Progressive Hints &amp; Behavioral Tests
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Sidebar: 32-Lesson Search & Selector */}
        <div className="lg:col-span-4 bg-[#111827] border border-[#334155] rounded-xl p-4 flex flex-col max-h-[760px]">
          {/* Search Input */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 32 lessons by ID, title, or topic..."
              data-testid="input-lesson-search"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0b0f19] border border-[#334155] text-xs text-[#f1f5f9] placeholder-[#64748b] focus:outline-none focus:border-[#38bdf8]"
            />
          </div>

          <div className="flex items-center justify-between gap-1 mb-3">
            <span className="text-xs font-mono text-[#94a3b8] tabular-nums">
              Lessons ({filteredLessons.length})
            </span>
            <div className="flex gap-1">
              {[
                { id: 'all', label: 'All (32)' },
                { id: 'track-p', label: 'Track P (13)' },
                { id: 't00-02', label: 'T00–02 (10)' },
                { id: 't03-08', label: 'T03–08 (9)' },
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
                      <span className="text-[#94a3b8] truncate">{lesson.track}</span>
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
                <div className="flex items-center gap-2 text-xs font-mono text-[#94a3b8]">
                  <span className="text-[#38bdf8] font-bold">Lesson {currentLesson.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{currentLesson.path}</span>
                  {isCurrentVerified && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#34d399] font-semibold">Executed &amp; Passed (WASM)</span>
                    </>
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
                    setCode(currentLesson.starterCode);
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
                    setCode(currentLesson.fullSolution);
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
                  onClick={() => runPythonCode(code)}
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
                    onClick={() => setRevealedHints((h) => h + 1)}
                    data-testid="btn-reveal-hint"
                    className="px-2.5 py-1 rounded text-xs font-mono bg-[#fbbf24]/15 hover:bg-[#fbbf24]/25 text-[#fbbf24] border border-[#fbbf24]/40 cursor-pointer"
                  >
                    Reveal Hint {revealedHints + 1}
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
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              data-testid="textarea-python-code"
              className="w-full h-72 p-4 bg-[#0b0f19] text-[#f1f5f9] font-mono text-xs leading-relaxed focus:outline-none resize-y"
            />
          </div>

          {/* Instructor Behavioral Assessment Panel */}
          <div
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
