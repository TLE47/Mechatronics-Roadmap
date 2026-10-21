/**
 * `track-p` -> `Track P`, `02-mechanics` -> `Track 02`, so every surface spells a track the way the
 * pages do.
 *
 * One function, because the palette's second line and the roadmap's resume card are the two places a
 * learner reads a track name, and two hand-written versions would drift the moment a track is added.
 */
export function trackLabel(track: string): string {
  return `Track ${track.replace(/^track-/, '').toUpperCase()}`;
}
