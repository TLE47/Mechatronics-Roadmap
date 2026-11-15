import BridgeLab from './bridgeLabShell';
import { gearSquaredLab } from './gearSquared';

/**
 * The Bridge Notes lab for Lesson 02.4 (`app/src/bridges/GearSquaredLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `gearSquared`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function GearSquaredLab() {
  return <BridgeLab spec={gearSquaredLab} />;
}
