import {
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { BookOpen, ClipboardCheck, Cpu, Gauge, StickyNote, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  KIND_META,
  MAX_BRANCH_CONDITION_CHARS,
  MAX_NODE_HEIGHT,
  MAX_NODE_WIDTH,
  MAX_STEP_DETAIL_CHARS,
  MAX_STEP_TITLE_CHARS,
  MAX_STEP_UNIT_CHARS,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  NODE_HEIGHT,
  NODE_SHAPE,
  nodeHeight,
  nodeWidth,
  type NodeShape,
  type SocketKinds,
  type WorkflowIssue,
  type WorkflowNode,
  type WorkflowSide,
} from '../../workflow.ts';
import { missingProjectObject, type ProjectObject } from '../../projectRef.ts';
import { PROJECT_WORDS } from '../../projectPresentation.ts';
import { iconForKind } from '../workflowIcons.ts';
import { MathView } from '../MathView.tsx';
import { parseInline, type InlineRun } from '../../readerMarkdown.ts';
import { cardFill, cardInk, cardType } from './cardStyle.ts';
import { nudgeCard } from './cardNudge.ts';
import { WorkflowPorts } from './WorkflowPorts.tsx';
import { WorkflowTextToolbar, type TextAnchor } from './WorkflowTextToolbar.tsx';
import type { LinkDraft } from './useLinking.ts';

/** The badge glyph for each kind; the card is the only surface that draws one. */
const PROJECT_ICONS: Record<string, typeof Cpu> = {
  component: Cpu,
  requirement: ClipboardCheck,
  test: Gauge,
};

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
  /** The project object this card cites, when the id still resolves; the id alone otherwise. */
  projectObject: ProjectObject | undefined;
  index: number;
  /** Its place in the one reading order — the number the checklist also says. */
  number: number;
  issue: WorkflowIssue | undefined;
  selected: boolean;
  /** A run token is on this card: the simulation's trail, drawn in the run colour. */
  active: boolean;
  /** Where the canvas draws it: the document's point, or the live one during a drag. */
  position: { x: number; y: number };
  dragging: boolean;
  linking: LinkDraft | null;
  /** What is plugged into each of this card's four dots, read off the document's arrows. */
  sockets: SocketKinds | undefined;
  onSelect: (id: string, additive?: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onUpdate: (id: string, patch: Partial<WorkflowNode>) => void;
  onRemove: (id: string) => void;
  onOpenLesson: (lesson: string) => void;
  /** Pressed on the badge: open the cited object in the view its kind owns. */
  onOpenObject?: (projectRef: string) => void;
  onDragStart: (event: ReactPointerEvent, node: WorkflowNode) => void;
  onLinkStart: (event: ReactPointerEvent, node: WorkflowNode, side: WorkflowSide) => void;
  /** A press on the body: the canvas's armed arrow lands here, or the press is just a selection. */
  onLinkLand: (event: ReactPointerEvent, node: WorkflowNode) => void;
}

export function WorkflowNodeCard({
  node,
  projectObject,
  index,
  number,
  issue,
  selected,
  active,
  position,
  dragging,
  linking,
  sockets,
  onSelect,
  onMove,
  onUpdate,
  onRemove,
  onOpenLesson,
  onOpenObject,
  onDragStart,
  onLinkStart,
  onLinkLand,
}: WorkflowNodeCardProps) {
  const Icon = iconForKind(node.kind);
  const meta = KIND_META[node.kind];
  const shape = NODE_SHAPE[node.kind];
  const words = projectObject ? PROJECT_WORDS[projectObject.kind] : undefined;
  const ObjectIcon = projectObject ? PROJECT_ICONS[projectObject.kind] : undefined;
  const badgeIcon = ObjectIcon ? (
    <ObjectIcon className="h-2.5 w-2.5 shrink-0 text-accent" aria-hidden="true" />
  ) : (
    <Cpu className="h-2.5 w-2.5 shrink-0 text-accent" aria-hidden="true" />
  );
  const badgeLabel = projectObject ? projectObject.label : node.projectRef;
  const badgeTitle = projectObject
    ? `${projectObject.id} — open ${words?.label ?? projectObject.kind}`
    : missingProjectObject(node.projectRef ?? '');
  const shaped = shape !== 'rect';
  // A text card is words on the paper: the same fields, no plate around them. Selection still shows
  // a ring, so a label can be nudged and deleted like anything else without a box in the diagram.
  const bare = node.kind === 'text';
  const clip = SHAPE_CLIP[shape];
  const inset = SHAPE_INSET[shape] ?? '';
  const frame = active
    ? 'border-emerald ring-2 ring-emerald/40'
    : selected
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
  const [liveSize, setLiveSize] = useState<{ width: number; height: number } | null>(null);
  const [toolbarAt, setToolbarAt] = useState<TextAnchor | null>(null);
  const [toolbarCard, setToolbarCard] = useState<TextAnchor | null>(null);
  const [toolbarField, setToolbarField] = useState<'title' | 'detail'>('title');
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const detailRef = useRef<HTMLTextAreaElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const resizeSize = useRef({ width: nodeWidth(node), height: NODE_HEIGHT });
  const width = liveSize?.width ?? nodeWidth(node);
  /** A chosen height, or null while the card is as tall as its words. */
  const height = liveSize?.height ?? nodeHeight(node);

  // A wrapped field grows with its words instead of showing a one-line scrollbar. This is the
  // difference between a diagram label and a form control that happens to be on a canvas.
  useLayoutEffect(() => {
    for (const field of [titleRef.current, detailRef.current]) {
      if (!field) continue;
      // Measure the words first, then the field's own rows-based height. A field that still fits
      // in its `rows` keeps no inline height at all: that is what makes one-line cards byte-for-byte
      // identical to the card they were before this control existed.
      field.style.height = '0px';
      const needed = field.scrollHeight;
      field.style.height = '';
      const natural = field.scrollHeight;
      if (needed > natural + 1) field.style.height = `${needed}px`;
    }
  }, [node.title, node.detail, width, node.size, node.wrapText]);

  /** Title and detail carry their own formatting: a press in one field must not reformat the other.
   * Only a chosen value is written, so an untouched card keeps exactly its pre-formatting style. */
  const titleFormatStyle: CSSProperties = {
    ...(node.bold ? { fontWeight: 700 } : {}),
    ...(node.italic ? { fontStyle: 'italic' } : {}),
    ...(node.underline ? { textDecorationLine: 'underline' } : {}),
    ...(node.align ? { textAlign: node.align } : {}),
    ...(node.wrapText === false ? { whiteSpace: 'nowrap' } : {}),
  };
  const detailFormatStyle: CSSProperties = {
    ...(node.detailBold ? { fontWeight: 700 } : {}),
    ...(node.detailItalic ? { fontStyle: 'italic' } : {}),
    ...(node.detailUnderline ? { textDecorationLine: 'underline' } : {}),
    ...(node.detailAlign ? { textAlign: node.detailAlign } : {}),
    ...(node.wrapText === false ? { whiteSpace: 'nowrap' } : {}),
  };

  /** A selected range in a field is the request for the formatting toolbar. */
  const openTextMenu = (event: ReactMouseEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    if (field.selectionStart === field.selectionEnd) return;
    event.preventDefault();
    event.stopPropagation();
    const box = field.getBoundingClientRect();
    setToolbarField(field === titleRef.current ? 'title' : 'detail');
    // The field decides above/below; the whole card decides whether a bar below it would land on
    // the card's own next line in a window shorter than the card.
    const card = field.closest<HTMLElement>('[data-node-id]')?.getBoundingClientRect();
    setToolbarAt({
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    });
    setToolbarCard(
      card
        ? {
            left: card.left,
            top: card.top,
            right: card.right,
            bottom: card.bottom,
            width: card.width,
            height: card.height,
          }
        : null
    );
  };

  /**
   * Drag the corner to resize the plate in both directions.
   *
   * The gesture is one document write, on release, and both axes are clamped to a quarter and twice
   * the size the drag started from — so a card cannot be dragged into a sliver or an unscrollable
   * wall, and the same drag means the same thing whatever size the card was.
   */
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = width;
    const startHeight = cardRef.current?.offsetHeight ?? NODE_HEIGHT;
    resizeSize.current = { width: startWidth, height: startHeight };
    const move = (pointerEvent: PointerEvent) => {
      // The bounds are the card's own 25%–200%, not a share of wherever this drag began: a drag
      // could otherwise ratchet a card smaller — or larger — one gesture at a time.
      const next = {
        width: Math.min(
          MAX_NODE_WIDTH,
          Math.max(MIN_NODE_WIDTH, startWidth + pointerEvent.clientX - startX)
        ),
        height: Math.min(
          MAX_NODE_HEIGHT,
          Math.max(MIN_NODE_HEIGHT, startHeight + pointerEvent.clientY - startY)
        ),
      };
      resizeSize.current = next;
      setLiveSize(next);
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      const next = resizeSize.current;
      setLiveSize(null);
      const patch: Partial<WorkflowNode> = {};
      if (Math.round(next.width) !== startWidth) patch.width = Math.round(next.width);
      if (Math.round(next.height) !== startHeight) patch.height = Math.round(next.height);
      if (patch.width || patch.height) onUpdate(node.id, patch);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

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
      ref={cardRef}
      data-node-id={node.id}
      data-testid={`workflow-node-${index}`}
      data-step={number}
      data-kind={node.kind}
      data-shape={shape}
      data-run-active={active ? 'true' : undefined}
      style={{
        left: position.x,
        top: position.y,
        width,
        // A vertical resize is a chosen plate height, not a new layout: the fields keep growing with
        // their words and a fixed box clips the overflow (with room for the ports and the handle).
        ...(height ? { height } : {}),
        ...(height ? ({ overflow: 'clip', overflowClipMargin: '18px' } as CSSProperties) : {}),
        // A shaped plate is clipped inside this box: tinting the box would paint a rectangle behind
        // the diamond. Only the plain rectangle takes the fill here; the plate takes it below.
        ...(shaped ? {} : { backgroundColor: fill }),
      }}
      className={`absolute cursor-default ${
        shaped
          ? ''
          : bare
            ? `rounded-lg ${active ? 'ring-1 ring-emerald/60' : selected ? 'ring-1 ring-accent/40' : ''}`
            : `rounded-xl border bg-panel shadow-sm ${frame}`
      } ${dragging ? 'z-40' : selected ? 'z-30' : 'z-20'} ${dragging && !shaped && !bare ? 'shadow-lg' : ''}`}
      onPointerDown={(event) => onLinkLand(event, node)}
    >
      {shaped && (
        <>
          <div
            aria-hidden="true"
            style={clip ? { clipPath: clip } : undefined}
            className={`pointer-events-none absolute inset-0 drop-shadow-sm ${SHAPE_ROUND[shape]} ${
              active ? 'bg-emerald' : selected ? 'bg-accent' : issue ? 'bg-amber/70' : 'bg-line'
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
        {/* What this step touches in the project: one id, resolved to its designation and part
            number, or to a requirement's reference and title. A card whose id no longer resolves
            still says which id it cites, rather than silently dropping the reference — a dangling
            citation is worth seeing. The glyph says which view the badge opens. */}
        {node.projectRef &&
          (onOpenObject ? (
            <button
              type="button"
              data-testid={`workflow-node-ref-${index}`}
              title={badgeTitle}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onOpenObject(node.projectRef as string)}
              className="flex w-full min-w-0 cursor-pointer items-center gap-1 rounded bg-raise/60 px-1 py-0.5 text-left font-mono text-[9.5px] text-muted hover:bg-raise hover:text-body focus-visible:outline-2 focus-visible:outline-accent"
            >
              {badgeIcon}
              <span className="truncate">{badgeLabel}</span>
            </button>
          ) : (
            <div
              data-testid={`workflow-node-ref-${index}`}
              title={projectObject ? projectObject.id : missingProjectObject(node.projectRef)}
              className="flex min-w-0 items-center gap-1 rounded bg-raise/60 px-1 py-0.5 font-mono text-[9.5px] text-muted"
            >
              {badgeIcon}
              <span className="truncate">{badgeLabel}</span>
            </div>
          ))}
        {/* A field with maths in it shows the maths until it is focused, then the source it is made
            of: the input is the same field, hidden behind the rendering rather than a second copy.
            `peer-focus:hidden` is what swaps them, so the card needs no edit state of its own. */}
        <div className="relative">
          <textarea
            ref={titleRef}
            data-testid={`workflow-node-title-${index}`}
            aria-label={`Title of card ${index + 1}`}
            value={node.title}
            rows={1}
            wrap={node.wrapText === false ? 'off' : 'soft'}
            maxLength={MAX_STEP_TITLE_CHARS}
            placeholder={`${meta.label} — one idea`}
            onChange={(event) => onUpdate(node.id, { title: event.target.value })}
            onFocus={() => onSelect(node.id)}
            onContextMenu={openTextMenu}
            className={`peer block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold outline-none hover:bg-raise focus:border-line focus:bg-canvas ${
              node.wrapText === false ? 'whitespace-nowrap' : 'break-words'
            } ${titleMath ? 'opacity-0 focus:opacity-100' : ''}`}
            style={{ color: ink, fontSize: type.title, ...titleFormatStyle }}
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
            ref={detailRef}
            data-testid={`workflow-node-detail-${index}`}
            aria-label={`Detail of card ${index + 1}`}
            value={node.detail}
            rows={2}
            wrap={node.wrapText === false ? 'off' : 'soft'}
            maxLength={MAX_STEP_DETAIL_CHARS}
            placeholder={meta.hint}
            onChange={(event) => onUpdate(node.id, { detail: event.target.value })}
            onFocus={() => onSelect(node.id)}
            onContextMenu={openTextMenu}
            className={`peer block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent px-1 py-0.5 font-mono leading-snug outline-none hover:bg-raise focus:border-line focus:bg-canvas ${
              node.wrapText === false ? 'whitespace-nowrap' : 'break-words'
            } ${detailMath ? 'opacity-0 focus:opacity-100' : ''}`}
            style={{ color: detailInk, fontSize: type.detail, ...detailFormatStyle }}
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

      {/* The corner is deliberately a button, not a decorative div: it is a pointer affordance with
          a name and a keyboard-reachable target, and a press on it must never start a card drag. */}
      <button
        type="button"
        data-testid={`workflow-node-resize-${index}`}
        aria-label={`Resize card ${number}: drag the corner right or left, down or up`}
        title="Drag the corner to resize both ways (25%–200%); Fit text in the inspector fits the words"
        onPointerDown={beginResize}
        className="absolute -bottom-1 -right-1 z-30 h-3.5 w-3.5 touch-none cursor-nwse-resize rounded-full border border-accent bg-panel shadow-sm hover:bg-accent/20"
      />

      {toolbarAt &&
        typeof document !== 'undefined' &&
        createPortal(
          <WorkflowTextToolbar
            node={node}
            field={toolbarField}
            anchor={toolbarAt}
            card={toolbarCard}
            onApply={(patch) => onUpdate(node.id, patch)}
            onClose={() => setToolbarAt(null)}
          />,
          document.body
        )}
    </div>
  );
}
