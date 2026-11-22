import type { ReactNode } from 'react';
import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronUp, Copy, CornerDownRight, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { KIND_LABELS, type BlockFields, type BlockNode, isContainer } from './ast.ts';
import { blockColors, type BlockAppearance } from './appearance.ts';
import { InlineField } from './InlineField';

/**
 * One Python statement as a card (`app/src/pythonBlocks/BlockCard.tsx`).
 *
 * The card's header is the statement's actual Python, token by token: a keyword in the family's ink
 * and every value a tappable field. A suite's body is drawn inside it, one level in, so the shape on
 * screen is the shape of the file. Editing a value never opens a dialog; the program stays visible
 * while one word of it changes.
 *
 * Controls are per statement — up, down, duplicate, delete, insert after — because those are the
 * operations a learner thinks in ("move this print above the if"). A container also offers **Add
 * statement inside**, which is how a nested suite is built without typing indentation.
 *
 * Raw Python — a class, a decorator, a statement outside the supported set — is shown as its own
 * lines and explained, not hidden: the editor's promise is that code it cannot draw is code it did
 * not change.
 */

export interface BlockCardHandlers {
  appearance: BlockAppearance;
  selectedId: string | null;
  /**
   * Whether a card opens with its five controls drawn.
   *
   * Desktop has the width for them and a learner can see what a card can do; a phone's card is the
   * code and nothing else until the learner asks for the controls, which is room a 390 px screen
   * cannot spend on five 24 px buttons. The toggle is on every card either way.
   */
  actionsOpenByDefault: boolean;
  insertionHere: (bodyId: string | null, index: number) => boolean;
  onSelect: (nodeId: string | null, bodyId: string | null, index: number) => void;
  onField: (id: string, fields: Partial<BlockFields>) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onInsertInside: (id: string) => void;
}

function keyword(text: string) {
  return <span className="font-semibold">{text}</span>;
}

function punctuation(text: string) {
  return <span aria-hidden="true">{text}</span>;
}

function Tokens({
  node,
  ink,
  field,
  onField,
}: {
  node: BlockNode;
  ink: string;
  field: string;
  onField: (id: string, fields: Partial<BlockFields>) => void;
}) {
  const f = node.fields;
  const edit = (key: keyof BlockFields, label: string, minWidth = 4) => (
    <InlineField
      value={f[key] ?? ''}
      label={label}
      testId={`block-field-${String(key)}-${node.id}`}
      ink={ink}
      field={field}
      minWidth={minWidth}
      onCommit={(next) => onField(node.id, { [key]: next })}
    />
  );

  switch (node.kind) {
    case 'assign':
      return (
        <>
          {edit('name', 'variable name', 6)}
          <span aria-hidden="true">{f.op ?? '='}</span>
          {edit('value', 'value', 8)}
        </>
      );
    case 'call':
      return (
        <>
          <span className="font-semibold">{f.callee?.trim() || 'print'}</span>
          {punctuation('(')}
          {edit('args', 'arguments', 8)}
          {punctuation(')')}
        </>
      );
    case 'if':
    case 'elif':
      return (
        <>
          {keyword(node.kind)}
          {edit('condition', 'condition', 10)}
          {punctuation(':')}
        </>
      );
    case 'else':
    case 'try':
    case 'finally':
      return <>{keyword(`${node.kind}:`)}</>;
    case 'for':
      return (
        <>
          {keyword('for')}
          {edit('target', 'loop variable', 4)}
          {keyword('in')}
          {edit('iterable', 'what to loop over', 8)}
          {punctuation(':')}
        </>
      );
    case 'while':
      return (
        <>
          {keyword('while')}
          {edit('condition', 'condition', 10)}
          {punctuation(':')}
        </>
      );
    case 'def':
      return (
        <>
          {keyword('def')}
          {edit('name', 'function name', 6)}
          {punctuation('(')}
          {edit('params', 'parameters', 6)}
          {punctuation('):')}
        </>
      );
    case 'return':
      return (
        <>
          {keyword('return')}
          {edit('value', 'return value', 6)}
        </>
      );
    case 'except':
      return (
        <>
          {keyword('except')}
          {edit('clause', 'exception type', 8)}
          {punctuation(':')}
        </>
      );
    default:
      return null;
  }
}

export function BlockCard({
  node,
  bodyId,
  index,
  position,
  handlers,
}: {
  node: BlockNode;
  /** The body this card sits in: null for the program's own body. */
  bodyId: string | null;
  index: number;
  /** Readable position such as `2` or `2.1`, used in the card's accessible name. */
  position: string;
  handlers: BlockCardHandlers;
}) {
  const colors = blockColors(node.kind, handlers.appearance);
  const [actionsOpen, setActionsOpen] = useState(handlers.actionsOpenByDefault);
  const selected = handlers.selectedId === node.id;
  const container = isContainer(node.kind);
  const raw = node.kind === 'raw' || node.kind === 'import';
  const label = KIND_LABELS[node.kind];
  const action = (
    name: string,
    title: string,
    icon: ReactNode,
    onClick: () => void,
    testId: string
  ) => (
    <button
      type="button"
      aria-label={`${name} ${label} statement ${position}`}
      title={title}
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent text-muted transition-colors hover:border-line-soft hover:bg-raise hover:text-ink"
    >
      {icon}
    </button>
  );

  return (
    <li
      data-testid={`python-block-${node.kind}`}
      data-block-id={node.id}
      className="relative list-none"
    >
      {handlers.insertionHere(bodyId, index + 1) && (
        <div
          aria-hidden="true"
          data-testid="block-insertion"
          className="mx-1 h-0.5 rounded bg-accent"
        />
      )}
      <div
        role="group"
        aria-label={`${label} statement ${position}`}
        // A dragged toolbox element released here lands directly below this statement. The suite's
        // own body publishes a deeper target, so a drop inside a container reaches the container.
        data-drop-body={bodyId ?? ''}
        data-drop-index={index + 1}
        onClick={() => handlers.onSelect(node.id, bodyId, index)}
        style={{
          background: colors.background,
          border: `1px solid ${selected ? 'var(--accent)' : colors.border}`,
          borderLeft: `3px solid ${colors.rule}`,
          borderRadius: 8,
          boxShadow: selected ? '0 0 0 2px var(--accent-soft)' : undefined,
        }}
        className="min-w-0 px-2 py-1.5"
      >
        <div className="flex min-w-0 flex-wrap items-start gap-1">
          <div className="min-w-0 flex-1">
            {raw ? (
              <>
                <pre
                  className="m-0 max-w-full overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12.5px] leading-5"
                  style={{ color: 'var(--body)' }}
                  data-testid="block-raw-code"
                >
                  {node.lines.join('\n')}
                </pre>
                {node.kind === 'raw' && (
                  <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                    Kept exactly as written — these lines are outside the visual blocks.
                  </p>
                )}
              </>
            ) : (
              <div
                className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-[13px] leading-6"
                style={{ color: colors.ink }}
              >
                <Tokens node={node} ink={colors.ink} field={colors.field} onField={handlers.onField} />
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {actionsOpen && (
              <>
                {action(
                  'Insert after',
                  'Insert a toolbox statement after this one',
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />,
                  () => handlers.onSelect(node.id, bodyId, index + 1),
                  'block-insert-after'
                )}
                {action(
                  'Move up',
                  'Move this statement up',
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />,
                  () => handlers.onMove(node.id, -1),
                  'block-move-up'
                )}
                {action(
                  'Move down',
                  'Move this statement down',
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />,
                  () => handlers.onMove(node.id, 1),
                  'block-move-down'
                )}
                {action(
                  'Duplicate',
                  'Duplicate this statement',
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />,
                  () => handlers.onDuplicate(node.id),
                  'block-duplicate'
                )}
                {action(
                  'Delete',
                  'Delete this statement',
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />,
                  () => handlers.onRemove(node.id),
                  'block-remove'
                )}
              </>
            )}
            {/* One control always visible: a card with no way back to its buttons would hide the
                only way to move or delete the statement. */}
            <button
              type="button"
              data-testid="block-actions-toggle"
              aria-expanded={actionsOpen}
              aria-label={`${actionsOpen ? 'Hide' : 'Show'} controls for ${label} statement ${position}`}
              title={
                actionsOpen
                  ? 'Hide the controls and give the code the room'
                  : 'Insert, move, copy or delete this statement'
              }
              onClick={(event) => {
                event.stopPropagation();
                setActionsOpen((value) => !value);
              }}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent text-faint transition-colors hover:border-line-soft hover:bg-raise hover:text-ink"
            >
              {actionsOpen ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {container && (
          <div
            data-drop-body={node.id}
            data-drop-index={node.body.length}
            className="mt-1.5 min-w-0 pl-2"
            style={{ borderLeft: `2px solid ${colors.border}` }}
          >
            {node.body.length > 0 ? (
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {node.body.map((child, childIndex) => (
                  <BlockCard
                    key={child.id}
                    node={child}
                    bodyId={node.id}
                    index={childIndex}
                    position={`${position}.${childIndex + 1}`}
                    handlers={handlers}
                  />
                ))}
              </ol>
            ) : (
              <p
                className="px-1 py-0.5 text-[11px] leading-snug"
                style={{ color: 'var(--muted)' }}
              >
                Nothing inside yet — add a statement here. The code uses <code>pass</code> until
                then.
              </p>
            )}
            <button
              type="button"
              data-testid={`block-add-inside-${node.id}`}
              // Keep the visible words first: `label-content-name-mismatch` (WCAG 2.5.3) fails
              // when the accessible name paraphrases "Add statement inside" instead of containing it.
              aria-label={`Add statement inside ${label} statement ${position}`}
              onClick={(event) => {
                event.stopPropagation();
                handlers.onInsertInside(node.id);
              }}
              className="mt-1 flex min-h-7 cursor-pointer items-center gap-1 rounded border border-dashed border-line px-1.5 font-mono text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
            >
              <CornerDownRight className="h-3 w-3" aria-hidden="true" />
              Add statement inside
            </button>
            {handlers.insertionHere(node.id, node.body.length) && (
              <div
                aria-hidden="true"
                data-testid="block-insertion"
                className="mx-1 mt-1 h-0.5 rounded bg-accent"
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}
