import BridgeLab from './bridgeLabShell';
import { flybackSpikeLab } from './flybackSpike';

/**
 * The Bridge Notes lab for Lesson 01.1 (`app/src/bridges/FlybackSpikeLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `flybackSpike`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function FlybackSpikeLab() {
  return <BridgeLab spec={flybackSpikeLab} />;
}
