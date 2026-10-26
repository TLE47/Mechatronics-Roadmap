import React from 'react';

/**
 * The sound control, behind a lazy boundary (`app/src/components/SoundControlLazy.tsx`).
 *
 * The control is a button and a small panel, but it also reads the preference store and the bus, and
 * the entry chunk has a ceiling measured in kilobytes that a first paint waits for. Sound is an
 * opt-in extra; a learner who never turns it on should not pay for its module before the lesson text
 * is on screen. The chunk is prefetched at idle once the control mounts, so the first press finds it
 * already here — which matters, because the AudioContext must be created inside that gesture.
 *
 * `Header` and the focus pill both render this, so there is one boundary and one chunk.
 */
export const SoundControlLazy = React.lazy(() =>
  import('./SoundControl.tsx').then((module) => ({ default: module.SoundControl }))
);
