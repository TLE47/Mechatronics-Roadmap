import React, { useMemo, useState } from 'react';
import { CheckCircle2, Copy, Cpu, ExternalLink, XCircle } from 'lucide-react';
import {
  BOARD_SIMULATORS,
  bridgeById,
  displayTitle,
  gradeBoardPrint,
  validateBridges,
  verdictLine,
  type BoardBridge as BoardBridgeData,
} from '../boardBridge.ts';
import { pageUrl } from '../pageUrl.ts';
import { logEvent } from '../learningLog.ts';
import bridgeFile from '../data/boardBridges.json';

/**
 * The Board card — the embedded C lessons, bridged to a simulator.
 *
 * This app cannot run C: the tab holds CPython, and an AVR toolchain is a multi-megabyte wasm build
 * the bundle budget does not carry. What it can do is keep the seam tidy: show the lesson's own
 * sketch (generated from the page, never a copy), hand the learner to a third-party simulator with
 * the steps spelled out, and grade the one thing that is checkable here — what the serial prints,
 * against the exact text CI proves by compiling the same sketch against a host mock of `Arduino.h`.
 *
 * The honesty is part of the design, not a footnote: the panel says the board runs elsewhere, names
 * the two simulators, and says that nothing typed there comes back to this page. The alternative —
 * a browser C toolchain, or an iframe of a site that cannot be framed under this document's COEP —
 * costs more than the lesson is worth, and a card that pretended to simulate would be a worse lie
 * than a card that points.
 */

const BRIDGES: BoardBridgeData[] = (() => {
  try {
    return validateBridges(bridgeFile);
  } catch {
    // `scripts/test_board_bridge.mjs` and the generator's `--check` gate fail first; an empty card
    // is still better than a tab that will not render.
    return [];
  }
})();

const PINNED_LINES = 16;

export const BoardBridge: React.FC = () => {
  const [selectedId, setSelectedId] = useState(BRIDGES[0]?.id ?? '');
  const [prediction, setPrediction] = useState('');
  const [checked, setChecked] = useState<{ verdict: string; ok: boolean } | null>(null);
  const [showExpected, setShowExpected] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  const bridge = useMemo(() => bridgeById(BRIDGES, selectedId) ?? BRIDGES[0], [selectedId]);

  if (!bridge) {
    return (
      <section className="bg-panel border border-line rounded-xl p-4" data-testid="board-bridge">
        <h2 className="text-sm font-bold text-accent mb-1">The board, without the board</h2>
        <p className="text-muted text-[0.8rem]">
          The generated sketch data is missing, so this card has nothing to show. Run
          <code className="font-mono text-ink"> python3 scripts/extract_and_compile_sketches.py --write-panel</code>.
        </p>
      </section>
    );
  }

  const select = (id: string) => {
    setSelectedId(id);
    setPrediction('');
    setChecked(null);
    setShowExpected(false);
    setCopied('idle');
  };

  const copySketch = async () => {
    try {
      await navigator.clipboard.writeText(bridge.solution);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  const checkPrediction = () => {
    const comparison = gradeBoardPrint(bridge, prediction);
    const verdict = verdictLine(comparison);
    setChecked({ verdict, ok: comparison.matched });
    setShowExpected(true);
    // The same event the runner files for a graded run: this is a lesson attempt whose check is a
    // prediction rather than a program, and the friction report counts it as one either way.
    logEvent({ kind: 'run', lesson: bridge.id, outcome: comparison.matched ? 'verified' : 'mismatch' });
  };

  return (
    <section className="bg-panel border border-line rounded-xl p-4" data-testid="board-bridge">
      <div className="flex justify-between items-start flex-wrap gap-2 mb-2">
        <div>
          <h2 className="text-sm font-bold text-accent flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
            The board, without the board
          </h2>
          <p className="text-muted text-[0.78rem] mt-1 max-w-3xl">
            These five lessons — Stage 0's four plus Track 01's H-bridge lab — are C for an Arduino Uno,
            which cannot compile in this tab. Show the sketch, predict what its serial port prints, then
            run it in a simulator in another tab.
            The serial this page asks you for is the exact text CI proves: it compiles the same sketch
            and compares the output with the lesson&rsquo;s own Expected Output.
          </p>
        </div>
        <span className="text-[0.7rem] font-mono text-muted whitespace-nowrap">arduino:avr:uno · 5 lessons</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <label htmlFor="board-lesson" className="text-[0.75rem] text-muted">
          Lesson
        </label>
        <select
          id="board-lesson"
          data-testid="board-select"
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
        <a
          href={pageUrl(bridge.page)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.75rem] text-accent hover:underline inline-flex items-center gap-1"
          data-testid="board-page"
        >
          Read the lesson <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-[0.75rem] font-semibold text-ink">The sketch (Full Solution)</h3>
            <button
              type="button"
              onClick={copySketch}
              data-testid="board-copy"
              className="text-[0.72rem] text-accent hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3 h-3" aria-hidden="true" />
              {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy failed: select it' : 'Copy sketch'}
            </button>
          </div>
          <pre
            className="bg-canvas border border-line rounded-md p-2 text-[0.72rem] leading-relaxed overflow-auto font-mono text-ink"
            style={{ maxHeight: `${PINNED_LINES * 1.15}rem` }}
          >
            <code>{bridge.solution}</code>
          </pre>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="board-prediction" className="text-[0.75rem] font-semibold text-ink">
            What does its serial print?
          </label>
          <textarea
            id="board-prediction"
            data-testid="board-predict"
            value={prediction}
            onChange={(event) => {
              setPrediction(event.target.value);
              setChecked(null);
            }}
            rows={6}
            spellCheck={false}
            placeholder={'Type the lines you expect, e.g.\nReleased | pin_reading=HIGH(1) -> led_out=LOW(0)'}
            className="bg-canvas border border-line rounded-md p-2 text-[0.75rem] font-mono text-ink resize-y"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={checkPrediction}
              disabled={prediction.trim() === ''}
              data-testid="board-check"
              className="text-[0.75rem] px-2 py-1 rounded-md border border-line bg-canvas text-ink hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Check against the verified serial
            </button>
            <button
              type="button"
              onClick={() => setShowExpected((open) => !open)}
              className="text-[0.72rem] text-muted hover:text-accent hover:underline cursor-pointer"
            >
              {showExpected ? 'Hide the verified serial' : 'Show the verified serial'}
            </button>
          </div>

          {checked && (
            <p
              role="status"
              data-testid="board-verdict"
              className={`text-[0.75rem] flex items-start gap-1.5 ${checked.ok ? 'text-emerald' : 'text-rose'}`}
            >
              {checked.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              )}
              <span>{checked.verdict}</span>
            </p>
          )}

          {showExpected && (
            <div>
              <div className="text-[0.7rem] font-mono text-muted mb-1">
                Verified serial — CI compiles this sketch and compares it with the lesson
              </div>
              <pre
                data-testid="board-expected"
                className="bg-canvas border border-line rounded-md p-2 text-[0.72rem] font-mono text-ink overflow-auto"
                style={{ maxHeight: `${PINNED_LINES * 1.15}rem` }}
              >
                {bridge.expectedOutput}
              </pre>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          {BOARD_SIMULATORS.map((simulator, index) => (
            <a
              key={simulator.id}
              href={simulator.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`board-${simulator.id}`}
              className={`text-[0.75rem] inline-flex items-center gap-1 hover:underline ${
                index === 0 ? 'text-accent font-semibold' : 'text-muted'
              }`}
            >
              Run it in {simulator.name} <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          ))}
          <span className="text-[0.7rem] text-muted">
            Third-party simulators: they need the network, and nothing pasted there reaches this page.
          </span>
        </div>
        <ol className="mt-1 ml-4 list-decimal text-[0.72rem] text-muted space-y-0.5">
          {(BOARD_SIMULATORS[0]?.steps ?? []).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </section>
  );
};
