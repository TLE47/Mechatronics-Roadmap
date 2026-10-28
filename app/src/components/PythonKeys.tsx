import React from 'react';

/**
 * The punctuation a phone keyboard hides (`components/PythonKeys.tsx`).
 *
 * A phone's default keyboard has letters, a space and a return; Python needs `:`, `(`, `)`, `"`,
 * `_`, `#`, brackets and indentation on nearly every line. Switching to the numeric or symbol pane
 * for each one is three taps per colon and loses the caret's place. These buttons insert at the
 * caret through the editor's own handle, so the document and React's value move together.
 *
 * The strip is not a full keyboard: it is the ten characters a beginner actually hunts for, plus
 * Tab. The editor's own keyboard handling still owns typing, and a hardware keyboard ignores this
 * row entirely. Each key is 40 px square, an inch above the 28 px floor the rest of the app's
 * coarse-pointer controls use, because these are hit repeatedly and without looking
 * (`scripts/e2e_mobile.mjs` measures every one).
 */

const KEYS: { label: string; insert: string; name: string }[] = [
  { label: 'Tab', insert: '    ', name: 'Indent four spaces' },
  { label: ':', insert: ':', name: 'Colon' },
  { label: '(', insert: '(', name: 'Open parenthesis' },
  { label: ')', insert: ')', name: 'Close parenthesis' },
  { label: '"', insert: '"', name: 'Double quote' },
  { label: "'", insert: "'", name: 'Single quote' },
  { label: '_', insert: '_', name: 'Underscore' },
  { label: '=', insert: '=', name: 'Equals' },
  { label: '#', insert: '#', name: 'Hash, starts a comment' },
  { label: '[', insert: '[', name: 'Open bracket' },
  { label: ']', insert: ']', name: 'Close bracket' },
  { label: '→', insert: '    ', name: 'Indent four spaces' },
];

export const PythonKeys: React.FC<{ onInsert: (text: string) => void }> = ({ onInsert }) => (
  <div
    data-testid="python-keys"
    role="group"
    aria-label="Python punctuation keys"
    className="flex flex-wrap items-center gap-1 border-b border-line-soft bg-canvas px-2 py-1.5"
  >
    {KEYS.map((key) => (
      <button
        key={`${key.label}-${key.insert}`}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onInsert(key.insert)}
        aria-label={key.name}
        title={key.name}
        data-testid={`python-key-${key.label === '→' ? 'indent' : key.label === ':' ? 'colon' : key.label}`}
        className="min-h-[40px] min-w-[40px] rounded-md border border-line bg-panel px-2 font-mono text-[14px] font-semibold text-body hover:bg-raise active:bg-accent/15 active:text-accent cursor-pointer"
      >
        {key.label}
      </button>
    ))}
  </div>
);
