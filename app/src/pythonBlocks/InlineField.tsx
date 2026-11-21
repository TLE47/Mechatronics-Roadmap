import { useEffect, useRef, useState } from 'react';

/**
 * One editable token inside a statement card (`app/src/pythonBlocks/InlineField.tsx`).
 *
 * A tap opens the value where it is, not in a dialog: the point of a Python-shaped card is that the
 * program stays on screen while a learner changes one word of it. Enter or leaving the field commits
 * once; Escape puts the old value back. The input's width follows its text (`ch`, the monospace
 * character width), so a short name does not leave a wide hole and a long one does not clip.
 *
 * `draft` resets when the committed value changes from elsewhere — an undo, or a parse of code the
 * learner typed — which keeps the field showing the program rather than an edit that was replaced.
 */
export function InlineField({
  value,
  label,
  onCommit,
  testId,
  ink,
  field,
  minWidth = 4,
}: {
  value: string;
  label: string;
  onCommit: (next: string) => void;
  testId: string;
  ink: string;
  field: string;
  minWidth?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const finish = (commit: boolean) => {
    setEditing(false);
    if (!commit) {
      setDraft(value);
      return;
    }
    if (draft !== value) onCommit(draft);
  };

  if (!editing) {
    return (
      <button
        type="button"
        data-testid={testId}
        aria-label={`Edit ${label}: ${value || 'empty'}`}
        title={`Edit ${label}`}
        onClick={() => setEditing(true)}
        className="max-w-full shrink truncate rounded px-1 font-mono text-[13px] leading-5 transition-colors hover:bg-raise"
        style={{
          color: ink,
          borderBottom: '1px dashed var(--border-strong)',
          background: 'transparent',
        }}
      >
        {value || '…'}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      data-testid={`${testId}-input`}
      aria-label={label}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      }}
      style={{
        width: `${Math.max(minWidth, draft.length + 1)}ch`,
        maxWidth: '100%',
        color: ink,
        background: field,
        border: '1px solid var(--accent)',
        borderRadius: 4,
        padding: '0 2px',
        font: 'inherit',
        lineHeight: 1.5,
      }}
    />
  );
}
