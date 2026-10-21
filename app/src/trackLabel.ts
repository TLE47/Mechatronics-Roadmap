/**
 * `track-p` -> `Track P`, `02-mechanics` -> `Track 02`, so every surface spells a track the way the
 * pages do.
 *
 * One function, because the palette's second line and the roadmap's resume card are the two places a
 * learner reads a track name, and two hand-written versions would drift the moment a track is added.
 */
export function trackLabel(track: string): string {
  // A graded exercise package's `track` is `modules` - the registry bucket it lives in, not a track a
  // page teaches. Naming it "Track MODULES" would invent a track, and the runner already calls these
  // "graded exercises".
  if (track === 'modules') return 'Graded exercises';
  const bare = track.replace(/^track-/, '');
  // A page lives in a directory whose name carries more than the track (`02-mechanics-kinematics-
  // dynamics`); the number is the track. `track-p` has no number, so its own name is the label.
  const code = /^\d+/.exec(bare)?.[0] ?? bare.toUpperCase();
  return `Track ${code}`;
}
