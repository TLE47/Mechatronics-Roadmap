import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * One editable token inside a statement card (`app/src/pythonBlocks/InlineField.tsx`).
 *
 * A tap opens the value where it is, not in a dialog: the point of a Python-shaped card is that the
 * program stays on screen while a learner changes one word of it. Enter or leaving the field commits
 * once; Escape puts the old value back. The input's width follows its text (`ch`, the monospace
 * character width), so a short name does not leave a wide hole and a long one does not clip.
 *
 * **The field is 13 px, and iOS must not zoom it.** A focused editable that computes under 16 px is
 * zoomed by iOS on the whole page, and the block would be a magnified fragment until the learner
 * pinches back out. So on a coarse pointer the input is laid out at 16 px — every length enlarged
 * by 16/13, and the font too — and scaled back down by 13/16 (`index.css`). The wrapper reserves the
 * scaled box, so the statement's own size, the row it sits in and the field's hit target are the
 * ones the block had before the tap. The scale is a coarse-pointer rule; a desktop keeps the plain
 * 13 px input.
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

  // The wrapper's width is in the row's 13 px `ch`; the input's own `ch` is the same unit in its
  // 16 px type, so the scaled field lands exactly on the wrapper.
  const chars = Math.max(minWidth, draft.length + 1);
  return (
    <span
      className="inline-field"
      style={{ '--field-chars': chars, '--field-fill': field } as CSSProperties}
    >
      <input
        ref={inputRef}
        type="text"
        value={draft}
        data-testid={`${testId}-input`}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        // A native-keyboard switch blurs and re-focuses the field to raise the OS keyboard. That
        // blur is not the learner leaving: committing now would unmount the input before focus.
        onBlur={() => {
          if (inputRef.current?.dataset.nativeKeyboard === '1') return;
          finish(true);
        }}
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
          width: 'calc(var(--field-chars) * 1ch)',
          // On a touch screen the enlarged input may be capped at the enlarged wrapper, never past
          // the statement's own right edge.
          maxWidth: 'calc(100% * var(--field-ring, 1))',
          color: ink,
          background: field,
          border: 'calc(1px * var(--field-ring, 1)) solid var(--accent)',
          borderRadius: 'calc(4px * var(--field-ring, 1))',
          padding: '0 calc(2px * var(--field-ring, 1))',
          // Longhands rather than `font: inherit`, because the coarse-pointer rule raises only the
          // size: family, weight and style stay the card's own.
          fontFamily: 'inherit',
          fontWeight: 'inherit',
          fontStyle: 'inherit',
          fontSize: 'var(--field-font-size, 13px)',
          lineHeight: 1.5,
        }}
      />
    </span>
  );
}
