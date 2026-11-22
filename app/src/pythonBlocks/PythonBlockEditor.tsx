import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Blocks, Redo2, Undo2 } from 'lucide-react';
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
export function PythonBlockEditor({
  code,
  onCode,
  active = true,
  isPhone = false,
}: {
  code: string;
  onCode: (next: string) => void;
  /** False while Python Code is the face on screen; the model then waits for the next switch. */
  active?: boolean;
  /** The phone's dock: the toolbox is pinned under the code instead of ending the workspace. */
  isPhone?: boolean;
}) {
  const editor = useBlockEditor(code, onCode, active);
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
  const [dropTarget, setDropTarget] = useState<InsertionPoint | null>(null);
  const pressRef = useRef<CardPress | null>(null);

  /**
   * The drop point under a pointer, read from the targets the cards publish.
   *
   * The dragged card is not a target for itself: while the finger is still over the statement's old
   * place, `elementFromPoint` finds that statement, and "drop after itself" is a no-op the highlight
   * should not promise. A suite's body is a deeper target than its card, so dropping over a loop's
   * inside lands inside it.
   */
  const dropPointAt = (x: number, y: number): InsertionPoint | null => {
    const under = document.elementFromPoint(x, y);
    const target = under?.closest('[data-drop-body]') as HTMLElement | null;
    if (!target) return null;
    const dragged = pressRef.current?.id;
    if (dragged && target.closest(`[data-block-id="${dragged}"]`)) return null;
    const rawBody = target.getAttribute('data-drop-body');
    const rawIndex = Number(target.getAttribute('data-drop-index'));
    return { bodyId: rawBody ? rawBody : null, index: Number.isFinite(rawIndex) ? rawIndex : 0 };
  };

  const endPress = () => {
    const press = pressRef.current;
    if (press && press.timer !== null) window.clearTimeout(press.timer);
    pressRef.current = null;
    document.removeEventListener('touchmove', stopTouchScroll);
    document.body.style.userSelect = '';
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
    // From here a touch is the drag, not the page's scroll. The listener is non-passive on purpose:
    // once a long press has lifted a card, the browser must not take the next move as a scroll.
    document.addEventListener('touchmove', stopTouchScroll, { passive: false });
    document.body.style.userSelect = 'none';
    navigator.vibrate?.(8);
  };

  const stopTouchScroll = (event: TouchEvent) => {
    if (pressRef.current?.started) event.preventDefault();
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
      document.body.style.userSelect = 'none';
    } else {
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
    endPress();
    if (moved && target) editor.moveTo(id, target.bodyId, target.index);
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
      data-testid="python-block-editor"
      data-appearance={appearance}
      onKeyDown={onKeyDown}
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
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-accent bg-panel px-2 py-1 font-mono text-[11px] font-semibold text-accent shadow-lg"
          style={{ left: cardDrag.x, top: cardDrag.y }}
        >
          {cardDrag.label}
        </div>
      )}

      <PythonToolbox
        onInsert={(item) => editor.insert(item.template, item.id)}
        onDropItem={onDropItem}
        onDragTargetChange={setDropTarget}
        appearance={appearance}
        dock={isPhone}
        recent={editor.recent}
      />
    </div>
  );
}

function countStatements(nodes: readonly BlockNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countStatements(node.body), 0);
}
