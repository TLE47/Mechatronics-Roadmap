import { useEffect, useRef } from 'react';
import { playShortcut } from '../../../audio/shortcutSound';
import { layoutShortcutFor, type WorkspaceLayout } from '../../../workspaceLayout';

/**
 * ⌥1–⌥4 pick a layout, from anywhere including inside the editor (`runner/useLayoutShortcuts.ts`).
 *
 * The buttons in the editor's header are the discoverable path; this is the shortcut the buttons
 * print. The code is read first: ⌥2 is `™` in `key` on a Mac, and the shortcut is the physical key.
 * The callback is kept in a ref so a fresh closure on each render does not re-register the listener.
 */
export function useLayoutShortcuts(chooseLayout: (next: WorkspaceLayout) => void) {
  const chooseRef = useRef(chooseLayout);
  chooseRef.current = chooseLayout;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.altKey || event.metaKey || event.ctrlKey) return;
      const next = layoutShortcutFor(event.code) ?? layoutShortcutFor(event.key);
      if (!next) return;
      playShortcut('toggle', event);
      event.preventDefault();
      chooseRef.current(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
