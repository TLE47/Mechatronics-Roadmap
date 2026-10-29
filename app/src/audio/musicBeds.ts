/**
 * Where the tapes' files live (`app/src/audio/musicBeds.ts`).
 *
 * The other half of `musicCatalogue.ts`: the catalogue says what a tape *is*, this says where its
 * `.m4a` is and how to decode it. It is imported only through a dynamic `import()` inside the engine,
 * which is what keeps a Node test importing the engine from meeting a media import, and what keeps
 * eight loops out of every chunk a learner loads before turning sound on.
 *
 * `import.meta.glob` is lazy: Vite turns it into one `import()` per file, so choosing a tape fetches
 * that tape and nothing else. A missing file is a `null`, never a throw — the engine then keeps the
 * drone playing, because a tape that cannot be had is a different texture rather than silence.
 *
 * Fetching and decoding are separated so the engine can inject a loader in its tests; see
 * `EngineOptions.loadTape`.
 */
import type { MusicTape } from './musicCatalogue.ts';

const FILES = import.meta.glob('./assets/music/*.m4a', {
  query: '?url',
  import: 'default',
}) as Record<string, () => Promise<string>>;

/** The URL for one tape. Throws only for a catalogue entry with no file — a bug, not a runtime case. */
export async function tapeUrl(tape: MusicTape): Promise<string> {
  const load = FILES[`./assets/music/${tape.id}.m4a`];
  if (!load) throw new Error(`no music file for tape ${tape.id}`);
  return await load();
}

/** Fetch and decode one tape, or `null` when it cannot be had. Never throws. */
export async function loadTape(tape: MusicTape, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  try {
    const url = await tapeUrl(tape);
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}
