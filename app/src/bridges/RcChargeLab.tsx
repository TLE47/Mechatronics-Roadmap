import BridgeLab from './bridgeLabShell';
import { rcChargeLab } from './rcCharge';

/**
 * The Bridge Notes lab for Lesson S0.6 (`app/src/bridges/RcChargeLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `rcCharge`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function RcChargeLab() {
  return <BridgeLab spec={rcChargeLab} />;
}
