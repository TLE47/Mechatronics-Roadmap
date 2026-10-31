import { useEffect, useMemo } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { socketKinds } from '../workflow.ts';
import { isForkJoin } from '../workflowProcesses.ts';
import type {
  EdgeRoute,
  WorkflowDoc,
  WorkflowEdgeType,
  WorkflowIssue,
  WorkflowNode,
  WorkflowSide,
  PortKind,
} from '../workflow.ts';
import { cardsWithin, groupRect, laneRect } from './workflow/canvasGeometry.ts';
import { WorkflowEdges } from './workflow/WorkflowEdges.tsx';
import { WorkflowForkJoinCard } from './workflow/WorkflowForkJoinCard.tsx';
import { WorkflowGroupFrame } from './workflow/WorkflowGroupFrame.tsx';
import { WorkflowLaneBand } from './workflow/WorkflowLaneBand.tsx';
import { WorkflowNodeCard } from './workflow/WorkflowNodeCard.tsx';
import type { WorkflowMenuRequest } from './workflow/WorkflowMenu.tsx';
import { useLinking, type LinkDraft } from './workflow/useLinking.ts';
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
  onOpenLesson: (lesson: string) => void;
  onConnect: (
    from: string,
    to: string,
    fromSide: WorkflowSide,
    toSide: WorkflowSide,
    fromPort: PortKind | null,
    toPort: PortKind | null
  ) => void;
  onDisconnect: (edgeId: string) => void;
  /** A drag that left a dot and ended on bare paper: the panel makes the card there and links it. */
  onDropLink: (
    draft: LinkDraft,
    at: { x: number; y: number },
    client: { x: number; y: number },
    picker: boolean
  ) => void;
  /** The arrow whose kind palette is open, if any. */
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
  onEdgeType: (edgeId: string, type: WorkflowEdgeType) => void;
  onEdgeLabel: (edgeId: string, label: string) => void;
  onEdgeGuard: (edgeId: string, guard: string) => void;
  onEdgePort: (edgeId: string, end: 'from' | 'to', kind: PortKind | null) => void;
  onEdgeRoute: (edgeId: string, route: EdgeRoute) => void;
  /** A frame drag reports every member at once, so one release is one document write. */
  onMoveMany: (moves: NodeMove[]) => void;
  /** Whether the next drag on paper draws a frame instead of panning. */
  grouping: boolean;
  onGroupCards: (nodeIds: string[]) => void;
  /** Whether the next drag on paper draws an activity partition instead of panning. */
  laning: boolean;
  onLaneCards: (nodeIds: string[]) => void;
  /** Frames and lanes are named and removed by their place in the document, not by a stored key. */
  onRenameGroup: (index: number, title: string) => void;
  onRemoveGroup: (index: number) => void;
  onRenameLane: (index: number, title: string) => void;
  onRemoveLane: (index: number) => void;
  /** The lane whose name field should take focus after a keyboard creation. */
  focusLane: number | null;
  onLaneNameFocused: () => void;
  /** A right-click or a keyboard menu press on the paper, a card, a frame, a lane or an arrow. */
  onMenu: (request: WorkflowMenuRequest) => void;
  /** The menu's clipboard items: one card at a time, owned by the panel. */
  onCopyNode: (id: string) => void;
  onCutNode: (id: string) => void;
  onPaste: (at?: { x: number; y: number }) => void;
  canPaste: boolean;
  /** Open filling the viewport: the paper is no longer capped at 70% of the screen. */
  fullscreen: boolean;
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
  onOpenLesson,
  onConnect,
  onDisconnect,
  onDropLink,
  selectedEdgeId,
  onSelectEdge,
  onEdgeType,
  onEdgeLabel,
  onEdgeGuard,
  onEdgePort,
  onEdgeRoute,
  onMoveMany,
  grouping,
  onGroupCards,
  laning,
  onLaneCards,
  onRenameGroup,
  onRemoveGroup,
  onRenameLane,
  onRemoveLane,
  focusLane,
  onLaneNameFocused,
  onMenu,
  onCopyNode,
  onCutNode,
  onPaste,
  canPaste,
  fullscreen,
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

  // Partitions are read the same way frames are: from the cards inside them, never from a stored
  // rectangle, so a drag redraws the band and a deletion shrinks it.
  const lanes = useMemo(
    () =>
      (doc.lanes ?? []).flatMap((lane, index) => {
        const members = shown.filter((node) => lane.nodeIds.includes(node.id));
        const rect = laneRect(members, heights);
        return rect ? [{ lane, index, rect }] : [];
      }),
    [doc.lanes, shown, heights]
  );

  const marquee = useMarquee({
    toCanvas: viewport.toCanvas,
    onDone: (rect) => {
      const nodeIds = cardsWithin(rect, shown, heights);
      if (laning) onLaneCards(nodeIds);
      else onGroupCards(nodeIds);
    },
  });

  const linking = useLinking({
    toCanvas: viewport.toCanvas,
    byId,
    heights,
    onConnect,
    onSelect,
    onDropEmpty: onDropLink,
  });

  /**
   * What a press landed on, read off the DOM the way the link gesture reads a drop target.
   *
   * One handler on the paper rather than a callback on every card, bar, band and arrow: the parts
   * keep their own gestures, and the mapping from what is painted to what the menu can act on lives
   * in one place. The press resolves to the one action it can offer, so the menu never has to know
   * what kind of thing it is standing on. Every part of the diagram ends its test hook with its
   * index, so one number names it — and a card, whose hook is its id, is read first.
   */
  const actionAt = (target: Element): (() => void) | null => {
    const hit = target.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? '';
    const index = Number(/(\d+)$/.exec(hit)?.[1]);
    if (Number.isNaN(index)) return null;
    if (hit.startsWith('workflow-edge-')) {
      const edge = doc.edges[index];
      return edge ? () => onDisconnect(edge.id) : null;
    }
    return hit.startsWith('workflow-lane-')
      ? () => onRemoveLane(index)
      : hit.startsWith('workflow-group-')
        ? () => onRemoveGroup(index)
        : null;
  };

  /**
   * A menu request for a viewport point: a card's own actions and colours, a drawn part's removal, or
   * bare paper to add on. Paste rides on every request that has a paper point to land on.
   */
  const openMenu = (
    x: number,
    y: number,
    node?: WorkflowNode | null,
    action?: (() => void) | null
  ) => {
    const at = viewport.toCanvas(x, y);
    if (node) {
      onMenu({
        x,
        y,
        node,
        remove: () => onRemove(node.id),
        onCopy: () => onCopyNode(node.id),
        onCut: () => onCutNode(node.id),
        onFill: (fill) => onUpdate(node.id, { fill }),
      });
      return;
    }
    const request: WorkflowMenuRequest = action
      ? { x, y, remove: action }
      : { x, y, at };
    if (canPaste) request.onPaste = () => onPaste(at);
    onMenu(request);
  };

  // An issue pressed in the checklist names a card; bring that card into view instead of trusting
  // that the learner can guess which one it is.
  useEffect(() => {
    if (!selectedId) return;
    const surface = viewport.surfaceRef.current;
    const card = surface?.querySelector(`[data-node-id="${CSS.escape(selectedId)}"]`);
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  return (
    // `z-0` is the canvas's own stacking level: every control inside it (`z-20` cards through the
    // `z-50` edge inspector) is contained here, so a diagram scrolled under the sticky tab rail or
    // the fixed Run bar can never paint over those buttons. Without it, the Fit button tied the
    // rail's `z-30` and won on DOM order. `isolate` on the paper does the same for its own layers:
    // an edge label at `z-40` must not cover the Fit button, which is a sibling of the scroll box.
    // In full screen the wrapper, not the scroll box, carries the floor: a min-height on a flex
    // child taller than its parent spills over the rows below it instead of pushing them down.
    <div
      className={`relative z-0 mt-2 flex flex-1 flex-col ${fullscreen ? 'min-h-[75vh]' : 'min-h-0'}`}
    >
      <div
        ref={viewport.surfaceRef}
        data-testid="workflow-canvas"
        // Capture first: armed, or with Shift held, a drag on paper draws a frame — including over
        // an existing frame, whose own press would otherwise start moving it. Otherwise: pan.
        onPointerDownCapture={(event) => {
          if ((grouping || laning || event.shiftKey) && marquee.start(event)) event.stopPropagation();
        }}
        onPointerDown={(event) => viewport.startPan(event)}
        onPointerMove={marquee.move}
        onPointerUp={marquee.finish}
        onPointerCancel={marquee.finish}
        onContextMenu={(event) => {
          // A field keeps the browser's own menu: copy and paste are what a learner needs there.
          if ((event.target as Element).closest('input, textarea, select')) return;
          event.preventDefault();
          const node = doc.nodes.find(
            (entry) =>
              entry.id ===
              (event.target as Element).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId
          );
          openMenu(
            event.clientX,
            event.clientY,
            node ?? null,
            node ? null : actionAt(event.target as Element)
          );
        }}
        onKeyDown={(event) => {
          // The keyboard's right-click: Shift+F10, or the Menu key, opens the paper's menu where
          // the canvas centre is, since there is no pointer to name a place.
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(rect.left + 60, rect.top + 60);
            return;
          }
          viewport.panWithKeys(event);
        }}
        tabIndex={0}
        role="group"
        aria-label="Workflow canvas. Arrow keys pan it; drag a card by its header to move the card."
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        // The 70 vh cap is what makes this a canvas rather than a growing page; full screen is a
        // bigger paper, so that cap is the one thing it removes. The 55 vh floor above keeps the
        // paper at least half the viewport even with the checklist, the guide and the inspector open.
        className={`relative isolate min-h-[280px] flex-1 overflow-auto overscroll-contain rounded-lg border border-line-soft bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          fullscreen ? '' : 'max-h-[70vh]'
        } ${
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
            {lanes.map(({ lane, index, rect }) => (
              <WorkflowLaneBand
                key={`lane-${index}`}
                lane={lane}
                index={index}
                rect={rect}
                focusName={focusLane === index}
                onNameFocused={onLaneNameFocused}
                onRename={onRenameLane}
                onRemove={onRemoveLane}
              />
            ))}

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
              onEdgeRoute={onEdgeRoute}
            />

            {doc.nodes.map((node, index) => {
              const shared = {
                node,
                index,
                number: numbers.get(node.id) ?? index + 1,
                issue: issueByStep.get(node.id),
                selected: selectedId === node.id,
                position: drag.live?.get(node.id) ?? { x: node.x, y: node.y },
                dragging: Boolean(drag.dragIds?.includes(node.id)),
                linking: linking.linking,
                sockets: sockets.get(node.id),
                onSelect,
                onMove,
                onRemove,
                onOpenLesson,
                onDragStart: drag.startDrag,
                onLinkStart: linking.startLink,
                onLinkLand: linking.landOnCard,
              };
              return isForkJoin(node.kind) ? (
                <WorkflowForkJoinCard key={node.id} {...shared} />
              ) : (
                <WorkflowNodeCard key={node.id} {...shared} onUpdate={onUpdate} />
              );
            })}

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
