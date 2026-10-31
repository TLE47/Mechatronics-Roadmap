import type { FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent } from 'react';
import { BookOpen, StickyNote, Trash2 } from 'lucide-react';
import {
  KIND_META,
  MAX_BRANCH_CONDITION_CHARS,
  MAX_STEP_DETAIL_CHARS,
  MAX_STEP_TITLE_CHARS,
  MAX_STEP_UNIT_CHARS,
  NODE_SHAPE,
  NODE_WIDTH,
  type NodeShape,
  type SocketKinds,
  type WorkflowIssue,
  type WorkflowNode,
  type WorkflowSide,
} from '../../workflow.ts';
import { iconForKind } from '../workflowIcons.ts';
import { MathView } from '../MathView.tsx';
import { parseInline, type InlineRun } from '../../readerMarkdown.ts';
import { cardFill, cardInk, cardType } from './cardStyle.ts';
import { nudgeCard } from './cardNudge.ts';
import { WorkflowPorts } from './WorkflowPorts.tsx';
import type { LinkDraft } from './useLinking.ts';

/**
 * One card on the canvas (`components/workflow/WorkflowNodeCard.tsx`).
 *
 * A card is editable where it sits: title, detail and unit are always inputs, so there is no edit
 * mode to enter and no second form that can drift from what the card shows. Its header is the drag
 * handle and the keyboard handle (arrows nudge); its four dots are both inlets and outlets.
 *
 * The card owns no state — the position it is drawn at, whether it is being dragged, and which
 * arrow is armed all belong to the canvas, so two cards can never disagree about them.
 */

/**
 * How a kind's plate is drawn: the same silhouette a flowchart gives that meaning.
 *
 * The cuts are 14 px and the fields are indented past them, because a card is a form — a diamond
 * big enough to hold three inputs would be a 400 px point. The plate says what the card is; the
 * fields stay readable. `rect` keeps the border and ring it always had, so no recorded card moves.
 */
const SHAPE_CLIP: Partial<Record<NodeShape, string>> = {
  data: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
  gate: 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)',
  diamond: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
};
const SHAPE_ROUND: Record<NodeShape, string> = {
  rect: 'rounded-xl',
  stadium: 'rounded-[32px]',
  data: '',
  gate: '',
  diamond: '',
  bar: '',
};
/** A cut or diamond corner leaves the outer strip empty, so those fields move inward. */
const SHAPE_INSET: Partial<Record<NodeShape, string>> = {
  data: 'px-4',
  gate: 'px-4',
  diamond: 'px-9',
};

/**
 * A field's words with `$…$` drawn as maths.
 *
 * The runs come from the reader's own inline parser (`readerMarkdown.ts`), so a formula on a card is
 * split by the same rule as a formula in a lesson — one parser, not a second weaker one. Only the
 * maths runs are drawn differently: a card is a diagram label, so its emphasis stays the plain text
 * it already is.
 */
function CardWords({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((run, index) =>
        run.k === 'math' ? <MathView key={index} math={run.v} /> : <span key={index}>{run.v}</span>
      )}
    </>
  );
}

export interface WorkflowNodeCardProps {
  node: WorkflowNode;
  index: number;
  /** Its place in the one reading order — the number the checklist also says. */
  number: number;
  issue: WorkflowIssue | undefined;
  selected: boolean;
  /** Where the canvas draws it: the document's point, or the live one during a drag. */
  position: { x: number; y: number };
  dragging: boolean;
  linking: LinkDraft | null;
  /** What is plugged into each of this card's four dots, read off the document's arrows. */
  sockets: SocketKinds | undefined;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onUpdate: (id: string, patch: Partial<WorkflowNode>) => void;
  onRemove: (id: string) => void;
  onOpenLesson: (lesson: string) => void;
  onDragStart: (event: ReactPointerEvent, node: WorkflowNode) => void;
  onLinkStart: (event: ReactPointerEvent, node: WorkflowNode, side: WorkflowSide) => void;
  /** A press on the body: the canvas's armed arrow lands here, or the press is just a selection. */
  onLinkLand: (event: ReactPointerEvent, node: WorkflowNode) => void;
}

export function WorkflowNodeCard({
  node,
  index,
  number,
  issue,
  selected,
  position,
  dragging,
  linking,
  sockets,
  onSelect,
  onMove,
  onUpdate,
  onRemove,
  onOpenLesson,
  onDragStart,
  onLinkStart,
  onLinkLand,
}: WorkflowNodeCardProps) {
  const Icon = iconForKind(node.kind);
  const meta = KIND_META[node.kind];
  const shape = NODE_SHAPE[node.kind];
  const shaped = shape !== 'rect';
  // A text card is words on the paper: the same fields, no plate around them. Selection still shows
  // a ring, so a label can be nudged and deleted like anything else without a box in the diagram.
  const bare = node.kind === 'text';
  const clip = SHAPE_CLIP[shape];
  const inset = SHAPE_INSET[shape] ?? '';
  const frame = selected
    ? 'border-accent ring-2 ring-accent/25'
    : issue
      ? 'border-amber/70'
      : 'border-line';
  const type = cardType(node.size);
  const ink = cardInk(node.ink);
  // Without a chosen ink the detail keeps the muted colour it always had; a chosen ink is the one
  // colour the learner asked the card's words to be, so both fields take it.
  const detailInk = node.ink ? ink : 'var(--muted)';
  const fill = cardFill(node.fill);
  const titleRuns = parseInline(node.title);
  const detailRuns = parseInline(node.detail);
  const titleMath = titleRuns.some((run) => run.k === 'math');
  const detailMath = detailRuns.some((run) => run.k === 'math');

  // Only the header itself selects. A focus that bubbles up from the delete button or a port must
  // not open the inspector: that panel is in flow above the paper and would move the control under
  // the pointer between its press and its release.
  const selectSelf = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onSelect(node.id);
  };

  // A resting card sits above the connector layer (`z-[15]`): a curve is diagram, the card is what
  // the learner is editing, and an arrow that crosses a card must not hide its title or delete
  // button. A card being dragged rises above the other cards it is crossing.
  return (
    <div
      data-node-id={node.id}
      data-testid={`workflow-node-${index}`}
      data-step={number}
      data-kind={node.kind}
      data-shape={shape}
      style={{
        left: position.x,
        top: position.y,
        width: NODE_WIDTH,
        // A shaped plate is clipped inside this box: tinting the box would paint a rectangle behind
        // the diamond. Only the plain rectangle takes the fill here; the plate takes it below.
        ...(shaped ? {} : { backgroundColor: fill }),
      }}
      className={`absolute cursor-default ${
        shaped ? '' : bare ? `rounded-lg ${selected ? 'ring-1 ring-accent/40' : ''}` : `rounded-xl border bg-panel shadow-sm ${frame}`
      } ${dragging ? 'z-40' : selected ? 'z-30' : 'z-20'} ${dragging && !shaped && !bare ? 'shadow-lg' : ''}`}
      onPointerDown={(event) => onLinkLand(event, node)}
    >
      {shaped && (
        <>
          <div
            aria-hidden="true"
            style={clip ? { clipPath: clip } : undefined}
            className={`pointer-events-none absolute inset-0 drop-shadow-sm ${SHAPE_ROUND[shape]} ${
              selected ? 'bg-accent' : issue ? 'bg-amber/70' : 'bg-line'
            }`}
          />
          <div
            aria-hidden="true"
            style={{ clipPath: clip, backgroundColor: fill }}
            className={`pointer-events-none absolute bg-panel ${SHAPE_ROUND[shape]} ${
              selected ? 'inset-[2px]' : 'inset-px'
            }`}
          />
        </>
      )}
      <div
        data-testid={`workflow-node-drag-${index}`}
        role="group"
        tabIndex={0}
        aria-label={`Card ${number}, ${meta.label}. Drag to move; arrow keys nudge it.`}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        onFocus={selectSelf}
        onPointerDown={(event) => onDragStart(event, node)}
        onKeyDown={(event) => nudgeCard(event, node, onMove, onSelect)}
        className={`flex cursor-grab touch-none items-center gap-1.5 select-none py-1.5 focus-visible:outline-2 focus-visible:outline-accent ${
          bare ? 'bg-transparent px-1' : shaped ? inset : 'rounded-t-xl border-b border-line-soft bg-canvas px-2'
        }`}
      >
        <Icon className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
          {meta.label}
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

      <div className={`space-y-1 ${shaped ? `${inset} py-1.5` : bare ? 'px-1 pb-1' : 'p-1.5'}`}>
        {/* A field with maths in it shows the maths until it is focused, then the source it is made
            of: the input is the same field, hidden behind the rendering rather than a second copy.
            `peer-focus:hidden` is what swaps them, so the card needs no edit state of its own. */}
        <div className="relative">
          <input
            data-testid={`workflow-node-title-${index}`}
            aria-label={`Title of card ${index + 1}`}
            value={node.title}
            maxLength={MAX_STEP_TITLE_CHARS}
            placeholder={`${meta.label} — one idea`}
            onChange={(event) => onUpdate(node.id, { title: event.target.value })}
            onFocus={() => onSelect(node.id)}
            className={`peer w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold outline-none hover:bg-raise focus:border-line focus:bg-canvas ${
              titleMath ? 'opacity-0 focus:opacity-100' : ''
            }`}
            style={{ color: ink, fontSize: type.title }}
          />
          {/* A formula is taller than a line of text (a fraction is two), so the rendering gets a
              little room above and below the input's box rather than being clipped to it. */}
          {titleMath && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -inset-y-1 flex items-center overflow-hidden px-1 py-0.5 peer-focus:hidden"
              style={{ color: ink, fontSize: type.title }}
            >
              <CardWords runs={titleRuns} />
            </span>
          )}
        </div>
        <div className="relative">
          <textarea
            data-testid={`workflow-node-detail-${index}`}
            aria-label={`Detail of card ${index + 1}`}
            value={node.detail}
            rows={2}
            maxLength={MAX_STEP_DETAIL_CHARS}
            placeholder={meta.hint}
            onChange={(event) => onUpdate(node.id, { detail: event.target.value })}
            onFocus={() => onSelect(node.id)}
            className={`peer w-full resize-y rounded border border-transparent bg-transparent px-1 py-0.5 font-mono leading-snug outline-none hover:bg-raise focus:border-line focus:bg-canvas ${
              detailMath ? 'opacity-0 focus:opacity-100' : ''
            }`}
            style={{ color: detailInk, fontSize: type.detail }}
          />
          {detailMath && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -inset-y-1 overflow-hidden whitespace-pre-wrap px-1 py-0.5 font-mono leading-snug peer-focus:hidden"
              style={{ color: detailInk, fontSize: type.detail }}
            >
              <CardWords runs={detailRuns} />
            </span>
          )}
        </div>
        {node.kind === 'branch' && (
          <input
            data-testid={`workflow-node-condition-${index}`}
            aria-label={`Condition on card ${number}'s arrows`}
            value={node.condition ?? ''}
            maxLength={MAX_BRANCH_CONDITION_CHARS}
            placeholder="condition — speed > 0.5"
            onChange={(event) => onUpdate(node.id, { condition: event.target.value })}
            onFocus={() => onSelect(node.id)}
            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[10.5px] outline-none hover:bg-raise focus:border-line focus:bg-canvas"
            style={{ color: 'var(--accent)' }}
          />
        )}
        {meta.measured && (
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

      {(node.note || node.lesson) && (
        <div className="flex flex-wrap items-center gap-1 border-t border-line-soft px-1.5 py-1">
          {node.note && (
            <span
              data-testid={`workflow-node-note-${index}`}
              title={node.note}
              className="flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted"
            >
              <StickyNote className="h-2.5 w-2.5 shrink-0 text-faint" aria-hidden="true" />
              <span className="truncate">{node.note}</span>
            </span>
          )}
          {node.lesson && (
            <button
              type="button"
              data-testid={`workflow-node-lesson-${index}`}
              aria-label={`Open lesson ${node.lesson}`}
              title={`Open lesson ${node.lesson}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onOpenLesson(node.lesson ?? '');
              }}
              className="flex shrink-0 cursor-pointer items-center gap-0.5 rounded border border-line bg-canvas px-1 font-mono text-[10px] text-accent hover:border-accent"
            >
              <BookOpen className="h-2.5 w-2.5" aria-hidden="true" />
              {node.lesson}
            </button>
          )}
        </div>
      )}

      <WorkflowPorts
        node={node}
        index={index}
        number={number}
        sockets={sockets}
        linking={linking}
        onLinkStart={onLinkStart}
      />
    </div>
  );
}
