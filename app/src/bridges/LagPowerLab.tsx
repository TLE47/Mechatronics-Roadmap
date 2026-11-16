import BridgeLab from './bridgeLabShell';
import { lagPowerLab } from './lagPower';

/**
 * The Bridge Notes lab for Lesson 00.1 (`app/src/bridges/LagPowerLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `lagPower`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function LagPowerLab() {
  return <BridgeLab spec={lagPowerLab} />;
}
