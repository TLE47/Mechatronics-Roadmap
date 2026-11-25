import React from 'react';
import type { LandmarkKey } from '../../learningPath';

/**
 * The landmark rendering frame (`app/src/components/learningPath/LandmarkRenderer.tsx`).
 *
 * This owns only the shared `<svg>` contract: its viewBox, `lp-art` class, locked modifier,
 * `data-landmark` hook and the decorative accessibility attributes. The artwork itself stays in
 * `Landmarks.tsx`, which passes the selected structure in as `art`. There is no extra wrapper, so
 * the rendered DOM is exactly the same SVG the page had before.
 */

export interface LandmarkRendererProps {
  kind: LandmarkKey;
  locked: boolean;
  art: React.ComponentType;
}

export const LandmarkRenderer: React.FC<LandmarkRendererProps> = ({ kind, locked, art: Art }) => (
  <svg
    className={`lp-art${locked ? ' lp-art--locked' : ''}`}
    viewBox="0 0 280 260"
    role="presentation"
    focusable="false"
    data-landmark={kind}
    aria-hidden="true"
  >
    <Art />
  </svg>
);
