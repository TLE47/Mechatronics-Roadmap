/**
 * The music tapes, as facts (`app/src/audio/musicCatalogue.ts`).
 *
 * This module has **no audio imports** on purpose: the settings panel shows the title, the artist and
 * the licence of what is playing, and a Node test reads the same table, so neither should need Vite to
 * resolve an `.m4a`. `musicBeds.ts` is the other half — the URLs and the decode — and it is only ever
 * reached through a dynamic import inside the engine.
 *
 * ## Where the tapes come from
 *
 * Two kinds, and the panel always says which one is playing:
 *
 * - **Recorded.** Real tracks, all released under **CC0 1.0 Universal** on Free Music Archive, so they
 *   may be bundled, cut and redistributed with no attribution obligation. The attribution below is
 *   honour, not duty — and it is the panel's credit line, because a learner is entitled to know whose
 *   music they are hearing. All four are by HoliznaCC0, from the album *Winter Lofi*: the album is
 *   CC0 and each track's own page states the same, which is what `page` points at.
 * - **Composed.** Tapes this repository writes itself (`scripts/build_music.mjs`), one per idiom a free
 *   recording does not cover: anime, pop, K-pop, and an instrumental arpeggio. They carry the build
 *   script as the artist and say "composed by this repository" in the credit, because calling a
 *   synthesised loop a licensed K-pop song would be a lie a learner could not check.
 *
 * ## The categories
 *
 * Six, in the order the panel draws them, plus the drone that is not a tape at all. A category is a
 * door, not a claim: `lofi` and `instrumental` each hold two tapes, the rest one, and the panel shows
 * the tapes inside the category that is open.
 *
 * | tape | category | source | length |
 * | :--- | :--- | :--- | ---: |
 * | `lab-night` | Lo-fi | *Snow Drift* — HoliznaCC0, CC0 | 60 s |
 * | `focus-current` | Lo-fi | *Fire Place* — HoliznaCC0, CC0 | 60 s |
 * | `winter-blues` | Jazz | *Winter Blues* — HoliznaCC0, CC0 | 45 s |
 * | `first-snow` | Instrumental | *First Snow* — HoliznaCC0, CC0 | 40 s |
 * | `bench-arpeggio` | Instrumental | composed by `scripts/build_music.mjs` | 24 s |
 * | `paper-lanterns` | Anime | composed by `scripts/build_music.mjs` | 24 s |
 * | `city-lights` | Pop | composed by `scripts/build_music.mjs` | 24 s |
 * | `neon-stage` | K-pop | composed by `scripts/build_music.mjs` | 24 s |
 *
 * Every file is a seamless loop cut or rendered by that script; the engine's synthesised drone remains
 * as the fallback for a browser that cannot decode AAC, and as the "Drone" choice for a learner who
 * wants the music to be a texture rather than a song.
 */

export type MusicCategory = 'lofi' | 'jazz' | 'instrumental' | 'anime' | 'pop' | 'kpop';

/** The category that is not a tape: two detuned oscillators the engine has always had. */
export const DRONE_ID = 'drone';

export interface MusicCategoryInfo {
  id: MusicCategory;
  /** What the chip says. Plain words: a learner should not have to know a genre to pick one. */
  label: string;
  /** One line under the open category, in the panel. */
  hint: string;
}

export const MUSIC_CATEGORIES: readonly MusicCategoryInfo[] = [
  { id: 'lofi', label: 'Lo-fi', hint: 'The two tapes this app opened with: a bench at night, and a fire.' },
  { id: 'jazz', label: 'Jazz', hint: 'A slow blues walk, cut from a real CC0 recording.' },
  { id: 'instrumental', label: 'Instrumental', hint: 'A minimal piano piece, and a plucked arpeggio this repo wrote.' },
  { id: 'anime', label: 'Anime', hint: 'Pentatonic bells and a soft kick — the opening-credits idiom.' },
  { id: 'pop', label: 'Pop', hint: 'Four chords, a four-on-the-floor kick and a filtered pad.' },
  { id: 'kpop', label: 'K-pop', hint: 'Brighter lead, side-chained pad, claps on two and four.' },
];

export interface MusicTape {
  /** The file stem under `app/src/audio/assets/music/`; also the stored preference. */
  id: string;
  category: MusicCategory;
  title: string;
  /** The recording artist, or the build script when this repository composed it. */
  artist: string;
  album: string;
  licence: string;
  /** The track's page, where the licence is stated, or the script that renders it. */
  page: string;
  /** The loop's length in seconds, printed in the panel so a learner knows what repeats. */
  seconds: number;
  /** True for a tape `scripts/build_music.mjs` synthesises, false for a real recording. */
  composed: boolean;
}

const WINTER_LOFI = 'Winter Lofi';
const CC0 = 'CC0 1.0 Universal';
const COMPOSED_BY = 'composed by this repository';
/** Where a composed tape is described: the script that renders it. */
export const TAPE_SCRIPT_PAGE =
  'https://github.com/TLE47/Mechatronics-Roadmap/blob/main/scripts/build_music.mjs';

export const MUSIC_TAPES: readonly MusicTape[] = [
  {
    id: 'lab-night',
    category: 'lofi',
    title: 'Snow Drift',
    artist: 'HoliznaCC0',
    album: WINTER_LOFI,
    licence: CC0,
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/snow-drift/',
    seconds: 60,
    composed: false,
  },
  {
    id: 'focus-current',
    category: 'lofi',
    title: 'Fire Place',
    artist: 'HoliznaCC0',
    album: WINTER_LOFI,
    licence: CC0,
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/fire-place/',
    seconds: 60,
    composed: false,
  },
  {
    id: 'winter-blues',
    category: 'jazz',
    title: 'Winter Blues',
    artist: 'HoliznaCC0',
    album: WINTER_LOFI,
    licence: CC0,
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/winter-blues/',
    seconds: 45,
    composed: false,
  },
  {
    id: 'first-snow',
    category: 'instrumental',
    title: 'First Snow',
    artist: 'HoliznaCC0',
    album: WINTER_LOFI,
    licence: CC0,
    page: 'https://freemusicarchive.org/music/holiznacc0/winter-lofi/first-snowmp3/',
    seconds: 40,
    composed: false,
  },
  {
    id: 'bench-arpeggio',
    category: 'instrumental',
    title: 'Bench Arpeggio',
    artist: COMPOSED_BY,
    album: 'MechaLab tapes',
    licence: 'Written for this repository, no restrictions',
    page: TAPE_SCRIPT_PAGE,
    seconds: 24,
    composed: true,
  },
  {
    id: 'paper-lanterns',
    category: 'anime',
    title: 'Paper Lanterns',
    artist: COMPOSED_BY,
    album: 'MechaLab tapes',
    licence: 'Written for this repository, no restrictions',
    page: TAPE_SCRIPT_PAGE,
    seconds: 24,
    composed: true,
  },
  {
    id: 'city-lights',
    category: 'pop',
    title: 'City Lights',
    artist: COMPOSED_BY,
    album: 'MechaLab tapes',
    licence: 'Written for this repository, no restrictions',
    page: TAPE_SCRIPT_PAGE,
    seconds: 24,
    composed: true,
  },
  {
    id: 'neon-stage',
    category: 'kpop',
    title: 'Neon Stage',
    artist: COMPOSED_BY,
    album: 'MechaLab tapes',
    licence: 'Written for this repository, no restrictions',
    page: TAPE_SCRIPT_PAGE,
    seconds: 24,
    composed: true,
  },
];

/** The tape a fresh browser hears, and the fallback for any unknown id. */
export const DEFAULT_TAPE = 'lab-night';

const TAPE_IDS = new Set(MUSIC_TAPES.map((tape) => tape.id));

/** A stored preference is usable only when it names a tape this build carries, or the drone. */
export function isTapeId(value: unknown): value is string {
  return value === DRONE_ID || (typeof value === 'string' && TAPE_IDS.has(value));
}

/** The tapes inside one category, in catalogue order. */
export function tapesIn(category: MusicCategory): MusicTape[] {
  return MUSIC_TAPES.filter((tape) => tape.category === category);
}

/** One tape by id. An unknown id is the default tape, not an exception. */
export function tapeById(id: string): MusicTape {
  return MUSIC_TAPES.find((tape) => tape.id === id) ?? MUSIC_TAPES.find((tape) => tape.id === DEFAULT_TAPE)!;
}

/** The category a tape belongs to, for the panel's open chip. Drone has none. */
export function categoryOf(id: string): MusicCategory | null {
  return id === DRONE_ID ? null : tapeById(id).category;
}

/**
 * One line of credit for the panel: who made it, and under what terms.
 *
 * A composed tape says so in the same sentence that names its author, so a learner never has to work
 * out whether "MechaLab tapes" is a band.
 */
export function tapeCredit(tape: MusicTape = tapeById(DEFAULT_TAPE)): string {
  if (tape.composed) {
    return `“${tape.title}” — ${COMPOSED_BY} · ${tape.licence.toLowerCase()}`;
  }
  return `“${tape.title}” by ${tape.artist} — ${tape.licence}, via Free Music Archive`;
}
