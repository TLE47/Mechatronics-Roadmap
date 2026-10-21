/**
 * The Python runtime: Pyodide in its own worker.
 *
 * This file is the worker itself, built by Vite as a module worker
 * (`new Worker(new URL('../../runtime/pythonWorker.js', import.meta.url), { type: 'module' })`). It was
 * a blob-URL string in TabPyodideRunner until the offline work: a service worker does not control blob
 * workers, so nothing in that blob's network traffic could be cached. A real module URL puts the worker
 * in the service worker's scope, which is what lets Pyodide's 10 MB of wheels be served from the cache
 * on a plane.
 *
 * Plain JavaScript, not TypeScript: it was extracted verbatim from the string it used to be, all of its
 * edges are messages rather than calls, and a `.js` worker keeps `tsc` out of a file whose whole job is
 * runtime behaviour that the browser suites pin (and the `webworker` lib would otherwise fight `DOM`'s
 * `self`).
 *
 * The protocol is unchanged - `init`, `warm`, `run`, `stop` in; `status`, `scope`, `stdin-request`,
 * `result` out - and so is the reason for each: an interrupt word in a SharedArrayBuffer so Stop raises
 * KeyboardInterrupt in place, a second shared buffer so `input()` blocks this thread and not the page,
 * and scope points buffered so a 1 kHz loop does not cost a message per sample.
 */


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

// Scope. A learner's loop can produce tens of thousands of points; posting each one would cost more
// than the simulation. Points are buffered here and sent in batches of SCOPE_FLUSH_POINTS, plus one
// final message before the run's result, so the panel draws while the loop runs and is complete at
// the end. SCOPE_MAX_POINTS caps a runaway recording at what a canvas can still show.
const SCOPE_FLUSH_POINTS = 500;
const SCOPE_MAX_POINTS = 20000;
let scopeSeries = new Map();
let scopePending = 0;
let scopeRunId = null;

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

function toNumberArray(value) {
  if (typeof value === 'number') return [value];
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (typeof value.length === 'number') return Array.from(value);
  return [];
}

// Called from Python as scope.stream(name, t, y). Silent while no run is active, so a stray call
// from a module import cannot leave a message for a run that has already been reported.
function scopePush(name, t, y) {
  if (!scopeRunId) return;
  const key = String(name || 'series');
  let entry = scopeSeries.get(key);
  if (!entry) {
    entry = { t: [], y: [] };
    scopeSeries.set(key, entry);
  }
  const times = toNumberArray(t);
  const values = toNumberArray(y);
  const count = Math.min(times.length, values.length);
  for (let i = 0; i < count; i += 1) {
    if (entry.t.length >= SCOPE_MAX_POINTS) {
      entry.truncated = true;
      break;
    }
    const tv = times[i];
    const yv = values[i];
    if (!Number.isFinite(tv) || !Number.isFinite(yv)) continue;
    entry.t.push(tv);
    entry.y.push(yv);
    scopePending += 1;
  }
  if (scopePending >= SCOPE_FLUSH_POINTS) flushScope(false);
}

function flushScope(final) {
  scopePending = 0;
  if (!scopeRunId || !scopeSeries.size) return;
  self.postMessage({
    type: 'scope',
    runId: scopeRunId,
    final: Boolean(final),
    series: Array.from(scopeSeries, ([name, entry]) => ({
      name,
      t: entry.t,
      y: entry.y,
      truncated: Boolean(entry.truncated),
    })),
  });
}

// Every path that ends a run goes through here, so the last batch of points cannot arrive after the
// verdict the panel is drawn beside.
function postResult(payload) {
  flushScope(true);
  self.postMessage(payload);
}

// mechalab.scope, the module the lessons' prose tells the learner to import. The two methods are
// one operation: stream paints as it goes, plot is the name a lesson uses when it is a finished curve.
function installScopeBridge(py) {
  if (py.__mechalabScopeInstalled) return;
  py.globals.set('__mechalab_scope_push__', scopePush);
  py.globals.set('__mechalab_scope_clear__', () => {
    scopeSeries.clear();
    scopePending = 0;
  });
  py.runPython(
    [
      'import sys, types',
      '',
      'def _mechalab_as_list(value):',
      '    """A list of numbers, from a list, a range or a numpy array alike."""',
      '    try:',
      '        return list(value)',
      '    except TypeError:',
      '        return [value]',
      '',
      'class _MechaLabScope:',
      '    """The Scope panel: stream and plot record a signal, clear forgets this run."""',
      '',
      '    def stream(self, name, t, y, _push=__mechalab_scope_push__):',
      '        _push(str(name), _mechalab_as_list(t), _mechalab_as_list(y))',
      '',
      '    def plot(self, name, t, y, _push=__mechalab_scope_push__):',
      '        _push(str(name), _mechalab_as_list(t), _mechalab_as_list(y))',
      '',
      '    def clear(self, _clear=__mechalab_scope_clear__):',
      '        _clear()',
      '',
      'if "mechalab" not in sys.modules:',
      '    _mechalab_module = types.ModuleType("mechalab")',
      '    _mechalab_module.scope = _MechaLabScope()',
      '    sys.modules["mechalab"] = _mechalab_module',
    ].join('\n')
  );
  py.__mechalabScopeInstalled = true;
}

function installStdinBridge(py) {
  if (py.__mechalabStdinInstalled) return;
  py.globals.set('__mechalab_read_stdin__', readStdin);
  py.runPython(
    'import builtins\n' +
      'def __mechalab_input(prompt=""):\n' +
      '    return __mechalab_read_stdin__(str(prompt))\n' +
      'builtins.input = __mechalab_input\n'
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
      // The ESM build, loaded with a dynamic import: a module worker has no `importScripts`, and a
      // dynamic import is an ordinary network request of a controlled client, which is exactly what the
      // service worker caches for offline use. `@vite-ignore` keeps the bundler from trying to resolve a
      // CDN URL it will never see at build time.
      const { loadPyodide } = await import(/* @vite-ignore */ cdnUrl + 'pyodide.mjs');
      if (typeof loadPyodide !== 'function') {
        throw new Error('loadPyodide not exported by pyodide.mjs');
      }
      const startedAt = performance.now();
      pyodideInstance = await loadPyodide({ indexURL: cdnUrl });
      if (interruptView) pyodideInstance.setInterruptBuffer(interruptView);
      installStdinBridge(pyodideInstance);
      installScopeBridge(pyodideInstance);
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
    // ...and with an empty Scope: a trace belongs to the run that produced it.
    scopeSeries = new Map();
    scopePending = 0;
    scopeRunId = runId;
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
        py.runPython('import sys\nif "/" not in sys.path:\n    sys.path.insert(0, "/")\n');
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
        py.runPython('import sys\nif "/" not in sys.path:\n    sys.path.insert(0, "/")\n');
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

      const runnerHarness = `
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
`;

      await py.runPythonAsync(runnerHarness);
      const studentErr = py.globals.get('__mechalab_student_err__') || '';
      const timedOut = Boolean(py.globals.get('__mechalab_timed_out__'));
      const stopped = Boolean(py.globals.get('__mechalab_stopped__'));

      captureEnabled = false;
      const stdoutText = capturedOut.join('\n').trim();
      const stderrText = capturedErr.join('\n').trim();

      if (stopped) {
        postResult({
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
        postResult({
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
        postResult({
          type: 'result',
          runId,
          stdout: stdoutText,
          stderr: stderrText ? stderrText + '\n' + studentErr : studentErr,
          timedOut: false,
          runtimeError: true,
          instructorPassed: false,
          instructorError: '',
          bench: earlyBench,
        });
        return;
      }

      const instructorHarness = `
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
`;

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

      postResult({
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
        postResult({
          type: 'result',
          runId,
          stdout: capturedOut.join('\n').trim(),
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

