import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowBigUp,
  ArrowRightToLine,
  Copy,
  CornerDownLeft,
  Delete,
  IndentDecrease,
  IndentIncrease,
  Keyboard,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';

/**
 * The phone's coding keyboard (`components/MobilePythonKeyboard.tsx`).
 *
 * One component draws both editors' keyboard: Python Code and Visual pass the same keys and only
 * change what a key means. The layout is the approved picture — six editing actions, the
 * programming symbols, QWERTY with its number labels, Shift, the operators, and a bottom row with
 * `123`, the native keyboard, space and Done — so a learner who switches faces does not have to
 * learn a second keyboard.
 *
 * Three switches change what is printed, never where a key is:
 *
 * - **Fn** turns the top row into block operations (indent/dedent a block, new statement, insert a
 *   tab, duplicate, delete) and makes the QWERTY row print digits, with the letters as its small
 *   secondary labels. The keys keep their places, so the hand does not move.
 * - **123** swaps the three QWERTY rows for digits, punctuation and arithmetic. `ABC` puts the
 *   letters back; it is one key that says which page it will open, not two keys.
 * - **Shift** is one-shot, the way a phone keyboard's shift is: the next letter is capital and the
 *   key lets go. It only exists on the letters page.
 *
 * Every press cancels the pointer's default. A key is outside the editing surface, and on a phone
 * a press that moved focus to the button would blur the block field or the CodeMirror caret — the
 * editing position, the scroll and (in Visual) the keyboard itself would go with it. Cancelling on
 * pointerdown keeps the caret where it was, and the button still receives its click, its Enter and
 * its Space.
 */

export type MobileKeyboardMode = 'code' | 'visual';

type KeyboardAction =
  | 'indent'
  | 'dedent'
  | 'newline'
  | 'tab'
  | 'undo'
  | 'redo'
  | 'duplicate'
  | 'delete'
  | 'backspace';

export interface MobilePythonKeyboardProps {
  /** Which editor is underneath, so a label can name the operation it performs there. */
  mode: MobileKeyboardMode;
  onInsertText: (text: string) => void;
  onBackspace: () => void;
  onIndent: () => void;
  onDedent: () => void;
  onNewLine: () => void;
  onTab: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onNativeKeyboard: () => void;
  onDone: () => void;
}

const SYMBOLS: { id: string; label: string; insert: string; name: string }[] = [
  { id: 'open-paren', label: '(', insert: '(', name: 'Open parenthesis' },
  { id: 'close-paren', label: ')', insert: ')', name: 'Close parenthesis' },
  { id: 'open-bracket', label: '[', insert: '[', name: 'Open square bracket' },
  { id: 'close-bracket', label: ']', insert: ']', name: 'Close square bracket' },
  { id: 'open-brace', label: '{', insert: '{', name: 'Open curly brace' },
  { id: 'close-brace', label: '}', insert: '}', name: 'Close curly brace' },
  { id: 'colon', label: ':', insert: ':', name: 'Colon' },
  { id: 'comma', label: ',', insert: ',', name: 'Comma' },
  { id: 'semicolon', label: ';', insert: ';', name: 'Semicolon' },
  { id: 'single-quote', label: "'", insert: "'", name: 'Single quote' },
  { id: 'double-quote', label: '"', insert: '"', name: 'Double quote' },
  { id: 'equals', label: '=', insert: '=', name: 'Equals' },
];

const LETTERS = [
  ['q', '1'],
  ['w', '2'],
  ['e', '3'],
  ['r', '4'],
  ['t', '5'],
  ['y', '6'],
  ['u', '7'],
  ['i', '8'],
  ['o', '9'],
  ['p', '0'],
  ['a', ''],
  ['s', ''],
  ['d', ''],
  ['f', ''],
  ['g', ''],
  ['h', ''],
  ['j', ''],
  ['k', ''],
  ['l', ''],
  ['z', ''],
  ['x', ''],
  ['c', ''],
  ['v', ''],
  ['b', ''],
  ['n', ''],
  ['m', ''],
] as const;

const NUMBERS = [
  ['1', '1'],
  ['2', '2'],
  ['3', '3'],
  ['4', '4'],
  ['5', '5'],
  ['6', '6'],
  ['7', '7'],
  ['8', '8'],
  ['9', '9'],
  ['0', '0'],
] as const;

/** The symbol half of `123`: the punctuation a phone hides, minus what row two already offers. */
const NUMERIC_MIDDLE = [
  { id: 'dot', label: '.', name: 'Full stop' },
  { id: 'comma-num', label: ',', name: 'Comma' },
  { id: 'colon-num', label: ':', name: 'Colon' },
  { id: 'semicolon-num', label: ';', name: 'Semicolon' },
  { id: 'underscore', label: '_', name: 'Underscore' },
  { id: 'hash', label: '#', name: 'Hash, starts a comment' },
  { id: 'at', label: '@', name: 'At sign' },
  { id: 'ampersand', label: '&', name: 'Ampersand' },
  { id: 'exclaim', label: '!', name: 'Exclamation mark' },
];

const NUMERIC_LAST = [
  { id: 'tilde', label: '~', name: 'Tilde' },
  { id: 'dollar', label: '$', name: 'Dollar sign' },
  { id: 'caret', label: '^', name: 'Caret' },
  { id: 'pipe', label: '|', name: 'Vertical bar' },
  { id: 'backslash', label: '\\', name: 'Backslash' },
  { id: 'question', label: '?', name: 'Question mark' },
  { id: 'percent-num', label: '%', name: 'Percent' },
  { id: 'star-num', label: '*', name: 'Asterisk' },
  { id: 'plus-num', label: '+', name: 'Plus' },
];

const OPERATORS: { id: string; label: string; insert: string; name: string }[] = [
  { id: 'plus', label: '+', insert: '+', name: 'Plus' },
  { id: 'minus', label: '−', insert: '-', name: 'Minus' },
  { id: 'star', label: '*', insert: '*', name: 'Asterisk, multiply' },
  { id: 'slash', label: '/', insert: '/', name: 'Slash, divide' },
  { id: 'percent', label: '%', insert: '%', name: 'Percent, remainder' },
  { id: 'less', label: '<', insert: '<', name: 'Less than' },
  { id: 'greater', label: '>', insert: '>', name: 'Greater than' },
  { id: 'less-equal', label: '<=', insert: '<=', name: 'Less than or equal' },
  { id: 'greater-equal', label: '>=', insert: '>=', name: 'Greater than or equal' },
  { id: 'equal-equal', label: '==', insert: '==', name: 'Equal to' },
  { id: 'not-equal', label: '!=', insert: '!=', name: 'Not equal to' },
];

/** A key's surface: the raised white cap of the picture, themed by the app's own tokens. */
const CAP =
  'relative flex min-h-[40px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center rounded-lg border border-line-soft bg-panel text-body shadow-sm transition-colors active:bg-accent-soft active:text-accent';

const ACTION_CAP =
  'relative flex min-h-[40px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center gap-0.5 rounded-lg border border-line-soft bg-raise px-0.5 text-[9px] font-semibold leading-none text-body transition-colors active:bg-accent-soft active:text-accent';

const OPERATOR_CAP =
  'relative flex min-h-[40px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center rounded-lg border border-line-soft bg-panel font-mono text-[13px] font-semibold text-body shadow-sm transition-colors active:bg-accent-soft active:text-accent';

/** One key. `button` keeps the keyboard reachable from a switch or a screen reader. */
function Key({
  testId,
  label,
  onPress,
  className,
  children,
  pressed,
  style,
  wide,
}: {
  testId: string;
  label: string;
  onPress: () => void;
  className: string;
  children: ReactNode;
  pressed?: boolean;
  style?: CSSProperties;
  wide?: number;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      // The editing surface keeps focus — and with it the caret, the scroll and the open field.
      onPointerDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={className}
      style={wide ? { ...style, flexGrow: wide } : style}
    >
      {children}
    </button>
  );
}

export function MobilePythonKeyboard({
  mode,
  onInsertText,
  onBackspace,
  onIndent,
  onDedent,
  onNewLine,
  onTab,
  onUndo,
  onRedo,
  onDuplicate,
  onDelete,
  onNativeKeyboard,
  onDone,
}: MobilePythonKeyboardProps) {
  const [fn, setFn] = useState(false);
  const [page, setPage] = useState<'abc' | '123'>('abc');
  const [shift, setShift] = useState(false);

  const visual = mode === 'visual';
  const action = (id: KeyboardAction) => {
    switch (id) {
      case 'indent':
        return onIndent();
      case 'dedent':
        return onDedent();
      case 'newline':
        return onNewLine();
      case 'tab':
        return onTab();
      case 'undo':
        return onUndo();
      case 'redo':
        return onRedo();
      case 'duplicate':
        return onDuplicate();
      case 'delete':
        return onDelete();
      case 'backspace':
        return onBackspace();
    }
  };

  const letter = (key: string) => {
    onInsertText(shift ? key.toUpperCase() : key);
    if (shift) setShift(false);
  };

  return (
    <section
      data-testid="python-keyboard"
      data-mode={mode}
      data-page={page}
      data-fn={fn ? '1' : undefined}
      role="group"
      aria-label="Python keyboard"
      className="min-w-0 select-none border-t border-line-soft bg-canvas px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-12px_30px_rgba(0,0,0,0.28)]"
    >
      {/* Row 1 — editing actions. Fn swaps each label and, on the last two, the verb. */}
      <div className="flex min-w-0 gap-1">
        <Key
          testId="python-key-indent"
          label={fn ? 'Indent block' : 'Indent current line or selection'}
          onPress={() => action('indent')}
          className={ACTION_CAP}
        >
          <IndentIncrease className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
          <span className="truncate">Indent</span>
        </Key>
        <Key
          testId="python-key-dedent"
          label={fn ? 'Dedent block' : 'Dedent current line or selection'}
          onPress={() => action('dedent')}
          className={ACTION_CAP}
        >
          <IndentDecrease className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
          <span className="truncate">Dedent</span>
        </Key>
        <Key
          testId="python-key-newline"
          label={visual ? 'New statement' : fn ? 'New statement' : 'New line'}
          onPress={() => action('newline')}
          className={ACTION_CAP}
        >
          <CornerDownLeft className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
          <span className="truncate">{fn ? 'New stmt' : 'New line'}</span>
        </Key>
        <Key
          testId="python-key-tab"
          label={fn ? 'Insert tab' : 'Tab, four spaces'}
          onPress={() => action('tab')}
          className={ACTION_CAP}
        >
          <ArrowRightToLine className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
          <span className="truncate">{fn ? 'Insert tab' : 'Tab'}</span>
        </Key>
        <Key
          testId="python-key-undo"
          label={fn ? (visual ? 'Duplicate block' : 'Duplicate line or selection') : 'Undo'}
          onPress={() => action(fn ? 'duplicate' : 'undo')}
          className={ACTION_CAP}
        >
          {fn ? (
            <Copy className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
          ) : (
            <Undo2 className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
          )}
          <span className="truncate">{fn ? 'Duplicate' : 'Undo'}</span>
        </Key>
        <Key
          testId="python-key-redo"
          label={fn ? (visual ? 'Delete block' : 'Delete line or selection') : 'Redo'}
          onPress={() => action(fn ? 'delete' : 'redo')}
          className={ACTION_CAP}
        >
          {fn ? (
            <Trash2 className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
          ) : (
            <Redo2 className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
          )}
          <span className="truncate">{fn ? 'Delete' : 'Redo'}</span>
        </Key>
      </div>

      {/* Row 2 — the programming symbols. `==` and `!=` live only in the operator row below. */}
      <div className="mt-1 flex min-w-0 gap-1">
        {SYMBOLS.map((symbol) => (
          <Key
            key={symbol.id}
            testId={`python-key-${symbol.id}`}
            label={symbol.name}
            onPress={() => onInsertText(symbol.insert)}
            className={`${CAP} font-mono text-[15px]`}
          >
            {symbol.label}
          </Key>
        ))}
      </div>

      {page === 'abc' ? (
        <>
          {/* Row 3 — QWERTY top row, with the digits it becomes under Fn as small labels. */}
          <div className="mt-1 flex min-w-0 gap-1">
            {LETTERS.slice(0, 10).map(([key, digit]) => (
              <Key
                key={key}
                testId={`python-key-${key}`}
                label={fn ? `Digit ${digit}` : `Letter ${key}`}
                onPress={() => (fn ? onInsertText(digit) : letter(key))}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">
                  {fn ? digit : shift ? key.toUpperCase() : key}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute bottom-0.5 right-1 text-[9px] leading-none text-faint"
                >
                  {fn ? key : digit}
                </span>
              </Key>
            ))}
          </div>

          {/* Row 4 — the home row. */}
          <div className="mt-1 flex min-w-0 gap-1">
            {LETTERS.slice(10, 19).map(([key]) => (
              <Key
                key={key}
                testId={`python-key-${key}`}
                label={`Letter ${key}`}
                onPress={() => letter(key)}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">
                  {shift ? key.toUpperCase() : key}
                </span>
              </Key>
            ))}
          </div>

          {/* Row 5 — Shift, the bottom letter row, Backspace. */}
          <div className="mt-1 flex min-w-0 gap-1">
            <Key
              testId="python-key-shift"
              label={shift ? 'Shift is on for one letter' : 'Shift, capital for one letter'}
              pressed={shift}
              onPress={() => setShift((on) => !on)}
              wide={1.5}
              className={`${CAP} ${shift ? 'bg-accent-soft text-accent' : 'bg-raise text-muted'}`}
            >
              <ArrowBigUp className="h-4 w-4" aria-hidden="true" />
            </Key>
            {LETTERS.slice(19).map(([key]) => (
              <Key
                key={key}
                testId={`python-key-${key}`}
                label={`Letter ${key}`}
                onPress={() => letter(key)}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">
                  {shift ? key.toUpperCase() : key}
                </span>
              </Key>
            ))}
            <Key
              testId="python-key-backspace"
              label="Backspace"
              onPress={onBackspace}
              wide={1.5}
              className={`${CAP} bg-raise text-body`}
            >
              <Delete className="h-4 w-4" aria-hidden="true" />
            </Key>
          </div>
        </>
      ) : (
        <>
          {/* The 123 page: digits on the top row, punctuation, then arithmetic and Backspace. */}
          <div className="mt-1 flex min-w-0 gap-1">
            {NUMBERS.map(([digit]) => (
              <Key
                key={digit}
                testId={`python-key-digit-${digit}`}
                label={`Digit ${digit}`}
                onPress={() => onInsertText(digit)}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">{digit}</span>
              </Key>
            ))}
          </div>
          <div className="mt-1 flex min-w-0 gap-1">
            {NUMERIC_MIDDLE.map((symbol) => (
              <Key
                key={symbol.id}
                testId={`python-key-${symbol.id}`}
                label={symbol.name}
                onPress={() => onInsertText(symbol.label)}
                className={`${CAP} font-mono text-[15px]`}
              >
                {symbol.label}
              </Key>
            ))}
          </div>
          <div className="mt-1 flex min-w-0 gap-1">
            {NUMERIC_LAST.map((symbol) => (
              <Key
                key={symbol.id}
                testId={`python-key-${symbol.id}`}
                label={symbol.name}
                onPress={() => onInsertText(symbol.label)}
                className={`${CAP} font-mono text-[15px]`}
              >
                {symbol.label}
              </Key>
            ))}
            <Key
              testId="python-key-backspace"
              label="Backspace"
              onPress={onBackspace}
              wide={1.5}
              className={`${CAP} bg-raise text-body`}
            >
              <Delete className="h-4 w-4" aria-hidden="true" />
            </Key>
          </div>
        </>
      )}

      {/* Row 6 — Fn and the operators. `==` and `!=` are here and nowhere else. */}
      <div className="mt-1 flex min-w-0 gap-1">
        <Key
          testId="python-key-fn"
          label={fn ? 'Fn is on: block operations' : 'Fn: block operations and digits'}
          pressed={fn}
          onPress={() => setFn((on) => !on)}
          wide={1.15}
          className="flex min-h-[40px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center rounded-lg font-mono text-[14px] font-bold transition-colors"
          style={{
            background: fn ? 'var(--accent-strong, var(--accent))' : 'var(--accent)',
            color: 'var(--inverse)',
            border: '1px solid var(--accent-strong, var(--accent))',
          }}
        >
          Fn
        </Key>
        {OPERATORS.map((operator) => (
          <Key
            key={operator.id}
            testId={`python-key-${operator.id}`}
            label={operator.name}
            onPress={() => onInsertText(operator.insert)}
            className={OPERATOR_CAP}
          >
            {operator.label}
          </Key>
        ))}
      </div>

      {/* Row 7 — 123/ABC, the native keyboard, space and Done. */}
      <div className="mt-1 flex min-w-0 items-stretch gap-1">
        <Key
          testId="python-key-layout"
          label={page === 'abc' ? 'Numbers and symbols' : 'Letters'}
          pressed={page === '123'}
          onPress={() => {
            setPage((current) => (current === 'abc' ? '123' : 'abc'));
            setShift(false);
          }}
          wide={1.4}
          className={`${ACTION_CAP} font-mono text-[13px]`}
        >
          {page === 'abc' ? '123' : 'ABC'}
        </Key>
        <Key
          testId="python-key-native"
          label="Use the phone's own keyboard"
          onPress={onNativeKeyboard}
          wide={1}
          className={`${ACTION_CAP} text-muted`}
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
        </Key>
        <Key
          testId="python-key-space"
          label="Space"
          onPress={() => onInsertText(' ')}
          wide={3.6}
          className={`${CAP} font-mono text-[13px] text-muted`}
        >
          space
        </Key>
        <Key
          testId="python-key-done"
          label="Done, close the keyboard"
          onPress={onDone}
          wide={2.1}
          className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center gap-1 rounded-lg font-mono text-[13px] font-bold transition-colors"
          style={{
            background: 'var(--emerald)',
            color: 'var(--inverse)',
            border: '1px solid var(--emerald)',
          }}
        >
          Done
        </Key>
      </div>
    </section>
  );
}
