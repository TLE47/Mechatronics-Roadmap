import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Maximize2, Minimize2, Trash2 } from 'lucide-react';
import {
  KIND_META,
  MAX_NODE_COORD,
  MAX_STEP_DETAIL_CHARS,
  MAX_STEP_TITLE_CHARS,
  MAX_STEP_UNIT_CHARS,
  NODE_WIDTH,
  type WorkflowDoc,
  type WorkflowIssue,
  type WorkflowNode,
} from '../workflow.ts';
import { iconForKind } from './workflowIcons.ts';

/**
 * The workflow canvas (`components/WorkflowCanvas.tsx`).
 *
 * The tab used to be a list, and a list cannot show a branch that goes back, two paths that meet, or
 * the shape a learner actually has in mind. This draws the graph: cards on a dotted grid, dragged by
 * their header, arrows drawn from a card's right-hand dot to another card.
 *
 * Three rules the interaction keeps:
 *
 * 1. **The document is the parent's.** A drag reports a position once, on release; a keystroke
 *    reports a patch; an arrow reports an `onConnect`. Nothing is kept here except the pixels of a
 *    drag in progress, so a reload or a lesson switch can never leave two versions of one card.
 * 2. **A card is editable where it sits.** Title, detail and unit are always inputs on the card — no
 *    edit mode to enter, and no second form that can drift from what the card shows.
 * 3. **Two ways to draw an arrow.** Drag from the dot to the target (a mouse), or tap the dot then
 *    tap the target (a phone, or an unsteady hand). Escape, or a tap on empty grid, cancels.
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
  onConnect: (from: string, to: string) => void;
  onDisconnect: (edgeId: string) => void;
}

/** How far down a card the arrows attach: the middle of its header. */
const ANCHOR_Y = 26;
const DRAG_STEP = 4;
const NUDGE = 8;
const NUDGE_FAST = 32;
/** A 24-card column is ~4,100 px tall; the map view may shrink it to a sixth, not to a speck. */
const FIT_MIN_SCALE = 0.1;
const FIT_PAD = 16;
const PAN_STEP = 40;
const PAN_STEP_FAST = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function anchorRight(node: WorkflowNode): { x: number; y: number } {
  return { x: node.x + NODE_WIDTH, y: node.y + ANCHOR_Y };
}

function anchorLeft(node: WorkflowNode): { x: number; y: number } {
  return { x: node.x, y: node.y + ANCHOR_Y };
}

/**
 * A connector that stays in the paper between two cards.
 *
 * A vertical flow has the next card down and to the left (its left edge is the one-column x), so a
 * bend proportional to the horizontal gap would throw the control point far off the canvas and draw
 * a loop around the card. The bend is capped and the controls meet at the midpoint height instead:
 * the arrow leaves the right dot, crosses the gap, and settles into the next card's left dot.
 */
function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const bend = Math.max(28, Math.min(52, Math.abs(b.y - a.y) * 0.25));
  const midY = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x + bend} ${midY}, ${b.x - bend} ${midY}, ${b.x} ${b.y}`;
}

function nodeIdAt(clientX: number, clientY: number): string | null {
  const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const card = element?.closest('[data-node-id]');
  return card?.getAttribute('data-node-id') ?? null;
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
}: WorkflowCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** View scale, not document data: a fit is a lens on the graph, never a coordinate written to it. */
  const [scale, setScale] = useState(1);
  const viewTarget = useRef<{ left: number; top: number } | null>(null);
  const [viewSeq, setViewSeq] = useState(0);
  const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const dragged = useRef<{ x: number; y: number } | null>(null);
  const dragMoved = useRef(false);
  const [livePosition, setLivePosition] = useState<{ x: number; y: number } | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const linkTravelled = useRef(false);

  const byId = useMemo(() => new Map(doc.nodes.map((node) => [node.id, node])), [doc.nodes]);

  const extents = useMemo(() => {
    // The grid is only as wide as the cards need: a 380 px split must not get a horizontal
    // scrollbar for paper nobody drew on.
    let width = NODE_WIDTH + 48;
    let height = 300;
    for (const node of doc.nodes) {
      width = Math.max(width, node.x + NODE_WIDTH + 48);
      height = Math.max(height, node.y + 200);
    }
    return { width, height };
  }, [doc.nodes]);

  /** A screen point in canvas pixels, scroll offsets and the view scale included. */
  const toCanvas = (clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return { x: 0, y: 0 };
    const rect = surface.getBoundingClientRect();
    return {
      x: (clientX - rect.left + surface.scrollLeft) / scale,
      y: (clientY - rect.top + surface.scrollTop) / scale,
    };
  };

  // A fit is applied after the scaled spacer has laid out, or the scroll would be clamped to the
  // old size. One target, written by the press and consumed once.
  useEffect(() => {
    const target = viewTarget.current;
    if (!target) return;
    viewTarget.current = null;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.scrollLeft = Math.max(0, target.left);
    surface.scrollTop = Math.max(0, target.top);
  }, [viewSeq, scale]);

  /**
   * Fit every card in the canvas, or return to 100%.
   *
   * One control rather than two: while the map is smaller than life it says 100%, and pressing it
   * keeps the viewport's centre so the card being read does not jump away. The button is a lens, not
   * a document edit — no position, zoom or lesson field is written.
   */
  const fitOrReset = () => {
    const surface = surfaceRef.current;
    if (!surface) return;
    if (scale < 1) {
      const centreX = (surface.scrollLeft + surface.clientWidth / 2) / scale;
      const centreY = (surface.scrollTop + surface.clientHeight / 2) / scale;
      setScale(1);
      viewTarget.current = {
        left: centreX - surface.clientWidth / 2,
        top: centreY - surface.clientHeight / 2,
      };
      setViewSeq((seq) => seq + 1);
      return;
    }
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-node-id]'));
    if (!cards.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const card of cards) {
      minX = Math.min(minX, card.offsetLeft);
      minY = Math.min(minY, card.offsetTop);
      maxX = Math.max(maxX, card.offsetLeft + card.offsetWidth);
      maxY = Math.max(maxY, card.offsetTop + card.offsetHeight);
    }
    const fit = Math.min(
      (surface.clientWidth - FIT_PAD * 2) / Math.max(1, maxX - minX),
      (surface.clientHeight - FIT_PAD * 2) / Math.max(1, maxY - minY)
    );
    const next = clamp(fit, FIT_MIN_SCALE, 1);
    setScale(next);
    viewTarget.current = {
      left: ((minX + maxX) / 2) * next - surface.clientWidth / 2,
      top: ((minY + maxY) / 2) * next - surface.clientHeight / 2,
    };
    setViewSeq((seq) => seq + 1);
  };

  /**
   * Drag the empty paper to pan. Cards, fields and dots keep their own gestures; a finger keeps the
   * native scroll, because hijacking touch here would take away the scrolling that already works.
   */
  const startPan = (event: ReactPointerEvent) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-node-id], button, input, textarea, select, a')) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    event.preventDefault();
    // A pan press arms the arrow keys too; the surface's own focus ring stays keyboard-only.
    surface.focus({ preventScroll: true });
    onSelect(null);
    panStart.current = {
      x: event.clientX,
      y: event.clientY,
      left: surface.scrollLeft,
      top: surface.scrollTop,
    };
    setPanning(true);
  };

  /**
   * Arrow keys pan the focused paper, away from the cards' own nudge: the guard on `event.target`
   * means a focused card header (or a field) never reaches this, so the same key still moves the
   * card it belongs to.
   */
  const panWithKeys = (event: ReactKeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const step = event.shiftKey ? PAN_STEP_FAST : PAN_STEP;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    event.preventDefault();
    surface.scrollLeft = Math.max(0, surface.scrollLeft + dx);
    surface.scrollTop = Math.max(0, surface.scrollTop + dy);
  };

  useEffect(() => {
    if (!panning) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const move = (event: PointerEvent) => {
      const start = panStart.current;
      if (!start) return;
      surface.scrollLeft = Math.max(0, start.left - (event.clientX - start.x));
      surface.scrollTop = Math.max(0, start.top - (event.clientY - start.y));
    };
    const finish = () => {
      panStart.current = null;
      setPanning(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [panning]);

  const startDrag = (event: ReactPointerEvent, node: WorkflowNode) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = toCanvas(event.clientX, event.clientY);
    dragOffset.current = { dx: point.x - node.x, dy: point.y - node.y };
    dragged.current = { x: node.x, y: node.y };
    dragMoved.current = false;
    setLivePosition({ x: node.x, y: node.y });
    setDragId(node.id);
    onSelect(node.id);
  };

  // A drag is a window gesture: the pointer may leave the card, the surface, or the window edge, and
  // the card must still follow it and land where it was released.
  useEffect(() => {
    if (!dragId) return;
    const move = (event: PointerEvent) => {
      const point = toCanvas(event.clientX, event.clientY);
      const x = clamp(
        Math.round((point.x - dragOffset.current.dx) / DRAG_STEP) * DRAG_STEP,
        0,
        MAX_NODE_COORD
      );
      const y = clamp(
        Math.round((point.y - dragOffset.current.dy) / DRAG_STEP) * DRAG_STEP,
        0,
        MAX_NODE_COORD
      );
      dragged.current = { x, y };
      dragMoved.current = true;
      setLivePosition({ x, y });
    };
    const finish = () => {
      const position = dragged.current;
      // A press that never moved is a selection, not a move: it must not write a new document.
      if (position && dragMoved.current) onMove(dragId, position.x, position.y);
      dragged.current = null;
      setLivePosition(null);
      setDragId(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [dragId, onMove]);

  /** Arm an arrow. A tap on the source dot leaves it armed; a drag draws and drops in one gesture. */
  const startLink = (event: ReactPointerEvent, node: WorkflowNode) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = toCanvas(event.clientX, event.clientY);
    linkTravelled.current = false;
    setCursor(point);
    setLinking(node.id);
    onSelect(node.id);
  };

  useEffect(() => {
    if (!linking) return;
    const move = (event: PointerEvent) => {
      linkTravelled.current = true;
      setCursor(toCanvas(event.clientX, event.clientY));
    };
    const up = (event: PointerEvent) => {
      const target = nodeIdAt(event.clientX, event.clientY);
      if (target && target !== linking) {
        onConnect(linking, target);
        setLinking(null);
        return;
      }
      // Released on its own dot: stay armed for the phone's tap-then-tap. Released on the grid, or
      // after a drag that ended nowhere: cancel, because a half-drawn arrow left armed is a trap.
      if (target === null || linkTravelled.current) setLinking(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLinking(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  }, [linking, onConnect]);

  // An issue pressed in the checklist names a card; bring that card into view instead of trusting
  // that the learner can guess which one it is.
  useEffect(() => {
    if (!selectedId) return;
    const surface = surfaceRef.current;
    const card = surface?.querySelector(`[data-node-id="${CSS.escape(selectedId)}"]`);
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  const nudge = (event: ReactKeyboardEvent, node: WorkflowNode) => {
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
  };

  const linkSource = linking ? byId.get(linking) ?? null : null;

  return (
    <div className="relative mt-2 flex min-h-0 flex-1 flex-col">
      <div
        ref={surfaceRef}
        data-testid="workflow-canvas"
        onPointerDown={startPan}
        onKeyDown={panWithKeys}
        tabIndex={0}
        role="group"
        aria-label="Workflow canvas. Arrow keys pan it; drag a card by its header to move the card."
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        // The 70 vh cap is what makes this a canvas rather than a growing page: a 24-card flow on a
        // phone scrolls inside the pane instead of turning the lesson into a four-thousand-pixel
        // document.
        className={`relative min-h-[280px] max-h-[70vh] flex-1 overflow-auto overscroll-contain rounded-lg border border-line-soft bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          panning ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
        style={{
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      >
        {/* The spacer reserves the scaled grid's extent; the grid itself keeps canvas coordinates. */}
        <div
          style={{
            width: Math.ceil(extents.width * scale),
            height: Math.ceil(extents.height * scale),
          }}
        >
          <div
            ref={gridRef}
            data-testid="workflow-canvas-grid"
            className="relative"
            style={{
              width: extents.width,
              height: extents.height,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
        <svg
          className="pointer-events-none absolute inset-0"
          width={extents.width}
          height={extents.height}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="workflow-arrowhead"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--accent)" />
            </marker>
          </defs>
          {doc.edges.map((edge, index) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            return (
              <g key={edge.id} data-testid={`workflow-edge-${index}`}>
                <path
                  d={curve(anchorRight(from), anchorLeft(to))}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.6}
                  strokeOpacity={0.6}
                  markerEnd="url(#workflow-arrowhead)"
                />
              </g>
            );
          })}
          {linkSource && (
            <path
              data-testid="workflow-edge-pending"
              d={curve(anchorRight(linkSource), cursor)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.6}
              strokeDasharray="5 4"
            />
          )}
        </svg>

        {doc.edges.map((edge, index) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const a = anchorRight(from);
          const b = anchorLeft(to);
          const left = (a.x + b.x) / 2;
          const top = (a.y + b.y) / 2;
          return (
            <div key={`edge-controls-${edge.id}`}>
              {edge.label && (
                <span
                  className="pointer-events-none absolute z-10 max-w-[140px] -translate-x-1/2 -translate-y-[calc(100%+2px)] truncate rounded border border-line bg-panel px-1 font-mono text-[10px] text-muted"
                  style={{ left, top }}
                  title={edge.label}
                >
                  {edge.label}
                </span>
              )}
              <button
                type="button"
                data-testid={`workflow-edge-remove-${index}`}
                aria-label={`Remove the arrow from card ${from.title || KIND_META[from.kind].label} to card ${to.title || KIND_META[to.kind].label}`}
                title="Remove this arrow"
                onClick={() => onDisconnect(edge.id)}
                className="absolute z-20 flex h-4 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-panel font-mono text-[10px] leading-none text-faint opacity-60 hover:border-rose hover:text-rose hover:opacity-100"
                style={{ left: left + 10, top }}
              >
                ×
              </button>
            </div>
          );
        })}

        {doc.nodes.map((node, index) => {
          const Icon = iconForKind(node.kind);
          const issue = issueByStep.get(node.id);
          const number = numbers.get(node.id) ?? index + 1;
          const position = dragId === node.id && livePosition ? livePosition : { x: node.x, y: node.y };
          const selected = selectedId === node.id;
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              data-testid={`workflow-node-${index}`}
              data-step={number}
              data-kind={node.kind}
              style={{ left: position.x, top: position.y, width: NODE_WIDTH }}
              className={`absolute z-10 cursor-default rounded-xl border bg-panel shadow-sm ${
                selected ? 'border-accent ring-2 ring-accent/25' : issue ? 'border-amber/70' : 'border-line'
              } ${dragId === node.id ? 'z-20 shadow-lg' : ''}`}
              onPointerDown={(event) => {
                if (!linking) return;
                if (linking === node.id) {
                  setLinking(null);
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onConnect(linking, node.id);
                setLinking(null);
              }}
            >
              <div
                data-testid={`workflow-node-drag-${index}`}
                role="group"
                tabIndex={0}
                aria-label={`Card ${number}, ${KIND_META[node.kind].label}. Drag to move; arrow keys nudge it.`}
                onPointerDown={(event) => startDrag(event, node)}
                onKeyDown={(event) => nudge(event, node)}
                className="flex cursor-grab touch-none items-center gap-1.5 rounded-t-xl border-b border-line-soft bg-canvas px-2 py-1.5 select-none focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Icon className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
                  {KIND_META[node.kind].label}
                </span>
                <span
                  data-testid={`workflow-node-number-${index}`}
                  className="ml-auto font-mono text-[10px] tabular-nums text-faint"
                >
                  {number}
                </span>
                <button
                  type="button"
                  data-testid={`workflow-node-delete-${index}`}
                  aria-label={`Delete card ${number}`}
                  title="Delete this card and its arrows"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onRemove(node.id)}
                  className="flex h-4 w-4 cursor-pointer items-center justify-center rounded text-faint hover:text-rose"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
                {issue && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
                    title={issue.message}
                    aria-label={issue.message}
                  />
                )}
              </div>

              <div className="space-y-1 p-1.5">
                <input
                  data-testid={`workflow-node-title-${index}`}
                  aria-label={`Title of card ${index + 1}`}
                  value={node.title}
                  maxLength={MAX_STEP_TITLE_CHARS}
                  placeholder={`${KIND_META[node.kind].label} — one idea`}
                  onChange={(event) => onUpdate(node.id, { title: event.target.value })}
                  onFocus={() => onSelect(node.id)}
                  className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-semibold outline-none hover:bg-raise focus:border-line focus:bg-canvas"
                  style={{ color: 'var(--text)' }}
                />
                <textarea
                  data-testid={`workflow-node-detail-${index}`}
                  aria-label={`Detail of card ${index + 1}`}
                  value={node.detail}
                  rows={2}
                  maxLength={MAX_STEP_DETAIL_CHARS}
                  placeholder={KIND_META[node.kind].hint}
                  onChange={(event) => onUpdate(node.id, { detail: event.target.value })}
                  onFocus={() => onSelect(node.id)}
                  className="w-full resize-y rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] leading-snug outline-none hover:bg-raise focus:border-line focus:bg-canvas"
                  style={{ color: 'var(--muted)' }}
                />
                {KIND_META[node.kind].measured && (
                  <input
                    data-testid={`workflow-node-unit-${index}`}
                    aria-label={`Unit of card ${index + 1}`}
                    value={node.unit ?? ''}
                    maxLength={MAX_STEP_UNIT_CHARS}
                    placeholder="unit — A, V, rad/s"
                    onChange={(event) => onUpdate(node.id, { unit: event.target.value })}
                    onFocus={() => onSelect(node.id)}
                    className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[10.5px] outline-none hover:bg-raise focus:border-line focus:bg-canvas"
                    style={{ color: 'var(--body)' }}
                  />
                )}
              </div>

              <button
                type="button"
                data-testid={`workflow-node-in-${index}`}
                aria-label={`Connect an arrow into card ${index + 1}`}
                title="An arrow lands here"
                onPointerDown={(event) => {
                  if (!linking) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (linking !== node.id) onConnect(linking, node.id);
                  setLinking(null);
                }}
                className={`absolute -left-2.5 top-4 z-20 h-5 w-5 touch-none rounded-full border bg-panel ${
                  linking && linking !== node.id
                    ? 'border-accent ring-2 ring-accent/30'
                    : 'border-line'
                }`}
              />
              <button
                type="button"
                data-testid={`workflow-node-out-${index}`}
                aria-label={`Start an arrow from card ${index + 1}`}
                title="Drag from this dot to another card to draw an arrow"
                onPointerDown={(event) => startLink(event, node)}
                className={`absolute -right-2.5 top-4 z-20 flex h-5 w-5 touch-none cursor-crosshair items-center justify-center rounded-full border border-accent bg-panel ${
                  linking === node.id ? 'ring-2 ring-accent/40' : ''
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              </button>
            </div>
          );
        })}
          </div>
        </div>
      </div>
      <button
        type="button"
        data-testid="workflow-fit"
        onClick={fitOrReset}
        aria-label={scale < 1 ? 'Back to 100% zoom' : 'Fit the whole flow in the canvas'}
        title={scale < 1 ? 'Back to 100%' : 'Fit the whole flow in the canvas'}
        className="absolute right-2 top-2 z-30 flex min-h-9 items-center gap-1 rounded-md border border-line bg-panel/95 px-2 font-mono text-[10.5px] text-muted shadow-sm hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        {scale < 1 ? (
          <Minimize2 className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
        )}
        {scale < 1 ? '100%' : 'Fit'}
      </button>
    </div>
  );
}
