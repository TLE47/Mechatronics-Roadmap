import { useMemo, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { evaluateExpression, formatNumber, type AngleMode } from '../../../calculator';

/** One entry of the tab's history: the text that was evaluated and the number it produced. */
interface HistoryEntry {
  expression: string;
  value: number;
}

/** A keypad key: what it prints on the face, what it inserts, or the action it performs. */
interface CalculatorKey {
  label: string;
  /** Stable half of the test id and the accessible name. */
  id: string;
  insert?: string;
  action?: 'back' | 'clear' | 'equals';
  /** The equals key takes two cells so it reads as the answer the pad is for. */
  wide?: boolean;
  accent?: boolean;
}

const KEYS: CalculatorKey[] = [
  { label: 'sin', id: 'sin', insert: 'sin(' },
  { label: 'cos', id: 'cos', insert: 'cos(' },
  { label: 'tan', id: 'tan', insert: 'tan(' },
  { label: 'ln', id: 'ln', insert: 'ln(' },
  { label: 'log', id: 'log', insert: 'log(' },
  { label: 'sin⁻¹', id: 'asin', insert: 'asin(' },
  { label: 'cos⁻¹', id: 'acos', insert: 'acos(' },
  { label: 'tan⁻¹', id: 'atan', insert: 'atan(' },
  { label: '√', id: 'sqrt', insert: 'sqrt(' },
  { label: '^', id: 'pow', insert: '^' },
  { label: '(', id: 'lparen', insert: '(' },
  { label: ')', id: 'rparen', insert: ')' },
  { label: '!', id: 'factorial', insert: '!' },
  { label: '%', id: 'percent', insert: '%' },
  { label: 'π', id: 'pi', insert: 'π' },
  { label: '7', id: '7', insert: '7' },
  { label: '8', id: '8', insert: '8' },
  { label: '9', id: '9', insert: '9' },
  { label: '÷', id: 'divide', insert: '÷' },
  { label: 'e', id: 'e', insert: 'e' },
  { label: '4', id: '4', insert: '4' },
  { label: '5', id: '5', insert: '5' },
  { label: '6', id: '6', insert: '6' },
  { label: '×', id: 'multiply', insert: '×' },
  { label: 'Ans', id: 'ans', insert: 'ans' },
  { label: '1', id: '1', insert: '1' },
  { label: '2', id: '2', insert: '2' },
  { label: '3', id: '3', insert: '3' },
  { label: '−', id: 'minus', insert: '−' },
  { label: 'C', id: 'clear', action: 'clear' },
  { label: '0', id: '0', insert: '0' },
  { label: '.', id: 'dot', insert: '.' },
  { label: '+', id: 'plus', insert: '+' },
  { label: '=', id: 'equals', action: 'equals', wide: true, accent: true },
];

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
      className="flex min-h-0 flex-1 flex-col bg-canvas"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
          Scientific calculator · never edits your code
        </span>
        <div role="group" aria-label="Angle mode" className="flex rounded-lg border border-line bg-panel p-0.5">
          {(['deg', 'rad'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`calculator-angle-${mode}`}
              aria-pressed={angle === mode}
              title={mode === 'deg' ? 'Degrees: sin(30) is 0.5' : 'Radians: sin(π ÷ 2) is 1'}
              onClick={() => setAngle(mode)}
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] uppercase cursor-pointer ${
                angle === mode ? 'bg-accent/15 text-accent' : 'text-muted hover:text-body'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-line-soft px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            ref={input}
            data-testid="calculator-display"
            aria-label="Calculator expression"
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
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-right font-mono text-[18px] text-body outline-none focus:border-accent"
          />
          <button
            type="button"
            data-testid="calculator-key-back"
            aria-label="Delete the last character"
            title="Delete the last character"
            onClick={backspace}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel text-muted hover:text-accent"
          >
            <Delete className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1.5 flex min-h-7 items-baseline justify-between gap-2">
          <span className="font-mono text-[10.5px] text-faint">
            {live ? `${angle === 'deg' ? 'degrees' : 'radians'} · Enter to keep it` : expression ? 'keep typing' : 'π · e · Ans are ready'}
          </span>
          <output
            data-testid="calculator-result"
            aria-live="polite"
            title={live ? 'The expression on screen' : undefined}
            className="min-w-0 truncate font-mono text-[21px] tabular-nums text-accent"
          >
            {live ? formatNumber(live.value) : '0'}
          </output>
        </div>
        {error && (
          <p role="alert" data-testid="calculator-error" className="mt-1 text-[11.5px] text-rose">
            {error}
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div
          data-testid="calculator-history"
          aria-label="Recent calculations"
          className="max-h-20 shrink-0 overflow-y-auto border-b border-line-soft px-2 py-1"
        >
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
              className="flex w-full items-baseline justify-between gap-3 rounded px-1.5 py-0.5 font-mono text-[11px] cursor-pointer hover:bg-raise"
            >
              <span className="truncate text-muted">{entry.expression}</span>
              <span className="shrink-0 tabular-nums text-body">= {formatNumber(entry.value)}</span>
            </button>
          ))}
        </div>
      )}

      <div
        role="group"
        aria-label="Calculator keypad"
        className="grid shrink-0 grid-cols-5 gap-1 p-2"
        style={{ gridAutoRows: 'minmax(2rem, 1fr)' }}
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
            className={`min-h-8 rounded-lg border font-mono text-[12.5px] cursor-pointer ${
              key.accent
                ? 'border-accent bg-accent text-inverse font-bold hover:opacity-90'
                : 'border-line bg-panel text-body hover:border-accent hover:text-accent'
            } ${key.action === 'clear' ? 'text-rose' : ''}`}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
