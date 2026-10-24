import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Cpu, ExternalLink, Play, RotateCcw, Square, XCircle } from 'lucide-react';
import {
  displayTitle,
  gradeBoardPrint,
  validateBridges,
  verdictLine,
  type BoardBridge,
} from '../../boardBridge.ts';
import { pageUrl } from '../../pageUrl.ts';
import { logEvent } from '../../learningLog.ts';
import bridgeFile from '../../data/boardBridges.json';
import firmwareFile from '../../data/firmware.json';

/**
 * Board — the one tab that runs machine code (`TabBoard.tsx`).
 *
 * The lessons are C for an Arduino Uno and this app has no C toolchain, so the program is compiled
 * ahead of time (`scripts/extract_and_compile_sketches.py --write-firmware`) and committed as `.hex`;
 * the tab fetches the sketch's bytes on demand and executes them in `avr8js` (`app/src/avrSim.ts`),
 * with a serial monitor, a cycle count, and Stop. `avr8js` is imported **inside** the Run handler, so
 * the 14 kB it costs is a chunk a first visit never pays for.
 *
 * The predict half is the reason this is a lesson surface and not a toy: the guess is graded against
 * what the emulator actually printed, not against the page's text, so a divergence between the two
 * shows up as a mismatch instead of being silently forgiven. A completed run is logged as a run.
 */

const BRIDGES: BoardBridge[] = (() => {
  try {
    return validateBridges(bridgeFile);
  } catch {
    return [];
  }
})();

/** Which lessons have compiled firmware, keyed by id; `--check-firmware` keeps the two files agreeing. */
const FIRMWARE_BY_ID = new Map(
  (firmwareFile as { sketches: { id: string; hex: string }[] }).sketches.map((entry) => [entry.id, entry])
);

type Status = 'idle' | 'running' | 'complete' | 'stopped' | 'budget' | 'error';

/** Simulated seconds, from the 16 MHz clock, so the panel can say what the cycle count means. */
function arduinoSeconds(cycles: number): string {
  return `${(cycles / 16_000_000).toFixed(2)} s`;
}

export const TabBoard: React.FC = () => {
  const [selectedId, setSelectedId] = useState(BRIDGES[0]?.id ?? '');
  const [guess, setGuess] = useState('');
  const [serial, setSerial] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [cycles, setCycles] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const bridge = useMemo(
    () => BRIDGES.find((entry) => entry.id === selectedId) ?? BRIDGES[0],
    [selectedId]
  );

  // Leaving the tab stops the run: a 40 ms-of-Arduino-time slice forever in the background is a
  // battery bug, and the reader is not looking at it.
  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  if (!bridge) {
    return (
      <div className="p-4 text-muted text-sm" data-testid="tab-board">
        The generated bridge data is missing, so this tab has nothing to run. Run
        <code className="font-mono text-ink"> python3 scripts/extract_and_compile_sketches.py --write-panel</code>.
      </div>
    );
  }

  const firmware = FIRMWARE_BY_ID.get(bridge.id);

  const reset = () => {
    cancelled.current = true;
    setSerial('');
    setCycles(0);
    setElapsed(0);
    setStatus('idle');
    setVerdict(null);
    setError(null);
  };

  const select = (id: string) => {
    reset();
    setGuess('');
    setSelectedId(id);
  };

  const stop = () => {
    cancelled.current = true;
    setStatus((current) => (current === 'running' ? 'stopped' : current));
  };

  const run = async () => {
    if (!firmware) {
      setError('This lesson has no compiled firmware; rebuild with --write-firmware.');
      return;
    }
    reset();
    cancelled.current = false;
    setStatus('running');
    const startedAt = Date.now();
    try {
      const [{ AvrSketch, CHUNK_CYCLES, DEFAULT_MAX_CYCLES, normalizeSerial }, response] =
        await Promise.all([
          import('../../avrSim.ts'),
          fetch(`${import.meta.env.BASE_URL}${firmware.hex}`),
        ]);
      if (!response.ok) throw new Error(`could not fetch ${firmware.hex} (HTTP ${response.status})`);
      const hex = await response.text();
      const sketch = new AvrSketch(hex);
      // A chunk per tick: 40 000 instructions is a few milliseconds, so Stop stays responsive and
      // the monitor fills the way a board would fill it.
      while (!cancelled.current && sketch.cycles < DEFAULT_MAX_CYCLES) {
        sketch.step(CHUNK_CYCLES);
        setSerial(normalizeSerial(sketch.serial));
        if (gradeBoardPrint(bridge, sketch.output).matched) break;
        // Yield to the browser so the button, the scroll and the Stop press all stay live.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const finalText = normalizeSerial(sketch.serial);
      setSerial(finalText);
      setCycles(sketch.cycles);
      setElapsed(Date.now() - startedAt);
      if (cancelled.current) {
        setStatus('stopped');
        return;
      }
      const printed = gradeBoardPrint(bridge, finalText);
      if (!printed.matched) {
        setStatus('budget');
        return;
      }
      setStatus('complete');
      const typed = guess.trim();
      const guessed = typed === '' ? null : gradeBoardPrint(bridge, typed);
      if (guessed) {
        setVerdict({
          ok: guessed.matched,
          text: guessed.matched
            ? verdictLine(guessed)
            : `Your guess does not match what the sketch printed: line ${guessed.firstDiffLine ?? 1} differs.`,
        });
      }
      logEvent({
        kind: 'run',
        lesson: bridge.id,
        outcome: guessed && !guessed.matched ? 'mismatch' : 'verified',
      });
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const running = status === 'running';

  return (
    <div className="p-3 space-y-3" data-testid="tab-board">
      <div className="bg-panel border border-line rounded-xl p-4">
        <div className="flex justify-between items-start flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-bold text-accent flex items-center gap-1.5">
              <Cpu className="w-4 h-4" aria-hidden="true" />
              Board — run the compiled sketch
            </h2>
            <p className="text-muted text-[0.78rem] mt-1 max-w-3xl">
              The sketch is compiled to an Arduino Uno&rsquo;s machine code by CI and committed; this
              tab executes those bytes in an emulated ATmega328P and shows the serial monitor. Change
              the code and it runs on a board or in CI — an edit cannot run here. Unconnected inputs
              read 0, exactly as they do in the host mock CI compiles against, which is why the serial
              below is the one the lesson promises.
            </p>
          </div>
          <a
            href={pageUrl(bridge.page)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.75rem] text-accent hover:underline inline-flex items-center gap-1"
          >
            Read the lesson <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-3">
          <label htmlFor="board-tab-lesson" className="text-[0.75rem] text-muted">
            Lesson
          </label>
          <select
            id="board-tab-lesson"
            data-testid="board-tab-select"
            value={bridge.id}
            onChange={(event) => select(event.target.value)}
            className="bg-canvas border border-line rounded-md px-2 py-1 text-[0.78rem] text-ink max-w-full"
          >
            {BRIDGES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {displayTitle(entry.title)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={run}
            disabled={running}
            data-testid="board-tab-run"
            className="text-[0.78rem] px-2 py-1 rounded-md border border-accent bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1"
          >
            <Play className="w-3 h-3 fill-current" aria-hidden="true" />
            {running ? 'Running…' : 'Run'}
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={!running}
            data-testid="board-tab-stop"
            className="text-[0.78rem] px-2 py-1 rounded-md border border-line bg-canvas text-ink hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1"
          >
            <Square className="w-3 h-3" aria-hidden="true" />
            Stop
          </button>
          <button
            type="button"
            onClick={reset}
            data-testid="board-tab-reset"
            className="text-[0.78rem] px-2 py-1 rounded-md border border-line bg-canvas text-muted hover:border-accent cursor-pointer inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            Reset
          </button>
          <span className="text-[0.7rem] font-mono text-muted" data-testid="board-tab-clock">
            {cycles.toLocaleString('en-US')} cycles · {arduinoSeconds(cycles)} of Arduino time
            {elapsed > 0 ? ` · ${elapsed} ms here` : ''}
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="bg-panel border border-line rounded-xl p-3">
          <h3 className="text-[0.78rem] font-semibold text-ink mb-1">What will it print?</h3>
          <p className="text-[0.72rem] text-muted mb-2">
            Guess first — the run is graded against what the emulator actually sends, not against the
            page.
          </p>
          <textarea
            data-testid="board-tab-guess"
            value={guess}
            onChange={(event) => setGuess(event.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={'One line per Serial.println(), e.g.\nReleased | pin_reading=HIGH(1) -> led_out=LOW(0)'}
            className="w-full bg-canvas border border-line rounded-md p-2 text-[0.75rem] font-mono text-ink resize-y"
          />
          <details className="mt-2">
            <summary className="text-[0.72rem] text-muted cursor-pointer">The sketch being run</summary>
            <pre className="mt-1 bg-canvas border border-line rounded-md p-2 text-[0.7rem] font-mono text-ink overflow-auto max-h-64">
              {bridge.solution}
            </pre>
          </details>
        </div>

        <div className="bg-panel border border-line rounded-xl p-3">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-[0.78rem] font-semibold text-ink">Serial monitor</h3>
            <span className="text-[0.7rem] font-mono text-muted" data-testid="board-tab-status">
              {status === 'idle'
                ? 'not run'
                : status === 'running'
                  ? 'running'
                  : status === 'complete'
                    ? 'printed the whole serial'
                    : status === 'stopped'
                      ? 'stopped'
                      : status === 'budget'
                        ? 'cycle budget reached'
                        : 'failed'}
            </span>
          </div>
          <pre
            data-testid="board-tab-serial"
            className="bg-canvas border border-line rounded-md p-2 text-[0.72rem] font-mono text-ink overflow-auto min-h-32 max-h-72 whitespace-pre-wrap"
          >
            {serial || (running ? '…' : '')}
          </pre>
          {verdict && (
            <p
              role="status"
              data-testid="board-tab-verdict"
              className={`mt-2 text-[0.75rem] flex items-start gap-1.5 ${verdict.ok ? 'text-emerald' : 'text-rose'}`}
            >
              {verdict.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              )}
              <span>{verdict.text}</span>
            </p>
          )}
          {error && (
            <p className="mt-2 text-[0.75rem] text-rose" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
