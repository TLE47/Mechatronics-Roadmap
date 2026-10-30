import { useEffect, useMemo } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { socketKinds } from '../workflow.ts';
import type {
  WorkflowDoc,
  WorkflowEdgeType,
  WorkflowIssue,
  WorkflowNode,
  WorkflowSide,
  PortKind,
} from '../workflow.ts';
import { cardsWithin, groupRect } from './workflow/canvasGeometry.ts';
import { WorkflowEdges } from './workflow/WorkflowEdges.tsx';
import { WorkflowGroupFrame } from './workflow/WorkflowGroupFrame.tsx';
import { WorkflowNodeCard } from './workflow/WorkflowNodeCard.tsx';
import { useLinking } from './workflow/useLinking.ts';
import { useMarquee } from './workflow/useMarquee.ts';
import { useNodeDrag, type NodeMove } from './workflow/useNodeDrag.ts';
import { useNodeHeights } from './workflow/useNodeHeights.ts';
import { useViewport } from './workflow/useViewport.ts';

/**
 * The workflow canvas (`components/WorkflowCanvas.tsx`).
 *
 * The tab used to be a list, and a list cannot show a branch that goes back, two paths that meet, or
 * the shape a learner actually has in mind. This draws the graph: cards on a dotted grid, dragged by
 * their header, arrows drawn between any of their four connection dots.
 *
 * This file is the surface and the composition. The pieces that keep it readable alone live beside
 * it in `components/workflow/`:
 *
 * - `canvasGeometry.ts` — where a dot sits, how an arrow bends, which side faces a source. Pure.
 * - `useViewport.ts` — the lens: view scale, fit/100%, scrolled offset, drag-pan and arrow-key pan.
 * - `useNodeDrag.ts` — a card's or a frame's drag, held in pixels until release.
 * - `useMarquee.ts` — the armed box that turns a drag on paper into a frame around cards.
 * - `useLinking.ts` — the arrow being drawn: drag-dot-to-dot, or tap-then-tap.
 * - `useNodeHeights.ts` — the measured card heights the four dots need.
 * - `WorkflowNodeCard.tsx` — one editable card and its four ports.
 * - `WorkflowGroupFrame.tsx` — one named frame and its chip.
 * - `WorkflowEdges.tsx` — the paths, the arrowheads, the dashed preview and each edge's controls.
 *
 * Three rules the interaction keeps:
 *
 * 1. **The document is the parent's.** A drag reports a position once, on release; a keystroke
 *    reports a patch; an arrow reports an `onConnect`. Nothing is kept here except the pixels of a
 *    drag in progress and the lens, so a reload or a lesson switch can never leave two versions of
 *    one card.
 * 2. **A card is editable where it sits.** Title, detail and unit are always inputs on the card — no
 *    edit mode to enter, and no second form that can drift from what the card shows.
 * 3. **Two ways to draw an arrow.** Drag from one dot to another (a mouse), or tap the first then
 *    the second (a phone, or an unsteady hand). Escape, or a tap on empty grid, cancels.
 *
 * Cards are laid out in canvas pixels, and the grid grows with the furthest card, so a learner can
 * drag right and down rather than being boxed into a first screenful. The surface scrolls; the page
 * never does.
 */

export interface WorkflowCanvasProps {
  doc: WorkflowDoc;
  /** Each card's place in the one reading order — the number the checklist also says. */
  numbers: Map<string, number>;
  /** The first open issue per card, from the panel's single validation pass. */
  issueByStep: Map<string, WorkflowIssue>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onUpdate: (id: string, patch: Partial<WorkflowNode>) => void;
  onRemove: (id: string) => void;
  onConnect: (
    from: string,
    to: string,
    fromSide: WorkflowSide,
    toSide: WorkflowSide,
    fromPort: PortKind | null,
    toPort: PortKind | null
  ) => void;
  onDisconnect: (edgeId: string) => void;
  /** The arrow whose kind palette is open, if any. */
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
  onEdgeType: (edgeId: string, type: WorkflowEdgeType) => void;
  onEdgeLabel: (edgeId: string, label: string) => void;
  onEdgeGuard: (edgeId: string, guard: string) => void;
  onEdgePort: (edgeId: string, end: 'from' | 'to', kind: PortKind | null) => void;
  /** A frame drag reports every member at once, so one release is one document write. */
  onMoveMany: (moves: NodeMove[]) => void;
  /** Whether the next drag on paper draws a frame instead of panning. */
  grouping: boolean;
  onGroupCards: (nodeIds: string[]) => void;
  /** Frames are named and removed by their place in the document, not by a stored key. */
  onRenameGroup: (index: number, title: string) => void;
  onRemoveGroup: (index: number) => void;
}

export function WorkflowCanvas({
  doc,
  numbers,
  issueByStep,
  selectedId,
  onSelect,
  onMove,
  onUpdate,
  onRemove,
  onConnect,
  onDisconnect,
  selectedEdgeId,
  onSelectEdge,
  onEdgeType,
  onEdgeLabel,
  onEdgeGuard,
  onEdgePort,
  onMoveMany,
  grouping,
  onGroupCards,
  onRenameGroup,
  onRemoveGroup,
}: WorkflowCanvasProps) {
  const byId = useMemo(() => new Map(doc.nodes.map((node) => [node.id, node])), [doc.nodes]);
  // Which socket each dot has become, once per document: the cards read it, and no card can hold a
  // second copy of what the arrows already say.
  const sockets = useMemo(() => socketKinds(doc), [doc]);
  const nodeIds = useMemo(() => doc.nodes.map((node) => node.id).join('\u0000'), [doc.nodes]);

  const viewport = useViewport(doc.nodes, onSelect);
  const heights = useNodeHeights(viewport.gridRef, nodeIds);
  const drag = useNodeDrag({ toCanvas: viewport.toCanvas, onMoveMany, onSelect });

  // A frame is drawn from the cards it holds, at the position they are at right now: mid-drag, the
  // box follows its members instead of snapping back at release.
  const shown = useMemo(
    () =>
      drag.live
        ? doc.nodes.map((node) => {
            const live = drag.live?.get(node.id);
            return live ? { ...node, ...live } : node;
          })
        : doc.nodes,
    [doc.nodes, drag.live]
  );
  const frames = useMemo(
    () =>
      (doc.groups ?? []).flatMap((group, index) => {
        const members = shown.filter((node) => group.nodeIds.includes(node.id));
        const rect = groupRect(members, heights);
        return rect ? [{ group, index, rect, members }] : [];
      }),
    [doc.groups, shown, heights]
  );

  const marquee = useMarquee({
    toCanvas: viewport.toCanvas,
    onDone: (rect) => onGroupCards(cardsWithin(rect, shown, heights)),
  });

  const linking = useLinking({
    toCanvas: viewport.toCanvas,
    byId,
    heights,
    onConnect,
    onSelect,
  });

  // An issue pressed in the checklist names a card; bring that card into view instead of trusting
  // that the learner can guess which one it is.
  useEffect(() => {
    if (!selectedId) return;
    const surface = viewport.surfaceRef.current;
    const card = surface?.querySelector(`[data-node-id="${CSS.escape(selectedId)}"]`);
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  return (
    <div className="relative mt-2 flex min-h-0 flex-1 flex-col">
      <div
        ref={viewport.surfaceRef}
        data-testid="workflow-canvas"
        // Capture first: armed, or with Shift held, a drag on paper draws a frame — including over
        // an existing frame, whose own press would otherwise start moving it. Otherwise: pan.
        onPointerDownCapture={(event) => {
          if ((grouping || event.shiftKey) && marquee.start(event)) event.stopPropagation();
        }}
        onPointerDown={(event) => viewport.startPan(event)}
        onPointerMove={marquee.move}
        onPointerUp={marquee.finish}
        onPointerCancel={marquee.finish}
        onKeyDown={viewport.panWithKeys}
        tabIndex={0}
        role="group"
        aria-label="Workflow canvas. Arrow keys pan it; drag a card by its header to move the card."
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        // The 70 vh cap is what makes this a canvas rather than a growing page: a 24-card flow on a
        // phone scrolls inside the pane instead of turning the lesson into a four-thousand-pixel
        // document.
        className={`relative min-h-[280px] max-h-[70vh] flex-1 overflow-auto overscroll-contain rounded-lg border border-line-soft bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          viewport.panning ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
        style={{
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      >
        {/* The spacer reserves the scaled grid's extent; the grid itself keeps canvas coordinates. */}
        <div
          style={{
            width: Math.ceil(viewport.extents.width * viewport.scale),
            height: Math.ceil(viewport.extents.height * viewport.scale),
          }}
        >
          <div
            ref={viewport.gridRef}
            data-testid="workflow-canvas-grid"
            className="relative"
            style={{
              width: viewport.extents.width,
              height: viewport.extents.height,
              transform: `scale(${viewport.scale})`,
              transformOrigin: '0 0',
            }}
          >
            {frames.map(({ group, index, rect, members }) => (
              <WorkflowGroupFrame
                key={index}
                group={group}
                index={index}
                rect={rect}
                members={members}
                onRename={onRenameGroup}
                onRemove={onRemoveGroup}
                onDragStart={drag.startDrag}
              />
            ))}

            <WorkflowEdges
              doc={doc}
              byId={byId}
              heights={heights}
              extents={viewport.extents}
              linking={linking.linking}
              cursor={linking.cursor}
              selectedEdgeId={selectedEdgeId}
              onSelectEdge={onSelectEdge}
              onDisconnect={onDisconnect}
              onEdgeType={onEdgeType}
              onEdgeLabel={onEdgeLabel}
              onEdgeGuard={onEdgeGuard}
              onEdgePort={onEdgePort}
            />

            {doc.nodes.map((node, index) => (
              <WorkflowNodeCard
                key={node.id}
                node={node}
                index={index}
                number={numbers.get(node.id) ?? index + 1}
                issue={issueByStep.get(node.id)}
                selected={selectedId === node.id}
                position={drag.live?.get(node.id) ?? { x: node.x, y: node.y }}
                dragging={Boolean(drag.dragIds?.includes(node.id))}
                linking={linking.linking}
                sockets={sockets.get(node.id)}
                onSelect={onSelect}
                onMove={onMove}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onDragStart={drag.startDrag}
                onLinkStart={linking.startLink}
                onLinkLand={linking.landOnCard}
              />
            ))}

            {marquee.rect && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-40 rounded border border-dashed border-accent bg-accent/10"
                style={{
                  left: marquee.rect.x,
                  top: marquee.rect.y,
                  width: marquee.rect.width,
                  height: marquee.rect.height,
                }}
              />
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        data-testid="workflow-fit"
        onClick={viewport.fitOrReset}
        aria-label={viewport.scale < 1 ? 'Back to 100% zoom' : 'Fit the whole flow in the canvas'}
        title={viewport.scale < 1 ? 'Back to 100%' : 'Fit the whole flow in the canvas'}
        className="absolute right-2 top-2 z-30 flex min-h-9 items-center gap-1 rounded-md border border-line bg-panel/95 px-2 font-mono text-[10.5px] text-muted shadow-sm hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        {viewport.scale < 1 ? (
          <Minimize2 className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
        )}
        {viewport.scale < 1 ? '100%' : 'Fit'}
      </button>
    </div>
  );
}
