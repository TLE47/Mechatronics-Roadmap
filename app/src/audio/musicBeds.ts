/**
 * The two music beds' files (`app/src/audio/musicBeds.ts`).
 *
 * The other half of `musicCatalogue.ts`: this is where the `.m4a` URLs live, and it is imported only
 * through a dynamic `import()` inside the engine's `ensureMusic()`. That is what keeps a Node test
 * importing the engine from meeting a media import, and what keeps the two 400 kB beds out of every
 * chunk a learner loads before turning sound on.
 *
 * Fetching and decoding are separated so the engine can inject a loader in its tests:
 *
 * - `loadBed(bed, ctx)` fetches the bed's URL once and decodes it, returning `null` for anything that
 *   goes wrong — offline, a 404, a browser without AAC. `null` is a fact the engine acts on (the
 *   synthesised drone takes over), never an exception a learner sees.
 *
 * The beds are 60-second seamless loops cut by `scripts/build_music.mjs` from CC0 sources; see
 * `musicCatalogue.ts` for the tracks and the licence.
 */
import type { MusicBed } from './musicCatalogue.ts';

export interface BedSources {
  labNight: string;
  focusCurrent: string;
}

export async function bedUrls(): Promise<BedSources> {
  const [labNight, focusCurrent] = await Promise.all([
    import('./assets/music/lab-night.m4a?url'),
    import('./assets/music/focus-current.m4a?url'),
  ]);
  return { labNight: labNight.default, focusCurrent: focusCurrent.default };
}

export async function bedUrl(bed: MusicBed): Promise<string> {
  const urls = await bedUrls();
  return bed.scene === 'focus' ? urls.focusCurrent : urls.labNight;
}

/** Fetch and decode one bed, or `null` when it cannot be had. Never throws. */
export async function loadBed(bed: MusicBed, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  try {
    const url = await bedUrl(bed);
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}
