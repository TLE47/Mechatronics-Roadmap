import { useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CornerDownLeft, History, RotateCcw, Sigma, Delete } from 'lucide-react';
import { evaluateExpression, formatNumber, type AngleMode } from '../../../calculator';

/** One entry of the tab's history: the text that was evaluated and the number it produced. */
interface HistoryEntry {
  expression: string;
  value: number;
}

/** The visual family a key belongs to: functions are quiet, operators carry the accent. */
type KeyTone = 'function' | 'number' | 'operator' | 'utility' | 'clear' | 'equals';

/** A keypad key: what it prints on the face, what it inserts, or the action it performs. */
interface CalculatorKey {
  label: string;
  /** Stable half of the test id and the accessible name. */
  id: string;
  insert?: string;
  action?: 'back' | 'clear' | 'equals';
  /** The equals key takes two cells so it reads as the answer the pad is for. */
  wide?: boolean;
  tone: KeyTone;
}

/**
 * Reading order, left to right, top to bottom. The digits keep the shape of a phone pad in the
 * lower-left; the four operators sit in the right column above the answer, and the function bank
 * is one quiet block at the top. Rearranged from the first version, where `+` was under the digits
 * and `C` sat beside `0`: a calculator's geometry is part of knowing where to put your finger.
 */
const KEYS: CalculatorKey[] = [
  { label: 'sin', id: 'sin', insert: 'sin(', tone: 'function' },
  { label: 'cos', id: 'cos', insert: 'cos(', tone: 'function' },
  { label: 'tan', id: 'tan', insert: 'tan(', tone: 'function' },
  { label: 'ln', id: 'ln', insert: 'ln(', tone: 'function' },
  { label: 'log', id: 'log', insert: 'log(', tone: 'function' },

  { label: 'sin⁻¹', id: 'asin', insert: 'asin(', tone: 'function' },
  { label: 'cos⁻¹', id: 'acos', insert: 'acos(', tone: 'function' },
  { label: 'tan⁻¹', id: 'atan', insert: 'atan(', tone: 'function' },
  { label: '√', id: 'sqrt', insert: 'sqrt(', tone: 'function' },
  { label: '^', id: 'pow', insert: '^', tone: 'function' },

  { label: '(', id: 'lparen', insert: '(', tone: 'utility' },
  { label: ')', id: 'rparen', insert: ')', tone: 'utility' },
  { label: 'π', id: 'pi', insert: 'π', tone: 'utility' },
  { label: 'e', id: 'e', insert: 'e', tone: 'utility' },
  { label: '!', id: 'factorial', insert: '!', tone: 'utility' },

  { label: '7', id: '7', insert: '7', tone: 'number' },
  { label: '8', id: '8', insert: '8', tone: 'number' },
  { label: '9', id: '9', insert: '9', tone: 'number' },
  { label: '÷', id: 'divide', insert: '÷', tone: 'operator' },
  { label: '%', id: 'percent', insert: '%', tone: 'utility' },

  { label: '4', id: '4', insert: '4', tone: 'number' },
  { label: '5', id: '5', insert: '5', tone: 'number' },
  { label: '6', id: '6', insert: '6', tone: 'number' },
  { label: '×', id: 'multiply', insert: '×', tone: 'operator' },
  { label: 'Ans', id: 'ans', insert: 'ans', tone: 'utility' },

  { label: '1', id: '1', insert: '1', tone: 'number' },
  { label: '2', id: '2', insert: '2', tone: 'number' },
  { label: '3', id: '3', insert: '3', tone: 'number' },
  { label: '−', id: 'minus', insert: '−', tone: 'operator' },
  { label: 'C', id: 'clear', action: 'clear', tone: 'clear' },

  { label: '0', id: '0', insert: '0', tone: 'number' },
  { label: '.', id: 'dot', insert: '.', tone: 'number' },
  { label: '+', id: 'plus', insert: '+', tone: 'operator' },
  { label: '=', id: 'equals', action: 'equals', wide: true, tone: 'equals' },
];

/** The one place a key's surface is decided, so every function key reads as a family. */
const KEY_CLASSES: Record<KeyTone, string> = {
  function:
    'border-transparent bg-raise/55 text-muted hover:border-line-soft hover:bg-raise hover:text-body',
  number:
    'border-line-soft bg-panel-2 text-body font-semibold hover:border-accent/40 hover:bg-raise',
  operator:
    'border-accent/20 bg-accent/10 text-accent font-semibold hover:border-accent/40 hover:bg-accent/15',
  utility:
    'border-line-soft bg-transparent text-muted hover:border-line hover:bg-raise hover:text-body',
  clear: 'border-rose/25 bg-rose/5 text-rose hover:bg-rose/10',
  equals:
    'border-accent bg-accent text-inverse font-bold shadow-[0_10px_24px_-12px_var(--accent)] hover:bg-accent-strong',
};

/**
 * The Calculator tab (`runner/CalculatorPane.tsx`).
 *
 * The runner's other panes report on a Python file; this one is a tool beside the code — the
 * scientific calculator a learner would otherwise open in another window while reading a torque or a
 * radian. It never touches `main.py`, the interpreter or a lesson, so it works before Pyodide has
 * loaded and cannot change a verdict.
 *
 * The expression is the single source of truth: the keypad inserts at the caret, Enter and `=` both
 * commit, and the answer is computed as the text changes. A history row puts its expression back in
 * the field, which is the fastest way to re-evaluate with one number changed. The angle switch sits
 * beside the display because `sin(30)` means two different numbers and a calculator that hides the
 * unit is a calculator that lies.
 *
 * The desk shape — display over keypad, with the tape beside it — is intentional: at a split pane's
 * width the history stacks under the calculator, and at a wide one it reads as the paper trail next
 * to the machine instead of a cramped strip that steals the keypad's height.
 */
export function CalculatorPane() {
  const [expression, setExpression] = useState('');
  const [angle, setAngle] = useState<AngleMode>('rad');
  const [ans, setAns] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const input = useRef<HTMLInputElement | null>(null);

  /** What the display would print right now, or null while the text is not yet an expression. */
  const live = useMemo(() => {
    if (!expression.trim()) return null;
    try {
      return { value: evaluateExpression(expression, { angle, ans }), error: null };
    } catch {
      return null;
    }
  }, [expression, angle, ans]);

  const commit = () => {
    const text = expression.trim();
    if (!text) return;
    try {
      const value = evaluateExpression(text, { angle, ans });
      setAns(value);
      setError(null);
      setHistory((entries) =>
        [{ expression: text, value }, ...entries.filter((entry) => entry.expression !== text)].slice(0, 8)
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That expression could not be read');
    }
  };

  /** Put a key's text where the caret is, and leave the caret after it. */
  const insert = (text: string) => {
    const field = input.current;
    setError(null);
    if (!field) {
      setExpression((current) => current + text);
      return;
    }
    const start = field.selectionStart ?? expression.length;
    const end = field.selectionEnd ?? start;
    const next = expression.slice(0, start) + text + expression.slice(end);
    const caret = start + text.length;
    setExpression(next);
    window.setTimeout(() => {
      field.focus();
      field.setSelectionRange(caret, caret);
    }, 0);
  };

  const backspace = () => {
    const field = input.current;
    setError(null);
    if (!field) {
      setExpression((current) => current.slice(0, -1));
      return;
    }
    const start = field.selectionStart ?? expression.length;
    const end = field.selectionEnd ?? start;
    if (start === end && start === 0) return;
    const from = start === end ? start - 1 : start;
    const next = expression.slice(0, from) + expression.slice(end);
    setExpression(next);
    window.setTimeout(() => {
      field.focus();
      field.setSelectionRange(from, from);
    }, 0);
  };

  const press = (key: CalculatorKey) => {
    if (key.action === 'clear') {
      setExpression('');
      setError(null);
      input.current?.focus();
      return;
    }
    if (key.action === 'equals') {
      commit();
      return;
    }
    if (key.action === 'back') {
      backspace();
      return;
    }
    if (key.insert) insert(key.insert);
  };

  return (
    <div
      data-testid="calculator-pane"
      data-angle={angle}
      data-value={live ? formatNumber(live.value) : undefined}
      aria-label="Scientific calculator"
      className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-canvas p-2.5 sm:p-3"
    >
      <div
        className="grid w-full max-w-[940px] content-start gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}
      >
        <section
          aria-label="Calculator"
          className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-panel shadow-md"
        >
          {/* A hairline of brand on the card's top edge: the one decorative mark, and it disappears
              in high contrast because it is a border rather than information. */}
          <div aria-hidden="true" className="h-px bg-gradient-to-r from-accent/80 via-accent/25 to-transparent" />

          <header className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                <Sigma className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-faint">Scientific</p>
                <p className="truncate text-[11.5px] text-muted">A tool beside your code</p>
              </div>
            </div>
            <div role="group" aria-label="Angle mode" className="flex shrink-0 rounded-full border border-line bg-canvas p-0.5">
              {(['deg', 'rad'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-testid={`calculator-angle-${mode}`}
                  aria-pressed={angle === mode}
                  title={mode === 'deg' ? 'Degrees: sin(30) is 0.5' : 'Radians: sin(π ÷ 2) is 1'}
                  onClick={() => setAngle(mode)}
                  className={`cursor-pointer rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                    angle === mode
                      ? 'bg-accent text-inverse shadow-sm'
                      : 'text-faint hover:text-body'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </header>

          <div
            className="border-y border-line-soft px-3 py-2"
            style={{
              backgroundImage:
                'radial-gradient(120% 90% at 82% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 62%)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
              <input
                ref={input}
                data-testid="calculator-display"
                aria-label="Calculator expression"
                aria-invalid={error ? true : undefined}
                value={expression}
                onChange={(event) => {
                  setExpression(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setExpression('');
                    setError(null);
                  }
                }}
                placeholder="1 + 2 × 3"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-sm bg-transparent text-right font-mono text-[20px] leading-tight text-body outline-none placeholder:text-faint/70"
              />
              <button
                type="button"
                data-testid="calculator-key-back"
                aria-label="Delete the last character"
                title="Delete the last character"
                onClick={backspace}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-faint transition-colors hover:border-line hover:bg-raise hover:text-accent"
              >
                <Delete className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
                {angle === 'deg' ? 'Degrees' : 'Radians'} · Enter keeps it
              </span>
              <div className="flex min-w-0 items-baseline gap-1.5">
                <span aria-hidden="true" className="font-mono text-[13px] text-faint">
                  =
                </span>
                <output
                  data-testid="calculator-result"
                  aria-live="polite"
                  title={live ? 'The expression on screen' : undefined}
                  className="min-w-0 truncate font-mono text-[28px] font-semibold leading-none tracking-tight text-accent tabular-nums"
                >
                  {live ? formatNumber(live.value) : expression.trim() ? '…' : '0'}
                </output>
              </div>
            </div>
            {error && (
              <p role="alert" data-testid="calculator-error" className="mt-1.5 text-[11px] leading-snug text-rose">
                {error}
              </p>
            )}
          </div>

          <div className="p-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
                Keypad
              </span>
              <span className="hidden items-center gap-1 font-mono text-[9.5px] text-faint sm:flex">
                <CornerDownLeft className="h-3 w-3" aria-hidden="true" /> to keep
              </span>
            </div>
            <div
              role="group"
              aria-label="Calculator keypad"
              className="grid grid-cols-5 gap-1"
              style={{ gridAutoRows: 'minmax(1.85rem, 1fr)' }}
            >
              {KEYS.map((key) => (
                <button
                  key={key.id}
                  type="button"
                  data-testid={`calculator-key-${key.id}`}
                  aria-label={key.action === 'equals' ? 'Evaluate' : `Insert ${key.label}`}
                  title={key.action === 'equals' ? 'Evaluate the expression (Enter)' : `Insert ${key.label}`}
                  onClick={() => press(key)}
                  style={key.wide ? { gridColumn: 'span 2' } : undefined}
                  className={`min-h-[1.85rem] select-none rounded-lg border font-mono text-[12.5px] transition-[transform,background-color,border-color,color,box-shadow] duration-100 active:scale-[0.97] cursor-pointer ${
                    key.tone === 'number' ? 'text-[16px]' : ''
                  } ${KEY_CLASSES[key.tone]}`}
                >
                  {key.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside
          data-testid="calculator-history-panel"
          aria-label="Calculation history"
          className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-md"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <History className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-faint">History</p>
                <p className="truncate text-[11px] text-muted">
                  {history.length === 0 ? 'Nothing kept yet' : `${history.length} recent calculation${history.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                data-testid="calculator-history-clear"
                onClick={() => setHistory([])}
                title="Clear the calculation history"
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-faint hover:bg-raise hover:text-rose"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Clear
              </button>
            )}
          </header>

          {history.length > 0 ? (
            <div data-testid="calculator-history" className="max-h-[17rem] min-h-0 overflow-y-auto p-1.5">
              {history.map((entry) => (
                <button
                  key={`${entry.expression}:${entry.value}`}
                  type="button"
                  data-testid="calculator-history-row"
                  title="Put this expression back in the field"
                  onClick={() => {
                    setExpression(entry.expression);
                    setAns(entry.value);
                    setError(null);
                    input.current?.focus();
                  }}
                  className="group flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left cursor-pointer hover:border-line hover:bg-raise"
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/35 group-hover:bg-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[10.5px] text-muted">{entry.expression}</span>
                    <span className="block truncate font-mono text-[12.5px] font-semibold text-body tabular-nums">
                      {formatNumber(entry.value)}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="h-3 w-3 shrink-0 text-faint opacity-0 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-6 text-center">
              <span className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-line text-faint">
                <History className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mt-2 text-[11.5px] font-semibold text-body">Keep a calculation</p>
              <p className="mt-0.5 max-w-[21ch] text-[10.5px] leading-snug text-faint">
                Press <span className="font-mono text-muted">=</span> or Enter and it lands here, ready to reuse.
              </p>
            </div>
          )}

          <footer className="mt-auto hidden flex-wrap gap-x-3 gap-y-1 border-t border-line-soft px-3 py-2 font-mono text-[9.5px] text-faint sm:flex">
            <span>
              <kbd className="rounded border border-line-soft bg-canvas px-1 py-0.5 text-[9px]">Esc</kbd> clear
            </span>
            <span>
              <kbd className="rounded border border-line-soft bg-canvas px-1 py-0.5 text-[9px]">Ans</kbd> last answer
            </span>
          </footer>
        </aside>
      </div>
    </div>
  );
}
