import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, RotateCcw, X } from 'lucide-react';
import { shortcutRows } from '../shortcuts';
import {
  chordFromEvent,
  formatChord,
  isDefaultKeymap,
  rebind,
  resetKeymap,
  writeKeymap,
  type Keymap,
  type KeymapAction,
} from '../keymap';
import { useKeymap } from '../useKeymap';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * `?`: the sheet that says which keys do what (`app/src/components/ShortcutsModal.tsx`).
 *
 * Small by design. The header's cheat sheet is *content* — equations and pinouts; this is the map
 * of the machine you are typing into, and its rows come from `app/src/shortcuts.ts` so there is one
 * place to change a key.
 *
 * Six rows can be rebound here (`app/src/keymap.ts`). A row's key is a button: pressing it waits for
 * the next chord, prints what it will be, and either takes it or says why not — the action that
 * already has it, the browser's own key, or a bare key that would be typing. The old chord is freed
 * by the change, so a learner who wants the palette on ⌘⇧P does not have to find somewhere else for
 * ⌘K first. **Reset all keys** puts the shipped six back.
 *
 * The dialog takes focus on open and gives it back on close, because it is opened by a keystroke:
 * a learner who pressed `?` has both hands on the keyboard, and the next thing they do should not
 * be a click. Tab cycles inside the dialog rather than walking out of it, now that there are
 * buttons to reach.
 */
export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const keymap = useKeymap();
  const keymapRef = useRef<Keymap>(keymap);
  keymapRef.current = keymap;
  /** The row waiting for a key, and the sentence the last attempt left behind. */
  const [listening, setListening] = useState<KeymapAction | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The close button, not the dialog: a focus ring is how a keyboard user sees where they are.
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // A row waiting for a key gave Escape back as "never mind" already (the capture listener
        // above stops it from reaching here); closing the sheet would be a second meaning.
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        // One dialog, several buttons: Tab stays inside it, wrapping at the ends. Letting it leave
        // would put the focus ring on the page behind a modal that is still open.
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Back to whatever had focus, so closing the sheet does not drop the learner at the top.
      returnFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  // The capture phase, so a chord being learned cannot also trip the dialog's own Escape or the
  // page's shortcuts: this listener runs before either and stops the event there.
  useEffect(() => {
    if (!isOpen || !listening) return;
    const onCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setListening(null);
        setNote(null);
        return;
      }
      const chord = chordFromEvent(event);
      // A modifier on its own is a half-pressed chord, not an answer.
      if (!chord) return;
      const result = rebind(keymapRef.current, listening, chord);
      if (result.error) {
        setNote({ kind: 'error', text: result.error });
        return;
      }
      writeKeymap(result.keymap);
      setListening(null);
      setNote({ kind: 'ok', text: `${formatChord(chord)} is the new key.` });
    };
    window.addEventListener('keydown', onCapture, true);
    return () => window.removeEventListener('keydown', onCapture, true);
  }, [isOpen, listening]);

  if (!isOpen) return null;

  const rows = shortcutRows(keymap);
  const changed = !isDefaultKeymap(keymap);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-4 pt-[10vh] max-sm:items-end max-sm:p-0 max-sm:pt-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        data-testid="shortcuts-modal"
        className="w-full max-w-xl overflow-hidden rounded-[var(--r-lg)] border shadow-2xl max-sm:max-h-[92dvh] max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]"
        style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border-strong)' }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2
            id="shortcuts-title"
            className="flex items-center gap-2 text-[13.5px] font-semibold"
            style={{ color: 'var(--text)' }}
          >
            <Keyboard className="h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden="true" />
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="btn-close-shortcuts"
            aria-label="Close the keyboard shortcuts"
            className="btn"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        <dl className="max-h-[62vh] overflow-y-auto px-4 py-2" data-testid="shortcuts-list">
          {rows.map((row, index) => (
            <div
              key={`${row.keys}-${index}`}
              data-testid="shortcut-row"
              className="flex items-start gap-3 border-b py-2 last:border-0"
              style={{ borderColor: 'var(--border-soft, var(--border))' }}
            >
              <dt className="w-[8.25rem] shrink-0">
                {row.keymapAction ? (
                  <button
                    type="button"
                    data-testid={`btn-rebind-${row.keymapAction}`}
                    aria-label={`Change the key for ${row.action}`}
                    aria-pressed={listening === row.keymapAction}
                    title="Press to learn a new key for this action"
                    onClick={() => {
                      setListening((current) => (current === row.keymapAction ? null : row.keymapAction!));
                      setNote(null);
                    }}
                    className="inline-flex w-full cursor-pointer items-center rounded border px-1.5 py-0.5 text-left font-mono text-[11px] transition-colors"
                    style={{
                      borderColor: listening === row.keymapAction ? 'var(--accent)' : 'var(--border)',
                      backgroundColor:
                        listening === row.keymapAction
                          ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                          : 'transparent',
                      color: 'var(--text)',
                    }}
                  >
                    {listening === row.keymapAction ? 'Press keys…' : row.keys}
                  </button>
                ) : (
                  <kbd
                    className="inline-block rounded border px-1.5 py-0.5 font-mono text-[11px]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    {row.keys}
                  </kbd>
                )}
              </dt>
              <dd className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: 'var(--muted)' }}>
                {row.action}
              </dd>
            </div>
          ))}
        </dl>

        <div className="border-t px-4 py-2" style={{ borderColor: 'var(--border)' }}>
          <p
            role="status"
            data-testid="keymap-status"
            className="min-h-[1.1rem] text-[11px]"
            style={{
              color: note
                ? note.kind === 'error'
                  ? 'var(--rose)'
                  : 'var(--emerald)'
                : 'var(--dim)',
            }}
          >
            {note
              ? note.text
              : listening
                ? 'Press the new key — Escape cancels.'
                : 'Press a key in the left column to change it.'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px]" style={{ color: 'var(--dim)' }}>
              Keys need ⌘ or ⌥ to be a shortcut; the preset digits and the editor’s F9/F12 stay fixed.
              On Windows and Linux, ⌘ is Ctrl and ⌥ is Alt.
            </p>
            {changed && (
              <button
                type="button"
                data-testid="btn-reset-keymap"
                onClick={() => {
                  resetKeymap();
                  setListening(null);
                  setNote({ kind: 'ok', text: 'Every key is back to its shipped shortcut.' });
                }}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded border px-2 py-1 font-mono text-[10.5px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Reset all keys
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
