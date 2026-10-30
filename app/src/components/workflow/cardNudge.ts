import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MAX_NODE_COORD, type WorkflowNode } from '../../workflow.ts';
import { clamp } from './canvasGeometry.ts';

/**
 * Arrow-key movement shared by a card and a fork/join bar (`components/workflow/cardNudge.ts`).
 *
 * Both are the same document object with a different plate, so the keyboard step and the clamp
 * live once: 8 px a press, 32 with Shift, and never past the canvas's own bound.
 */
const NUDGE = 8;
const NUDGE_FAST = 32;

export function nudgeCard(
  event: ReactKeyboardEvent,
  node: WorkflowNode,
  onMove: (id: string, x: number, y: number) => void,
  onSelect: (id: string) => void
): void {
  const step = event.shiftKey ? NUDGE_FAST : NUDGE;
  const delta =
    event.key === 'ArrowLeft'
      ? { x: -step, y: 0 }
      : event.key === 'ArrowRight'
        ? { x: step, y: 0 }
        : event.key === 'ArrowUp'
          ? { x: 0, y: -step }
          : event.key === 'ArrowDown'
            ? { x: 0, y: step }
            : null;
  if (!delta) return;
  event.preventDefault();
  onMove(
    node.id,
    clamp(node.x + delta.x, 0, MAX_NODE_COORD),
    clamp(node.y + delta.y, 0, MAX_NODE_COORD)
  );
  onSelect(node.id);
}
