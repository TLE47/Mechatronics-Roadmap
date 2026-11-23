import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
import { haptic, type HapticPattern } from '../keyboard/haptics';
import {
  RGB_MODES,
  RGB_PRESETS,
  readRgbSettings,
  writeRgbSettings,
  type RgbSettings,
} from '../keyboard/rgb';

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
 *   key lets go. Tapping it twice quickly locks capitals, as a phone's own Shift does, until the
 *   next tap. It only exists on the letters page.
 *
 * **Lighting is a layer of this keyboard, not a second one.** With Fn on, the `123` / `ABC` key
 * becomes `RGB`: one press swaps the three top rows for the six lighting modes, a preset row, and
 * brightness and speed, while the letter rows underneath stay as the live preview. The same key
 * goes back to the typing page, which is kept underneath (page and Fn state survive the round
 * trip). The lighting itself is CSS custom properties on this section and a `::before` wash under
 * each cap (`index.css`), so there is no per-frame JavaScript: a loop pauses when the shell slides
 * away and the reduced-motion preference turns the animations off.
 *
 * Every press cancels the pointer's default, and the section does the same for its gaps and padding.
 * A key is outside the editing surface, and on a phone a press that moved focus to the button would
 * blur the block field or the CodeMirror caret — the editing position, the scroll and (in Visual)
 * the keyboard itself would go with it. Cancelling on pointerdown keeps the caret where it was, and
 * the button still receives its click, its Enter and its Space; a key that only changes the keyboard
 * (Shift, Fn, 123/ABC) puts the caret back afterwards. Backspace deletes on the way down and repeats
 * on a held finger, then stops on the lift. The press also asks for a small vibration where the
 * device has one, and raises the pressed character above the cap in the iOS manner; neither is
 * required for a key to work.
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
  /** Whether the shell is showing. Closing clears the transient Shift state, as a native keyboard does. */
  open: boolean;
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
  /** Put the caret back in the editing surface after a key that changes the keyboard, not the text. */
  onKeepFocus: () => void;
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

/**
 * A key's motion: a short compression and a coast back, the way a phone's keys answer a finger.
 * Transform only — the cap's box, and therefore every neighbour, never changes size.
 */
const PRESS =
  'transition-[transform,background-color,color,box-shadow] duration-100 ease-out active:scale-[0.94] motion-reduce:transition-none';

/** A key's surface: the raised white cap of the picture, themed by the app's own tokens. */
const CAP =
  `kb-key relative flex min-h-[44px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center rounded-lg border border-line-soft bg-panel text-body shadow-sm ${PRESS}`;

const ACTION_CAP =
  `kb-key relative flex min-h-[44px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center gap-0.5 rounded-lg border border-line-soft bg-raise px-0.5 text-[9px] font-semibold leading-none text-body ${PRESS}`;

const OPERATOR_CAP =
  `kb-key relative flex min-h-[44px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center rounded-lg border border-line-soft bg-panel font-mono text-[13px] font-semibold text-body shadow-sm ${PRESS}`;

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
  index,
  feedback = 'light',
  preview,
  onPreview,
  onRepeat,
  keepFocus = true,
}: {
  testId: string;
  label: string;
  onPress: () => void;
  className: string;
  children: ReactNode;
  pressed?: boolean;
  style?: CSSProperties;
  wide?: number;
  /** Its place on the keyboard, so a rainbow can start one hue later on the next key. */
  index?: number;
  /** The tap this key asks for; a character is light, Enter is medium, a mode is a confirmation. */
  feedback?: HapticPattern | 'none';
  /** The character this key should raise above the cap while it is held, if it has one. */
  preview?: string;
  onPreview?: (next: { text: string; button: HTMLElement } | null) => void;
  /** A held key repeats this until the finger lifts, the way a native Backspace does. */
  onRepeat?: () => void;
  /** Native and Done deliberately move focus away; every other key keeps the caret. */
  keepFocus?: boolean;
}) {
  const holdTimer = useRef<number | null>(null);
  const repeatTimer = useRef<number | null>(null);

  const stopRepeat = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    if (repeatTimer.current !== null) window.clearInterval(repeatTimer.current);
    holdTimer.current = null;
    repeatTimer.current = null;
  };

  useEffect(() => stopRepeat, []);

  /**
   * Delete on the way down, then keep deleting while the finger stays, like a phone's Backspace.
   * The synthetic click that follows the lift is swallowed, so one press never deletes twice.
   */
  const beginRepeat = () => {
    if (!onRepeat) return;
    stopRepeat();
    if (feedback !== 'none') haptic(feedback);
    onRepeat();
    holdTimer.current = window.setTimeout(() => {
      repeatTimer.current = window.setInterval(onRepeat, 55);
    }, 420);
  };

  const merged: CSSProperties = {
    ...(index === undefined ? {} : ({ '--i': index } as CSSProperties)),
    ...style,
  };
  const press = () => {
    if (feedback !== 'none') haptic(feedback);
    onPress();
  };
  return (
    <button
      type="button"
      data-testid={testId}
      data-no-keep-focus={keepFocus ? undefined : '1'}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      // A key acts on the way down, like a native keyboard, not on the synthetic click after the
      // lift. Two fingers can overlap while typing quickly, and Chromium (like a phone browser)
      // does not synthesise a click for every touch in a multi-touch sequence. Waiting for it lost
      // those characters entirely; acting on pointerdown also removes the lift from the latency.
      // The editing surface still keeps focus: `preventDefault` stops the button from taking it.
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        if (onRepeat) {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // A browser without capture still gets the closing pointerup on the key.
          }
          beginRepeat();
        } else {
          press();
        }
        if (preview) onPreview?.({ text: preview, button: event.currentTarget });
      }}
      onPointerUp={() => {
        stopRepeat();
        onPreview?.(null);
      }}
      onPointerCancel={() => {
        stopRepeat();
        onPreview?.(null);
      }}
      onPointerLeave={() => {
        stopRepeat();
        onPreview?.(null);
      }}
      onLostPointerCapture={() => stopRepeat()}
      onClick={(event) => {
        // Every pointer press has already acted on the way down. Its click is the lift, however
        // late the browser synthesises it, so it is never a second press. A keyboard's Enter/Space
        // activation has `detail === 0` and no pointer behind it; that one press is the only way a
        // switch or screen reader can use a key, so it still acts once.
        if (event.detail > 0) return;
        press();
      }}
      className={className}
      style={wide ? { ...merged, flexGrow: wide } : merged}
    >
      {children}
    </button>
  );
}

/** The duration an effect runs at: the slider's fast end is a shorter loop, never a faster frame. */
function duration(fast: number, slow: number, speed: number): string {
  return `${(slow - (slow - fast) * (speed / 100)).toFixed(2)}s`;
}

export function MobilePythonKeyboard({
  mode,
  open,
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
  onKeepFocus,
}: MobilePythonKeyboardProps) {
  const [fn, setFn] = useState(false);
  const [page, setPage] = useState<'abc' | '123'>('abc');
  const [shift, setShift] = useState(false);
  // A native phone's Shift, tapped twice, locks capitals until the next Shift. `shift` stays the
  // one-shot arm; `caps` is the lock, and the labels and typed letters read both.
  const [caps, setCaps] = useState(false);
  const shiftTapAt = useRef(0);
  const capital = shift || caps;

  // A native keyboard comes back with Shift unarmed and caps lock off. This shell stays mounted
  // while folded, so clear both whenever it closes — Done, Native, or the caret leaving — instead
  // of handing the next open the last word's capitals. Fn, page and lighting stay remembered.
  useEffect(() => {
    if (open) return;
    setShift(false);
    setCaps(false);
    shiftTapAt.current = 0;
  }, [open]);
  // The lighting layer, and the choice it remembers. Fn + the layout key opens it; the same key
  // closes it. `page` and `fn` are not reset by the trip, so the learner returns to what they had.
  const [rgbOpen, setRgbOpen] = useState(false);
  const [rgb, setRgb] = useState<RgbSettings>(() => readRgbSettings());
  const [preview, setPreview] = useState<{ text: string; left: number } | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const noop = () => undefined;

  // The stamp belongs to the latest press. A finger outside this keyboard clears it before its
  // own focus change, so a blur caused by leaving is never mistaken for one caused by a key.
  useEffect(() => {
    const clear = (event: PointerEvent) => {
      if (event.target instanceof Node && sectionRef.current?.contains(event.target)) return;
      sectionRef.current?.removeAttribute('data-pressed-at');
    };
    document.addEventListener('pointerdown', clear, true);
    return () => document.removeEventListener('pointerdown', clear, true);
  }, []);

  // One write per choice: the value returned by the store is the value drawn, so a blocked
  // localStorage loses the memory and never the switch.
  const updateRgb = (patch: Partial<RgbSettings>) => {
    setRgb(writeRgbSettings({ ...rgb, ...patch }));
  };

  /**
   * Raise the held character over the key that is holding it, the way a phone does. The bubble is
   * positioned in the section's coordinates, so it climbs with the keyboard as it slides.
   */
  const showPreview = (next: { text: string; button: HTMLElement } | null) => {
    if (!next) {
      setPreview(null);
      return;
    }
    const section = sectionRef.current;
    if (!section) return;
    const base = section.getBoundingClientRect();
    const key = next.button.getBoundingClientRect();
    setPreview({ text: next.text, left: key.left - base.left + key.width / 2 });
  };

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
    onInsertText(capital ? key.toUpperCase() : key);
    if (shift) setShift(false);
  };

  /**
   * Shift, with the native keyboard's double tap: one press arms one capital, a second quick press
   * locks capitals, and a press while locked lets go. The lock never folds or moves the keyboard.
   */
  const shiftPress = () => {
    if (caps) {
      setCaps(false);
      setShift(false);
      shiftTapAt.current = 0;
      return;
    }
    const now = Date.now();
    if (shift && now - shiftTapAt.current <= 360) {
      setCaps(true);
      setShift(false);
      shiftTapAt.current = 0;
      return;
    }
    setShift((on) => !on);
    shiftTapAt.current = now;
  };

  /**
   * The 123/ABC key, and the lighting's door.
   *
   * While Fn is on it is the RGB key: opening lighting is one press away from the keyboard the
   * learner already has, and the typing page underneath is untouched. Inside the lighting layer the
   * same key is the way back. Without Fn it is the page switch it has always been.
   */
  const layoutPress = () => {
    if (rgbOpen) {
      setRgbOpen(false);
      setShift(false);
      return;
    }
    if (fn) {
      setFn(false);
      setRgbOpen(true);
      return;
    }
    setPage((current) => (current === 'abc' ? '123' : 'abc'));
    setShift(false);
  };
  const layoutLabel = rgbOpen ? 'ABC' : fn ? 'RGB' : page === 'abc' ? '123' : 'ABC';
  const layoutName = rgbOpen
    ? 'Back to the typing keys'
    : fn
      ? 'Keyboard lighting, RGB'
      : page === 'abc'
        ? 'Numbers and symbols'
        : 'Letters';
  const lightingName = RGB_MODES.find((entry) => entry.id === rgb.mode)?.name ?? 'Lighting off';

  // The effect's pace, as one duration per mode: the slider moves the loop, not the frame rate.
  const lightingStyle = {
    '--kb-rgb': rgb.color,
    // A mode that is on must stay readable: the wash tops out below half the cap's colour.
    '--kb-light-alpha': (0.06 + (rgb.brightness / 100) * 0.32).toFixed(3),
    '--kb-cycle': duration(3, 14, rgb.speed),
    '--kb-breathe': duration(1.4, 5, rgb.speed),
    '--kb-rainbow': duration(5, 18, rgb.speed),
  } as CSSProperties;

  return (
    <section
      ref={sectionRef}
      data-testid="python-keyboard"
      data-mode={mode}
      data-page={page}
      data-fn={fn ? '1' : undefined}
      data-caps={caps ? '1' : undefined}
      data-layer={rgbOpen ? 'rgb' : 'keys'}
      data-rgb={rgb.mode === 'off' ? undefined : rgb.mode}
      role="group"
      aria-label="Python keyboard"
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        sectionRef.current?.setAttribute('data-pressed-at', String(Date.now()));
        // A press anywhere on the keys — including the gap between two caps — belongs to the
        // keyboard, not the page behind it. The caret must stay where the learner left it.
        if (target.closest('input, textarea, select, label')) return;
        event.preventDefault();
      }}
      // A slow press can outlast the guard's window: the stamp was taken on the way down, and iOS
      // may move the focus on the lift or the click that follows it. The same press stamps again at
      // each of those moments, so a keyboard-caused blur is never read as the learner leaving.
      onPointerUpCapture={() =>
        sectionRef.current?.setAttribute('data-pressed-at', String(Date.now()))
      }
      onPointerCancelCapture={() =>
        sectionRef.current?.setAttribute('data-pressed-at', String(Date.now()))
      }
      onClickCapture={(event) => {
        sectionRef.current?.setAttribute('data-pressed-at', String(Date.now()));
        const target = event.target;
        const button = target instanceof Element ? target.closest('button') : null;
        if (!button || button.getAttribute('data-no-keep-focus') === '1') return;
        // The key's action runs after this capture; put the caret back afterwards. A key that
        // switches Fn, 123 or Shift has changed the keyboard and not the text, and on a phone a
        // focused button can otherwise take the caret — and the keyboard — with it.
        window.setTimeout(onKeepFocus, 0);
      }}
      style={lightingStyle}
      className="relative min-w-0 select-none border-t border-line-soft bg-canvas px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-12px_30px_rgba(0,0,0,0.28)]"
    >
      {/* The held character, above the cap it belongs to; never a target, never focused. */}
      {preview && (
        <div
          aria-hidden="true"
          data-testid="python-key-preview"
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line-soft bg-panel px-2 py-0.5 font-mono text-[15px] leading-6 text-body shadow-md"
          style={{ left: preview.left, bottom: '100%', marginBottom: 6 }}
        >
          {preview.text}
        </div>
      )}
      <p className="sr-only" role="status">
        {rgbOpen ? `Keyboard lighting: ${lightingName}, colour ${rgb.color}` : ''}
      </p>

      {rgbOpen ? (
        <>
          {/* Row 1 — the six modes. Each is the same key component as a character. */}
          <div role="group" aria-label="Lighting mode" className="flex min-w-0 gap-1" data-testid="rgb-modes">
            {RGB_MODES.map((entry) => (
              <Key
                key={entry.id}
                testId={`rgb-mode-${entry.id}`}
                label={entry.name}
                pressed={rgb.mode === entry.id}
                feedback="confirmation"
                onPress={() => updateRgb({ mode: entry.id })}
                className={`${ACTION_CAP} ${
                  rgb.mode === entry.id ? 'border-accent bg-accent-soft text-accent' : ''
                }`}
              >
                <span className="truncate">{entry.label}</span>
              </Key>
            ))}
          </div>

          {/* Row 2 — six presets, a custom colour, and what the keys are wearing now. */}
          <div
            role="group"
            aria-label="Lighting colour"
            className="mt-1 flex min-w-0 items-stretch gap-1"
            data-testid="rgb-colours"
          >
            {RGB_PRESETS.map((color) => (
              <Key
                key={color}
                testId={`rgb-preset-${color.slice(1)}`}
                label={`Colour ${color}`}
                pressed={rgb.color === color}
                onPress={() => updateRgb({ color })}
                className={`${CAP} ${rgb.color === color ? 'border-accent' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full border border-line-soft"
                  style={{ background: color, boxShadow: `0 0 9px -1px ${color}` }}
                />
              </Key>
            ))}
            <label
              className="relative flex min-h-[44px] w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-soft bg-raise font-mono text-[13px] text-muted focus-within:border-accent"
              title="Custom colour"
            >
              <span aria-hidden="true">+</span>
              <input
                type="color"
                data-testid="rgb-custom"
                aria-label="Custom colour"
                value={rgb.color}
                onChange={(event) => updateRgb({ color: event.target.value })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <span
              data-testid="rgb-color-indicator"
              aria-label={`Current colour ${rgb.color}`}
              title={`Current colour ${rgb.color}`}
              className="flex min-h-[44px] w-9 shrink-0 items-center justify-center rounded-lg border bg-panel font-mono text-[13px] font-semibold"
              style={{ color: rgb.color, borderColor: rgb.color }}
            >
              Aa
            </span>
          </div>

          {/* Row 3 — brightness and speed, the two knobs every mode shares. */}
          <div role="group" aria-label="Lighting strength" className="mt-1 flex min-w-0 gap-2" data-testid="rgb-sliders">
            <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line-soft bg-panel px-2 text-[9px] font-semibold uppercase tracking-wide text-muted">
              Bright
              <input
                type="range"
                min={5}
                max={100}
                value={rgb.brightness}
                data-testid="rgb-brightness"
                aria-label="Lighting brightness"
                onChange={(event) => updateRgb({ brightness: Number(event.target.value) })}
                className="min-w-0 flex-1"
                style={{ accentColor: rgb.color }}
              />
              <span className="w-7 text-right font-mono text-[10px] normal-case text-body">
                {rgb.brightness}%
              </span>
            </label>
            <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line-soft bg-panel px-2 text-[9px] font-semibold uppercase tracking-wide text-muted">
              Speed
              <input
                type="range"
                min={0}
                max={100}
                value={rgb.speed}
                data-testid="rgb-speed"
                aria-label="Lighting animation speed"
                onChange={(event) => updateRgb({ speed: Number(event.target.value) })}
                className="min-w-0 flex-1"
                style={{ accentColor: rgb.color }}
              />
              <span className="w-7 text-right font-mono text-[10px] normal-case text-body">
                {rgb.speed}%
              </span>
            </label>
          </div>

          {/* Rows 4–6 — the typing layout itself, lit. A press previews the light and types nothing. */}
          <div className="mt-1 flex min-w-0 gap-1">
            {LETTERS.slice(0, 10).map(([key, digit], index) => (
              <Key
                key={key}
                testId={`rgb-preview-${key}`}
                label={`Preview key ${key}`}
                index={index}
                preview={key}
                onPreview={showPreview}
                onPress={noop}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">{key}</span>
                <span
                  aria-hidden="true"
                  className="absolute bottom-0.5 right-1 text-[9px] leading-none text-faint"
                >
                  {digit}
                </span>
              </Key>
            ))}
          </div>
          <div className="mt-1 flex min-w-0 gap-1">
            {LETTERS.slice(10, 19).map(([key], index) => (
              <Key
                key={key}
                testId={`rgb-preview-${key}`}
                label={`Preview key ${key}`}
                index={10 + index}
                preview={key}
                onPreview={showPreview}
                onPress={noop}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">{key}</span>
              </Key>
            ))}
          </div>
          <div className="mt-1 flex min-w-0 gap-1">
            <Key
              testId="rgb-preview-shift"
              label="Preview key Shift"
              wide={1.5}
              onPress={noop}
              className={`${CAP} bg-raise text-muted`}
            >
              <ArrowBigUp className="h-4 w-4" aria-hidden="true" />
            </Key>
            {LETTERS.slice(19).map(([key], index) => (
              <Key
                key={key}
                testId={`rgb-preview-${key}`}
                label={`Preview key ${key}`}
                index={19 + index}
                preview={key}
                onPreview={showPreview}
                onPress={noop}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">{key}</span>
              </Key>
            ))}
            <Key
              testId="rgb-preview-backspace"
              label="Preview key Backspace"
              wide={1.5}
              onPress={noop}
              className={`${CAP} bg-raise text-body`}
            >
              <Delete className="h-4 w-4" aria-hidden="true" />
            </Key>
          </div>
        </>
      ) : page === 'abc' ? (
        <>
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
              feedback="medium"
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
                preview={symbol.label}
                onPreview={showPreview}
                onPress={() => onInsertText(symbol.insert)}
                className={`${CAP} font-mono text-[15px]`}
              >
                {symbol.label}
              </Key>
            ))}
          </div>

          {/* Row 3 — QWERTY top row, with the digits it becomes under Fn as small labels. */}
          <div className="mt-1 flex min-w-0 gap-1">
            {LETTERS.slice(0, 10).map(([key, digit], index) => (
              <Key
                key={key}
                testId={`python-key-${key}`}
                label={fn ? `Digit ${digit}` : `Letter ${key}`}
                index={index}
                preview={fn ? digit : capital ? key.toUpperCase() : key}
                onPreview={showPreview}
                onPress={() => (fn ? onInsertText(digit) : letter(key))}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">
                  {fn ? digit : capital ? key.toUpperCase() : key}
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
            {LETTERS.slice(10, 19).map(([key], index) => (
              <Key
                key={key}
                testId={`python-key-${key}`}
                label={`Letter ${key}`}
                index={10 + index}
                preview={capital ? key.toUpperCase() : key}
                onPreview={showPreview}
                onPress={() => letter(key)}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">
                  {capital ? key.toUpperCase() : key}
                </span>
              </Key>
            ))}
          </div>

          {/* Row 5 — Shift, the bottom letter row, Backspace. */}
          <div className="mt-1 flex min-w-0 gap-1">
            <Key
              testId="python-key-shift"
              label={
                caps
                  ? 'Caps lock is on: letters stay capital until Shift is tapped again'
                  : shift
                    ? 'Shift is on for one letter; tap twice for caps lock'
                    : 'Shift, capital for one letter; tap twice for caps lock'
              }
              pressed={capital}
              onPress={shiftPress}
              wide={1.5}
              className={`${CAP} ${capital ? 'bg-accent-soft text-accent' : 'bg-raise text-muted'}`}
            >
              <ArrowBigUp className="h-4 w-4" aria-hidden="true" />
            </Key>
            {LETTERS.slice(19).map(([key], index) => (
              <Key
                key={key}
                testId={`python-key-${key}`}
                label={`Letter ${key}`}
                index={19 + index}
                preview={capital ? key.toUpperCase() : key}
                onPreview={showPreview}
                onPress={() => letter(key)}
                className={CAP}
              >
                <span className="text-[16px] font-medium leading-none">
                  {capital ? key.toUpperCase() : key}
                </span>
              </Key>
            ))}
            <Key
              testId="python-key-backspace"
              label="Backspace"
              onPress={onBackspace}
              onRepeat={onBackspace}
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
            {NUMBERS.map(([digit], index) => (
              <Key
                key={digit}
                testId={`python-key-digit-${digit}`}
                label={`Digit ${digit}`}
                index={index}
                preview={digit}
                onPreview={showPreview}
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
                preview={symbol.label}
                onPreview={showPreview}
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
                preview={symbol.label}
                onPreview={showPreview}
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
              onRepeat={onBackspace}
              wide={1.5}
              className={`${CAP} bg-raise text-body`}
            >
              <Delete className="h-4 w-4" aria-hidden="true" />
            </Key>
          </div>
        </>
      )}

      {/* Row 6 — Fn and the operators. `==` and `!=` are here and nowhere else. In the lighting
          layer the row is not a substitution: the preview rows above already fill this space. */}
      {!rgbOpen && (
        <div className="mt-1 flex min-w-0 gap-1">
          <Key
            testId="python-key-fn"
            label={fn ? 'Fn is on: block operations' : 'Fn: block operations and digits'}
            pressed={fn}
            onPress={() => setFn((on) => !on)}
            wide={1.15}
            className="kb-key flex min-h-[44px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center rounded-lg font-mono text-[14px] font-bold"
            style={{
              background: fn ? 'var(--accent-strong, var(--accent))' : 'var(--accent)',
              color: 'var(--inverse)',
              border: '1px solid var(--accent-strong, var(--accent))',
              transition: 'transform 100ms ease-out, background-color 120ms ease',
            }}
          >
            Fn
          </Key>
          {OPERATORS.map((operator) => (
            <Key
              key={operator.id}
              testId={`python-key-${operator.id}`}
              label={operator.name}
              preview={operator.label}
              onPreview={showPreview}
              onPress={() => onInsertText(operator.insert)}
              className={OPERATOR_CAP}
            >
              {operator.label}
            </Key>
          ))}
        </div>
      )}

      {/* Row 7 — 123/ABC, the native keyboard, space and Done. The row is shared by both layers:
          in the lighting layer the page key is the way back, and space previews instead of typing. */}
      <div className="mt-1 flex min-w-0 items-stretch gap-1">
        <Key
          testId="python-key-layout"
          label={layoutName}
          pressed={rgbOpen ? false : page === '123'}
          feedback="confirmation"
          onPress={layoutPress}
          wide={1.4}
          className={`${ACTION_CAP} font-mono text-[13px] ${
            rgbOpen || fn ? 'border-accent/50 text-accent' : ''
          }`}
        >
          {layoutLabel}
        </Key>
        <Key
          testId="python-key-native"
          label="Use the phone's own keyboard"
          feedback="confirmation"
          keepFocus={false}
          onPress={onNativeKeyboard}
          wide={1}
          className={`${ACTION_CAP} text-muted`}
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
        </Key>
        <Key
          testId="python-key-space"
          label="Space"
          preview={rgbOpen ? undefined : 'space'}
          onPreview={showPreview}
          onPress={rgbOpen ? noop : () => onInsertText(' ')}
          wide={3.6}
          className={`${CAP} font-mono text-[13px] text-muted`}
        >
          space
        </Key>
        <Key
          testId="python-key-done"
          label="Done, close the keyboard"
          feedback="confirmation"
          keepFocus={false}
          onPress={onDone}
          wide={2.1}
          className="kb-key flex min-h-[44px] min-w-0 flex-1 cursor-pointer select-none touch-manipulation items-center justify-center gap-1 rounded-lg font-mono text-[13px] font-bold"
          style={{
            background: 'var(--emerald)',
            color: 'var(--inverse)',
            border: '1px solid var(--emerald)',
            transition: 'transform 100ms ease-out, filter 120ms ease',
          }}
        >
          Done
        </Key>
      </div>
    </section>
  );
}
