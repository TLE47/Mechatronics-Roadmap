import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline, X } from 'lucide-react';
import type { WorkflowNode } from '../../workflow.ts';

/**
 * The card-text toolbar (`components/workflow/WorkflowTextToolbar.tsx`).
 *
 * A learner selects words in a card's title or detail, then right-clicks: the browser's menu would
 * offer Copy and Paste, neither of which changes the diagram. This small overlay replaces it with
 * the formatting the card can actually keep — bold, italic, underline and alignment.
 *
 * It applies to the whole card, because a card's words are one plain-text field rather than a rich
 * document. That is a deliberate boundary: the field stays searchable, exportable and copyable as
 * plain text, while the learner still gets the visual emphasis a diagram needs.
 *
 * **Where it sits is a decision, not a pointer offset.** The toolbar belongs to the field it
 * formats, so it is placed against that field's rect: above when there is room, below when the field
 * is near the top of the window, and beside the card when the card itself runs past the bottom of a
 * short window — below there would sit on the card's own next line. A toolbar floating at the
 * pointer covered the words the learner had just selected, which is the one thing it must not do.
 *
 * Wrapping is not here: a card's wrap is toggled by right-clicking the card itself, so the toolbar
 * carries only the formatting a text selection asks for.
 */

/** A viewport rect captured when the menu opened: the field's, or its card's for the side fit. */
export interface TextAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type ToolbarPlacement = 'above' | 'below' | 'side';

export interface WorkflowTextToolbarProps {
  node: WorkflowNode;
  anchor: TextAnchor;
  /** The field's whole card, when it is known: a card taller than the window changes the fit. */
  card?: TextAnchor | null;
  onApply: (patch: Partial<WorkflowNode>) => void;
  onClose: () => void;
}

const GAP = 8;
const EDGE = 8;

/**
 * Where the toolbar fits around its field: above, else below, else beside.
 *
 * Pure and exported so the rule can be read without a browser. `card` is the field's whole card: a
 * card that runs past the bottom of the window has no room for a bar below the field without
 * covering the card's own next line, so the bar goes beside the card — aligned with the field — as
 * soon as one side has room. Without a card, or when the card fits, above/below decides first.
 */
export function toolbarPlacement(
  anchor: TextAnchor,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  card?: TextAnchor | null
): { left: number; top: number; placement: ToolbarPlacement } {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const left = clamp(
    anchor.left + anchor.width / 2 - size.width / 2,
    EDGE,
    Math.max(EDGE, viewport.width - size.width - EDGE)
  );
  const above = anchor.top - size.height - GAP;
  if (above >= EDGE) return { left, top: above, placement: 'above' };

  // The card's edge is the side the bar sits on, so it clears the whole card rather than only the
  // field inside it; the field still decides the bar's vertical centre.
  const sideEdgeLeft = card?.left ?? anchor.left;
  const sideEdgeRight = card?.right ?? anchor.right;
  const sideRight = sideEdgeRight + GAP + size.width <= viewport.width - EDGE;
  const sideLeft = sideEdgeLeft - GAP - size.width >= EDGE;
  const side = () => ({
    left: clamp(
      sideRight ? sideEdgeRight + GAP : sideEdgeLeft - size.width - GAP,
      EDGE,
      Math.max(EDGE, viewport.width - size.width - EDGE)
    ),
    top: clamp(
      anchor.top + anchor.height / 2 - size.height / 2,
      EDGE,
      Math.max(EDGE, viewport.height - size.height - EDGE)
    ),
    placement: 'side' as const,
  });

  // A card taller than the window: a bar below the field would sit on the card's next line.
  if (card && card.bottom > viewport.height - EDGE && (sideRight || sideLeft)) return side();

  const below = anchor.bottom + GAP;
  if (below + size.height <= viewport.height - EDGE) return { left, top: below, placement: 'below' };
  return side();
}

export function WorkflowTextToolbar({ node, anchor, card = null, onApply, onClose }: WorkflowTextToolbarProps) {
  const toggle = (field: 'bold' | 'italic' | 'underline') =>
    onApply({ [field]: node[field] ? undefined : true });
  const barRef = useRef<HTMLDivElement | null>(null);
  // Placed only after it has been measured: painting it at the corner for one frame and then
  // jumping to the field is worse than not painting it at all.
  const [at, setAt] = useState<{ left: number; top: number; placement: ToolbarPlacement } | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const box = bar.getBoundingClientRect();
    setAt(
      toolbarPlacement(
        anchor,
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
        card
      )
    );
  }, [anchor, card]);

  // A press anywhere else closes the toolbar. This is a document listener rather than a
  // full-screen backdrop: a backdrop is a second element that swallows the very click that was
  // meant to dismiss the bar, so the press a learner uses to close it is a press they lose — and a
  // driver that refuses to click an intercepted element waits forever. The listener does not stop
  // the press, so the control under it still receives its own click.
  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      const bar = barRef.current;
      if (bar && !bar.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPress, true);
    return () => document.removeEventListener('pointerdown', onPress, true);
  }, [onClose]);

  return (
    <div
      ref={barRef}
        data-testid="workflow-text-toolbar"
        data-placement={at?.placement ?? 'above'}
        role="toolbar"
        aria-label="Format the selected card text"
        style={{
          left: at?.left ?? EDGE,
          top: at?.top ?? EDGE,
          visibility: at ? 'visible' : 'hidden',
        }}
        className="fixed z-[70] flex items-center gap-0.5 rounded-lg border border-line bg-panel p-1 shadow-xl"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <span className="px-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">Text</span>
        <button
          type="button"
          data-testid="workflow-format-bold"
          aria-label="Bold card text"
          aria-pressed={Boolean(node.bold)}
          onClick={() => toggle('bold')}
          className={`grid h-7 w-7 cursor-pointer place-items-center rounded ${node.bold ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise'}`}
        >
          <Bold className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="workflow-format-italic"
          aria-label="Italic card text"
          aria-pressed={Boolean(node.italic)}
          onClick={() => toggle('italic')}
          className={`grid h-7 w-7 cursor-pointer place-items-center rounded ${node.italic ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise'}`}
        >
          <Italic className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="workflow-format-underline"
          aria-label="Underline card text"
          aria-pressed={Boolean(node.underline)}
          onClick={() => toggle('underline')}
          className={`grid h-7 w-7 cursor-pointer place-items-center rounded ${node.underline ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise'}`}
        >
          <Underline className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line" />
        {(
          [
            ['left', AlignLeft],
            ['center', AlignCenter],
            ['right', AlignRight],
          ] as const
        ).map(([align, Icon]) => (
          <button
            key={align}
            type="button"
            data-testid={`workflow-format-align-${align}`}
            aria-label={`Align card text ${align}`}
            aria-pressed={(node.align ?? 'left') === align}
            onClick={() => onApply({ align: align === 'left' ? undefined : align })}
            className={`grid h-7 w-7 cursor-pointer place-items-center rounded ${(node.align ?? 'left') === align ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise'}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ))}
        <button
          type="button"
          aria-label="Close the text toolbar"
          onClick={onClose}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded text-faint hover:bg-raise hover:text-body"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
    </div>
  );
}
