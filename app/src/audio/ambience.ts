/**
 * The room's own sound, as a table (`app/src/audio/ambience.ts`).
 *
 * Four layers, no score: rain on the window, the electrical floor, the city beyond it, and the
 * bench itself. Which of them you hear is a fact about what you are doing, never a random event —
 * the app's whole grammar is that nothing interesting happens on its own.
 *
 * | layer   | what it is                                  | home | focus | run  |
 * | :------ | :------------------------------------------ | ---: | ----: | ---: |
 * | `rain`  | the window, with the city behind it         |  1.0 |  0.35 | 0.55 |
 * | `floor` | 50 Hz mains hum and its harmonic             |  0.5 |  0.25 |  0.5 |
 * | `city`  | distant traffic, band-passed noise           | 0.35 |     0 | 0.25 |
 * | `bench` | the machine under load, on the effects bus   |    0 |     0 |  0.8 |
 *
 * `bench` is the one layer that does not belong to the music bus: it is machinery, so it rises while
 * a run is executing and is *not* ducked — that is the moment it should be audible. Everything else
 * ducks with the bed, which is why a run is quiet rather than loud.
 *
 * Focus and the run state compose instead of overwriting: a run started in focus is still focus.
 * Pure and bounded, so the mix can be pinned without an AudioContext.
 */
import type { SoundScene } from './facade.ts';

export type RoomLayer = 'rain' | 'floor' | 'city' | 'bench';

export const ROOM_LAYERS: readonly RoomLayer[] = ['rain', 'floor', 'city', 'bench'];

export type RoomMix = Record<RoomLayer, number>;

/** Each layer's own output level, before the Room fader. Deliberately far under the cues. */
export const ROOM_TRIM: RoomMix = { rain: 0.5, floor: 0.05, city: 0.06, bench: 0.06 };

const HOME: RoomMix = { rain: 1, floor: 0.5, city: 0.35, bench: 0 };
const FOCUS: RoomMix = { rain: 0.35, floor: 0.25, city: 0, bench: 0 };
const RUN: RoomMix = { rain: 0.55, floor: 0.5, city: 0.25, bench: 0.8 };

/** How much of the run's rain survives a focus session on top of the run mix. */
export const RUN_IN_FOCUS = 0.6;

/**
 * The layer gains for one state.
 *
 * A run in focus is the run row with the rain and the city pulled back, because focus is a choice
 * about the room and it should hold even while the checks run.
 */
export function roomMix(scene: SoundScene, running: boolean): RoomMix {
  if (!running) return scene === 'focus' ? { ...FOCUS } : { ...HOME };
  if (scene !== 'focus') return { ...RUN };
  return { ...RUN, rain: RUN.rain * RUN_IN_FOCUS, city: RUN.city * RUN_IN_FOCUS };
}

/** The loudest layer in a mix, for a test (and the panel's hint) to reason about. */
export function loudestLayer(mix: RoomMix): RoomLayer {
  return ROOM_LAYERS.reduce((loudest, layer) => (mix[layer] > mix[loudest] ? layer : loudest), 'rain');
}
