/**
 * The keymap as React state (`app/src/useKeymap.ts`).
 *
 * `App`'s handler and the runner's both read the same module store, so a rebind in the sheet reaches
 * the next keypress without a prop threaded through the lazy tab tree. `useSyncExternalStore` is the
 * React 19 way to subscribe to something that is not React state: the snapshot is the cached map,
 * and `writeKeymap` puts a new object in it.
 */

import { useRef, useSyncExternalStore, type RefObject } from 'react';
import { keymapSnapshot, subscribeKeymap, type Keymap } from './keymap';

export function useKeymap(): Keymap {
  return useSyncExternalStore(subscribeKeymap, keymapSnapshot, keymapSnapshot);
}

/**
 * The keymap as a live ref, for a listener that is registered once (`useKeymapRef`).
 *
 * A window `keydown` handler is attached on mount, so it cannot close over the map from the render
 * that attached it: it has to read the map in force when the key is pressed. That mirror is this
 * hook's own current value — keeping it in a caller's `keymapRef` made every consumer of the
 * shortcut re-implement the same three lines.
 */
export function useKeymapRef(): RefObject<Keymap> {
  const keymap = useSyncExternalStore(subscribeKeymap, keymapSnapshot, keymapSnapshot);
  const ref = useRef(keymap);
  ref.current = keymap;
  return ref;
}
