/**
 * The keymap as React state (`app/src/useKeymap.ts`).
 *
 * `App`'s handler and the runner's both read the same module store, so a rebind in the sheet reaches
 * the next keypress without a prop threaded through the lazy tab tree. `useSyncExternalStore` is the
 * React 19 way to subscribe to something that is not React state: the snapshot is the cached map,
 * and `writeKeymap` puts a new object in it.
 */

import { useSyncExternalStore } from 'react';
import { keymapSnapshot, subscribeKeymap, type Keymap } from './keymap';

export function useKeymap(): Keymap {
  return useSyncExternalStore(subscribeKeymap, keymapSnapshot, keymapSnapshot);
}
