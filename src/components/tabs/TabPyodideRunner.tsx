import React, { useState, useEffect, useRef } from 'react';
import { PYTHON_LESSONS, PythonLessonItem } from '../../data/pythonLessonsData';
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
} from 'lucide-react';

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
    __mechalabPyodide?: any;
  }
}

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const STORAGE_KEY_COMPLETED = 'mechalab_pyodide_completed_v1';

interface TabPyodideRunnerProps {
  initialLessonId?: string;
}

export const TabPyodideRunner: React.FC<TabPyodideRunnerProps> = ({ initialLessonId }) => {
  const [selectedId, setSelectedId] = useState<string>(initialLessonId || PYTHON_LESSONS[0].id);
  const [trackFilter, setTrackFilter] = useState<'all' | 'track-p' | 't00-02' | 't03-08'>('all');
  const [code, setCode] = useState<string>(PYTHON_LESSONS[0].starterCode);
  const [revealedHints, setRevealedHints] = useState<number>(0);
  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [pyodideStatus, setPyodideStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [passStatus, setPassStatus] = useState<'untested' | 'passed' | 'mismatch' | 'error'>('untested');
  const [completedLessons, setCompletedLessons] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_COMPLETED);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const pyodideRef = useRef<any>(null);

  useEffect(() => {
    if (initialLessonId && PYTHON_LESSONS.some((l) => l.id === initialLessonId)) {
      selectLesson(initialLessonId);
    }
  }, [initialLessonId]);

  const currentLesson: PythonLessonItem =
    PYTHON_LESSONS.find((l) => l.id === selectedId) || PYTHON_LESSONS[0];

  const selectLesson = (id: string) => {
    const found = PYTHON_LESSONS.find((l) => l.id === id);
    if (!found) return;
    setSelectedId(id);
    setCode(found.starterCode);
    setRevealedHints(0);
    setStdout('');
    setStderr('');
    setPassStatus('untested');
  };

  const ensurePyodide = async () => {
    if (window.__mechalabPyodide) {
      pyodideRef.current = window.__mechalabPyodide;
      setPyodideStatus('ready');
      return window.__mechalabPyodide;
    }
    setPyodideStatus('loading');
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${PYODIDE_CDN}pyodide.js"]`);
        if (existing) {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error('Failed to load Pyodide script')));
          return;
        }
        const script = document.createElement('script');
        script.src = `${PYODIDE_CDN}pyodide.js`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide from CDN'));
        document.head.appendChild(script);
      });
    }
    if (!window.loadPyodide) {
      throw new Error('window.loadPyodide not available');
    }
    const py = await window.loadPyodide({ indexURL: PYODIDE_CDN });
    window.__mechalabPyodide = py;
    pyodideRef.current = py;
    setPyodideStatus('ready');
    return py;
  };

  const runPythonCode = async (sourceCode: string) => {
    setIsRunning(true);
    setStdout('');
    setStderr('');
    setPassStatus('untested');
    try {
      const py = await ensurePyodide();
      let capturedOut: string[] = [];
      let capturedErr: string[] = [];
      py.setStdout({
        batched: (msg: string) => {
          capturedOut.push(msg);
        },
      });
      py.setStderr({
        batched: (msg: string) => {
          capturedErr.push(msg);
        },
      });

      await py.runPythonAsync(sourceCode);
      const actualOut = capturedOut.join('\n').trim();
      const actualErr = capturedErr.join('\n').trim();
      setStdout(actualOut);
      setStderr(actualErr);

      const expectedNorm = currentLesson.expectedOutput
        .split('\n')
        .map((s) => s.trimEnd())
        .join('\n')
        .trim();
      const actualNorm = actualOut
        .split('\n')
        .map((s) => s.trimEnd())
        .join('\n')
        .trim();

      if (actualNorm === expectedNorm) {
        setPassStatus('passed');
        const next = { ...completedLessons, [currentLesson.id]: true };
        setCompletedLessons(next);
        try {
          localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
      } else {
        setPassStatus('mismatch');
      }
    } catch (err: any) {
      setPyodideStatus((prev) => (prev === 'loading' ? 'error' : prev));
      setStderr(err?.message || String(err));
      setPassStatus('error');
    } finally {
      setIsRunning(false);
    }
  };

  const filteredLessons = PYTHON_LESSONS.filter((l) => {
    if (trackFilter === 'track-p') return l.track === 'track-p';
    if (trackFilter === 't00-02')
      return (
        l.track === '00-foundations' ||
        l.track === '01-electronics-and-power' ||
        l.track === '02-mechanics-kinematics-dynamics'
      );
    if (trackFilter === 't03-08')
      return (
        l.track === '03-sensors-and-actuators' ||
        l.track === '04-embedded-and-realtime' ||
        l.track === '05-control-and-estimation' ||
        l.track === '06-robotics-and-autonomy' ||
        l.track === '07-systems-hil-and-production' ||
        l.track === '08-capstone-projects'
      );
    return true;
  });

  const currentIdx = PYTHON_LESSONS.findIndex((l) => l.id === currentLesson.id);
  const nextLesson =
    currentIdx >= 0 && currentIdx < PYTHON_LESSONS.length - 1
      ? PYTHON_LESSONS[currentIdx + 1]
      : null;

  const completedCount = PYTHON_LESSONS.filter((l) => completedLessons[l.id]).length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#34d399] flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5" />
            ZERO-INSTALL IN-BROWSER PYTHON 3 RUNNER (PYODIDE WEBASSEMBLY) · 32 BEGINNER LESSONS
          </div>
          <h2 className="text-lg font-bold text-[#f1f5f9] mt-0.5">
            Run Track P (`P.1–P.M`) & Tier 1 (`00.1–08.1`) Starter Code, Progressive Hints & Assert Checks In-Page
          </h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Complete the `TODO` lines, unlock hints one step at a time, and click <b>Run & Verify Output</b> to execute real Python 3.12 in your browser and diff against the lesson's expected output.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-[#0b0f19] border border-[#1e293b] px-4 py-2.5 rounded-lg">
          <div>
            <div className="text-[10px] font-mono uppercase text-[#94a3b8]">Verified Lessons</div>
            <div className="text-sm font-mono font-bold text-[#34d399]">
              {completedCount} / {PYTHON_LESSONS.length} Passed
            </div>
          </div>
          <div className="h-7 w-[1px] bg-[#1e293b]" />
          <div>
            <div className="text-[10px] font-mono uppercase text-[#94a3b8]">Pyodide Runtime</div>
            <div className="text-xs font-mono font-semibold text-[#38bdf8]">
              {pyodideStatus === 'ready'
                ? 'Ready (Python 3.12)'
                : pyodideStatus === 'loading'
                ? 'Loading WASM...'
                : pyodideStatus === 'error'
                ? 'CDN Error'
                : 'Loads on first Run'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Sidebar: 32-Lesson Selector */}
        <div className="lg:col-span-4 bg-[#111827] border border-[#334155] rounded-xl p-4 flex flex-col max-h-[760px]">
          <div className="flex items-center justify-between gap-1 mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-[#94a3b8]">
              Select Lesson ({filteredLessons.length})
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
                  className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
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
              const isDone = !!completedLessons[lesson.id];
              return (
                <button
                  key={lesson.id}
                  onClick={() => selectLesson(lesson.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#1e293b] border-[#38bdf8] text-white'
                      : 'bg-[#0b0f19]/70 border-[#1e293b] text-[#cbd5e1] hover:border-[#475569]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#0f172a] text-[#38bdf8] border border-[#334155]">
                        {lesson.id}
                      </span>
                      <span className="text-[10px] font-mono text-[#64748b] truncate">
                        {lesson.track}
                      </span>
                    </div>
                    <div className="text-xs font-medium mt-1 line-clamp-1">{lesson.title}</div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {isDone ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        <Check className="w-3 h-3" />
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
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/40">
                    Lesson {currentLesson.id}
                  </span>
                  <span className="text-xs font-mono text-[#94a3b8]">{currentLesson.path}</span>
                </div>
                <h3 className="text-base font-bold text-[#f1f5f9] mt-1">{currentLesson.title}</h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setCode(currentLesson.starterCode);
                    setPassStatus('untested');
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#0b0f19] hover:bg-[#1e293b] text-[#cbd5e1] border border-[#334155] flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Starter
                </button>
                <button
                  onClick={() => {
                    setCode(currentLesson.fullSolution);
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#0b0f19] hover:bg-[#1e293b] text-[#fbbf24] border border-[#fbbf24]/40 flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Load Solution
                </button>
                <button
                  onClick={() => runPythonCode(code)}
                  disabled={isRunning}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-[#34d399] hover:bg-[#10b981] text-[#0b0f19] flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {isRunning ? 'Running Python...' : 'Run & Verify Output'}
                </button>
              </div>
            </div>

            {/* <= 2 Ideas Enforced Badge List */}
            <div className="mt-3 pt-3 border-t border-[#1e293b] flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono text-[#94a3b8] flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-[#38bdf8]" />
                New Ideas (≤2 rule):
              </span>
              {currentLesson.ideas.map((idea, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded bg-[#0b0f19] border border-[#1e293b] text-[11px] text-[#e2e8f0]"
                >
                  {idx + 1}. {idea}
                </span>
              ))}
            </div>
          </div>

          {/* Progressive 3-Step Hint Ladder */}
          {currentLesson.hints.length > 0 && (
            <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono text-[#fbbf24] flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4" />
                  Progressive 3-Step Hint Ladder ({revealedHints} / {currentLesson.hints.length}{' '}
                  unlocked)
                </div>
                {revealedHints < currentLesson.hints.length && (
                  <button
                    onClick={() => setRevealedHints((h) => h + 1)}
                    className="px-2.5 py-1 rounded text-xs font-mono bg-[#fbbf24]/15 hover:bg-[#fbbf24]/25 text-[#fbbf24] border border-[#fbbf24]/40"
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
                Python 3 Editor — Edit TODOs and press &quot;Run &amp; Verify Output&quot;
              </span>
              <span className="text-[11px] font-mono text-[#64748b]">
                {code.split('\n').length} lines
              </span>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="w-full h-72 p-4 bg-[#0b0f19] text-[#f1f5f9] font-mono text-xs leading-relaxed focus:outline-none resize-y"
            />
          </div>

          {/* Output & Expected Output Side-by-Side Diff */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase text-[#94a3b8]">
                  Actual Python Output (`stdout` / `assert`)
                </span>
                {passStatus === 'passed' && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Exact Match & Asserts Passed!
                  </span>
                )}
                {passStatus === 'mismatch' && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Output Differs from Expected
                  </span>
                )}
                {passStatus === 'error' && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Assertion / Runtime Error
                  </span>
                )}
              </div>
              <pre className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b] font-mono text-xs text-[#e2e8f0] whitespace-pre-wrap min-h-[120px]">
                {stdout || (stderr ? '' : 'Click "Run & Verify Output" to execute this lesson.')}
                {stderr && (
                  <span className="text-rose-400 block mt-1">{stderr}</span>
                )}
              </pre>
            </div>

            <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase text-[#94a3b8]">
                  Expected Output (Verified in CI)
                </span>
                {passStatus === 'passed' && nextLesson && (
                  <button
                    onClick={() => selectLesson(nextLesson.id)}
                    className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-[#38bdf8] text-[#0b0f19] flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Next: Lesson {nextLesson.id} →
                  </button>
                )}
              </div>
              <pre className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b] font-mono text-xs text-[#34d399] whitespace-pre-wrap min-h-[120px]">
                {currentLesson.expectedOutput}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
