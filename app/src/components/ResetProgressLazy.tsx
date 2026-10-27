import React from 'react';

/**
 * The reset panel, behind a lazy boundary (`app/src/components/ResetProgressLazy.tsx`).
 *
 * The dialog imports the eleven stores to count what is in them, which is more than a button should
 * cost a first paint: the header renders on every surface, and the entry chunk is measured. A learner
 * who never wants to start over therefore never downloads the panel, and the door beside Back Up costs
 * one icon. Same shape as `SoundControlLazy.tsx`, and for the same reason.
 */
export const ResetProgressLazy = React.lazy(() =>
  import('./ResetProgressDialog.tsx').then((module) => ({ default: module.ResetProgressDialog }))
);
