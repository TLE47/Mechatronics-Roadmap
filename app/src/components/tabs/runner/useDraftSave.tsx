/**
 * The draft's save state, and the line that reports a refused write
 * (`app/src/components/tabs/runner/useDraftSave.tsx`).
 *
 * `lessonDraft.ts` answers `false` when the browser refuses a write. The text stays on screen either
 * way, so the one thing the learner cannot otherwise see is that the next reload will not bring it
 * back. This module owns that answer: the tab calls `save`, the notice renders it, and neither the
 * state cell nor the markup sits in the tab (`scripts/test_runner_shape.mjs` holds that shape).
 */

import { useCallback, useState } from 'react';
import { saveDraft } from '../../../lessonDraft';

export interface DraftSave {
  /** True while the last write was refused; false again the moment one lands. */
  refused: boolean;
  /** Store the text, and answer whether it landed. */
  save: (lessonId: string, code: string) => boolean;
}

/**
 * The write and its answer.
 *
 * Every path that saves a draft goes through `save`, including the one before a lesson switch: a
 * refused write is one state, wherever it happened, and the next successful write clears it.
 */
export function useDraftSave(): DraftSave {
  const [refused, setRefused] = useState(false);
  const save = useCallback((lessonId: string, code: string) => {
    const landed = saveDraft(lessonId, code);
    setRefused(!landed);
    return landed;
  }, []);
  return { refused, save };
}

/** The sentence under the editor, or nothing when the last write landed. */
export function DraftSaveNotice({ refused }: { refused: boolean }) {
  if (!refused) return null;
  return (
    <p
      role="status"
      data-testid="draft-status"
      className="mt-2 text-[12px] leading-relaxed"
      style={{ color: 'var(--rose)' }}
    >
      Not saved — storage is blocked or full. Your code is still here, but a reload will not bring it
      back.
    </p>
  );
}
