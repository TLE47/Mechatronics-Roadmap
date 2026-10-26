/**
 * The two music beds, as facts (`app/src/audio/musicCatalogue.ts`).
 *
 * This module has **no audio imports** on purpose: the settings panel shows the title, the artist and
 * the licence of what is playing, and a Node test reads the same table, so neither should need Vite to
 * resolve an `.m4a`. `musicBeds.ts` is the other half — the URLs and the decode — and it is only ever
 * reached through a dynamic import inside the engine.
 *
 * Both beds are real lo-fi tracks released under **CC0 1.0 Universal** on Free Music Archive, so they
 * may be bundled, cut and redistributed with no attribution obligation. The attribution below is
 * honour, not duty — and it is the panel's credit line, because a learner is entitled to know whose
 * music they are hearing.
 *
 * | bed | scene | track |
 * | :--- | :--- | :--- |
 * | `lab-night` | home | *Snow Drift* — holiznacc0, *Winter Lofi* |
 * | `focus-current` | focus | *Fire Place* — holiznacc0, *Winter Lofi* |
 *
 * The files are 60-second seamless loops cut by `scripts/build_music.mjs`; the engine's synthesised
 * drones remain as the fallback, and as the "Drone" option in the panel for a learner who wants the
 * music to be a texture rather than a song.
 */
import type { SoundScene } from './facade.ts';

export interface MusicBed {
  id: string;
  scene: SoundScene;
  title: string;
  artist: string;
  album: string;
  licence: string;
  /** The track's page, where the licence is stated. Shown in the panel's credit line. */
  page: string;
}

export const MUSIC_BEDS: readonly MusicBed[] = [
  {
    id: 'lab-night',
    scene: 'home',
    title: 'Snow Drift',
    artist: 'holiznacc0',
    album: 'Winter Lofi',
    licence: 'CC0 1.0 Universal',
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/snow-drift/',
  },
  {
    id: 'focus-current',
    scene: 'focus',
    title: 'Fire Place',
    artist: 'holiznacc0',
    album: 'Winter Lofi',
    licence: 'CC0 1.0 Universal',
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/fire-place/',
  },
];

export function bedFor(scene: SoundScene): MusicBed {
  return MUSIC_BEDS.find((bed) => bed.scene === scene) ?? MUSIC_BEDS[0];
}

/** One line of credit for the panel: who made it, and the licence it is used under. */
export function bedCredit(bed: MusicBed = MUSIC_BEDS[0]): string {
  return `“${bed.title}” by ${bed.artist} — ${bed.licence}, via Free Music Archive`;
}
