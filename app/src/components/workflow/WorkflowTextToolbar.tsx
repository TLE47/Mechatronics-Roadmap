import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline, WrapText, X } from 'lucide-react';
import type { WorkflowNode } from '../../workflow.ts';

/**
 * The card-text toolbar (`components/workflow/WorkflowTextToolbar.tsx`).
 *
 * A learner selects words in a card's title or detail, then right-clicks: the browser's menu would
 * offer Copy and Paste, neither of which changes the diagram. This small overlay replaces it with
 * the formatting the card can actually keep — bold, italic, underline, alignment and wrapping.
 *
 * It applies to the whole card, because a card's words are one plain-text field rather than a rich
 * document. That is a deliberate boundary: the field stays searchable, exportable and copyable as
 * plain text, while the learner still gets the visual emphasis a diagram needs.
 */

export interface WorkflowTextToolbarProps {
  node: WorkflowNode;
  x: number;
  y: number;
  onApply: (patch: Partial<WorkflowNode>) => void;
  onClose: () => void;
}

export function WorkflowTextToolbar({ node, x, y, onApply, onClose }: WorkflowTextToolbarProps) {
  const toggle = (field: 'bold' | 'italic' | 'underline') =>
    onApply({ [field]: node[field] ? undefined : true });

  return (
    <>
      <div
        className="fixed inset-0 z-[69]"
        aria-hidden="true"
        onPointerDown={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        data-testid="workflow-text-toolbar"
        role="toolbar"
        aria-label="Format the selected card text"
        style={{
          left: Math.max(8, Math.min(x, window.innerWidth - 286)),
          top: Math.max(8, Math.min(y, window.innerHeight - 54)),
        }}
        className="fixed z-[70] flex items-center gap-0.5 rounded-lg border border-line bg-panel p-1 shadow-xl"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <span className="px-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">Text</span>
        <button
          type="button"
          data-testid="workflow-format-bold"
          aria-label="Bold card text"
          aria-pressed={Boolean(node.bold)}
          onClick={() => toggle('bold')}
          className={`grid h-7 w-7 cursor-pointer place-items-center rounded ${node.bold ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise'}`}
        >
          <Bold className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="workflow-format-italic"
          aria-label="Italic card text"
          aria-pressed={Boolean(node.italic)}
          onClick={() => toggle('italic')}
          className={`grid h-7 w-7 cursor-pointer place-items-center rounded ${node.italic ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise'}`}
        >
          <Italic className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="workflow-format-underline"
          aria-label="Underline card text"
          aria-pressed={Boolean(node.underline)}
          onClick={() => toggle('underline')}
          className={`grid h-7 w-7 cursor-pointer place-items-center rounded ${node.underline ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise'}`}
        >
          <Underline className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line" />
        {(
          [
            ['left', AlignLeft],
            ['center', AlignCenter],
            ['right', AlignRight],
          ] as const
        ).map(([align, Icon]) => (
          <button
            key={align}
            type="button"
            data-testid={`workflow-format-align-${align}`}
            aria-label={`Align card text ${align}`}
            aria-pressed={(node.align ?? 'left') === align}
            onClick={() => onApply({ align: align === 'left' ? undefined : align })}
            className={`grid h-7 w-7 cursor-pointer place-items-center rounded ${(node.align ?? 'left') === align ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise'}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ))}
        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          data-testid="workflow-format-wrap"
          aria-label="Wrap card text"
          aria-pressed={node.wrapText !== false}
          onClick={() => onApply({ wrapText: node.wrapText === false ? undefined : false })}
          className={`grid h-7 w-7 cursor-pointer place-items-center rounded ${node.wrapText !== false ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise'}`}
        >
          <WrapText className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Close the text toolbar"
          onClick={onClose}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded text-faint hover:bg-raise hover:text-body"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
