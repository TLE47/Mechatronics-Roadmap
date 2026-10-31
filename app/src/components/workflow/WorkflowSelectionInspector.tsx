import { BookOpen, StickyNote, X } from 'lucide-react';
import { KIND_META, MAX_FONT_SIZE, MIN_FONT_SIZE, type WorkflowNode } from '../../workflow.ts';
import { isForkJoin, type WorkflowLane } from '../../workflowProcesses.ts';
import { CardSwatches } from './CardSwatches.tsx';
import { cardType } from './cardStyle.ts';

/**
 * The selected card's metadata, kept off the card itself
 * (`components/workflow/WorkflowSelectionInspector.tsx`).
 *
 * A note and a lesson are things a learner attaches to a card, not fields the card needs while
 * drawing: an always-open textarea would make every card taller and put a second paragraph under
 * every detail. The inspector sits in flow *below* the paper, so opening it shortens the canvas from
 * the bottom instead of moving the card the learner just pressed, and it can never be painted under
 * a card, a lane chip or an edge label. It is the keyboard's one path to a lane: choose a lane,
 * choose “New lane”, or take the card out — all native selects.
 *
 * A fork/join bar has no title, note or lesson by design; it still has a lane, because a partition
 * says who owns the concurrency as much as it owns an action.
 */

export interface LessonChoice {
  id: string;
  title: string;
}

export interface WorkflowSelectionInspectorProps {
  node: WorkflowNode;
  number: number;
  lanes: readonly WorkflowLane[];
  laneIndex: number;
  lessons: readonly LessonChoice[];
  onNote: (note: string) => void;
  onLesson: (lesson: string) => void;
  onOpenLesson: (lesson: string) => void;
  onLane: (choice: 'none' | 'new' | number) => void;
  /** A look is optional, so `undefined` puts a card back to the theme's own surface and type. */
  onStyle: (patch: Partial<Pick<WorkflowNode, 'fill' | 'ink' | 'size'>>) => void;
  onDismiss: () => void;
}

export function WorkflowSelectionInspector({
  node,
  number,
  lanes,
  laneIndex,
  lessons,
  onNote,
  onLesson,
  onOpenLesson,
  onLane,
  onStyle,
  onDismiss,
}: WorkflowSelectionInspectorProps) {
  const bar = isForkJoin(node.kind);
  const known = lessons.some((lesson) => lesson.id === node.lesson);
  return (
    <div
      data-testid="workflow-selection"
      role="group"
      aria-label={`Selected ${KIND_META[node.kind].label} ${number}`}
      className="mt-2 rounded-lg border border-line bg-canvas/70 p-2"
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Selected</span>
        <span className="truncate font-mono text-[11px] text-accent">
          {number} · {KIND_META[node.kind].label}
        </span>
        <button
          type="button"
          data-testid="workflow-selection-close"
          aria-label="Close the selected card inspector"
          onClick={onDismiss}
          className="ml-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded text-faint hover:text-body"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        <label className="flex min-w-0 items-center gap-1.5">
          <span className="font-mono text-[10px] text-faint">Lane</span>
          <select
            data-testid="workflow-card-lane"
            aria-label={`Lane for ${KIND_META[node.kind].label} ${number}`}
            value={laneIndex >= 0 ? String(laneIndex) : 'none'}
            onChange={(event) => {
              const value = event.target.value;
              onLane(value === 'new' || value === 'none' ? value : Number(value));
            }}
            className="min-h-9 min-w-0 flex-1 rounded border border-line bg-panel px-1.5 font-mono text-[11px] text-body outline-none focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option value="none">No lane</option>
            {lanes.map((lane, index) => (
              <option key={`${lane.title}-${index}`} value={String(index)}>
                {lane.title || `Lane ${index + 1}`}
              </option>
            ))}
            <option value="new">New lane…</option>
          </select>
        </label>

        {!bar && (
          <label className="flex min-w-0 items-center gap-1.5">
            <BookOpen className="h-3 w-3 shrink-0 text-faint" aria-hidden="true" />
            <span className="font-mono text-[10px] text-faint">Lesson</span>
            <select
              data-testid="workflow-card-lesson"
              aria-label={`Lesson linked from ${KIND_META[node.kind].label} ${number}`}
              value={node.lesson ?? ''}
              onChange={(event) => onLesson(event.target.value)}
              className="min-h-9 min-w-0 flex-1 rounded border border-line bg-panel px-1.5 font-mono text-[11px] text-body outline-none focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="">No lesson</option>
              {node.lesson && !known && <option value={node.lesson}>{node.lesson} (not found)</option>}
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.id} — {lesson.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="workflow-card-lesson-open"
              disabled={!node.lesson}
              onClick={() => node.lesson && onOpenLesson(node.lesson)}
              className="min-h-9 shrink-0 cursor-pointer rounded border border-line bg-panel px-1.5 font-mono text-[10.5px] text-accent hover:bg-raise disabled:cursor-default disabled:opacity-40"
            >
              Open
            </button>
          </label>
        )}
      </div>

      {/* The card's look, not its content: a bar has no words of its own to recolour or resize, so
          it only offers the fill its plate can take. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <CardSwatches label="Fill" field="fill" value={node.fill} onPick={(fill) => onStyle({ fill })} />
        {!bar && (
          <>
            <CardSwatches label="Ink" field="ink" value={node.ink} onPick={(ink) => onStyle({ ink })} />
            {/* Any whole pixel from 9 to 24, not three named steps: the slider commits as it moves,
                the readout names the number, and 12 (the size every card has) stores no field. */}
            <div role="group" aria-label="Text size" className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-faint">Size</span>
              <input
                data-testid="workflow-size"
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={1}
                value={cardType(node.size).title}
                aria-label={`Text size in pixels for ${KIND_META[node.kind].label} ${number}`}
                onChange={(event) => {
                  const size = Number(event.target.value);
                  onStyle({ size: size === 12 ? undefined : size });
                }}
                className="h-6 w-20 cursor-pointer"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span
                data-testid="workflow-size-value"
                className="w-8 font-mono text-[10px] tabular-nums text-muted"
              >
                {cardType(node.size).title}px
              </span>
            </div>
          </>
        )}
      </div>

      {!bar && (
        <label className="mt-1.5 flex items-start gap-1.5">
          <StickyNote className="mt-1 h-3 w-3 shrink-0 text-faint" aria-hidden="true" />
          <span className="sr-only">Note on {KIND_META[node.kind].label} {number}</span>
          <textarea
            data-testid="workflow-card-note"
            aria-label={`Note on ${KIND_META[node.kind].label} ${number}`}
            value={node.note ?? ''}
            rows={1}
            placeholder="note — why this step, or what to check"
            onChange={(event) => onNote(event.target.value)}
            className="min-h-8 w-full resize-y rounded border border-transparent bg-transparent px-1 py-1 font-mono text-[11px] text-muted outline-none hover:bg-raise focus:border-line focus:bg-panel"
          />
        </label>
      )}
    </div>
  );
}
