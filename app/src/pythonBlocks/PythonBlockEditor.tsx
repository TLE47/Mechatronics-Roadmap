import { useState, type KeyboardEvent } from 'react';
import { Blocks, Redo2, Undo2 } from 'lucide-react';
import { type BlockNode } from './ast.ts';
import { BlockCard, type BlockCardHandlers } from './BlockCard';
import { APPEARANCE_LABELS, type BlockAppearance } from './appearance.ts';
import { PythonToolbox } from './PythonToolbox';
import { itemById } from './registry.ts';
import { readBlockSettings, writeBlockSettings } from './settings.ts';
import { useBlockEditor } from './useBlockEditor';

/**
 * The visual Python workspace (`app/src/pythonBlocks/PythonBlockEditor.tsx`).
 *
 * This is the editor's Visual face. It owns no code of its own: the hook holds the program, every
 * edit is rendered to Python and written back to the tab's one `main.py`, and the same Run, checks
 * and drafts that read the code editor read this. Switching to Python Code is a change of drawing,
 * not a change of document.
 *
 * The toolbar is deliberately small — undo, redo, the Normal/Colorful switch, the statement count —
 * because the workspace is the instrument. Appearance and undo history are device-local; the code
 * is not.
 */
export function PythonBlockEditor({
  code,
  onCode,
  active = true,
}: {
  code: string;
  onCode: (next: string) => void;
  /** False while Python Code is the face on screen; the model then waits for the next switch. */
  active?: boolean;
}) {
  const editor = useBlockEditor(code, onCode, active);
  const [appearance, setAppearance] = useState<BlockAppearance>(
    () => readBlockSettings().appearance
  );
  const chooseAppearance = (next: BlockAppearance) => {
    setAppearance(next);
    writeBlockSettings({ appearance: next });
  };

  const count = countStatements(editor.program.nodes);
  const handlers: BlockCardHandlers = {
    appearance,
    selectedId: editor.selectedId,
    insertionHere: (bodyId, index) =>
      editor.insertion.bodyId === bodyId && editor.insertion.index === index,
    onSelect: editor.select,
    onField: editor.editField,
    onMove: editor.move,
    onDuplicate: editor.duplicate,
    onRemove: editor.remove,
    onInsertInside: (id) => editor.insertAtEnd(id),
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const target = event.target as HTMLElement;
    // Inside a field, the browser's own text undo is the one the learner expects.
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    } else if (key === 'y') {
      event.preventDefault();
      editor.redo();
    }
  };

  const rootInsertion =
    editor.insertion.bodyId === null &&
    editor.insertion.index === editor.program.nodes.length &&
    editor.program.nodes.length > 0;

  return (
    <div
      data-testid="python-block-editor"
      data-appearance={appearance}
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-col bg-panel"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line-soft bg-canvas px-2 py-1.5">
        <p className="flex min-w-0 flex-1 items-center gap-1 text-[11px] leading-snug text-muted">
          <Blocks className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0">
            Blocks write <code>main.py</code> — the same program Run executes.
          </span>
        </p>

        <div
          role="group"
          aria-label="Block appearance"
          data-testid="block-appearance"
          className="flex shrink-0 rounded-lg border border-line-soft bg-panel p-0.5"
        >
          {(Object.keys(APPEARANCE_LABELS) as BlockAppearance[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={appearance === option}
              data-testid={`block-appearance-${option}`}
              title={
                option === 'normal'
                  ? 'Neutral cards with subtle borders'
                  : 'Semantic colours for each kind of statement'
              }
              onClick={() => chooseAppearance(option)}
              className={`min-h-7 cursor-pointer rounded-md px-2 font-mono text-[11.5px] transition-colors ${
                appearance === option
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'text-muted hover:text-body'
              }`}
            >
              {APPEARANCE_LABELS[option]}
            </button>
          ))}
        </div>

        <span
          role="status"
          data-testid="block-count"
          className="shrink-0 font-mono text-[11px] tabular-nums text-faint"
        >
          {count} {count === 1 ? 'statement' : 'statements'}
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            data-testid="block-undo"
            aria-label="Undo the last block edit"
            title="Undo (⌘Z)"
            disabled={!editor.canUndo}
            onClick={editor.undo}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-line-soft bg-panel text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-default disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="block-redo"
            aria-label="Redo the last block edit"
            title="Redo (⇧⌘Z)"
            disabled={!editor.canRedo}
            onClick={editor.redo}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-line-soft bg-panel text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-default disabled:opacity-40"
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div data-testid="python-workspace" className="min-w-0 px-2 py-2">
        {editor.program.nodes.length === 0 ? (
          <div
            data-testid="python-workspace-empty"
            className="rounded-lg border border-dashed border-line bg-canvas px-3 py-4 text-center"
          >
            <p className="m-0 text-[13px] font-semibold text-body">No statements yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-snug text-muted">
              Add one from the Python Toolbox below, or start with an assignment.
            </p>
            <button
              type="button"
              data-testid="block-add-first"
              onClick={() => {
                const assignment = itemById('assignment');
                if (assignment) editor.insert(assignment.template, assignment.id);
              }}
              className="mt-2 min-h-8 cursor-pointer rounded-lg border border-accent/40 bg-accent-soft px-2.5 font-mono text-[12px] font-semibold text-accent transition-colors hover:border-accent"
            >
              Add <code>name = &quot;Alex&quot;</code>
            </button>
          </div>
        ) : (
          <ol
            data-testid="python-workspace-list"
            aria-label="Python statements"
            className="m-0 flex list-none flex-col gap-1 p-0"
          >
            {editor.program.nodes.map((node, index) => (
              <BlockCard
                key={node.id}
                node={node}
                bodyId={null}
                index={index}
                position={String(index + 1)}
                handlers={handlers}
              />
            ))}
          </ol>
        )}

        {rootInsertion && (
          <div
            aria-hidden="true"
            data-testid="block-insertion"
            className="mx-1 mt-1 h-0.5 rounded bg-accent"
          />
        )}

        <button
          type="button"
          data-testid="block-add-statement"
          onClick={() => editor.insertAtEnd(null)}
          className="mt-1.5 flex min-h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-line px-2 font-mono text-[12px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
        >
          + Add statement
        </button>
      </div>

      <PythonToolbox
        onInsert={(item) => editor.insert(item.template, item.id)}
        recent={editor.recent}
      />
    </div>
  );
}

function countStatements(nodes: readonly BlockNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countStatements(node.body), 0);
}
