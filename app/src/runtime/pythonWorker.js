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

// Pause. The page cannot `postMessage` into a worker that is blocked inside Python - the message
// queues behind the very loop it is meant to steer - so the command comes back through a shared word,
// the same reason Stop uses one. Two words: the command the page writes, and the status this worker
// sets so the page knows a pause is in force rather than a slow line.
const PAUSE_COMMAND = 0;
const PAUSE_STATUS = 1;
const PAUSE_NONE = 0;
const PAUSE_REQUEST = 1;
const PAUSE_CONTINUE = 2;
const PAUSE_STEP = 3;
const PAUSE_STOP = 4;
// A change to the parked frame's own values. The command word carries the decision; the value itself
// rides in its own shared buffer, the same [state, length, bytes] layout stdin uses.
const PAUSE_EDIT = 5;
// Step **into** the call the parked line is about to make, rather than over it. Its own word because
// the two land on different lines: a step over waits for the caller's next line, a step in takes the
// first line of whatever the call runs.
const PAUSE_STEP_IN = 6;
// Step **out** of the frame that is parked: run the rest of it and stop in its caller. Its own word
// because it parks on a frame **return**, not on a line of the frame being read.
const PAUSE_STEP_OUT = 7;
// Pin, or unpin, an expression the bar should show at every park. Its own word because the run does
// **not** move: the payload is posted again for the same line, with the new watch evaluated in the
// frame the learner is standing in - which is the whole point of pinning a name.
const PAUSE_WATCH = 8;
let pauseView = null;
let editView = null;
let editBytes = null;
// The payload of the edit the page just asked for, read out of the shared buffer when the command
// arrives and handed to Python by `takePauseEdit` on the very next call.
let pendingEdit = '';
// The same for a watch request (`{ add }` or `{ remove }`): one buffer, one reader at a time, because
// the page cannot ask for a second thing until this run has parked again.
let pendingWatch = '';

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

/**
 * The edit the page just asked for, as JSON (`{ name, expression }`), and only once.
 *
 * Called from Python immediately after `pauseAt` answers `edit`: the value cannot ride back in the
 * return value (that is a plain string, and evaluating it is Python's job, not this file's).
 */
function takePauseEdit() {
  const text = pendingEdit;
  pendingEdit = '';
  return text;
}

/** The watch request the page just asked for, as JSON, and only once. */
function takePauseWatch() {
  const text = pendingWatch;
  pendingWatch = '';
  return text;
}

/**
 * Has the page asked to stop at the next line?
 *
 * Called from the Python trace hook once per executed line in the learner's file, so it is an
 * `Atomics.load` and nothing else: a message round trip is not available here, and a promise cannot
 * be awaited from a trace function.
 */
function pauseRequested() {
  return pauseView ? Atomics.load(pauseView, PAUSE_COMMAND) === PAUSE_REQUEST : false;
}

/**
 * The armed lines and their conditions, as text the Python side can read once per run.
 *
 * A JSON string rather than an array: a JS array arrives in Python as a proxy, and asking whether a
 * line is armed would then be a boundary round trip on every executed line. The page already filters
 * the list against the document it is about to run; this is the last check before it becomes a map
 * the trace hook looks things up in, so a malformed message costs a breakpoint, not the run.
 */
function serializeBreakpoints(list) {
  const rows = [];
  for (const item of Array.isArray(list) ? list : []) {
    const line = Math.round(Number(item?.line ?? item));
    if (!Number.isInteger(line) || line < 1 || line > 1000000) continue;
    rows.push({ line, condition: String(item?.condition ?? '').slice(0, 200) });
    if (rows.length >= 100) break;
  }
  return JSON.stringify(rows);
}

/**
 * The watch expressions, as text the Python side can read once per run.
 *
 * A JSON string for the same reason as the breakpoints: a JS array arrives in Python as a proxy, and
 * the trace hook would then make a boundary round trip on every park to read it. The page has
already normalised the list (`app/src/editor/watches.ts`); this is the last check before the bar can
 * quote an expression the interpreter will not run - one line, five of them, the width the store and
 * the chip share.
 */
function serializeWatches(list) {
  const rows = [];
  for (const item of Array.isArray(list) ? list : []) {
    const expression = String(item ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (!expression || rows.includes(expression)) continue;
    rows.push(expression);
    if (rows.length >= 5) break;
  }
  return JSON.stringify(rows);
}

/**
 * Block the interpreter on the lease of the page, and answer how the run should go on.
 *
 * The step is posted first: `postMessage` queues to the page even though this thread is about to
 * park, which is what lets the paused bar appear without polling. Then the worker waits on the
 * shared command word - `Atomics.wait` on a worker thread is a real park, not a spin, so the page's
 * own thread stays free and the pause costs no CPU.
 *
 * Returns `continue`, `step` or `stop`; the Python side raises `KeyboardInterrupt` for `stop`, so a
 * stopped pause unwinds through the same `except` a Stop does.
 */
function pauseAt(payloadJson) {
  if (!pauseView) return 'continue';
  let step = null;
  try {
    step = JSON.parse(String(payloadJson));
  } catch {
    step = { line: 0, fn: '', depth: 1, values: [] };
  }
  Atomics.store(pauseView, PAUSE_COMMAND, PAUSE_NONE);
  Atomics.store(pauseView, PAUSE_STATUS, 1);
  self.postMessage({ type: 'paused', runId: activeRunId, step });
  for (;;) {
    Atomics.wait(pauseView, PAUSE_COMMAND, PAUSE_NONE);
    const command = Atomics.load(pauseView, PAUSE_COMMAND);
    Atomics.store(pauseView, PAUSE_COMMAND, PAUSE_NONE);
    if (command === PAUSE_EDIT || command === PAUSE_WATCH) {
      Atomics.store(pauseView, PAUSE_STATUS, 0);
      // Copied now, while the page is still waiting for the next `paused` message: it will not touch
      // the buffer again until this run has parked, and a decode here is a few hundred bytes.
      let text = '';
      if (editView) {
        const length = Math.max(0, Math.min(Atomics.load(editView, 1), editBytes.byteLength - 8));
        if (length) {
          try {
            // `slice()` copies out of shared memory first: `TextDecoder` refuses a view over a
            // `SharedArrayBuffer` ("The provided ArrayBufferView value must not be shared"), which is
            // the same reason `readStdin` copies before decoding.
            text = new TextDecoder().decode(new Uint8Array(editBytes, 8, length).slice());
          } catch {
            text = '';
          }
        }
      }
      if (command === PAUSE_WATCH) {
        pendingWatch = text;
        return 'watch';
      }
      pendingEdit = text;
      return 'edit';
    }
    if (
      command === PAUSE_CONTINUE ||
      command === PAUSE_STEP ||
      command === PAUSE_STEP_IN ||
      command === PAUSE_STEP_OUT ||
      command === PAUSE_STOP
    ) {
      Atomics.store(pauseView, PAUSE_STATUS, 0);
      if (command === PAUSE_CONTINUE) return 'continue';
      if (command === PAUSE_STEP) return 'step';
      if (command === PAUSE_STEP_IN) return 'step_in';
      if (command === PAUSE_STEP_OUT) return 'step_out';
      return 'stop';
    }
    // A request that means nothing here (a pause asked for while already paused, or a word a
    // previous run left behind) is not a decision: keep waiting.
  }
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
  // A run is over: a pause word left set would park the next run at its first line, and a status
  // left at 1 would tell the page a finished run is still waiting for an answer.
  if (pauseView) {
    Atomics.store(pauseView, PAUSE_COMMAND, PAUSE_NONE);
    Atomics.store(pauseView, PAUSE_STATUS, 0);
  }
  // A run is over: an edit left unread belongs to a frame that no longer exists.
  pendingEdit = '';
  pendingWatch = '';
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

// ---------------------------------------------------------------------------------------------
// Analysis: completions, lint, hover and signatures, inside the interpreter that is already loaded.
//
// All four come from pure-Python packages, which is the whole reason they can run here: Jedi answers
// completions, hover text and call signatures with docstrings, and the lint is two tools - pyflakes
// for what the code *does* (an unused import, an undefined name, a redefinition) and pycodestyle for
// how it is written (the E and W rules Ruff reimplements in Rust). Ruff itself is a Rust binary
// compiled to native code and cannot run in Pyodide at all, so the page names the linters that
// answered rather than borrowing Ruff's name.
//
// Installed on the first request, not at boot: a learner who never asks for a completion never pays
// the ~1.5 MB, and the warm-up that a first Run needs stays the 10 MB it was. The install is a
// network request, so it can fail; that answer is reported to the page as `unavailable`, and the
// editor falls back to the keyword completions it shipped with.
// ---------------------------------------------------------------------------------------------
let analysisPromise = null;

// The Python half. A function call per keystroke bucket rather than a script string, so the code
// being completed is data and can never be executed by the analysis path.
const ANALYSIS_HELPER_SOURCE = `
import json as _mechalab_json

def __mechalab_complete(code, line, column):
    import jedi
    try:
        completions = jedi.Script(code, path="main.py").complete(int(line), int(column))
    except Exception:
        return "[]"
    items = []
    for completion in completions[:80]:
        try:
            doc = (completion.docstring() or "").strip()
        except Exception:
            doc = ""
        items.append({
            "name": completion.name,
            "type": completion.type,
            "doc": doc[:400],
        })
    return _mechalab_json.dumps(items)

def __mechalab_style(code):
    # The style half, as pycodestyle: the rules themselves rather than a sample of them, selected to
    # the slice that is true for a learner's file.
    #
    # The selection is the one Ruff shipped by default for years - E4 (imports), E7 (statements) and
    # E9 (runtime) - minus two things. E9 is left out because the pyflakes half already answers a
    # file that will not parse, in its own sentence. E741 (ambiguous variable name) is left out
    # because in this course a bare l is a link length or an observer gain: the lessons teach that
    # symbol, and a note telling a learner to rename it would be the checker arguing with the
    # material.
    #
    # W291, W293 and W605 are added because they name characters a learner cannot see - whitespace
    # after the last word of a line, whitespace on a blank line, an escape sequence Python reads
    # literally - and this repo's own 100 starters and solutions trip none of them.
    #
    # Line length (E501) is deliberately not selected, and that is a measurement rather than a
    # preference: at Black's 88 columns it fires 740 times across those same 100 files, so a learner
    # who edited one line of a lesson would be shown notes about lines the lesson shipped. A checker
    # that flags the exercise it just printed is noise, and Black - the Format button - is what owns
    # that question anyway.
    import pycodestyle
    found = []

    class _StyleCapture(pycodestyle.BaseReport):
        def __init__(self, options):
            super().__init__(options)
            self.seen = []

        def error(self, line_number, offset, text, check):
            code = super().error(line_number, offset, text, check)
            if code and code != "E741":
                self.seen.append({
                    "line": int(line_number),
                    "column": int(offset) + 1,
                    # pycodestyle's text already starts with the rule code ("E711 comparison to
                    # None should be ..."), which is what the strip shows: the code is the part
                    # that can be looked up.
                    "text": str(text),
                })
            return code

    options = pycodestyle.StyleGuide(
        select=("E4", "E7", "W2", "W6"), quiet=True
    ).options
    report = _StyleCapture(options)
    checker = pycodestyle.Checker(
        lines=code.splitlines(True), options=options, report=report
    )
    checker.check_all()
    return report.seen[:20]

def __mechalab_lint(code):
    import pyflakes.api
    import pyflakes.reporter
    found = []

    class _Reporter(pyflakes.reporter.Reporter):
        # Structured messages rather than the text report: pyflakes already knows the line, the
        # column and the words, and re-parsing its own prose is how a lint hint ends up wrong.
        def __init__(self):
            pass

        def unexpectedError(self, filename, msg):
            found.append({"line": 1, "column": 1, "text": str(msg)})

        def syntaxError(self, filename, msg, lineno, offset, text):
            found.append({
                "line": int(lineno or 1),
                "column": int(offset or 1),
                "text": "syntax error: " + str(msg),
            })

        def flake(self, message):
            try:
                text = message.message % message.message_args
            except Exception:
                text = str(message.message)
            found.append({
                "line": int(message.lineno or 1),
                "column": int(message.col or 1),
                "text": str(text),
            })

    pyflakes.api.check(code, "<editor>", _Reporter())
    try:
        found.extend(__mechalab_style(code))
    except Exception:
        # A style half that could not run must not take the flake half down with it: the notes
        # already collected are true, and a checker that goes silent because its second tool failed
        # is worse than one that answers with what it has.
        pass
    # One list in reading order: a learner reads a file top to bottom, and two tools answering into
    # two lists would make the strip an inventory of analyzers rather than of the code.
    found.sort(key=lambda note: (note["line"], note["column"]))
    return _mechalab_json.dumps(found[:20])

def __mechalab_hover(code, line, column):
    import jedi
    try:
        helps = jedi.Script(code, path="main.py").help(int(line), int(column))
    except Exception:
        return "null"
    for help_ in helps:
        try:
            name = str(help_.name or "")
        except Exception:
            name = ""
        if not name:
            continue
        try:
            description = str(help_.description or "")
        except Exception:
            description = ""
        try:
            kind = str(help_.type or "statement")
        except Exception:
            kind = "statement"
        # help() objects have no get_signature, but they can hand out their signatures, and the first
        # one is the call a learner would write.
        signature = ""
        try:
            signatures = help_.get_signatures()
            if signatures:
                signature = str(signatures[0].to_string() or "")
        except Exception:
            signature = ""
        try:
            doc = (help_.docstring(raw=True) or "").strip()
        except Exception:
            doc = ""
        # Jedi answers a constant with the docstring of its *type*: math.pi came back as float()'s
        # "Convert a string or number to a floating-point number", which answers a question nobody
        # asked. The definition line ("pi: Final[float]") is the true part, so only that is kept.
        if kind == "statement":
            doc = ""
        return _mechalab_json.dumps({
            "name": name,
            "type": kind,
            "description": description[:160],
            "signature": signature[:300],
            "doc": doc[:1200],
        })
    return "null"

def __mechalab_signature(code, line, column):
    import jedi
    line = int(line)
    column = int(column)
    # Jedi raises on a column past the end of its line rather than clamping, and the end of a line is
    # exactly where a half-written call puts the cursor.
    lines = code.splitlines()
    if 1 <= line <= len(lines):
        column = min(column, len(lines[line - 1]))
    try:
        signatures = jedi.Script(code, path="main.py").get_signatures(line, column)
    except Exception:
        return "null"
    if not signatures:
        return "null"
    best = signatures[0]
    try:
        label = str(best.to_string() or "")
    except Exception:
        label = ""
    if not label:
        return "null"
    params = []
    for param in list(getattr(best, "params", None) or [])[:12]:
        try:
            params.append(str(param.name or ""))
        except Exception:
            params.append(str(param))
    try:
        index = best.index
    except Exception:
        index = None
    # A signature with no active parameter ("f(" typed before any argument) reports index 0 with an
    # empty list, and highlighting "parameter 0 of 0" would be noise.
    if not isinstance(index, int) or index < 0 or index >= len(params):
        index = None
    try:
        doc = (best.docstring(raw=True) or "").strip()
    except Exception:
        doc = ""
    return _mechalab_json.dumps({
        "name": str(getattr(best, "name", "") or ""),
        "label": label[:300],
        "index": index,
        "params": params,
        "doc": doc[:1200],
    })
`;

async function ensureAnalysis(py) {
  if (py.__mechalabAnalysisReady) return true;
  if (!analysisPromise) {
    analysisPromise = (async () => {
      await py.loadPackage('micropip');
      const micropip = py.pyimport('micropip');
      await micropip.install(['jedi', 'pyflakes', 'pycodestyle']);
      py.runPython(ANALYSIS_HELPER_SOURCE);
      py.__mechalabAnalysisReady = true;
      return true;
    })().catch((error) => {
      // A failed install is not remembered: the next attempt (a next visit with a network) retries.
      analysisPromise = null;
      throw error;
    });
  }
  return analysisPromise;
}

/** Write the lesson's read-only files, once per content revision, for both a run and an analysis. */
function writeLessonFiles(py, plantSource, plantFilename, helperFiles) {
  // The shared plant: one file on the Pyodide filesystem and one importable name, so every Tier 2
  // and Tier 3 exercise works the same arm the Tier 1 capstone builds.
  if (plantSource && plantFilename && py.__mechalabPlantInstalled !== plantFilename) {
    py.FS.writeFile('/' + plantFilename, plantSource);
    py.__mechalabPlantInstalled = plantFilename;
  }
  for (const file of helperFiles) {
    if (!file || !file.name) continue;
    if (!py.__mechalabFiles) py.__mechalabFiles = {};
    if (py.__mechalabFiles[file.name] !== file.content) {
      py.FS.writeFile('/' + file.name, file.content);
      py.__mechalabFiles[file.name] = file.content;
    }
  }
  if (helperFiles.length || (plantSource && plantFilename)) {
    py.runPython('import sys\nif "/" not in sys.path:\n    sys.path.insert(0, "/")\n');
  }
}

function errorText(error) {
  const message = error && error.message ? error.message : String(error);
  return message.slice(0, 300);
}

/**
 * Black, installed once per worker.
 *
 * The formatter is pure Python, so it runs here as a library rather than as a native binary: Ruff is a
 * Rust program and cannot run in Pyodide at all (`docs/PLAN-2.0-GAP.md`), which is why the formatter
 * the learner gets is Black rather than `ruff format`. It installs on the first Format press - a few
 * hundred milliseconds from the wheel cache, a couple of seconds cold - and is remembered on the
 * interpreter, so a second press costs nothing. A failed install is forgotten, not cached: the next
 * press with a network retries.
 */
let blackPromise = null;
async function ensureBlack(py) {
  if (py.__mechalabBlackReady) return true;
  if (!blackPromise) {
    blackPromise = (async () => {
      await py.loadPackage('micropip');
      const micropip = py.pyimport('micropip');
      await micropip.install('black');
      // Black reads `platformdirs` for its cache directory, and platformdirs' Unix backend imports
      // `geteuid` from `os` at module scope. A browser has no user id, so the import is what fails —
      // Black 26.x on Pyodide 0.26 raises ImportError the moment `import black` runs, after a clean
      // install. The value is only used to pick a cache path the formatter never writes in here, so
      // a constant stands in for it. Measured against black 26.10.1, 2026-10-28.
      py.runPython(
        "import os\n" +
          "if not hasattr(os, 'geteuid'):\n" +
          "    os.geteuid = lambda: 0\n" +
          "if not hasattr(os, 'getuid'):\n" +
          "    os.getuid = lambda: 0\n"
      );
      py.__mechalabBlackReady = true;
      return true;
    })().catch((error) => {
      blackPromise = null;
      throw error;
    });
  }
  return blackPromise;
}

/**
 * Format the learner's file, and answer with the text (or the parser's sentence).
 *
 * Black's mode is its default: the one `black file.py` uses on the command line. Not a preference the
 * learner sets - an app that promised "format" and then asked about line length would be asking a
 * beginner a question they came here to avoid.
 */
async function handleFormat(msg) {
  const requestId = Number(msg.requestId) || 0;
  const source = String(msg.code ?? '');
  try {
    const py = await ensurePyodideLoaded(msg.cdnUrl);
    const wasReady = Boolean(py.__mechalabBlackReady);
    if (!wasReady) self.postMessage({ type: 'format-status', state: 'installing' });
    try {
      await ensureBlack(py);
    } finally {
      if (!wasReady) self.postMessage({ type: 'format-status', state: 'done' });
    }
    py.globals.set('__mechalab_format_source__', source);
    // The parser's refusal is answered as data, not as a thrown `PythonError`: the message of that
    // error is a whole traceback, and which of its lines is the parser's own sentence is a guess that
    // changed between Black versions (measured once: the tail said `ParseError: bad input`). A JSON
    // answer says which kind of failure it is, in the one place that knows.
    // Straight-line Python, one line per array entry: the answer is the whole document or the parser's
    // position, and a status bar shows one line. Black 26 answers a bad file with
    // `cannot parse: 1:6`, then the source line, then a caret; the first two are what a learner needs.
    const formatScript = [
      'import json as _mechalab_format_json, black as _mechalab_black',
      'def _mechalab_format():',
      '    try:',
      '        _text = _mechalab_black.format_str(__mechalab_format_source__, mode=_mechalab_black.Mode())',
      '        return _mechalab_format_json.dumps({"formatted": _text})',
      '    except Exception as _mechalab_error:',
      '        _lines = [line.strip() for line in str(_mechalab_error).splitlines() if line.strip()]',
      '        _sentence = _lines[0] if _lines else ""',
      '        if len(_lines) > 1 and _lines[1] != "^":',
      '            _sentence = _sentence + " · " + _lines[1]',
      '        return _mechalab_format_json.dumps({"error": "%s: %s" % (type(_mechalab_error).__name__, _sentence)})',
      '_mechalab_format()',
    ].join('\n');
    const answer = py.runPython(formatScript);
    const parsed = JSON.parse(String(answer ?? '{}'));
    if (typeof parsed.error === 'string' && parsed.error) {
      // A file Black cannot read is the learner's own syntax, and the parser's position is the half
      // they can act on.
      self.postMessage({ type: 'format', requestId, error: parsed.error });
      return;
    }
    self.postMessage({ type: 'format', requestId, formatted: String(parsed.formatted ?? '') });
  } catch (error) {
    // Anything that is not the parser talking - a missing wheel, a dead CDN, a JSON answer that did
    // not arrive - is the formatter being unavailable, which is a different sentence and must not be
    // blamed on the learner's code.
    console.error('[format] black failed', error);
    self.postMessage({ type: 'format', requestId, unavailable: errorText(error) });
  }
}

/** Load the interpreter (if needed), install the analyzers (if needed), write the lesson's files. */
async function prepareAnalysis(msg) {
  const py = await ensurePyodideLoaded(msg.cdnUrl);
  // The page's request clock suits a warm worker; the install it is about to wait on does not fit in
  // it, so the install is announced and the page stretches the clock rather than abandoning the
  // request and answering it with keywords. Not a request of its own: no id, and the run path drops
  // messages it does not know.
  const wasReady = Boolean(py.__mechalabAnalysisReady);
  if (!wasReady) self.postMessage({ type: 'analysis-status', state: 'installing' });
  try {
    await ensureAnalysis(py);
  } finally {
    if (!wasReady) self.postMessage({ type: 'analysis-status', state: 'done' });
  }
  writeLessonFiles(py, msg.plantSource, msg.plantFilename, msg.helperFiles || []);
  return py;
}

/**
 * Call one analysis helper and return its JSON, or `fallback` when the call could not be made.
 *
 * The Python function is fetched, called and destroyed per request: a PyProxy that outlives the call
 * leaks across a Reset Runtime, and the four helpers all take plain strings and numbers.
 */
function runAnalysisCall(py, name, args, fallback) {
  const call = py.globals.get(name);
  try {
    return String(call(...args));
  } finally {
    if (call && typeof call.destroy === 'function') call.destroy();
  }
}

/**
 * One request shape for all four analyzers: prepare, call, post.
 *
 * `shape` says how the answer is shaped (`options` is a list, `hover` may be null) and which message
 * type carries it back; the request id is echoed, which is the only thing that ties an answer to the
 * keystroke that asked for it.
 */
async function handleAnalysis(msg, { type, helper, source, fallback, args, shape }) {
  const startedAt = performance.now();
  try {
    const py = await prepareAnalysis(msg);
    const json = runAnalysisCall(py, helper, args(msg), fallback);
    self.postMessage({
      type,
      requestId: msg.requestId,
      [shape]: JSON.parse(json),
      source,
      ms: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    // The page turns this into one sentence; the console keeps the whole error for whoever is
    // debugging a failed analyzer install.
    console.error(`[${type}] analysis failed`, error);
    self.postMessage({ type, requestId: msg.requestId, unavailable: errorText(error) });
  }
}

const handleComplete = (msg) =>
  handleAnalysis(msg, {
    type: 'completions',
    helper: '__mechalab_complete',
    source: 'jedi',
    fallback: '[]',
    shape: 'options',
    args: (m) => [String(m.code || ''), Number(m.line) || 1, Number(m.column) || 0],
  });

const handleLint = (msg) =>
  handleAnalysis(msg, {
    type: 'lint',
    helper: '__mechalab_lint',
    source: 'pyflakes + pycodestyle',
    fallback: '[]',
    shape: 'messages',
    args: (m) => [String(m.code || '')],
  });

const handleHover = (msg) =>
  handleAnalysis(msg, {
    type: 'hover',
    helper: '__mechalab_hover',
    source: 'jedi',
    fallback: 'null',
    shape: 'hover',
    args: (m) => [String(m.code || ''), Number(m.line) || 1, Number(m.column) || 0],
  });

const handleSignature = (msg) =>
  handleAnalysis(msg, {
    type: 'signature',
    helper: '__mechalab_signature',
    source: 'jedi',
    fallback: 'null',
    shape: 'signature',
    args: (m) => [String(m.code || ''), Number(m.line) || 1, Number(m.column) || 0],
  });

async function ensurePyodideLoaded(cdnUrl) {
  // A completion, hover, signature or lint request does not carry the CDN: the page warms this
  // worker with it on mount, and only the run and format paths repeat it because they can be the
  // first message a worker ever sees. Falling back to the URL this worker already loaded keeps an
  // analysis request from starting a second load of `undefinedpyodide.mjs` — which is what a tab
  // switch that keeps the worker alive used to do, because there was no in-flight warm to ride.
  const url = cdnUrl || loadedCdnUrl;
  if (pyodideInstance && loadedCdnUrl === url) {
    return pyodideInstance;
  }
  // Any in-flight load is the load: Pyodide comes from one CDN, and two importScripts calls in one
  // worker would race the interpreter's global.
  if (loadPromise) {
    return loadPromise;
  }
  loadedCdnUrl = url;
  self.postMessage({ type: 'status', status: 'loading' });
  loadPromise = (async () => {
    try {
      // The ESM build, loaded with a dynamic import: a module worker has no `importScripts`, and a
      // dynamic import is an ordinary network request of a controlled client, which is exactly what the
      // service worker caches for offline use. `@vite-ignore` keeps the bundler from trying to resolve a
      // CDN URL it will never see at build time.
      const { loadPyodide } = await import(/* @vite-ignore */ url + 'pyodide.mjs');
      if (typeof loadPyodide !== 'function') {
        throw new Error('loadPyodide not exported by pyodide.mjs');
      }
      const startedAt = performance.now();
      pyodideInstance = await loadPyodide({ indexURL: url });
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
    pauseView = msg.pauseBuffer ? new Int32Array(msg.pauseBuffer, 0, 2) : null;
    editView = msg.editBuffer ? new Int32Array(msg.editBuffer, 0, 2) : null;
    // The buffer itself, not a view over it: the payload decode slices from byte 8, and a `Uint8Array`
    // passed to another `Uint8Array` constructor is copied as an array-like, ignoring the offset.
    editBytes = msg.editBuffer || null;
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
  // Analysis rides the same thread as a run, so a request that arrives mid-run is answered after
  // it: the page only asks while nothing is running, and drops a late answer by request id.
  if (msg.type === 'complete') {
    await handleComplete(msg);
    return;
  }
  if (msg.type === 'lint') {
    await handleLint(msg);
    return;
  }
  if (msg.type === 'hover') {
    await handleHover(msg);
    return;
  }
  if (msg.type === 'signature') {
    await handleSignature(msg);
    return;
  }
  if (msg.type === 'format') {
    await handleFormat(msg);
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
      breakpoints = [],
      watches = [],
    } = msg;

    // A fresh run starts un-stopped: clear the interrupt word a previous Stop left set.
    stopRequested = false;
    activeRunId = runId;
    // ...and with an empty Scope: a trace belongs to the run that produced it.
    scopeSeries = new Map();
    scopePending = 0;
    scopeRunId = runId;
    if (interruptView) Atomics.store(interruptView, 0, 0);
    // A pause word left set by a previous run would stop this one at its first line.
    if (pauseView) {
      Atomics.store(pauseView, PAUSE_COMMAND, PAUSE_NONE);
      Atomics.store(pauseView, PAUSE_STATUS, 0);
    }
    const capturedOut = [];
    const capturedErr = [];
    let captureEnabled = true;

    try {
      const py = await ensurePyodideLoaded(cdnUrl);
      // The shared plant and the lesson's read-only files, exactly as the editor shows them: a
      // helper the learner can read on screen is the module the import resolves to, and the same
      // writer serves completions so a dotted name completes against the real file.
      writeLessonFiles(py, plantSource, plantFilename, helperFiles);
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
      // The trace's caps come from the page (`app/src/runTrace.ts`), so the worker and the panel that
      // prints "300 of 12,431" cannot disagree about which number is which.
      const traceCaps = msg.trace && typeof msg.trace === 'object' ? msg.trace : null;
      py.globals.set('__mechalab_trace__', traceCaps ? 1 : 0);
      py.globals.set('__mechalab_trace_cap__', Number(traceCaps?.cap) || 0);
      py.globals.set('__mechalab_trace_name_cap__', Number(traceCaps?.names) || 0);
      py.globals.set('__mechalab_trace_value_chars__', Number(traceCaps?.chars) || 0);
      // Pause lives on the trace hook the step budget already runs: the same line events, one more
      // question asked of the page before the line executes.
      py.globals.set('__mechalab_pause_requested__', pauseRequested);
      py.globals.set('__mechalab_pause__', pauseAt);
      py.globals.set('__mechalab_take_edit__', takePauseEdit);
      // The armed lines and the condition each waits for, as one JSON string: a JS array arrives in
      // Python as a proxy, and a membership test on one would be a boundary round trip on every
      // executed line. The Python side builds one map per run (`breakpoint_conditions`).
      py.globals.set('__mechalab_breakpoints__', serializeBreakpoints(breakpoints));
      // The expressions the bar pins, one JSON string: evaluated in whichever frame parks, so the
      // same question is answered at every stop rather than only where the name happens to be local.
      py.globals.set('__mechalab_watches__', serializeWatches(watches));
      py.globals.set('__mechalab_take_watch__', takePauseWatch);
      // Every file the page can put on screen: the lesson's helper tabs and the shared plant. A step
      // can land in one of them, and the bar quotes the line from the file it names - so a file the
      // page cannot show is not a place to park (`project_files` in the harness).
      py.globals.set(
        '__mechalab_project_files__',
        JSON.stringify(
          [plantFilename, ...helperFiles.map((file) => file?.name)].filter(
            (name) => typeof name === 'string' && name
          )
        )
      );

      const runnerHarness = `
import json as _json, sys, time, traceback, warnings

def __mechalab_execute():
    ns = {
        "__name__": "__main__",
        "__mechalab_student_source__": __mechalab_student_code__,
    }
    t0 = time.monotonic()
    steps = 0
    max_s = int(__mechalab_max_steps__)
    max_t = float(__mechalab_timeout_sec__)
    # The trace: what the program did, kept only while it is small enough to be read. The count keeps
    # going past the cap, so the panel can say "300 of 12,431 steps" rather than implying the program
    # stopped there (the caps and the words are app/src/runTrace.ts's).
    trace_steps = []
    trace_total = 0
    want_trace = bool(int(__mechalab_trace__))
    trace_cap = int(__mechalab_trace_cap__)
    trace_names = int(__mechalab_trace_name_cap__)
    trace_chars = int(__mechalab_trace_value_chars__)

    # The expressions the bar pins, and one compiled form each. A watch is the learner's own
    # expression evaluated in whichever frame parks: 'plant.L1' inside a call, 'n * 2' at top level,
    # 'total' at every turn of a loop. Compiled once per run - a park in a loop would otherwise pay a
    # compile at every stop - and an expression that will not compile is kept with its sentence, so
    # a typo reads as a sentence in the bar rather than as a chip with nothing beside it.
    try:
        _watched = _json.loads(str(__mechalab_watches__) or "[]")
    except Exception:
        _watched = []
    watch_expressions = []
    if isinstance(_watched, list):
        for _expression in _watched:
            _text = str(_expression or "").strip()[:120]
            if not _text or _text in watch_expressions:
                continue
            watch_expressions.append(_text)
            if len(watch_expressions) >= 5:
                break
    # A parked value is cut to this width even when the trace is off and its own width is 0.
    watch_chars = trace_chars if trace_chars > 0 else 120
    watch_codes = {}

    def _watch_values(frame):
        # The pinned questions, answered for this frame. A watch that raises is a question this
        # frame cannot answer ('n' before the loop assigns it, a name from another lesson): the bar
        # says what the interpreter said and the run stays exactly where it is.
        out = []
        for expression in watch_expressions:
            if expression not in watch_codes:
                try:
                    watch_codes[expression] = (compile(expression, "<watch>", "eval"), "")
                except Exception as watch_compile_error:
                    watch_codes[expression] = (
                        None,
                        f"{type(watch_compile_error).__name__}: {watch_compile_error}",
                    )
            code, compile_error = watch_codes[expression]
            if compile_error:
                out.append({"expression": expression, "error": compile_error})
                continue
            try:
                text = repr(eval(code, frame.f_globals, frame.f_locals))
            except Exception as watch_error:
                out.append(
                    {
                        "expression": expression,
                        "error": f"{type(watch_error).__name__}: {watch_error}",
                    }
                )
                continue
            if len(text) > watch_chars:
                text = text[: max(0, watch_chars - 3)] + "..."
            out.append({"expression": expression, "value": text})
        return out

    def _trace_values(frame):
        # Only data, only a few names, only a width a cell can hold. A repr that raises is skipped:
        # a recording of a run must not become a second failure.
        out = []
        for value_name, bound in list(frame.f_locals.items()):
            if value_name.startswith("_"):
                continue
            try:
                text = repr(bound)
            except Exception:
                continue
            if len(text) > trace_chars:
                text = text[: max(0, trace_chars - 3)] + "..."
            out.append({"name": value_name[:32], "value": text})
            if len(out) >= trace_names:
                break
        return out

    # The files the learner can open on screen: their own file, a lesson's helper tabs, the shared
    # plant. A step may land in any of them; a frame we did not compile has no source in the editor
    # to quote, so CPython's own frames are not places to stand (stepping into math.sqrt is reading
    # the interpreter, not the learner's program).
    project_files = {"<lesson_editor>"}
    try:
        _project = _json.loads(str(__mechalab_project_files__) or "[]")
    except Exception:
        _project = []
    if isinstance(_project, list):
        for _name in _project:
            if isinstance(_name, str) and _name:
                project_files.add(_name.lstrip("/"))

    def _project_name(filename):
        # A module imported from sys.path reports its path, '/mechalab_plant.py', while the page names
        # files the way its tabs do. Measured: without this the plant was never a place a step could
        # stand, and a step in on it ran the call to its end instead.
        return filename.lstrip("/")

    def _in_project(filename):
        return _project_name(filename) in project_files

    def _trace_depth(frame):
        # Frames of files the learner can open, and only those: a call into abs() is not a deeper
        # step in their code, and neither is Pyodide's own plumbing.
        depth = 1
        walker = frame.f_back
        while walker is not None and _in_project(walker.f_code.co_filename):
            depth += 1
            walker = walker.f_back
        return depth

    # 0: run freely. 1: step over - stop at the next line of a file the learner can open, at the depth
    # that asked for the step or shallower, so a call runs to its end and a returning call lands back
    # in its caller. 2: step in - stop at the first line of any of those files, which is how a call
    # becomes a frame the bar can show. 3: step out - stop in the caller of the frame that was parked,
    # which is a frame **return** rather than a line (see the return branch below).
    pause_mode = 0
    # The depth of the park that asked for a step. A step over parks at this depth or shallower, a step
    # out strictly shallower (its caller), and a step in has no floor: the line it wants is deeper.
    step_floor = 0

    # The lines the gutter armed for this run, and the condition each one waits for. A breakpoint
    # parks the run without anyone pressing anything, which is the difference between a pause that is
    # asked for and one that is placed; the condition is what makes a park in a loop land on the pass
    # that matters instead of the first one.
    breakpoint_conditions = {}
    # Each condition is compiled once per run, not once per pass: a loop that reaches the same dot a
    # thousand times would otherwise pay a compile for every turn. A condition that will not compile
    # is kept with its own sentence and reported at the line, because the learner's typo is the thing
    # to show - not a run that silently never stops.
    breakpoint_checks = {}
    try:
        _armed = _json.loads(str(__mechalab_breakpoints__) or "[]")
    except Exception:
        _armed = []
    if isinstance(_armed, list):
        for _entry in _armed:
            try:
                _bp_line = int(_entry.get("line"))
            except Exception:
                continue
            if _bp_line < 1:
                continue
            _bp_condition = str(_entry.get("condition") or "")[:200]
            breakpoint_conditions[_bp_line] = _bp_condition
            if not _bp_condition.strip():
                continue
            try:
                breakpoint_checks[_bp_line] = (
                    compile(_bp_condition, "<breakpoint>", "eval"),
                    "",
                )
            except Exception as _bp_compile_error:
                breakpoint_checks[_bp_line] = (
                    None,
                    f"Breakpoint condition failed ({_bp_condition}): "
                    f"{type(_bp_compile_error).__name__}: {_bp_compile_error}",
                )

    def _breakpoint_hit(frame):
        # Whether this line's dot stops the run now, and the sentence to show if its condition could
        # not be read. The expression is the learner's own, evaluated with the names the line can see
        # ('n == 3' inside a loop reads the loop's own 'n'). One that raises parks anyway and says
        # what the interpreter said: skipping the park hides the mistake, and ending the run turns it
        # into a failure the learner cannot trace back to their typing.
        if frame.f_lineno not in breakpoint_conditions:
            return False, ""
        code, compile_error = breakpoint_checks.get(frame.f_lineno, (None, ""))
        if compile_error:
            return True, compile_error
        if code is None:
            return True, ""
        try:
            return bool(eval(code, frame.f_globals, frame.f_locals)), ""
        except Exception as condition_error:
            return (
                True,
                f"Breakpoint condition failed ({breakpoint_conditions[frame.f_lineno]}): "
                f"{type(condition_error).__name__}: {condition_error}",
            )

    def _apply_edit(frame):
        # A value the learner typed for a name the bar is showing. It is evaluated in the parked frame
        # - the names the bar read are the names it can see - and written back into that frame, so
        # Continue carries on with the value they chose. Answers an error sentence, or "" when it
        # landed: a rejected expression must not look like an applied one.
        raw = __mechalab_take_edit__()
        if not raw:
            return ""
        try:
            request = _json.loads(raw)
            edit_name = str(request.get("name") or "")
            edit_expression = str(request.get("expression") or "")
            if not edit_name or not edit_expression.strip():
                return "An edit needs a name and a value."
            edit_value = eval(
                compile(edit_expression, "<frame edit>", "eval"),
                frame.f_globals,
                frame.f_locals,
            )
        except Exception as edit_error:
            return f"{type(edit_error).__name__}: {edit_error}"
        frame.f_locals[edit_name] = edit_value
        # On CPython 3.12 a function frame's f_locals is a snapshot: writing it changes what the
        # debugger reads, not what the function will use. Push it into the frame's fast locals. That
        # API is private, so a failure says so rather than leaving a value that looks applied.
        if frame.f_code.co_name != "<module>":
            try:
                import ctypes
                ctypes.pythonapi.PyFrame_LocalsToFast(ctypes.py_object(frame), ctypes.c_int(0))
            except Exception:
                return "This interpreter cannot change a local inside a function; edit at top level."
        return ""

    def _apply_watch(frame):
        # A watch pinned or unpinned while the run is parked. It is read before the bar is posted
        # again - the point of pinning a name is to see it where the learner is standing, not one
        # Step later - and a list at its cap says so rather than evicting something they chose.
        # Answers an error sentence, or "" when it landed.
        raw = __mechalab_take_watch__()
        if not raw:
            return ""
        try:
            request = _json.loads(raw)
            # The page normalises what was typed; this repeats it in one place so a hand-written
            # message cannot smuggle a newline into an expression the bar has to show on one line.
            add_expression = " ".join(str(request.get("add") or "").split())[:120]
            remove_expression = " ".join(str(request.get("remove") or "").split())[:120]
        except Exception as watch_error:
            return f"{type(watch_error).__name__}: {watch_error}"
        if remove_expression and remove_expression in watch_expressions:
            watch_expressions.remove(remove_expression)
        if add_expression and add_expression not in watch_expressions:
            if len(watch_expressions) >= 5:
                return "At most 5 watches. Remove one to pin another."
            watch_expressions.append(add_expression)
        return ""

    def _pause_here(frame, reason, condition_error=""):
        # A pause is only offered at a line the page can show - the learner's file, a helper tab, the
        # plant - and only while the shared command word exists. The reason travels with the step so
        # the bar can say which park this is, the file so it can quote the right text, and a
        # condition that would not evaluate travels with it too.
        nonlocal t0, pause_mode, step_floor
        edit_error = ""
        watch_error = ""
        while True:
            payload = {
                "line": frame.f_lineno,
                "fn": frame.f_code.co_name,
                "file": _project_name(frame.f_code.co_filename),
                "depth": _trace_depth(frame),
                "values": _trace_values(frame),
                "reason": reason,
            }
            if condition_error:
                payload["condition_error"] = condition_error
            if edit_error:
                payload["edit_error"] = edit_error
            if watch_error:
                payload["watch_error"] = watch_error
            if watch_expressions:
                payload["watches"] = _watch_values(frame)
            verdict = __mechalab_pause__(_json.dumps(payload))
            if verdict == "edit":
                # Applied, or rejected with a sentence: either way the bar is posted again with this
                # frame's current values, and the run stays parked until the learner decides.
                edit_error = _apply_edit(frame)
                continue
            if verdict == "watch":
                # The run does not move: the same line is posted again, with the new watch answered
                # in this very frame. A refusal (a full bar) travels as a sentence beside it.
                watch_error = _apply_watch(frame)
                continue
            break
        if verdict == "stop":
            raise KeyboardInterrupt
        if verdict == "step_in":
            # The first line of any project file, however deep: that is the call's own body.
            pause_mode = 2
            step_floor = 0
        elif verdict == "step_out":
            # The caller is one frame up, so the frame that asked has to return first.
            pause_mode = 3
            step_floor = _trace_depth(frame)
        elif verdict == "step":
            pause_mode = 1
            step_floor = _trace_depth(frame)
        else:
            pause_mode = 0

    def _trace_guard(frame, event, arg):
        # t0 is assigned below (the paused time is added back), so it has to be declared here too,
        # or this function reads it as an unbound local on the very first line.
        nonlocal steps, trace_total, t0
        if event == "line":
            steps += 1
            in_lesson = frame.f_code.co_filename == "<lesson_editor>"
            if in_lesson:
                # The recording is the lesson's own file: a helper's lines are not the program the
                # learner wrote, and the trace panel draws one file's story.
                trace_total += 1
                if want_trace and len(trace_steps) < trace_cap:
                    trace_steps.append({
                        "line": frame.f_lineno,
                        "fn": frame.f_code.co_name,
                        "depth": _trace_depth(frame),
                        "values": _trace_values(frame),
                    })
            # Where a park may land: a step in any file the page can show, a breakpoint only in the
            # file whose gutter drew it (a helper's line 3 must not fire the dot on main.py's line 3),
            # and Pause in the learner's own file, which is what the button promises.
            reason = ""
            if pause_mode and _in_project(frame.f_code.co_filename):
                depth_now = _trace_depth(frame)
                if pause_mode == 2:
                    reason = "step"
                elif pause_mode == 1 and depth_now <= step_floor:
                    reason = "step"
                elif pause_mode == 3 and depth_now < step_floor:
                    # A step out that never met its return (an exception unwound past it, a frame
                    # that gave way to a shallower one): the first line of the caller is still
                    # where the learner wanted to be.
                    reason = "step"
            on_breakpoint, condition_error = (False, "")
            if not reason and in_lesson:
                on_breakpoint, condition_error = _breakpoint_hit(frame)
                if on_breakpoint:
                    reason = "breakpoint"
            if not reason and in_lesson and __mechalab_pause_requested__():
                reason = "pause"
            if reason:
                # The wall clock keeps running while the worker is parked, and the harness's timeout
                # is a wall clock: the time a learner spends reading a line is not execution time, so
                # it is added back rather than charged as a slow loop.
                before = time.monotonic()
                _pause_here(frame, reason, condition_error if reason == "breakpoint" else "")
                t0 += time.monotonic() - before
        elif event == "return":
            # Step out parks on the **return of the frame that was parked**, and reports the caller.
            # Waiting for the caller's next line event would miss the common case: a call is often
            # the last thing on its line ('print(f(x))'), so there is no new line in the caller to
            # stop at, and the run would go to the end instead. At the return event the caller's
            # f_lineno is still the call, which is exactly the line to show.
            if (
                pause_mode == 3
                and _trace_depth(frame) == step_floor
                and frame.f_back is not None
                and _in_project(frame.f_back.f_code.co_filename)
            ):
                before = time.monotonic()
                _pause_here(frame.f_back, "step")
                t0 += time.monotonic() - before
        # The budget belongs to execution, not to one event kind: checked here, outside the two
        # branches, so a return event can never become the only thing that notices an exhausted loop.
        if steps > max_s or (time.monotonic() - t0) > max_t:
            raise TimeoutError(
                f"ExecutionTimeoutError: Loop exceeded execution limit ({steps} line steps / {max_t:.1f}s). "
                "Possible infinite loop (such as 'while True:'). Your editor code is preserved — check your loop condition and try again."
            )
        return _trace_guard

    student_err = ""
    timed_out = False
    stopped = False
    # One warning is ours, not the learner's: reading a frame's locals makes CPython report that a
    # name a PEP 709 comprehension left unbound is being set to None. The name stays unbound (a later
    # read still raises NameError - measured), but the notice would land in their stderr and change the
    # graded output. The filter names the message, so a RuntimeWarning the learner caused still shows.
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                category=RuntimeWarning,
                message="assigning None to unbound local",
            )
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
        # The whole traceback, not just the exception line: the panel reads the frames to name the line
        # in the learner's own file, and separates them from the lesson's appended self-check.
        student_err = traceback.format_exc().strip()
    finally:
        sys.settrace(None)

    return ns, student_err, timed_out, stopped, trace_steps, trace_total

__mechalab_ns__, __mechalab_student_err__, __mechalab_timed_out__, __mechalab_stopped__, __mechalab_trace_steps__, __mechalab_trace_total__ = __mechalab_execute()

# Inline values: what this run left each top-level name holding. Captured here, from the namespace the
# run itself returned, because a value read later would belong to a later attempt. Functions, classes,
# modules and dunders are skipped (a name is only worth drawing when it holds data), and a long repr is
# cut to the width the editor draws.
import json as __mechalab_json__

def __mechalab_inline_values(namespace):
    import types
    skip = (
        types.ModuleType,
        types.FunctionType,
        types.BuiltinFunctionType,
        types.MethodType,
        type,
    )
    collected = []
    for value_name, bound in list(namespace.items()):
        if value_name.startswith("_") or isinstance(bound, skip):
            continue
        try:
            text = repr(bound)
        except Exception:
            continue
        if len(text) > 48:
            text = text[:45] + "..."
        collected.append({"name": value_name, "value": text})
    return collected[-16:]

try:
    __mechalab_inline_json__ = __mechalab_json__.dumps(__mechalab_inline_values(__mechalab_ns__))
except Exception:
    __mechalab_inline_json__ = "[]"

# The trace as JSON, or an empty string when nothing was recorded: the panel reads absence as absence.
try:
    if __mechalab_trace_steps__:
        __mechalab_trace_json__ = __mechalab_json__.dumps({
            "steps": __mechalab_trace_steps__,
            "total": __mechalab_trace_total__,
        })
    else:
        __mechalab_trace_json__ = ""
except Exception:
    __mechalab_trace_json__ = ""
`;

      await py.runPythonAsync(runnerHarness);
      const studentErr = py.globals.get('__mechalab_student_err__') || '';
      const timedOut = Boolean(py.globals.get('__mechalab_timed_out__'));
      const stopped = Boolean(py.globals.get('__mechalab_stopped__'));
      // Parsed once, attached to every verdict: a failed run's values are the ones the learner needs
      // most, and they are still this run's own.
      const inlineValues = (() => {
        try {
          const raw = py.globals.get('__mechalab_inline_json__');
          const parsed = raw ? JSON.parse(String(raw)) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      // The recorded trace, as JSON, or '' when the run recorded none. The page validates every step
      // itself (`app/src/runTrace.ts`); this thread only carries it.
      const traceJson = (() => {
        try {
          const raw = py.globals.get('__mechalab_trace_json__');
          return raw ? String(raw) : '';
        } catch {
          return '';
        }
      })();

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
          inlineValues,
          trace: traceJson,
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
          inlineValues,
          trace: traceJson,
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
          inlineValues,
          trace: traceJson,
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
        inlineValues,
        trace: traceJson,
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

