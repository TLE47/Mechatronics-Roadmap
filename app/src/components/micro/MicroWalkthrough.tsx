import { ArrowLeft, ArrowRight, Check, Keyboard, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MicroConcept } from '../../data/microLessons';
import { playCue, playUi } from '../../audio/facade.ts';
import { chordMatches } from '../../keymap.ts';
import {
  defaultWalkthroughKeys,
  formatWalkthroughChord,
  readWalkthroughKeys,
  updateWalkthroughKey,
  WALKTHROUGH_KEYS_KEY,
  walkthroughKeyFromEvent,
  writeWalkthroughKeys,
  type WalkthroughKeyAction,
  type WalkthroughKeys,
} from '../../micro/walkthroughKeys.ts';
import { MicroRichText, MicroCodeLine } from './MicroText.tsx';

/**
 * One line at a time (`components/micro/MicroWalkthrough.tsx`).
 *
 * The authored concept carries a short walkthrough. Only the first line is visible; the next
 * control appends one line and fades in the value it changes. The previous control goes back one
 * line, and both controls have a persisted, customizable shortcut. The rest of the lesson stays
 * locked until the learner has met the whole trace, so the screen never becomes a wall of text
 * first.
 */
export function MicroWalkthrough({
  concept,
  onComplete,
  onTest,
  testReady = false,
  onKeysChange,
}: {
  concept: MicroConcept;
  onComplete: () => void;
  onTest?: (input: 'pointer' | 'key') => void;
  testReady?: boolean;
  onKeysChange?: (keys: WalkthroughKeys) => void;
}) {
  const steps = concept.walkthrough;
  const [visible, setVisible] = useState(1);
  const [input, setInput] = useState<'pointer' | 'key'>('pointer');
  const [keys, setKeys] = useState<WalkthroughKeys>(() => readWalkthroughKeys());
  const [keysOpen, setKeysOpen] = useState(false);
  const [capture, setCapture] = useState<WalkthroughKeyAction | null>(null);
  const [keyError, setKeyError] = useState('');
  const completed = useRef(false);

  const applyKeys = (next: WalkthroughKeys) => {
    setKeys(next);
    onKeysChange?.(next);
  };

  useEffect(() => {
    if (!steps.length || visible < steps.length || completed.current) return;
    completed.current = true;
    // The last line lands with the verification stinger, so the end of the trace is a moment, not
    // just a button that disappears. It plays once per walkthrough; going back and forward again
    // does not repeat the reward.
    playCue('verify');
    onComplete();
  }, [onComplete, steps.length, visible]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === WALKTHROUGH_KEYS_KEY) {
        const next = readWalkthroughKeys();
        setKeys(next);
        onKeysChange?.(next);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [onKeysChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;

      if (capture) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setCapture(null);
          setKeyError('');
          return;
        }
        const chord = walkthroughKeyFromEvent(event);
        if (!chord) return;
        event.preventDefault();
        const result = updateWalkthroughKey(keys, capture, chord);
        if (result.error) {
          setKeyError(result.error);
          return;
        }
        applyKeys(result.keys);
        setCapture(null);
        setKeyError('');
        return;
      }

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (chordMatches(keys.next, event)) {
        event.preventDefault();
        if (visible >= steps.length) return;
        setInput('key');
        playUi('nav');
        setVisible((count) => Math.min(steps.length, count + 1));
        return;
      }
      if (chordMatches(keys.previous, event)) {
        event.preventDefault();
        if (visible <= 1) return;
        setInput('key');
        playUi('nav');
        setVisible((count) => Math.max(1, count - 1));
        return;
      }
      if (chordMatches(keys.test, event)) {
        event.preventDefault();
        if (!testReady || !onTest) return;
        setInput('key');
        playUi('primary');
        onTest('key');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capture, keys, steps.length, visible, testReady, onTest]);

  const startCapture = (action: WalkthroughKeyAction) => {
    setCapture(action);
    setKeyError('');
  };

  const resetKeys = () => {
    applyKeys(writeWalkthroughKeys(defaultWalkthroughKeys()));
    setCapture(null);
    setKeyError('');
  };

  const revealPrevious = () => {
    setInput('pointer');
    setVisible((count) => Math.max(1, count - 1));
  };

  const revealNext = () => {
    setInput('pointer');
    setVisible((count) => Math.min(steps.length, count + 1));
  };

  if (!steps.length) return null;
  const current = steps[Math.min(visible, steps.length) - 1];
  const value = current.after ?? current.output ?? 'ready';

  return (
    <section
      className="micro-walkthrough overflow-hidden rounded-2xl border border-accent/30 bg-canvas/75 shadow-sm"
      data-testid="micro-walkthrough"
      data-input={input}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft bg-accent/5 px-3 py-2.5 sm:px-3.5 sm:py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            Trace it, one line at a time
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted sm:text-[13px]">
            Read the code first. Use the buttons or your own keys for the next line, then test.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-accent/35 bg-panel px-2.5 py-1 font-mono text-[11px] tabular-nums text-accent">
            {visible} / {steps.length}
          </span>
          <button
            type="button"
            onClick={() => setKeysOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:border-accent/50 hover:text-accent"
            data-testid="micro-keybind-toggle"
            aria-expanded={keysOpen}
            aria-controls="micro-keybind-panel"
          >
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
            Keys
          </button>
        </div>
      </header>

      {keysOpen ? (
        <div
          id="micro-keybind-panel"
          className="border-b border-line-soft bg-panel/65 p-3"
          data-testid="micro-keybind-panel"
          data-capture={capture ?? undefined}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                Walkthrough keys
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                Pick a key for each control. Esc cancels while choosing.
              </p>
            </div>
            <button
              type="button"
              onClick={resetKeys}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:text-ink"
              data-testid="micro-keybind-reset"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reset
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <KeyChoice
              action="next"
              label="Reveal next line"
              chord={keys.next}
              capture={capture}
              onClick={() => startCapture('next')}
              testId="micro-keybind-next"
            />
            <KeyChoice
              action="previous"
              label="Previous line"
              chord={keys.previous}
              capture={capture}
              onClick={() => startCapture('previous')}
              testId="micro-keybind-previous"
            />
            <KeyChoice
              action="test"
              label="Let me test that"
              chord={keys.test}
              capture={capture}
              onClick={() => startCapture('test')}
              testId="micro-keybind-test"
            />
          </div>
          {capture ? (
            <p role="status" className="mt-2 text-[11.5px] text-accent">
              Press a key for{' '}
              {capture === 'next'
                ? 'reveal next line'
                : capture === 'previous'
                  ? 'previous line'
                  : 'let me test that'}.
            </p>
          ) : null}
          {keyError ? (
            <p role="alert" className="mt-2 text-[11.5px] leading-relaxed text-rose">
              {keyError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="min-w-0 p-2.5 sm:p-3.5">
          <div className="space-y-1.5 rounded-xl border border-line-soft bg-panel p-2 font-mono text-[11.5px] leading-relaxed sm:p-2.5 sm:text-[13px]">
            {steps.slice(0, visible).map((step, index) => (
              <div
                key={`${step.code}-${index}`}
                className={`micro-walkthrough-line flex items-start gap-1.5 rounded-lg px-1.5 py-1 sm:gap-2 sm:px-2 sm:py-1.5 ${
                  index === visible - 1 ? 'bg-accent/10 text-ink' : 'text-muted'
                }`}
              >
                <span className="w-4 shrink-0 select-none text-right text-[10.5px] text-faint">
                  {index + 1}
                </span>
                <MicroCodeLine code={step.code} className="min-w-0 flex-1" />
              </div>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 sm:mt-3">
            <button
              type="button"
              disabled={visible <= 1}
              onClick={revealPrevious}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-panel px-2.5 py-2 text-[11.5px] font-bold text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-[13px]"
              data-testid="micro-reveal-previous"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="sm:hidden">Previous</span>
              <span className="hidden sm:inline">Previous line</span>
              <kbd className="rounded border border-line-soft bg-canvas px-1.5 py-0.5 font-mono text-[10.5px] text-faint">
                {formatWalkthroughChord(keys.previous)}
              </kbd>
            </button>

            {visible < steps.length ? (
              <button
                type="button"
                onClick={revealNext}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-accent px-2.5 py-2 text-[12px] font-bold text-inverse shadow-sm hover:bg-accent/80 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-[14px]"
                data-testid="micro-reveal-next"
              >
                <span className="sm:hidden">Next</span>
                <span className="hidden sm:inline">Reveal next line</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                <kbd className="rounded border border-inverse/25 bg-inverse/10 px-1.5 py-0.5 font-mono text-[10.5px] text-inverse/80">
                  {formatWalkthroughChord(keys.next)}
                </kbd>
              </button>
            ) : (
              <p
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald/35 bg-emerald/10 px-3 py-1.5 text-[12.5px] font-semibold text-emerald"
                data-testid="micro-walkthrough-done"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                All lines revealed
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-line-soft bg-panel/65 p-2.5 sm:p-3.5 lg:border-l lg:border-t-0">
          <div
            key={`${visible}-${current.code}`}
            aria-live="polite"
            data-testid={`micro-walkthrough-step-${visible}`}
          >
            <div className="micro-walkthrough-values" data-testid="micro-walkthrough-values">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
                What changes
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-accent/35 bg-accent/10 px-2 py-1 font-mono text-[12px] font-bold text-accent sm:text-[13px]">
                  {current.variable ?? 'result'}
                </span>
                {current.before ? (
                  <>
                    <span className="rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[12px] text-muted line-through decoration-rose/60">
                      {current.before}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                  </>
                ) : null}
                <span
                  key={`${visible}-${value}`}
                  className="micro-answer-value rounded-md border border-emerald/40 bg-emerald/10 px-2.5 py-1 font-mono text-[13.5px] font-bold text-emerald sm:text-[15px]"
                >
                  {value}
                </span>
              </div>
            </div>
            <div className="micro-walkthrough-note" data-testid="micro-walkthrough-note">
              {current.expression ? (
                <p className="mt-2 font-mono text-[12px] text-muted">reads {current.expression}</p>
              ) : null}
              <p className="mt-2 text-[13.5px] leading-relaxed text-body">
                <MicroRichText text={current.note} />
              </p>
              {current.output ? (
                <div className="mt-2.5 rounded-lg border border-line-soft bg-canvas p-2.5">
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">output</p>
                  <pre className="mt-0.5 whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-emerald">
                    {current.output}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function KeyChoice({
  action,
  label,
  chord,
  capture,
  onClick,
  testId,
}: {
  action: WalkthroughKeyAction;
  label: string;
  chord: WalkthroughKeys['next'];
  capture: WalkthroughKeyAction | null;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[11.5px] sm:px-3 sm:text-[12px] ${
        capture === action
          ? 'border-accent bg-accent-soft text-ink'
          : 'border-line-soft bg-canvas text-muted hover:border-accent/50'
      }`}
      data-testid={testId}
      aria-pressed={capture === action}
    >
      <span>{label}</span>
      <kbd className="rounded border border-line-soft bg-panel px-1.5 py-0.5 font-mono text-[10.5px] text-faint">
        {capture === action ? 'Press a key…' : formatWalkthroughChord(chord)}
      </kbd>
    </button>
  );
}
