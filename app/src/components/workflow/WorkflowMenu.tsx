import {
  KIND_META,
  STEPS_BY_MODE,
  type CardColor,
  type StepKind,
  type WorkflowDoc,
  type WorkflowNode,
} from '../../workflow.ts';
import { CardSwatches } from './CardSwatches.tsx';

/**
 * The canvas's press menu (`components/workflow/WorkflowMenu.tsx`).
 *
 * One list of actions, anchored where the pointer was: the canvas's second way to add a card, and
 * the shortest path to a frame's, a lane's or an arrow's own action without hunting for its small
 * control. It opens from the keyboard too (Shift+F10 or the Menu key on the paper).
 *
 * It is not a dialog: nothing blocks the diagram for longer than the menu itself. The first item
 * takes focus, Tab walks the list, Escape closes it, and a press anywhere else lands on the thin
 * backdrop first — so the press that dismisses the menu never also pans the paper underneath.
 *
 * Closing always returns the caret to the paper, whichever way it closes. Focus leaving the list is
 * itself a close: a Tab past the last item, or a press on the backdrop, leaves the keyboard where
 * the next Shift+F10 can be pressed instead of on an element that no longer exists.
 *
 * The list itself is the only place that knows what a press means for a workflow: empty paper
 * offers the palette's cards at the pressed point and the clip waiting to be pasted, a card adds its
 * colour row and its Copy/Cut/Remove, and any other drawn part offers the one action its own small
 * control already has. The canvas resolves the part, so nothing here tells a card from a lane, and
 * editing a card's words or an arrow's kind stays one press on the thing itself rather than a second
 * way to say it.
 */

export interface WorkflowMenuRequest {
  /** Viewport coordinates of the press, so the menu opens under the pointer. */
  x: number;
  y: number;
  /** Bare paper: the canvas point a new card lands on. */
  at?: { x: number; y: number };
  /** A drawn element: the one action its own small control also offers. */
  remove?: () => void;
  /** A card or a bar: its fill, and the clipboard items that only make sense on one card. */
  node?: WorkflowNode;
  onFill?: (fill: CardColor | undefined) => void;
  onCopy?: () => void;
  onCut?: () => void;
  /** Bare paper with a clip in hand: paste it at the pressed point. */
  onPaste?: () => void;
  /**
   * A drag from a dot released on bare paper: the same palette list, but every choice is the card
   * the arrow was heading for. No position and no Paste — the arrow already named where it goes.
   */
  onPickKind?: (kind: StepKind) => void;
}

export function WorkflowMenu({
  request,
  doc,
  onAdd,
  onClose,
}: {
  request: WorkflowMenuRequest;
  doc: WorkflowDoc;
  onAdd: (kind: StepKind, at: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  const { x, y, at, node, remove, onFill, onCopy, onCut, onPaste, onPickKind } = request;
  const items = node
    ? [
        ...(onCopy ? [{ label: 'Copy', onPick: onCopy }] : []),
        ...(onCut ? [{ label: 'Cut', onPick: onCut }] : []),
        ...(remove ? [{ label: 'Remove', onPick: remove }] : []),
      ]
    : remove
      ? [{ label: 'Remove', onPick: remove }]
      : at || onPickKind
        ? [
            ...(onPaste && at ? [{ label: 'Paste', onPick: onPaste }] : []),
            ...STEPS_BY_MODE[doc.mode].map((kind) => ({
              label: KIND_META[kind].label,
              onPick: () => (onPickKind ? onPickKind(kind) : onAdd(kind, at!)),
            })),
          ]
        : [];
  // The colour row is a row of its own, above the buttons, and only a card has one.
  const rows = items.length * 32 + (node && onFill ? 32 : 0) + 12;
  const close = () => {
    onClose();
    document.querySelector<HTMLElement>('[data-testid=workflow-canvas]')?.focus();
  };
  return (
    <>
      {/* The press dismisses the menu; its default focus move would land on whatever is under
          the backdrop, so it is cancelled and the caret goes back to the paper instead. */}
      <div
        className="fixed inset-0 z-[59]"
        onPointerDown={(event) => {
          event.preventDefault();
          close();
        }}
      />
      <div
        data-testid="workflow-menu"
        aria-label={onPickKind ? 'Card to link the arrow to' : 'Canvas actions'}
        style={{
          // Clamped so a menu opened at the edge does not hang off the viewport.
          left: Math.min(x, innerWidth - 208),
          top: Math.min(y, innerHeight - rows),
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          // Escape leaves the menu, not the full screen the menu is drawn in.
          event.stopPropagation();
          close();
        }}
        onBlur={(event) => {
          // Focus left the list — a Tab past the last item, or a press on the backdrop.
          if (!event.currentTarget.contains(event.relatedTarget as Node)) close();
        }}
        className="fixed z-[60] w-52 rounded-lg border border-line bg-panel p-1 shadow-xl"
      >
        {node && onFill && (
          <CardSwatches
            label="Fill"
            field="fill"
            value={node.fill}
            prefix="workflow-menu"
            onPick={(fill) => {
              close();
              onFill(fill);
            }}
          />
        )}
        {items.map((item, index) => (
          <button
            key={index}
            type="button"
            autoFocus={index === 0}
            onClick={() => {
              close();
              item.onPick();
            }}
            className="btn btn-ghost h-8 w-full justify-start px-1.5"
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

