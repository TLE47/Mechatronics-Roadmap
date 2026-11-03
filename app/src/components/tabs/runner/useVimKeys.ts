/**
 * Vim keys, and the mode they are reading (`runner/useVimKeys.ts`).
 *
 * Two things that always travel together: the remembered opt-in (`app/src/vimMode.ts`) and the mode
 * the editor is in while it is on. The mode is state because a badge with no mode would leave the
 * one question normal mode raises unanswered; turning the keys off puts it back to normal so a
 * later turn-on cannot start half-way through a command.
 *
 * The editor reads the mode (it decides what a keystroke means) and the toolbar reads both, so this
 * is a concern with two readers and no owner in the tab — which is why it has one here.
 */
import { useState } from 'react';
import { readVim, vimModeLabel, writeVim } from '../../../vimMode';

export interface VimKeys {
  on: boolean;
  mode: string;
  /** What the editor's badge prints. */
  label: string;
  setMode: (mode: string) => void;
  toggle: () => void;
}

export function useVimKeys(): VimKeys {
  const [on, setOn] = useState<boolean>(() => readVim());
  const [mode, setMode] = useState<string>('normal');

  return {
    on,
    mode,
    label: vimModeLabel(mode),
    setMode,
    toggle: () => {
      setOn(writeVim(!on));
      setMode('normal');
    },
  };
}
