import BridgeLab from './bridgeLabShell';
import { stateSlotsLab } from './stateSlots';

/**
 * The Bridge Notes lab for Lesson R.3 (`app/src/bridges/StateSlotsLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `stateSlots`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function StateSlotsLab() {
  return <BridgeLab spec={stateSlotsLab} />;
}
