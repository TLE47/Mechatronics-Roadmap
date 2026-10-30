import {
  KIND_META,
  type WorkflowDoc,
  type WorkflowNode,
} from '../../workflow.ts';
import { anchorFrom, edgeControls, edgeCurve, pendingCurve } from './canvasGeometry.ts';
import type { LinkDraft } from './useLinking.ts';

/**
 * The arrows of a workflow (`components/workflow/WorkflowEdges.tsx`).
 *
 * One layer for everything drawn between cards: the cubic paths with their arrowheads, the dashed
 * preview while an arrow is being drawn, and each edge's label and remove button. It reads the
 * document and the measured card heights, and reports a removal; it owns no state.
 */

export interface WorkflowEdgesProps {
  doc: WorkflowDoc;
  byId: Map<string, WorkflowNode>;
  heights: Record<string, number>;
  /** The grid's canvas-pixel size: the SVG's coordinate system is 1:1 with the cards'. */
  extents: { width: number; height: number };
  linking: LinkDraft | null;
  cursor: { x: number; y: number };
  onDisconnect: (edgeId: string) => void;
}

export function WorkflowEdges({
  doc,
  byId,
  heights,
  extents,
  linking,
  cursor,
  onDisconnect,
}: WorkflowEdgesProps) {
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
        a: anchorFrom(from, edge.fromSide, heights),
        b: anchorFrom(to, edge.toSide, heights),
      },
    ];
  });
  const linkSource = linking ? byId.get(linking.nodeId) ?? null : null;

  return (
    <>
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
        {drawn.map(({ edge, index, a, b }) => (
          <g key={edge.id} data-testid={`workflow-edge-${index}`}>
            <path
              d={edgeCurve(a, edge.fromSide, b, edge.toSide)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.6}
              strokeOpacity={0.6}
              markerEnd="url(#workflow-arrowhead)"
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

      {drawn.map(({ edge, index, from, to, a, b }) => {
        const { label, remove } = edgeControls(a, b);
        return (
          <div key={`edge-controls-${edge.id}`}>
            {edge.label && (
              <span
                className="pointer-events-none absolute z-10 max-w-[140px] -translate-x-1/2 -translate-y-[calc(100%+2px)] truncate rounded border border-line bg-panel px-1 font-mono text-[10px] text-muted"
                style={{ left: label.x, top: label.y }}
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
              style={{ left: remove.x, top: remove.y }}
            >
              ×
            </button>
          </div>
        );
      })}
    </>
  );
}
