import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Blocks, Redo2, Undo2 } from 'lucide-react';
import { playUi } from '../audio/facade.ts';
import { panFromX } from '../audio/clickMap.ts';
import { KIND_LABELS, type BlockKind, type BlockNode } from './ast.ts';
import { BlockCard, type BlockCardHandlers } from './BlockCard';
import { APPEARANCE_LABELS, type BlockAppearance } from './appearance.ts';
import type { InsertionPoint } from './operations.ts';
import { PythonToolbox, type ToolboxDropTarget } from './PythonToolbox';
import { itemById, type ToolboxItem } from './registry.ts';
import { readBlockSettings, writeBlockSettings } from './settings.ts';
import { useBlockEditor } from './useBlockEditor';

/** How long a touch has to rest on a card before the card is in the learner's hand. */
const HOLD_MS = 320;
/** How far a pointer travels before a press is a drag rather than a tap (or a scroll, on touch). */
const MOVE_SLOP = 8;

export type BlockKeyboardMode = 'off' | 'custom' | 'native';

/**
 * What the shared keyboard can ask of the visual editor.
 *
 * The keyboard is drawn by the pane above both faces, so the visual face answers through this
 * handle: text goes to whichever block field has the caret, and the block verbs go to the selected
 * statement. It is the visual half of the keyboard's adapter, not a second keyboard.
 */
export interface PythonBlockEditorHandle {
  insertText: (text: string) => void;
  backspace: () => void;
  indent: () => void;
  dedent: () => void;
  newStatement: () => void;
  insertTab: () => void;
  undo: () => void;
  redo: () => void;
  duplicate: () => void;
  deleteSelected: () => void;
  focusField: () => void;
  blurField: () => void;
  /** Remove the custom keyboard's inputmode and raise the OS keyboard inside the press's gesture. */
  openNativeKeyboard: () => void;
}

/** The point a card drag would land on, and the way the card is travelling to reach it. */
type CardDropTarget = InsertionPoint & { direction: 'up' | 'down' };

interface CardPress {
  id: string;
  kind: BlockKind;
  pointerId: number;
  /** The card surface that took the press and the capture, and the only one that acts on it. */
  element: HTMLElement;
  x: number;
  y: number;
  started: boolean;
  timer: number | null;
}

/**
 * The visual Python workspace (`app/src/pythonBlocks/PythonBlockEditor.tsx`).
 *
 * This is the editor's Visual face. It owns no code of its own: the hook holds the program, every
 * edit is rendered to Python and written back to the tab's one `main.py`, and the same Run, checks
 * and drafts that read the code editor read this. Switching to Python Code is a change of drawing,
 * not a change of document.
 *
 * The toolbar is deliberately small — undo, redo, the Normal/Colorful switch, the statement count —
 * because the workspace is the instrument. Appearance and undo history are device-local; the code
 * is not.
 */
export const PythonBlockEditor = forwardRef<
  PythonBlockEditorHandle,
  {
    code: string;
    onCode: (next: string) => void;
    /** False while Python Code is the face on screen; the model then waits for the next switch. */
    active?: boolean;
    /** The phone's dock: the toolbox is pinned under the code instead of ending the workspace. */
    isPhone?: boolean;
    /** How the shared phone keyboard is drawing: suppress the OS keyboard unless native is asked for. */
    keyboardMode?: BlockKeyboardMode;
    /** A block field took the caret, so the keyboard belongs on screen. */
    onFieldFocus?: () => void;
    /** The caret left every block field, so the keyboard can give the workspace back. */
    onFieldBlur?: () => void;
  }
>(function PythonBlockEditor(
  {
    code,
    onCode,
    active = true,
    isPhone = false,
    keyboardMode = 'off',
    onFieldFocus,
    onFieldBlur,
  },
  ref
) {
  const editor = useBlockEditor(code, onCode, active);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [appearance, setAppearance] = useState<BlockAppearance>(
    () => readBlockSettings().appearance
  );
  const chooseAppearance = (next: BlockAppearance) => {
    setAppearance(next);
    writeBlockSettings({ appearance: next });
  };

  const count = countStatements(editor.program.nodes);

  /** The card in the air: its label and where the pointer is, for the chip that follows the finger. */
  const [cardDrag, setCardDrag] = useState<{ label: string; x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** The point a release would land on right now, which the cards use to draw their snap line. */
  const [dropTarget, setDropTarget] = useState<CardDropTarget | null>(null);
  const pressRef = useRef<CardPress | null>(null);

  /**
   * The browser's own long-press gestures, declined while a card is in hand.
   *
   * These are refs, not per-render closures: the listener added when a finger goes down has to be
   * the one removed when that press ends, and an identity that changed with the drag's state would
   * leave a non-passive `touchmove` on the document forever. Both read the ref, so they always see
   * the press that is current rather than the one from the render that installed them.
   */
  const touchScrollGuard = useRef((event: TouchEvent) => {
    if (pressRef.current?.started) event.preventDefault();
  }).current;
  const longPressGuard = useRef((event: Event) => {
    if (pressRef.current?.started) event.preventDefault();
  }).current;

  /** Text selection is the page's, except while a press owns the finger or the mouse. */
  const setPageSelection = (suppressed: boolean) => {
    document.body.style.userSelect = suppressed ? 'none' : '';
    // Safari still reads the prefixed property; an empty value removes the inline declaration.
    document.body.style.setProperty('-webkit-user-select', suppressed ? 'none' : '');
  };

  /**
   * The drop point under a pointer, read from the targets the cards publish.
   *
   * The dragged card is not a target for itself: while the finger is still over the statement's old
   * place, `elementFromPoint` finds that statement, and "drop after itself" is a no-op the highlight
   * should not promise. A suite's body is a deeper target than its card, so dropping over a loop's
   * inside lands inside it.
   */
  const dropPointAt = (x: number, y: number): CardDropTarget | null => {
    const under = document.elementFromPoint(x, y);
    const target = under?.closest('[data-drop-body]') as HTMLElement | null;
    if (!target) return null;
    const press = pressRef.current;
    if (press && target.closest(`[data-block-id="${press.id}"]`)) return null;
    const rawBody = target.getAttribute('data-drop-body');
    const rawIndex = Number(target.getAttribute('data-drop-index'));
    // The arrow points the way the statement is travelling. A card (or a suite) is anchored by its
    // own top edge; the end-of-program surface is not a card, so there the pointer's side of the
    // source card decides. The source card keeps its old place while it is in the air, which is
    // exactly the position the learner is comparing against.
    let direction: 'up' | 'down' = 'down';
    if (press) {
      const source = press.element.getBoundingClientRect();
      const card = target.closest('[data-block-id]');
      const anchorTop = card ? card.getBoundingClientRect().top : null;
      if (anchorTop !== null) direction = anchorTop < source.top - 1 ? 'up' : 'down';
      else direction = y < source.top + source.height / 2 ? 'up' : 'down';
    }
    return {
      bodyId: rawBody ? rawBody : null,
      index: Number.isFinite(rawIndex) ? rawIndex : 0,
      direction,
    };
  };

  const endPress = () => {
    const press = pressRef.current;
    if (press && press.timer !== null) window.clearTimeout(press.timer);
    pressRef.current = null;
    document.removeEventListener('touchmove', touchScrollGuard);
    document.removeEventListener('contextmenu', longPressGuard);
    setPageSelection(false);
    setCardDrag(null);
    setDraggingId(null);
    setDropTarget(null);
  };

  /** The hold completed, or a mouse passed the slop: the card now follows the pointer. */
  const liftCard = () => {
    const press = pressRef.current;
    if (!press || press.started) return;
    press.started = true;
    if (press.timer !== null) window.clearTimeout(press.timer);
    press.timer = null;
    setDraggingId(press.id);
    setCardDrag({ label: KIND_LABELS[press.kind], x: press.x, y: press.y });
    // Capture only once the card is in the air: a tap that captured would retarget its click away
    // from the field under the finger, and a field is how a learner edits a card.
    try {
      press.element.setPointerCapture(press.pointerId);
    } catch {
      // The pointer was released between the move and this line; the press is over anyway.
    }
    // From here a touch is the drag, not the page's scroll. The non-passive `touchmove` guard was
    // attached when the finger went down (see `onCardPointerDown`), because the browser decides at
    // the start of a gesture whether its moves may scroll; it only starts declining now.
    setPageSelection(true);
    // The lift reuses the interface's own vocabulary: a soft row brush, panned to the hand. The
    // sound bus is silent until the learner turns sound on, so this costs no autoplay and no audio
    // code before that choice.
    playUi('row', panFromX(press.x, window.innerWidth));
    navigator.vibrate?.(8);
  };

  /**
   * A press on a card's own surface. Controls opt out with `data-no-drag`; a field is not a control
   * here — a press that does not travel still opens it, and a press that travels moves the card.
   *
   * The card takes pointer capture when the drag lifts, so the moves and the release keep coming to
   * it while the finger is over other statements. Nested cards see the event first and become the
   * press; the outer card then finds a press already in hand and leaves it alone.
   */
  const onCardPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    info: { id: string; kind: BlockKind; bodyId: string | null; index: number }
  ) => {
    if (pressRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button[data-no-drag], input, textarea, select, a, [contenteditable="true"]'))
      return;
    const element = event.currentTarget;
    const press: CardPress = {
      id: info.id,
      kind: info.kind,
      pointerId: event.pointerId,
      element,
      x: event.clientX,
      y: event.clientY,
      started: false,
      timer: null,
    };
    pressRef.current = press;
    if (event.pointerType === 'mouse') {
      // A drag from a card should move the card, not select the token under the pointer.
      setPageSelection(true);
    } else {
      // Both guards go on before the first `touchmove`. A listener attached only after the 320 ms
      // hold would be too late for the gesture's first move: the browser has already decided
      // whether this touch may scroll, so a drag could pan the page under the card instead. They
      // decline their defaults only once the hold has lifted, so a finger that scrolls sooner
      // still scrolls and a long-press menu after a tap still opens.
      document.addEventListener('touchmove', touchScrollGuard, { passive: false });
      document.addEventListener('contextmenu', longPressGuard);
      press.timer = window.setTimeout(() => {
        if (pressRef.current === press) liftCard();
      }, HOLD_MS);
    }
  };

  const onCardPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || event.pointerId !== press.pointerId || event.currentTarget !== press.element)
      return;
    if (!press.started) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < MOVE_SLOP) return;
      // A finger that moves before the hold ends is scrolling the page, not carrying a card.
      if (event.pointerType !== 'mouse') {
        endPress();
        return;
      }
      liftCard();
    }
    setCardDrag({ label: KIND_LABELS[press.kind], x: event.clientX, y: event.clientY });
    setDropTarget(dropPointAt(event.clientX, event.clientY));
  };

  const onCardPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || event.pointerId !== press.pointerId || event.currentTarget !== press.element)
      return;
    const target = press.started ? dropPointAt(event.clientX, event.clientY) : null;
    const moved = press.started;
    const id = press.id;
    const pan = panFromX(event.clientX, window.innerWidth);
    endPress();
    // The snap is only a fact if the model actually moved; a release over the statement's own place
    // is silence, not a click that promises an edit that did not happen.
    const landed = moved && target ? editor.moveTo(id, target.bodyId, target.index) : false;
    if (landed) playUi('chip', pan);
  };

  const onCardPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || event.pointerId !== press.pointerId) return;
    endPress();
  };

  /**
   * The pointer left the card before the hold completed. Only a press that has not lifted ends: a
   * card in the air is captured, and React's enter/leave events still bubble through the card's own
   * children, so leaving a field for the card must not drop what the learner is carrying.
   */
  const onCardPointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.started || event.pointerId !== press.pointerId) return;
    endPress();
  };

  // A card that unmounts mid-press (a reset, a lesson switch) must not leave the page's selection
  // frozen, or a hold armed.
  useEffect(() => () => endPress(), []);

  const handlers: BlockCardHandlers = {
    appearance,
    selectedId: editor.selectedId,
    // The code comes first at every width: five controls per statement are room the workspace would
    // rather spend on the program, so the verbs open on request and every card has its toggle.
    actionsOpenByDefault: false,
    drag: { id: draggingId, target: dropTarget },
    onCardPointerDown,
    onCardPointerMove,
    onCardPointerUp,
    onCardPointerCancel,
    onCardPointerLeave,
    insertionHere: (bodyId, index) =>
      editor.insertion.bodyId === bodyId && editor.insertion.index === index,
    onSelect: editor.select,
    onField: editor.editField,
    onMove: editor.move,
    onDuplicate: editor.duplicate,
    onRemove: editor.remove,
    onInsertInside: (id) => editor.insertAtEnd(id),
  };

  /** A dragged toolbox block landed on a card: insert exactly there, not at the last tap. */
  const onDropItem = (item: ToolboxItem, target: ToolboxDropTarget) => {
    editor.insertAt(target.bodyId, target.index, item.template, item.id);
  };

  /** The block field with the caret, if a field inside this workspace has it. */
  const activeField = (): HTMLInputElement | HTMLTextAreaElement | null => {
    const active = document.activeElement;
    if (
      (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
      rootRef.current?.contains(active)
    ) {
      return active;
    }
    return null;
  };

  /**
   * Write a field the way its own keyboard would.
   *
   * `InlineField` is a controlled input: assigning `.value` directly would be reverted by the next
   * render, and React's value tracker would not see a change at all. The native setter plus an
   * `input` event is the supported route through that tracker, so the draft, the width of the field
   * and the commit on blur all follow a custom-key press exactly as they follow a typed one.
   */
  const writeField = (
    field: HTMLInputElement | HTMLTextAreaElement,
    next: string,
    caret: number
  ) => {
    const prototype =
      field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, next);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.setSelectionRange(caret, caret);
    field.focus();
  };

  const insertIntoField = (text: string) => {
    const field = activeField();
    if (!field) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    writeField(field, field.value.slice(0, start) + text + field.value.slice(end), start + text.length);
  };

  const backspaceField = () => {
    const field = activeField();
    if (!field) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    if (start === end && start === 0) return;
    const from = start === end ? start - 1 : start;
    writeField(field, field.value.slice(0, from) + field.value.slice(end), from);
  };

  /**
   * The keyboard's New statement: one assignment, where the toolbox's first item would go.
   *
   * A statement needs a shape, and the empty workspace's own button already decided what a
   * beginner's first one is. Inserting after the current point is the promise of a "new" line; the
   * `insertAt` clamp keeps a press at the very end of the program from naming an index past it.
   */
  const addStatement = () => {
    const assignment = itemById('assignment');
    if (!assignment) return;
    editor.insertAt(
      editor.insertion.bodyId,
      editor.insertion.index + 1,
      assignment.template,
      assignment.id
    );
  };

  /** A field taking the caret brings the keyboard; the field asks the OS keyboard to stay away. */
  const onFieldFocusIn = (event: ReactFocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (keyboardMode !== 'native') target.setAttribute('inputmode', 'none');
    onFieldFocus?.();
    // The keyboard takes the bottom third of the screen. Centring the field after it opens keeps
    // the word being edited above the keys instead of under them; the document scroll also folds
    // the phone's tall top chrome, which is what makes the band tall enough.
    window.setTimeout(() => {
      if (!target.isConnected) return;
      target.scrollIntoView({ block: 'center' });
    }, 60);
  };

  /**
   * The caret left a field. The check is deferred by one task because a tap on another field fires
   * the old field's blur before the new field's focus; if a field is still active then, the keyboard
   * should stay, and only a tap on a card or the workspace closes it.
   */
  const onFieldFocusOut = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) return;
    window.setTimeout(() => {
      if (activeField()) return;
      onFieldBlur?.();
    }, 0);
  };

  /** Follow the shared keyboard's mode on the field that has the caret. */
  useEffect(() => {
    const field = activeField();
    if (!field) return;
    if (keyboardMode === 'custom') {
      field.setAttribute('inputmode', 'none');
      return;
    }
    field.removeAttribute('inputmode');
  }, [keyboardMode]);

  useImperativeHandle(ref, () => ({
    insertText: insertIntoField,
    backspace: backspaceField,
    indent: () => editor.nest(editor.selectedId),
    dedent: () => editor.unnest(editor.selectedId),
    newStatement: addStatement,
    insertTab: () => insertIntoField('    '),
    undo: editor.undo,
    redo: editor.redo,
    duplicate: () => {
      if (editor.selectedId) editor.duplicate(editor.selectedId);
    },
    deleteSelected: () => {
      if (editor.selectedId) editor.remove(editor.selectedId);
    },
    focusField: () => activeField()?.focus(),
    blurField: () => activeField()?.blur(),
    openNativeKeyboard: () => {
      const field = activeField();
      if (!field) return;
      // The field's blur is allowed to pass without committing this once: otherwise the input would
      // unmount before the focus that raises the OS keyboard. `InlineField` reads the flag.
      field.dataset.nativeKeyboard = '1';
      field.removeAttribute('inputmode');
      field.blur();
      field.focus();
      delete field.dataset.nativeKeyboard;
    },
  }));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const target = event.target as HTMLElement;
    // Inside a field, the browser's own text undo is the one the learner expects.
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    } else if (key === 'y') {
      event.preventDefault();
      editor.redo();
    }
  };

  const rootInsertion =
    editor.insertion.bodyId === null &&
    editor.insertion.index === editor.program.nodes.length &&
    editor.program.nodes.length > 0;

  return (
    <div
      ref={rootRef}
      data-testid="python-block-editor"
      data-appearance={appearance}
      onKeyDown={onKeyDown}
      onFocusCapture={onFieldFocusIn}
      onBlurCapture={onFieldFocusOut}
      className="flex min-w-0 flex-col bg-panel"
    >
      {/* Phone budget: this bar is above the code a learner came for, so it is one compact row
          there — tighter padding, no sentence, a smaller count — and the full bar from `sm` up. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-line-soft bg-canvas px-1.5 py-1 sm:gap-x-2 sm:px-2 sm:py-1.5">
        <p className="hidden min-w-0 flex-1 items-center gap-1 text-[11px] leading-snug text-muted sm:flex">
          <Blocks className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0">
            Blocks write <code>main.py</code> — the same program Run executes.
          </span>
        </p>

        <div
          role="group"
          aria-label="Block appearance"
          data-testid="block-appearance"
          className="flex shrink-0 rounded-lg border border-line-soft bg-panel p-0.5"
        >
          {(Object.keys(APPEARANCE_LABELS) as BlockAppearance[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={appearance === option}
              data-testid={`block-appearance-${option}`}
              title={
                option === 'normal'
                  ? 'Neutral cards with subtle borders'
                  : 'Semantic colours for each kind of statement'
              }
              onClick={() => chooseAppearance(option)}
              className={`min-h-6 cursor-pointer rounded-md px-1.5 font-mono text-[11px] transition-colors sm:min-h-7 sm:px-2 sm:text-[11.5px] ${
                appearance === option
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'text-muted hover:text-body'
              }`}
            >
              {APPEARANCE_LABELS[option]}
            </button>
          ))}
        </div>

        <span
          role="status"
          data-testid="block-count"
          className="shrink-0 font-mono text-[10.5px] tabular-nums text-faint sm:text-[11px]"
        >
          {count}
          <span className="hidden sm:inline"> {count === 1 ? 'statement' : 'statements'}</span>
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            data-testid="block-undo"
            aria-label="Undo the last block edit"
            title="Undo (⌘Z)"
            disabled={!editor.canUndo}
            onClick={editor.undo}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-line-soft bg-panel text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-default disabled:opacity-40 sm:h-7 sm:w-7"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="block-redo"
            aria-label="Redo the last block edit"
            title="Redo (⇧⌘Z)"
            disabled={!editor.canRedo}
            onClick={editor.redo}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-line-soft bg-panel text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-default disabled:opacity-40 sm:h-7 sm:w-7"
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* The workspace is a drop surface too: a block released past the last card goes to the end.
          On a phone the bottom padding keeps the last statement scrollable above the dock. */}
      <div
        data-testid="python-workspace"
        data-drop-body=""
        data-drop-index={editor.program.nodes.length}
        className={`min-w-0 px-2 py-2 ${isPhone ? 'pb-[42vh]' : ''}`}
      >
        {editor.program.nodes.length === 0 ? (
          <div
            data-testid="python-workspace-empty"
            className="rounded-lg border border-dashed border-line bg-canvas px-3 py-4 text-center"
          >
            <p className="m-0 text-[13px] font-semibold text-body">No statements yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-snug text-muted">
              Add one from the Python Toolbox below, or start with an assignment.
            </p>
            <button
              type="button"
              data-testid="block-add-first"
              onClick={() => {
                const assignment = itemById('assignment');
                if (assignment) editor.insert(assignment.template, assignment.id);
              }}
              className="mt-2 min-h-8 cursor-pointer rounded-lg border border-accent/40 bg-accent-soft px-2.5 font-mono text-[12px] font-semibold text-accent transition-colors hover:border-accent"
            >
              Add <code>name = &quot;Alex&quot;</code>
            </button>
          </div>
        ) : (
          <ol
            data-testid="python-workspace-list"
            aria-label="Python statements"
            className="m-0 flex list-none flex-col gap-1 p-0"
          >
            {editor.program.nodes.map((node, index) => (
              <BlockCard
                key={node.id}
                node={node}
                bodyId={null}
                index={index}
                position={String(index + 1)}
                handlers={handlers}
              />
            ))}
          </ol>
        )}

        {rootInsertion && (
          <div
            aria-hidden="true"
            data-testid="block-insertion"
            className="mx-1 mt-1 h-0.5 rounded bg-accent"
          />
        )}

        <button
          type="button"
          data-testid="block-add-statement"
          onClick={() => editor.insertAtEnd(null)}
          className="mt-1.5 flex min-h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-line px-2 font-mono text-[12px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
        >
          + Add statement
        </button>
      </div>

      {cardDrag && (
        <div
          aria-hidden="true"
          data-testid="block-drag-ghost"
          // The chip rides just above the pointer, not under it: at the bottom edge of a card the
          // pointer is exactly where the snap arrow is drawn, and a centred chip would paint over
          // the one mark that says where the block will land.
          className="pointer-events-none fixed z-50 rounded-lg border border-accent bg-panel px-2 py-1 font-mono text-[11px] font-semibold text-accent shadow-lg"
          style={{
            left: cardDrag.x,
            top: cardDrag.y,
            transform: 'translate(-50%, calc(-100% - 14px))',
          }}
        >
          {cardDrag.label}
        </div>
      )}

      <PythonToolbox
        onInsert={(item) => editor.insert(item.template, item.id)}
        onDropItem={onDropItem}
        // A toolbox element has no old place to travel from, so its arrow keeps pointing down into
        // the gap it will fill.
        onDragTargetChange={(target) =>
          setDropTarget(target ? { ...target, direction: 'down' } : null)
        }
        appearance={appearance}
        // While the shared keyboard is up it owns the bottom of the screen; the dock would only
        // leave its grabber peeking above the keys. Tapping a card (or Done) brings the dock back.
        dock={isPhone && keyboardMode === 'off'}
        recent={editor.recent}
      />
    </div>
  );
});

function countStatements(nodes: readonly BlockNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countStatements(node.body), 0);
}
