import { useEffect } from 'react';
import {
  EDGE_ROUTES,
  EDGE_ROUTE_LABEL,
  EDGE_TYPE_LABEL,
  KIND_META,
  MAX_BRANCH_CONDITION_CHARS,
  PORT_KINDS,
  PORT_LABEL,
  WORKFLOW_EDGE_TYPES,
  edgeCaption,
  edgePortOf,
  edgeRouteOf,
  edgeTypeOf,
  type EdgeRoute,
  type PortKind,
  type WorkflowDoc,
  type WorkflowEdgeType,
  type WorkflowNode,
} from '../../workflow.ts';
import { anchorFrom, edgeControls, edgePath, pendingCurve } from './canvasGeometry.ts';
import type { LinkDraft } from './useLinking.ts';

/**
 * The arrows of a workflow (`components/workflow/WorkflowEdges.tsx`).
 *
 * One layer for everything drawn between cards: the cubic paths with their arrowheads, the dashed
 * preview while an arrow is being drawn, and each edge's label, kind chip and remove button. The
 * paths and labels are diagram, not content: they sit above the frame bands and below the cards
 * (`z-20`), so an arrow crossing a card never hides its title or its buttons; the kind chip and the
 * remove button are the only parts above a card, because they have to be pressed. It reads
 * the document and the measured card heights, and reports an edit; it owns no state but the Escape
 * that closes the inspector.
 *
 * **The styles palette lives here**, because this is where the pixels are: one row per edge kind,
 * each a colour *and* a dash pattern, so control flow, data, power and mechanics are told apart at a
 * glance and also without colour. The same table draws the swatch in the inspector, so the choice on
 * screen and the line on the canvas cannot disagree.
 */

/** A kind's line: the canvas path, the chip's swatch and the arrowhead all read this row. */
export const EDGE_STYLE: Record<
  WorkflowEdgeType,
  { color: string; width: number; dash?: string; opacity: number }
> = {
  flow: { color: 'var(--accent)', width: 1.8, opacity: 0.65 },
  data: { color: 'var(--emerald)', width: 1.8, dash: '6 3', opacity: 0.85 },
  signal: { color: 'var(--amber)', width: 2, dash: '1.5 3.5', opacity: 0.9 },
  power: { color: 'var(--rose)', width: 3.2, opacity: 0.8 },
  mechanical: { color: 'var(--purple)', width: 2, dash: '8 3 2 3', opacity: 0.85 },
  communication: { color: 'var(--muted)', width: 2.2, dash: '11 4', opacity: 0.8 },
};

/** The one text field in the inspector, used for both an arrow's guard and its label. */
function EdgeField({
  testid,
  label,
  value,
  placeholder,
  onChange,
  onFocus,
}: {
  testid: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  return (
    <label className="mt-1.5 block">
      <span className="font-mono text-[10px] text-faint">{label}</span>
      <input
        data-testid={testid}
        aria-label={`${label} on this arrow`}
        value={value}
        maxLength={MAX_BRANCH_CONDITION_CHARS}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        className="mt-0.5 w-full rounded border px-1.5 py-1 font-mono text-[11.5px] outline-none focus:border-accent"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--canvas)',
          color: 'var(--text)',
        }}
      />
    </label>
  );
}

export interface WorkflowEdgesProps {
  doc: WorkflowDoc;
  byId: Map<string, WorkflowNode>;
  heights: Record<string, number>;
  /** The grid's canvas-pixel size: the SVG's coordinate system is 1:1 with the cards'. */
  extents: { width: number; height: number };
  linking: LinkDraft | null;
  cursor: { x: number; y: number };
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
  onDisconnect: (edgeId: string) => void;
  onEdgeType: (edgeId: string, type: WorkflowEdgeType) => void;
  onEdgeLabel: (edgeId: string, label: string) => void;
  onEdgeGuard: (edgeId: string, guard: string) => void;
  onEdgePort: (edgeId: string, end: 'from' | 'to', kind: PortKind | null) => void;
  onEdgeRoute: (edgeId: string, route: EdgeRoute) => void;
}

export function WorkflowEdges({
  doc,
  byId,
  heights,
  extents,
  linking,
  cursor,
  selectedEdgeId,
  onSelectEdge,
  onDisconnect,
  onEdgeType,
  onEdgeLabel,
  onEdgeGuard,
  onEdgePort,
  onEdgeRoute,
}: WorkflowEdgesProps) {
  // Escape closes the inspector wherever focus is: it is the same "put that away" key as the pending
  // arrow's, and a panel of six buttons with no visible way out is a trap on a phone.
  useEffect(() => {
    if (!selectedEdgeId) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSelectEdge(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selectedEdgeId, onSelectEdge]);

  // An edge whose card is gone draws nothing, but keeps its index: the testids name the document's
  // edge order, not the drawn order.
  const drawn = doc.edges.flatMap((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    return [
      {
        edge,
        index,
        from,
        to,
        type: edgeTypeOf(edge),
        route: edgeRouteOf(edge),
        a: anchorFrom(from, edge.fromSide, heights),
        b: anchorFrom(to, edge.toSide, heights),
      },
    ];
  });
  const linkSource = linking ? byId.get(linking.nodeId) ?? null : null;

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 z-[15]"
        width={extents.width}
        height={extents.height}
        aria-hidden="true"
      >
        <defs>
          {WORKFLOW_EDGE_TYPES.map((type) => (
            <marker
              key={type}
              id={`workflow-arrow-${type}`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill={EDGE_STYLE[type].color} />
            </marker>
          ))}
        </defs>
        {drawn.map(({ edge, index, a, b, type, route }) => (
          <g key={edge.id} data-testid={`workflow-edge-${index}`}>
            <path
              data-route={route}
              d={edgePath(a, edge.fromSide, b, edge.toSide, route)}
              fill="none"
              stroke={EDGE_STYLE[type].color}
              strokeWidth={EDGE_STYLE[type].width}
              strokeOpacity={EDGE_STYLE[type].opacity}
              strokeDasharray={EDGE_STYLE[type].dash}
              markerEnd={`url(#workflow-arrow-${type})`}
            />
          </g>
        ))}
        {linkSource && linking && (
          <path
            data-testid="workflow-edge-pending"
            d={pendingCurve(anchorFrom(linkSource, linking.side, heights), linking.side, cursor)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.6}
            strokeDasharray="5 4"
          />
        )}
      </svg>

      {drawn.map(({ edge, index, from, to, type, route, a, b }) => {
        const { label: anchor, remove } = edgeControls(a, edge.fromSide, b, edge.toSide, route);
        // `remove` is where the row of controls starts: the label rides above the line, the kind and
        // × hang below it, so a long label can never sit on top of the buttons.
        const text = edgeCaption(from, edge);
        const selected = selectedEdgeId === edge.id;
        return (
          <div key={`edge-controls-${edge.id}`}>
            {text && (
              <span
                data-testid={`workflow-edge-label-${index}`}
                className="pointer-events-none absolute z-[15] max-w-[140px] -translate-x-1/2 -translate-y-[calc(100%+2px)] truncate rounded border border-line bg-panel px-1 font-mono text-[10px] text-muted"
                style={{ left: anchor.x, top: anchor.y }}
                title={text}
              >
                {text}
              </span>
            )}
            {/* One row at the label's anchor: the kind (a press opens the styles palette) and the
                remove button. Both ride the curve's half-way point, so neither drifts off the line. */}
            <div
              className="absolute z-40 flex items-center gap-1"
              style={{ left: remove.x, top: remove.y + 2 }}
            >
              <button
                type="button"
                data-testid={`workflow-edge-kind-${index}`}
                aria-expanded={selected}
                aria-label={`Arrow from card ${from.title || KIND_META[from.kind].label} to card ${
                  to.title || KIND_META[to.kind].label
                } carries ${EDGE_TYPE_LABEL[type]}; press to change it`}
                title="What this arrow carries"
                onClick={() => onSelectEdge(selected ? null : edge.id)}
                className="flex h-4 cursor-pointer items-center gap-1 rounded-full border border-line bg-panel px-1 font-mono text-[9.5px] leading-none text-faint hover:border-accent hover:text-accent"
              >
                <svg width="10" height="4" aria-hidden="true">
                  <line
                    x1="0"
                    y1="2"
                    x2="10"
                    y2="2"
                    stroke={EDGE_STYLE[type].color}
                    strokeWidth={Math.min(3, EDGE_STYLE[type].width)}
                    strokeDasharray={EDGE_STYLE[type].dash}
                  />
                </svg>
                {EDGE_TYPE_LABEL[type]}
              </button>
              <button
                type="button"
                data-testid={`workflow-edge-remove-${index}`}
                aria-label={`Remove the arrow from card ${from.title || KIND_META[from.kind].label} to card ${to.title || KIND_META[to.kind].label}`}
                title="Remove this arrow"
                onClick={() => onDisconnect(edge.id)}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-line bg-panel font-mono text-[10px] leading-none text-faint opacity-60 hover:border-rose hover:text-rose hover:opacity-100"
              >
                ×
              </button>
            </div>

            {selected && (
              <div
                data-testid={`workflow-edge-inspector-${index}`}
                data-edge-inspector
                role="group"
                aria-label="What this arrow carries"
                className="absolute z-50 w-[228px] rounded-lg border border-line bg-panel p-2 shadow-md"
                style={{ left: remove.x, top: remove.y + 22 }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  What it carries
                </p>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {WORKFLOW_EDGE_TYPES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      data-testid={`workflow-edge-type-${choice}-${index}`}
                      aria-pressed={type === choice}
                      onClick={() => onEdgeType(edge.id, choice)}
                      className={`flex min-h-8 cursor-pointer items-center gap-1.5 rounded border px-1.5 text-[11px] ${
                        type === choice
                          ? 'border-accent/60 bg-accent/10 text-accent'
                          : 'border-line bg-canvas text-muted hover:bg-raise'
                      }`}
                    >
                      <svg width="16" height="6" aria-hidden="true">
                        <line
                          x1="0"
                          y1="3"
                          x2="16"
                          y2="3"
                          stroke={EDGE_STYLE[choice].color}
                          strokeWidth={Math.min(3, EDGE_STYLE[choice].width)}
                          strokeDasharray={EDGE_STYLE[choice].dash}
                        />
                      </svg>
                      {EDGE_TYPE_LABEL[choice]}
                    </button>
                  ))}
                </div>
                {/* How the line bends. Route is presentation, so it is picked here beside the
                    kind that decides what the line carries. */}
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  How it bends
                </p>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {EDGE_ROUTES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      data-testid={`workflow-edge-route-${choice}-${index}`}
                      aria-pressed={route === choice}
                      onClick={() => onEdgeRoute(edge.id, choice)}
                      className={`min-h-8 cursor-pointer rounded border px-1.5 text-[11px] ${
                        route === choice
                          ? 'border-accent/60 bg-accent/10 text-accent'
                          : 'border-line bg-canvas text-muted hover:bg-raise'
                      }`}
                    >
                      {EDGE_ROUTE_LABEL[choice]}
                    </button>
                  ))}
                </div>
                {/* Which socket each end plugs into. Empty means the kind's own socket — the
                    default a stored arrow keeps, so no document is rewritten by looking at it. */}
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  {(['from', 'to'] as const).map((end) => {
                    const socket = edgePortOf(edge, end);
                    return (
                      <select
                        key={end}
                        data-testid={`workflow-edge-port-${end}-${index}`}
                        aria-label={`${end === 'from' ? 'From' : 'To'} socket — ${
                          socket ? PORT_LABEL[socket] : 'plain dot'
                        } unless changed`}
                        value={(end === 'from' ? edge.fromPort : edge.toPort) ?? ''}
                        onChange={(event) =>
                          onEdgePort(edge.id, end, (event.target.value || null) as PortKind | null)
                        }
                        className="min-h-8 w-full rounded border border-line bg-canvas px-1 font-mono text-[11px] text-body"
                      >
                        <option value="">{`auto · ${socket ? PORT_LABEL[socket] : 'plain'}`}</option>
                        {PORT_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {PORT_LABEL[kind]}
                          </option>
                        ))}
                      </select>
                    );
                  })}
                </div>
                {from.kind === 'branch' && (
                  // A guard belongs to the exit, not the question: two arrows out of one decision
                  // carry two conditions. An empty guard falls back to the card's condition, which
                  // is what every arrow of an older document says.
                  <EdgeField
                    testid={`workflow-edge-guard-input-${index}`}
                    label="Guard"
                    value={edge.guard ?? ''}
                    placeholder={from.condition ? `card: ${from.condition}` : 'draw > 3.2 A'}
                    onChange={(guard) => onEdgeGuard(edge.id, guard)}
                    onFocus={() => onSelectEdge(edge.id)}
                  />
                )}
                <EdgeField
                  testid={`workflow-edge-label-input-${index}`}
                  label="Label"
                  value={edge.label ?? ''}
                  placeholder="RPM, PWM, torque"
                  onChange={(label) => onEdgeLabel(edge.id, label)}
                  onFocus={() => onSelectEdge(edge.id)}
                />
                <button
                  type="button"
                  data-testid={`workflow-edge-close-${index}`}
                  onClick={() => onSelectEdge(null)}
                  className="mt-1.5 w-full cursor-pointer rounded border border-line bg-canvas py-1 font-mono text-[11px] text-muted hover:bg-raise"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
