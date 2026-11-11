/**
 * The music tapes, as facts (`app/src/audio/musicCatalogue.ts`).
 *
 * This module has **no audio imports** on purpose: the settings panel shows the title, the artist and
 * the licence of what is playing, a Node test reads the same table, and the settings panel prints the
 * same labels — none of them should need Vite to resolve an `.m4a`. `musicBeds.ts` is the
 * other half, the URLs and the decode, and it is only ever reached through a dynamic import inside
 * the engine.
 *
 * ## Five doors, eleven tapes
 *
 * The panel's music section is organised by **genre**, the way a learner asks for it: Lo-fi, J-Pop,
 * Synthwave, Chiptune, Acoustic. A category is a door, a tape is what plays, and the panel shows the
 * tapes inside the door that is open. Every door holds at least one tape, and every door names a
 * `defaultTape`: the one the panel plays when a genre door is chosen, so switching doors is never a
 * restart of whatever happened to be first in the list.
 *
 * ## Where the tapes come from
 *
 * Two kinds, and the panel always says which one is playing:
 *
 * - **Recorded.** Real tracks, all released under **CC0 1.0 Universal** on Free Music Archive, so they
 *   may be bundled, cut and redistributed with no attribution obligation. All four are by HoliznaCC0,
 *   from the album *Winter Lofi*; the credit is honour, not duty. The piano and the blues walk are
 *   what the Acoustic door holds — the two recorded tapes that are acoustic instruments.
 * - **Composed.** Tapes this repository writes itself (`scripts/build_music.mjs`). Seven now: the four
 *   the catalog carried (an arpeggio, an anime bell loop, a pop and a K-pop loop) plus one written for
 *   each of the doors a free recording does not cover — a city-pop loop for J-Pop, a retrowave loop for
 *   Synthwave and an 8-bit loop for Chiptune. They carry the build script as the artist and say
 *   "composed by this repository" in the credit, because calling a synthesised loop a licensed song
 *   would be a lie a learner could not check.
 *
 * The genre names are the doors, not a claim about provenance: the J-Pop door says in its hint that
 * everything in it was written here, and each tape's own credit repeats it.
 *
 * ## The tapes
 *
 * | tape | door | source | length |
 * | :--- | :--- | :--- | ---: |
 * | `lab-night` | Lo-fi | *Snow Drift* — HoliznaCC0, CC0 | 60 s |
 * | `focus-current` | Lo-fi | *Fire Place* — HoliznaCC0, CC0 | 60 s |
 * | `city-pop` | J-Pop | composed — a city-pop chorus, 32 s | 32 s |
 * | `paper-lanterns` | J-Pop | composed — the anime-opening idiom | 24 s |
 * | `city-lights` | J-Pop | composed — four chords and a filtered pad | 24 s |
 * | `neon-stage` | J-Pop | composed — brighter lead, side-chained pad | 24 s |
 * | `bench-arpeggio` | J-Pop | composed — an instrumental plucked study | 24 s |
 * | `night-drive` | Synthwave | composed — saw pads and an analog arpeggio | 16 s |
 * | `pixel-run` | Chiptune | composed — a pulse lead and noise hats | 16 s |
 * | `first-snow` | Acoustic | *First Snow* — HoliznaCC0, CC0 | 40 s |
 * | `winter-blues` | Acoustic | *Winter Blues* — HoliznaCC0, CC0 | 45 s |
 *
 * Every file is a seamless loop cut or rendered by that script; the engine's synthesised drone remains
 * as the fallback for a browser that cannot decode AAC, and as the "Drone" choice for a learner who
 * wants the music to be a texture rather than a song.
 */

export type MusicCategory = 'lofi' | 'jpop' | 'synthwave' | 'chiptune' | 'acoustic';

/**
 * The sustained instrument beds (`INSTRUMENTS`).
 *
 * These are not recordings and not songs: each is one chord held on a different harmonic recipe, so
 * the drone can sound like a piano, a guitar, a flute or a violin instead of two anonymous sines. The
 * engine builds them (`engine.ts`, `instrumentBeds`), the Drone chip is what plays them, and the label
 * says "bed" rather than "instrument" so nobody expects a performance.
 */
export type InstrumentId = 'piano' | 'guitar' | 'flute' | 'violin';

export interface InstrumentInfo {
  id: InstrumentId;
  label: string;
}

export const INSTRUMENTS: readonly InstrumentInfo[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'guitar', label: 'Guitar' },
];

/** The category that is not a tape: two detuned oscillators the engine has always had. */
export const DRONE_ID = 'drone';

/**
 * The solo instrument tracks.
 *
 * "Solo" is meant literally: one instrument and nothing else. These chips choose the drone with an
 * instrument recipe — the held chord the engine already builds for a piano, a guitar, a flute or a
 * violin — so what a learner hears is that instrument alone, not a full band with that instrument
 * somewhere in the mix. The previous shortcuts played whole recordings (a lo-fi track for "Piano"),
 * which is not what the heading promised.
 */
export interface SoloTrack {
  id: InstrumentId;
  label: string;
  /** The drone is the only tape that plays one instrument on its own. */
  tapeId: string;
  hint: string;
}

export const SOLO_TRACKS: readonly SoloTrack[] = [
  { id: 'piano', label: 'Piano', tapeId: 'first-snow', hint: '\u201cFirst Snow\u201d — a real solo piano recording by HoliznaCC0 (CC0), not a held chord.' },
  { id: 'guitar', label: 'Guitar', tapeId: 'winter-blues', hint: '\u201cWinter Blues\u201d — a recorded guitar walk by HoliznaCC0 (CC0), not a held chord.' },
];

export function isInstrumentId(value: unknown): value is InstrumentId {
  return INSTRUMENTS.some((entry) => entry.id === value);
}

export interface MusicCategoryInfo {
  id: MusicCategory;
  /** What the panel's chip says. Emoji are the spec's, not decoration. */
  label: string;
  /** One line under the open category, in the panel. */
  hint: string;
  /** The tape the door plays by default: the one written for its idiom. */
  defaultTape: string;
}

export const MUSIC_CATEGORIES: readonly MusicCategoryInfo[] = [
  {
    id: 'lofi',
    label: 'Lo-Fi Beats',
    hint: 'The two recordings this app opened with: a bench at night, and a fire.',
    defaultTape: 'lab-night',
  },
  {
    id: 'jpop',
    label: 'J-Pop (City Pop)',
    hint: 'City-pop, anime and pop instrumentals written here — no vocal leads.',
    defaultTape: 'city-pop',
  },
  {
    id: 'synthwave',
    label: 'Synthwave',
    hint: 'Retrowave pads and an analog arpeggio, composed for this loop.',
    defaultTape: 'night-drive',
  },
  {
    id: 'chiptune',
    label: 'Chiptune 8-Bit',
    hint: 'A pulse lead and noise hats — the game-wave idiom, composed here.',
    defaultTape: 'pixel-run',
  },
  {
    id: 'acoustic',
    label: 'Acoustic',
    hint: 'A minimal piano piece and a slow blues walk, both real CC0 recordings.',
    defaultTape: 'first-snow',
  },
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
const MECHALAB_TAPES = 'MechaLab tapes';
const WRITTEN_HERE = 'Written for this repository, no restrictions';
/** Where a composed tape is described: the script that renders it. */
export const TAPE_SCRIPT_PAGE =
  'https://github.com/TLE47/Mechatronics-Roadmap/blob/main/scripts/build_music.mjs';

const composed = (
  id: string,
  category: MusicCategory,
  title: string,
  seconds: number
): MusicTape => ({
  id,
  category,
  title,
  artist: COMPOSED_BY,
  album: MECHALAB_TAPES,
  licence: WRITTEN_HERE,
  page: TAPE_SCRIPT_PAGE,
  seconds,
  composed: true,
});

/** A CC0 recording: the page is the track's own FMA slug, which is not always the file's id. */
const recorded = (
  id: string,
  category: MusicCategory,
  title: string,
  seconds: number,
  slug: string
): MusicTape => ({
  id,
  category,
  title,
  artist: 'HoliznaCC0',
  album: WINTER_LOFI,
  licence: CC0,
  page: `https://freemusicarchive.org/music/holiznacc0/winter-lofi/${slug}/`,
  seconds,
  composed: false,
});

export const MUSIC_TAPES: readonly MusicTape[] = [
  recorded('lab-night', 'lofi', 'Snow Drift', 60, 'snow-drift'),
  recorded('focus-current', 'lofi', 'Fire Place', 60, 'fire-place'),
  composed('city-pop', 'jpop', 'Morning City', 32),
  composed('paper-lanterns', 'jpop', 'Paper Lanterns', 24),
  composed('city-lights', 'jpop', 'City Lights', 24),
  composed('neon-stage', 'jpop', 'Neon Stage', 24),
  composed('bench-arpeggio', 'jpop', 'Bench Arpeggio', 24),
  composed('night-drive', 'synthwave', 'Night Drive', 16),
  composed('pixel-run', 'chiptune', 'Pixel Run', 16),
  recorded('first-snow', 'acoustic', 'First Snow', 40, 'first-snowmp3'),
  recorded('winter-blues', 'acoustic', 'Winter Blues', 45, 'winter-blues'),
];

/** The tape a fresh browser hears, and the fallback for any unknown id. */
export const DEFAULT_TAPE = 'lab-night';

const TAPE_IDS = new Set(MUSIC_TAPES.map((entry) => entry.id));

/** A stored preference is usable only when it names a tape this build carries, or the drone. */
export function isTapeId(value: unknown): value is string {
  return value === DRONE_ID || (typeof value === 'string' && TAPE_IDS.has(value));
}

/** The tapes inside one category, in catalogue order. */
export function tapesIn(category: MusicCategory): MusicTape[] {
  return MUSIC_TAPES.filter((entry) => entry.category === category);
}

/** One tape by id. An unknown id is the default tape, not an exception. */
export function tapeById(id: string): MusicTape {
  return MUSIC_TAPES.find((entry) => entry.id === id) ?? MUSIC_TAPES.find((entry) => entry.id === DEFAULT_TAPE)!;
}

/** The category a tape belongs to, for the panel's open chip. */
export function categoryOf(id: string): MusicCategory | null {
  return id === DRONE_ID ? null : tapeById(id).category;
}

/** The tape a genre door plays when it is chosen in the header. */
export function defaultTapeFor(category: MusicCategory): MusicTape {
  const info = MUSIC_CATEGORIES.find((entry) => entry.id === category);
  return tapeById(info?.defaultTape ?? DEFAULT_TAPE);
}

/** Every genre door, in the order the panel draws them. */
export function isMusicCategory(value: unknown): value is MusicCategory {
  return MUSIC_CATEGORIES.some((entry) => entry.id === value);
}

/**
 * A fresh tape id, never the one already playing.
 *
 * `random()` is injectable so the tests can pin both ends of the range without touching the clock.
 * A value outside [0, 1) is clamped rather than being allowed to index past the catalogue, and a
 * non-finite roll opens the list at its first tape. A one-tape catalogue stays on that tape: a
 * randomiser that can only choose the current one has nothing to do.
 */
export function randomTapeId(
  current: string,
  random: () => number = Math.random,
  excluded: readonly string[] = []
): string {
  const skipped = new Set(excluded);
  const choices = MUSIC_TAPES.filter((entry) => entry.id !== current && !skipped.has(entry.id));
  if (choices.length === 0) return current;
  const roll = random();
  const index = Number.isFinite(roll)
    ? Math.min(choices.length - 1, Math.max(0, Math.floor(roll * choices.length)))
    : 0;
  return choices[index].id;
}

/**
 * One line of credit for the panel: who made it, and under what terms.
 *
 * A composed tape says so in the same sentence that names its author, so a learner never has to work
 * out whether "MechaLab tapes" is a band.
 */
export function tapeCredit(entry: MusicTape = tapeById(DEFAULT_TAPE)): string {
  if (entry.composed) {
    return `“${entry.title}” — ${COMPOSED_BY} · ${entry.licence.toLowerCase()}`;
  }
  return `“${entry.title}” by ${entry.artist} — ${entry.licence}, via Free Music Archive`;
}
