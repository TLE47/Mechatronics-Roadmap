import { useMemo, useRef, useState } from 'react';
import { evaluateExpression, formatNumber, type AngleMode } from '../../../calculator';
import { GraphingPane } from './GraphingPane';

/** One entry of the tape: the text that was evaluated and the number it produced. */
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
  tone: KeyTone;
}

/** The two keypad faces, as Desmos divides them: common arithmetic on `main`, the rest on `func`. */
type KeypadPage = 'main' | 'func';

/**
 * `main` is the page a learner types on, read left to right and top to bottom. It keeps the phone
 * pad's shape in the lower-left, the four operators in the fourth column, and the one key that ends
 * a calculation in the corner where a calculator has always put it.
 */
const MAIN_KEYS: CalculatorKey[] = [
  { label: 'sin', id: 'sin', insert: 'sin(', tone: 'function' },
  { label: 'cos', id: 'cos', insert: 'cos(', tone: 'function' },
  { label: 'tan', id: 'tan', insert: 'tan(', tone: 'function' },
  { label: '^', id: 'pow', insert: '^', tone: 'function' },
  { label: '√', id: 'sqrt', insert: 'sqrt(', tone: 'function' },

  { label: '(', id: 'lparen', insert: '(', tone: 'utility' },
  { label: ')', id: 'rparen', insert: ')', tone: 'utility' },
  { label: 'π', id: 'pi', insert: 'π', tone: 'utility' },
  { label: '%', id: 'percent', insert: '%', tone: 'utility' },
  { label: '!', id: 'factorial', insert: '!', tone: 'utility' },

  { label: '7', id: '7', insert: '7', tone: 'number' },
  { label: '8', id: '8', insert: '8', tone: 'number' },
  { label: '9', id: '9', insert: '9', tone: 'number' },
  { label: '÷', id: 'divide', insert: '÷', tone: 'operator' },
  { label: 'e', id: 'e', insert: 'e', tone: 'utility' },

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
  { label: '⌫', id: 'back', action: 'back', tone: 'clear' },
  { label: '=', id: 'equals', action: 'equals', tone: 'equals' },
];

/**
 * `func` is the second face: inverse and hyperbolic trigonometry, the logs, roots, powers,
 * combinatorics, the integer family, and a comma so a two-argument function can be typed from the
 * pad. The last two rows repeat the constants and the run controls so a learner can stay on this
 * face for a whole expression.
 */
const FUNC_KEYS: CalculatorKey[] = [
  { label: 'sin⁻¹', id: 'asin', insert: 'asin(', tone: 'function' },
  { label: 'cos⁻¹', id: 'acos', insert: 'acos(', tone: 'function' },
  { label: 'tan⁻¹', id: 'atan', insert: 'atan(', tone: 'function' },
  { label: 'sinh', id: 'sinh', insert: 'sinh(', tone: 'function' },
  { label: 'cosh', id: 'cosh', insert: 'cosh(', tone: 'function' },

  { label: 'tanh', id: 'tanh', insert: 'tanh(', tone: 'function' },
  { label: 'ln', id: 'ln', insert: 'ln(', tone: 'function' },
  { label: 'log', id: 'log', insert: 'log(', tone: 'function' },
  { label: 'log₂', id: 'log2', insert: 'log2(', tone: 'function' },
  { label: 'eˣ', id: 'exp', insert: 'e^', tone: 'function' },

  { label: '10ˣ', id: 'tenpow', insert: '10^', tone: 'function' },
  { label: 'a²', id: 'square', insert: '^2', tone: 'function' },
  { label: 'a³', id: 'cube', insert: '^3', tone: 'function' },
  { label: '√', id: 'func-sqrt', insert: 'sqrt(', tone: 'function' },
  { label: '∛', id: 'cbrt', insert: 'cbrt(', tone: 'function' },

  { label: '|a|', id: 'abs', insert: 'abs(', tone: 'function' },
  { label: 'nCr', id: 'ncr', insert: 'nCr(', tone: 'function' },
  { label: 'nPr', id: 'npr', insert: 'nPr(', tone: 'function' },
  { label: 'mod', id: 'mod', insert: 'mod(', tone: 'function' },
  { label: 'gcd', id: 'gcd', insert: 'gcd(', tone: 'function' },

  { label: 'lcm', id: 'lcm', insert: 'lcm(', tone: 'function' },
  { label: '⌊a⌋', id: 'floor', insert: 'floor(', tone: 'function' },
  { label: '⌈a⌉', id: 'ceil', insert: 'ceil(', tone: 'function' },
  { label: 'round', id: 'round', insert: 'round(', tone: 'function' },
  { label: ',', id: 'comma', insert: ',', tone: 'utility' },

  { label: 'π', id: 'func-pi', insert: 'π', tone: 'utility' },
  { label: 'e', id: 'func-e', insert: 'e', tone: 'utility' },
  { label: '%', id: 'func-percent', insert: '%', tone: 'utility' },
  { label: '(', id: 'func-lparen', insert: '(', tone: 'utility' },
  { label: ')', id: 'func-rparen', insert: ')', tone: 'utility' },

  { label: '^', id: 'func-pow', insert: '^', tone: 'utility' },
  { label: 'Ans', id: 'func-ans', insert: 'ans', tone: 'utility' },
  { label: 'C', id: 'func-clear', action: 'clear', tone: 'clear' },
  { label: '⌫', id: 'func-back', action: 'back', tone: 'clear' },
  { label: '=', id: 'func-equals', action: 'equals', tone: 'equals' },
];

/** The one place a key's surface is decided, so every function key reads as a family. */
const KEY_CLASSES: Record<KeyTone, string> = {
  function: 'bg-panel-2 text-muted hover:bg-raise hover:text-body',
  number: 'bg-panel-2 text-body font-semibold text-[17px] hover:bg-raise',
  operator: 'bg-panel-2 text-accent font-semibold text-[17px] hover:bg-accent/10',
  utility: 'bg-panel-2 text-muted hover:bg-raise hover:text-body',
  clear: 'bg-panel-2 text-muted hover:bg-rose/10 hover:text-rose',
  equals:
    'border-accent bg-accent text-inverse font-bold text-[18px] shadow-[0_8px_20px_-10px_var(--accent)] hover:bg-accent-strong',
};

/**
 * The Calculator tab (`runner/CalculatorPane.tsx`).
 *
 * The runner's other panes report on a Python file; this one is a tool beside the code — the
 * scientific calculator a learner would otherwise open in another window while reading a torque or a
 * radian. It never touches `main.py`, the interpreter or a lesson, so it works before Pyodide has
 * loaded and cannot change a verdict.
 *
 * The shape follows Desmos' scientific calculator rather than a handheld: answers are lines on a
 * sheet, not one number that overwrites the last. A committed expression stays in the tape with its
 * answer underneath, the active line prints its answer as the text is typed, `main` and `func` split
 * the keys the way a scientific pad does, and `rad`/`deg` sits beside those tabs because `sin(30)`
 * means two different numbers. The expression is the single source of truth: keys insert at the
 * caret, Enter and `=` both commit, and a tape row puts its expression back for one number changed.
 */
export function CalculatorPane({
  source = '',
  onSourceChange,
  onSliderCommit,
}: {
  /** `main.py` when the calculator is opened inside the runner; empty in a standalone mount. */
  source?: string;
  /** Write a source slider's literal back into the editor. */
  onSourceChange?: (next: string) => void;
  /** Ask the runner for one re-run after a source slider drag. */
  onSliderCommit?: () => void;
} = {}) {
  const [expression, setExpression] = useState('');
  const [angle, setAngle] = useState<AngleMode>('rad');
  const [ans, setAns] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [page, setPage] = useState<KeypadPage>('main');
  // The tab holds both calculators Desmos separates into two pages: the scientific pad this tab has
  // always drawn, and the graphing sheet, which is a different instrument rather than a third keypad
  // face. The mode is this visit's choice; the angle unit and the tape stay scientific's.
  const [mode, setMode] = useState<'scientific' | 'graphing'>('scientific');
  const input = useRef<HTMLInputElement | null>(null);

  /** What the active line would print right now, or null while the text is not yet an expression. */
  const live = useMemo(() => {
    if (!expression.trim()) return null;
    try {
      return { value: evaluateExpression(expression, { angle, ans: ans ?? 0 }), error: null };
    } catch {
      return null;
    }
  }, [expression, angle, ans]);

  /** The number under the active line: the live answer, else the last one kept. */
  const shown = live ? live.value : expression.trim() ? null : ans;

  const commit = () => {
    const text = expression.trim();
    if (!text) return;
    try {
      const value = evaluateExpression(text, { angle, ans: ans ?? 0 });
      setAns(value);
      setError(null);
      setHistory((entries) =>
        [{ expression: text, value }, ...entries.filter((entry) => entry.expression !== text)].slice(0, 8)
      );
      // Desmos opens a fresh line after Enter; the calculation it just kept stays above.
      setExpression('');
      input.current?.focus();
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

  const keys = page === 'main' ? MAIN_KEYS : FUNC_KEYS;

  return (
    <div
      data-testid="calculator-pane"
      data-angle={angle}
      data-value={shown === null ? undefined : formatNumber(shown)}
      data-mode={mode}
      aria-label="Calculator"
      className="flex min-h-0 flex-1 justify-start overflow-y-auto bg-canvas p-2.5 sm:justify-center sm:p-3"
    >
      <div
        className={`flex w-full flex-col gap-2 self-start ${
          mode === 'scientific' ? 'max-w-[27rem]' : 'max-w-[76rem]'
        }`}
      >
        <div
          role="tablist"
          aria-label="Calculator mode"
          className="flex items-center gap-0.5 self-center rounded-full border border-line-soft bg-panel/80 p-0.5"
        >
          {(['scientific', 'graphing'] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={mode === name}
              data-testid={`calculator-mode-${name}`}
              onClick={() => setMode(name)}
              className={`cursor-pointer rounded-full px-3 py-1 font-mono text-[12px] lowercase transition-colors ${
                mode === name
                  ? 'bg-accent font-semibold text-inverse shadow-sm'
                  : 'text-muted hover:text-body'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {/*
          Both faces stay mounted. The graph owns its expression list, viewport and colours in
          component state, so hiding it for the scientific pad and showing it again must not throw
          that sheet away — only its pixels are hidden.
        */}
        <section
          aria-label="Calculator"
          className={`${mode === 'scientific' ? 'flex' : 'hidden'} w-full max-w-[27rem] flex-col self-start overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-md)]`}
        >
        <h2 className="sr-only">Scientific calculator</h2>

        <header className="flex items-center justify-between gap-2 px-3 pt-2.5">
          <div role="tablist" aria-label="Keypad pages" className="flex items-center gap-3">
            {(['main', 'func'] as const).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={page === name}
                data-testid={`calculator-tab-${name}`}
                onClick={() => setPage(name)}
                className={`cursor-pointer border-b-2 pb-1 font-mono text-[12px] lowercase transition-colors ${
                  page === name
                    ? 'border-accent font-semibold text-accent'
                    : 'border-transparent text-faint hover:text-body'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          <div role="group" aria-label="Angle mode" className="flex items-center gap-1.5 font-mono text-[12px]">
            {(['rad', 'deg'] as const).map((mode, index) => (
              <span key={mode} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span aria-hidden="true" className="text-faint">
                    /
                  </span>
                )}
                <button
                  type="button"
                  data-testid={`calculator-angle-${mode}`}
                  aria-pressed={angle === mode}
                  title={mode === 'deg' ? 'Degrees: sin(30) is 0.5' : 'Radians: sin(π ÷ 2) is 1'}
                  onClick={() => setAngle(mode)}
                  className={`cursor-pointer lowercase transition-colors ${
                    angle === mode ? 'font-semibold text-accent' : 'text-faint hover:text-body'
                  }`}
                >
                  {mode}
                </button>
              </span>
            ))}
          </div>
        </header>

        <div className="px-3 pb-2 pt-2">
          <div className="flex min-h-6 items-center justify-between gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
              {history.length === 0 ? 'Expression' : 'Expressions'}
            </span>
            {history.length > 0 && (
              <button
                type="button"
                data-testid="calculator-history-clear"
                onClick={() => setHistory([])}
                title="Clear every kept calculation"
                className="cursor-pointer rounded px-1 py-0.5 font-mono text-[12px] lowercase text-faint transition-colors hover:bg-raise hover:text-rose"
              >
                clear all
              </button>
            )}
          </div>

          <div
            data-testid="calculator-history"
            aria-label="Kept calculations"
            className="max-h-[9.5rem] overflow-y-auto"
          >
            {history.map((entry) => (
              <button
                key={`${entry.expression}:${entry.value}`}
                type="button"
                data-testid="calculator-history-row"
                title="Put this expression back on the active line"
                onClick={() => {
                  setExpression(entry.expression);
                  setAns(entry.value);
                  setError(null);
                  input.current?.focus();
                }}
                className="group flex w-full cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-raise"
              >
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/35 transition-colors group-hover:bg-accent"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-right font-mono text-[14px] leading-5 text-muted">
                    {entry.expression}
                  </span>
                  <span className="block truncate text-right font-mono text-[17px] font-semibold leading-6 text-body tabular-nums">
                    {formatNumber(entry.value)}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div
            className={`mt-1 rounded-lg border bg-canvas/60 px-2.5 py-1.5 transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20 ${
              error ? 'border-rose/40' : 'border-line-soft'
            }`}
          >
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
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
                  placeholder="Enter an expression"
                  autoComplete="off"
                  spellCheck={false}
                  // The row is the focus target: one ring around the whole line, not a box inside a box.
                  style={{ boxShadow: 'none' }}
                  className="w-full min-w-0 bg-transparent text-right font-mono text-[21px] leading-8 text-body outline-none placeholder:font-sans placeholder:text-[14px] placeholder:text-faint/70"
                />
                <div className="flex min-h-6 items-baseline justify-end gap-2">
                  {expression.trim() === '' && shown !== null && (
                    <span aria-hidden="true" className="font-mono text-[11px] lowercase text-faint">
                      ans
                    </span>
                  )}
                  <output
                    data-testid="calculator-result"
                    aria-live="polite"
                    className="min-w-0 truncate font-mono text-[19px] font-semibold leading-6 tracking-tight text-body tabular-nums"
                  >
                    {shown === null ? '' : formatNumber(shown)}
                  </output>
                </div>
              </div>
            </div>
            {error && (
              <p role="alert" data-testid="calculator-error" className="mt-1 border-t border-rose/20 pt-1 text-[11.5px] leading-snug text-rose">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-line-soft bg-canvas/40 p-2">
          <div
            role="group"
            aria-label={page === 'main' ? 'Main keypad' : 'Function keypad'}
            className="grid min-h-[18.5rem] grid-cols-5 content-start gap-1.5"
            style={{ gridAutoRows: '2.75rem' }}
          >
            {keys.map((key) => (
              <button
                key={key.id}
                type="button"
                data-testid={`calculator-key-${key.id}`}
                aria-label={key.action === 'equals' ? 'Evaluate' : key.action === 'back' ? 'Delete the last character' : `Insert ${key.label}`}
                title={key.action === 'equals' ? 'Evaluate the expression (Enter)' : key.action === 'back' ? 'Delete the last character' : `Insert ${key.label}`}
                onClick={() => press(key)}
                className={`select-none rounded-lg border border-line-soft/70 font-mono text-[13px] transition-[transform,background-color,border-color,color,box-shadow] duration-75 hover:border-line active:translate-y-px cursor-pointer ${KEY_CLASSES[key.tone]}`}
              >
                {key.label}
              </button>
            ))}
          </div>
        </div>

        <footer className="hidden items-center justify-between gap-3 border-t border-line-soft px-3 py-1.5 font-mono text-[11px] text-faint sm:flex">
          <span>
            <kbd className="rounded border border-line-soft bg-canvas px-1 py-0.5 text-[11px]">Enter</kbd> keeps
            the answer
          </span>
          <span>
            <kbd className="rounded border border-line-soft bg-canvas px-1 py-0.5 text-[11px]">Esc</kbd> clears
            the line
          </span>
          </footer>
        </section>
        <div className={mode === 'graphing' ? 'w-full' : 'hidden'}>
          <GraphingPane
            angle={angle}
            onAngle={setAngle}
            source={source}
            onSourceChange={onSourceChange}
            onSliderCommit={onSliderCommit}
          />
        </div>
      </div>
    </div>
  );
}
